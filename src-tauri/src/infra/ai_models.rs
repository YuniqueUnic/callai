//! OpenAI-compatible model list + chat/responses completion (blocking + SSE stream).
//! Desktop UI calls these via Tauri so WebView never hits CORS.

use std::io::{BufRead, BufReader, Read};
use std::time::Duration;

use serde_json::Value;
use ureq::Agent;

use crate::domain::{DomainError, DomainResult, ErrorCode};

/// Codex default originator header value.
const CODEX_ORIGINATOR: &str = "codex_cli_rs";

/// Build a Codex-CLI-shaped User-Agent (see openai/codex `get_codex_user_agent`).
/// Example: `codex_cli_rs/0.2.7 (Mac OS 15.0.0; arm64) unknown`
fn codex_user_agent() -> String {
    let build_version = env!("CARGO_PKG_VERSION");
    let info = os_info::get();
    let arch = info.architecture().unwrap_or("unknown");
    let term = std::env::var("TERM_PROGRAM")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "unknown".into());
    format!(
        "{CODEX_ORIGINATOR}/{build_version} ({} {}; {arch}) {term}",
        info.os_type(),
        info.version(),
    )
}

/// List model ids for the given provider endpoint.
pub fn list_models(provider: &str, base_url: &str, api_key: &str) -> DomainResult<Vec<String>> {
    let base = base_url.trim().trim_end_matches('/');
    let key = api_key.trim();
    if base.is_empty() {
        return Err(DomainError::new(
            ErrorCode::InvalidArgs,
            "AI base URL is empty",
        ));
    }
    if key.is_empty() {
        return Err(DomainError::new(
            ErrorCode::InvalidArgs,
            "AI API key is empty",
        ));
    }

    // If base ends with /responses or /chat/completions, strip to root for /models
    let root = base
        .trim_end_matches("/responses")
        .trim_end_matches("/chat/completions")
        .trim_end_matches('/');
    let url = format!("{root}/models");
    let provider = provider.trim().to_ascii_lowercase();
    let ua = codex_user_agent();

    let agent: Agent = Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(20)))
        .build()
        .into();

    let mut request = agent.get(&url).header("User-Agent", &ua);
    request = if provider == "claude" || provider == "anthropic" {
        request
            .header("originator", CODEX_ORIGINATOR)
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
    } else {
        request
            .header("originator", CODEX_ORIGINATOR)
            .header("Authorization", &format!("Bearer {key}"))
            .header("content-type", "application/json")
    };

    let mut res = request.call().map_err(|e| {
        DomainError::new(
            ErrorCode::Internal,
            format!("list models request failed: {e}"),
        )
    })?;

    let status = res.status().as_u16();
    let body = res.body_mut().read_to_string().map_err(|e| {
        DomainError::new(ErrorCode::Internal, format!("list models read body: {e}"))
    })?;

    if !(200..300).contains(&status) {
        let snippet: String = body.chars().take(240).collect();
        return Err(DomainError::new(
            ErrorCode::Internal,
            format!("list models HTTP {status}: {snippet}"),
        ));
    }

    parse_model_ids(&body)
}

fn parse_model_ids(body: &str) -> DomainResult<Vec<String>> {
    let v: Value = serde_json::from_str(body)
        .map_err(|e| DomainError::new(ErrorCode::Internal, format!("list models json: {e}")))?;

    let mut ids = Vec::new();

    if let Some(arr) = v.get("data").and_then(|d| d.as_array()) {
        for item in arr {
            if let Some(id) = item.get("id").and_then(|x| x.as_str()) {
                let id = id.trim();
                if !id.is_empty() {
                    ids.push(id.to_string());
                }
            } else if let Some(id) = item.get("name").and_then(|x| x.as_str()) {
                let id = id.trim();
                if !id.is_empty() {
                    ids.push(id.to_string());
                }
            }
        }
    } else if let Some(arr) = v.get("models").and_then(|d| d.as_array()) {
        for item in arr {
            if let Some(name) = item.get("name").and_then(|x| x.as_str()) {
                let id = name.rsplit('/').next().unwrap_or(name).trim();
                if !id.is_empty() {
                    ids.push(id.to_string());
                }
            } else if let Some(id) = item.get("id").and_then(|x| x.as_str()) {
                ids.push(id.trim().to_string());
            }
        }
    } else if let Some(arr) = v.as_array() {
        for item in arr {
            if let Some(id) = item.as_str() {
                ids.push(id.trim().to_string());
            } else if let Some(id) = item.get("id").and_then(|x| x.as_str()) {
                ids.push(id.trim().to_string());
            }
        }
    }

    ids.retain(|s| !s.is_empty());
    ids.sort();
    ids.dedup();

    if ids.is_empty() {
        return Err(DomainError::new(
            ErrorCode::Internal,
            "list models returned no model ids",
        ));
    }
    Ok(ids)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CompletionKind {
    Chat,
    Responses,
}

/// Progress phases for UI feedback while waiting / streaming.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamPhase {
    Connecting,
    WaitingFirstToken,
    Streaming,
    Done,
}

impl StreamPhase {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Connecting => "connecting",
            Self::WaitingFirstToken => "waiting",
            Self::Streaming => "streaming",
            Self::Done => "done",
        }
    }
}

/// Non-streaming convenience wrapper.
#[allow(dead_code)]
pub fn chat_completion(
    provider: &str,
    base_url: &str,
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
    temperature: f32,
) -> DomainResult<String> {
    chat_completion_stream(
        provider,
        base_url,
        api_key,
        model,
        system,
        user,
        temperature,
        |_, _| {},
    )
}

/// Stream chat/responses SSE when the gateway supports `stream: true`.
/// Falls back to non-stream parse if the body is a single JSON object.
#[allow(clippy::too_many_arguments)]
pub fn chat_completion_stream<F>(
    provider: &str,
    base_url: &str,
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
    temperature: f32,
    mut on_event: F,
) -> DomainResult<String>
where
    F: FnMut(StreamPhase, &str),
{
    let base = base_url.trim().trim_end_matches('/');
    let key = api_key.trim();
    let model = model.trim();
    if base.is_empty() {
        return Err(DomainError::new(
            ErrorCode::InvalidArgs,
            "AI base URL is empty",
        ));
    }
    if key.is_empty() {
        return Err(DomainError::new(
            ErrorCode::InvalidArgs,
            "AI API key is empty",
        ));
    }
    if model.is_empty() {
        return Err(DomainError::new(ErrorCode::InvalidArgs, "AI model is empty"));
    }

    let provider = provider.trim().to_ascii_lowercase();
    let temp = temperature.clamp(0.0, 2.0);
    let agent: Agent = Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(180)))
        .build()
        .into();

    let candidates = completion_candidates(base);
    let mut last_err = String::from("no completion endpoint tried");

    on_event(StreamPhase::Connecting, "");

    for (url, kind) in candidates {
        match post_completion_stream(
            &agent, &provider, key, &url, kind, model, system, user, temp, &mut on_event,
        ) {
            Ok(text) => {
                on_event(StreamPhase::Done, "");
                return Ok(text);
            }
            Err(e) => {
                last_err = format!("{url} ({kind:?}): {e}");
            }
        }
    }

    Err(DomainError::new(
        ErrorCode::Internal,
        format!("all completion endpoints failed; last: {last_err}"),
    ))
}

fn completion_candidates(base: &str) -> Vec<(String, CompletionKind)> {
    let b = base.trim().trim_end_matches('/');
    let mut out: Vec<(String, CompletionKind)> = Vec::new();

    if b.ends_with("/responses") {
        out.push((b.to_string(), CompletionKind::Responses));
    } else if b.ends_with("/chat/completions") {
        out.push((b.to_string(), CompletionKind::Chat));
    } else {
        let prefer_responses = b.contains("200064520.xyz") || b.contains("proxy.ai.");
        if prefer_responses {
            out.push((format!("{b}/responses"), CompletionKind::Responses));
            out.push((format!("{b}/chat/completions"), CompletionKind::Chat));
        } else {
            out.push((format!("{b}/chat/completions"), CompletionKind::Chat));
            out.push((format!("{b}/responses"), CompletionKind::Responses));
        }
    }

    if b.contains("://ai.200064520.xyz") && !b.contains("://proxy.ai.200064520.xyz") {
        let proxy = b
            .replace("://ai.200064520.xyz", "://proxy.ai.200064520.xyz")
            .trim_end_matches('/')
            .to_string();
        if proxy.ends_with("/responses") {
            out.push((proxy, CompletionKind::Responses));
        } else if proxy.ends_with("/chat/completions") {
            out.push((proxy, CompletionKind::Chat));
        } else {
            out.push((format!("{proxy}/responses"), CompletionKind::Responses));
            out.push((format!("{proxy}/chat/completions"), CompletionKind::Chat));
        }
    }

    let mut seen = std::collections::HashSet::new();
    out.into_iter()
        .filter(|(u, _)| seen.insert(u.clone()))
        .collect()
}

#[allow(clippy::too_many_arguments)]
fn post_completion_stream<F>(
    agent: &Agent,
    provider: &str,
    key: &str,
    url: &str,
    kind: CompletionKind,
    model: &str,
    system: &str,
    user: &str,
    temperature: f32,
    on_event: &mut F,
) -> DomainResult<String>
where
    F: FnMut(StreamPhase, &str),
{
    let body = match kind {
        CompletionKind::Chat => serde_json::json!({
            "model": model,
            "temperature": temperature,
            "stream": true,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": user },
            ],
        }),
        CompletionKind::Responses => serde_json::json!({
            "model": model,
            "temperature": temperature,
            "stream": true,
            "instructions": system,
            "input": user,
        }),
    };

    let ua = codex_user_agent();
    let mut request = agent
        .post(url)
        .header("User-Agent", &ua)
        .header("originator", CODEX_ORIGINATOR)
        .header("Accept", "text/event-stream, application/json");
    request = if provider == "claude" || provider == "anthropic" {
        request
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .header("Authorization", &format!("Bearer {key}"))
    } else {
        request
            .header("Authorization", &format!("Bearer {key}"))
            .header("content-type", "application/json")
    };

    on_event(StreamPhase::WaitingFirstToken, "");

    let mut res = request.send_json(&body).map_err(|e| {
        DomainError::new(ErrorCode::Internal, format!("request failed: {e}"))
    })?;

    let status = res.status().as_u16();
    if !(200..300).contains(&status) {
        let text = res.body_mut().read_to_string().unwrap_or_default();
        let snippet: String = text.chars().take(280).collect();
        return Err(DomainError::new(
            ErrorCode::Internal,
            format!("HTTP {status}: {snippet}"),
        ));
    }

    let content_type = res
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();

    let mut reader = res.into_body().into_reader();

    // Non-SSE JSON fallback (some gateways ignore stream:true).
    if content_type.contains("application/json") && !content_type.contains("event-stream") {
        let mut buf = String::new();
        reader
            .read_to_string(&mut buf)
            .map_err(|e| DomainError::new(ErrorCode::Internal, format!("read body: {e}")))?;
        let text = match kind {
            CompletionKind::Chat => parse_chat_content(&buf)?,
            CompletionKind::Responses => parse_responses_content(&buf)?,
        };
        if !text.is_empty() {
            on_event(StreamPhase::Streaming, &text);
        }
        return Ok(text);
    }

    // SSE parse
    let mut full = String::new();
    let mut line_buf = String::new();
    let mut buffered = BufReader::new(reader);
    loop {
        line_buf.clear();
        let n = buffered
            .read_line(&mut line_buf)
            .map_err(|e| DomainError::new(ErrorCode::Internal, format!("sse read: {e}")))?;
        if n == 0 {
            break;
        }
        let line = line_buf.trim_end_matches(['\r', '\n']);
        if line.is_empty() || line.starts_with(':') {
            continue;
        }
        let data = if let Some(rest) = line.strip_prefix("data:") {
            rest.trim()
        } else if line.starts_with('{') {
            // naked JSON lines
            line
        } else {
            continue;
        };
        if data == "[DONE]" {
            break;
        }
        if let Some(delta) = extract_stream_delta(data, kind) {
            if !delta.is_empty() {
                full.push_str(&delta);
                on_event(StreamPhase::Streaming, &delta);
            }
        }
    }

    // If SSE produced nothing, try reading remaining as JSON (already consumed).
    if full.trim().is_empty() {
        return Err(DomainError::new(
            ErrorCode::Internal,
            "stream ended with empty content (gateway may not support stream:true for this path)",
        ));
    }
    Ok(full)
}

fn extract_stream_delta(data: &str, kind: CompletionKind) -> Option<String> {
    let v: Value = serde_json::from_str(data).ok()?;
    match kind {
        CompletionKind::Chat => {
            // choices[0].delta.content
            if let Some(s) = v
                .pointer("/choices/0/delta/content")
                .and_then(|c| c.as_str())
            {
                return Some(s.to_string());
            }
            // some gateways put full message
            if let Some(s) = v
                .pointer("/choices/0/message/content")
                .and_then(|c| c.as_str())
            {
                return Some(s.to_string());
            }
            None
        }
        CompletionKind::Responses => {
            // OpenAI responses stream events
            let ty = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if ty == "response.output_text.delta" || ty.ends_with("output_text.delta") {
                if let Some(s) = v.get("delta").and_then(|d| d.as_str()) {
                    return Some(s.to_string());
                }
            }
            if let Some(s) = v.pointer("/delta").and_then(|d| d.as_str()) {
                return Some(s.to_string());
            }
            // nested text
            if let Some(s) = v.pointer("/text").and_then(|d| d.as_str()) {
                if ty.contains("delta") {
                    return Some(s.to_string());
                }
            }
            None
        }
    }
}

fn parse_chat_content(body: &str) -> DomainResult<String> {
    let v: Value = serde_json::from_str(body)
        .map_err(|e| DomainError::new(ErrorCode::Internal, format!("chat json: {e}")))?;

    if let Some(content) = v
        .pointer("/choices/0/message/content")
        .and_then(|c| c.as_str())
    {
        let s = content.trim();
        if !s.is_empty() {
            return Ok(s.to_string());
        }
    }
    if let Some(content) = v.pointer("/choices/0/text").and_then(|c| c.as_str()) {
        let s = content.trim();
        if !s.is_empty() {
            return Ok(s.to_string());
        }
    }
    if let Some(arr) = v
        .pointer("/choices/0/message/content")
        .and_then(|c| c.as_array())
    {
        let mut out = String::new();
        for part in arr {
            if let Some(t) = part.get("text").and_then(|x| x.as_str()) {
                out.push_str(t);
            } else if let Some(t) = part.as_str() {
                out.push_str(t);
            }
        }
        let s = out.trim();
        if !s.is_empty() {
            return Ok(s.to_string());
        }
    }
    Err(DomainError::new(
        ErrorCode::Internal,
        "chat completion returned empty content",
    ))
}

fn parse_responses_content(body: &str) -> DomainResult<String> {
    let v: Value = serde_json::from_str(body)
        .map_err(|e| DomainError::new(ErrorCode::Internal, format!("responses json: {e}")))?;

    if let Some(s) = v.get("output_text").and_then(|x| x.as_str()) {
        let s = s.trim();
        if !s.is_empty() {
            return Ok(s.to_string());
        }
    }

    let mut texts: Vec<String> = Vec::new();
    if let Some(arr) = v.get("output").and_then(|o| o.as_array()) {
        for item in arr {
            let ty = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if ty == "message" || item.get("role").and_then(|r| r.as_str()) == Some("assistant") {
                if let Some(content) = item.get("content").and_then(|c| c.as_array()) {
                    for part in content {
                        let pty = part.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        if pty == "output_text" || pty == "text" {
                            if let Some(t) = part.get("text").and_then(|x| x.as_str()) {
                                if !t.is_empty() {
                                    texts.push(t.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let joined = texts.join("\n").trim().to_string();
    if joined.is_empty() {
        return Err(DomainError::new(
            ErrorCode::Internal,
            "responses API returned empty message text",
        ));
    }
    Ok(joined)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_openai_style() {
        let body =
            r#"{"data":[{"id":"gpt-5.6-terra"},{"id":"gpt-5.6-sol"},{"id":"gpt-5.6-terra"}]}"#;
        let ids = parse_model_ids(body).unwrap();
        assert_eq!(
            ids,
            vec!["gpt-5.6-sol".to_string(), "gpt-5.6-terra".to_string()]
        );
    }

    #[test]
    fn parse_openai_chat_shape() {
        let body = r#"{"choices":[{"message":{"role":"assistant","content":"  hello  "}}]}"#;
        assert_eq!(parse_chat_content(body).unwrap(), "hello");
    }

    #[test]
    fn parse_responses_output_text() {
        let body = r#"{
          "output":[
            {"type":"reasoning","summary":[]},
            {"type":"message","role":"assistant","content":[
              {"type":"output_text","text":"pong"}
            ]}
          ]
        }"#;
        assert_eq!(parse_responses_content(body).unwrap(), "pong");
    }

    #[test]
    fn candidates_include_proxy_for_ai_host() {
        let c = completion_candidates("https://ai.200064520.xyz/v1");
        assert!(c.iter().any(|(u, k)| {
            u.contains("proxy.ai.200064520.xyz") && *k == CompletionKind::Responses
        }));
    }

    #[test]
    fn codex_ua_shape() {
        let ua = codex_user_agent();
        assert!(ua.starts_with("codex_cli_rs/"));
        assert!(ua.contains('('));
        assert!(ua.contains(')'));
    }

    #[test]
    fn extract_chat_delta() {
        let d = r#"{"choices":[{"delta":{"content":"Hi"}}]}"#;
        assert_eq!(
            extract_stream_delta(d, CompletionKind::Chat).as_deref(),
            Some("Hi")
        );
    }

    #[test]
    fn extract_responses_delta() {
        let d = r#"{"type":"response.output_text.delta","delta":"yo"}"#;
        assert_eq!(
            extract_stream_delta(d, CompletionKind::Responses).as_deref(),
            Some("yo")
        );
    }
}
