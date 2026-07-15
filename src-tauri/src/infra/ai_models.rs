//! Fetch model IDs from OpenAI-compatible / Anthropic APIs.
use std::time::Duration;

use serde_json::Value;
use ureq::Agent;

use crate::domain::{DomainError, DomainResult, ErrorCode};

/// List model ids for the given provider endpoint.
///
/// - OpenAI / Gemini openai-compat / custom: `GET {base}/models` Bearer
/// - Claude: `GET {base}/models` with `x-api-key` + `anthropic-version`
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

    let url = format!("{base}/models");
    let provider = provider.trim().to_ascii_lowercase();

    let agent: Agent = Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(20)))
        .build()
        .into();

    let mut request = agent.get(&url);
    request = if provider == "claude" || provider == "anthropic" {
        request
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
    } else {
        request
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

    // OpenAI / Anthropic style: { "data": [ { "id": "..." }, ... ] }
    if let Some(arr) = v.get("data").and_then(|d| d.as_array()) {
        for item in arr {
            if let Some(id) = item.get("id").and_then(|x| x.as_str()) {
                let id = id.trim();
                if !id.is_empty() {
                    ids.push(id.to_string());
                }
            } else if let Some(id) = item.get("name").and_then(|x| x.as_str()) {
                // some gateways use name
                let id = id.trim();
                if !id.is_empty() {
                    ids.push(id.to_string());
                }
            }
        }
    } else if let Some(arr) = v.get("models").and_then(|d| d.as_array()) {
        // Gemini native-ish
        for item in arr {
            if let Some(name) = item.get("name").and_then(|x| x.as_str()) {
                // "models/gemini-2.5-flash" -> "gemini-2.5-flash"
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

#[cfg(test)]
mod tests {
    use super::parse_model_ids;

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
    fn parse_gemini_models_array() {
        let body =
            r#"{"models":[{"name":"models/gemini-2.5-flash"},{"name":"models/gemini-2.5-pro"}]}"#;
        let ids = parse_model_ids(body).unwrap();
        assert!(ids.contains(&"gemini-2.5-flash".to_string()));
        assert!(ids.contains(&"gemini-2.5-pro".to_string()));
    }
}


/// Browser-like UA so Cloudflare / WAF (error 1010) does not block Rust clients.
const BROWSER_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CompletionKind {
    /// OpenAI Chat Completions: POST {base}/chat/completions
    Chat,
    /// OpenAI Responses API: POST {base}/responses or full .../v1/responses URL
    Responses,
}

/// One-shot text generation for the desktop UI (Rust HTTP = no WebView CORS).
///
/// Endpoint strategy:
/// 1. If base_url already ends with `/responses` or `/chat/completions`, use it as-is.
/// 2. Else try `{base}/chat/completions` then `{base}/responses`.
/// 3. For host `ai.200064520.xyz`, also try `proxy.ai.200064520.xyz` Responses
///    (that deployment only exposes working generation on the proxy + /v1/responses).
pub fn chat_completion(
    provider: &str,
    base_url: &str,
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
    temperature: f32,
) -> DomainResult<String> {
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

    for (url, kind) in candidates {
        match post_completion(&agent, &provider, key, &url, kind, model, system, user, temp)
        {
            Ok(text) => return Ok(text),
            Err(e) => {
                last_err = format!("{url} ({kind:?}): {e}");
                // try next candidate
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
        // Prefer Responses first when host is known to 404 on chat.
        let prefer_responses = b.contains("200064520.xyz") || b.contains("proxy.ai.");
        if prefer_responses {
            out.push((format!("{b}/responses"), CompletionKind::Responses));
            out.push((format!("{b}/chat/completions"), CompletionKind::Chat));
        } else {
            out.push((format!("{b}/chat/completions"), CompletionKind::Chat));
            out.push((format!("{b}/responses"), CompletionKind::Responses));
        }
    }

    // Dedicated proxy host used by this deployment for Responses API.
    if b.contains("://ai.200064520.xyz") && !b.contains("://proxy.ai.200064520.xyz") {
        let proxy = b.replace("://ai.200064520.xyz", "://proxy.ai.200064520.xyz");
        let proxy = proxy.trim_end_matches('/').to_string();
        if proxy.ends_with("/responses") {
            out.push((proxy, CompletionKind::Responses));
        } else if proxy.ends_with("/chat/completions") {
            out.push((proxy, CompletionKind::Chat));
        } else {
            out.push((format!("{proxy}/responses"), CompletionKind::Responses));
            out.push((format!("{proxy}/chat/completions"), CompletionKind::Chat));
        }
    }

    // de-dup preserving order
    let mut seen = std::collections::HashSet::new();
    out.into_iter()
        .filter(|(u, _)| seen.insert(u.clone()))
        .collect()
}

#[allow(clippy::too_many_arguments)]
fn post_completion(
    agent: &Agent,
    provider: &str,
    key: &str,
    url: &str,
    kind: CompletionKind,
    model: &str,
    system: &str,
    user: &str,
    temperature: f32,
) -> DomainResult<String> {
    let body = match kind {
        CompletionKind::Chat => serde_json::json!({
            "model": model,
            "temperature": temperature,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": user },
            ],
        }),
        CompletionKind::Responses => serde_json::json!({
            "model": model,
            "temperature": temperature,
            "instructions": system,
            "input": user,
        }),
    };

    let mut request = agent.post(url).header("User-Agent", BROWSER_UA);
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

    let mut res = request.send_json(&body).map_err(|e| {
        DomainError::new(
            ErrorCode::Internal,
            format!("request failed: {e}"),
        )
    })?;

    let status = res.status().as_u16();
    let text = res.body_mut().read_to_string().map_err(|e| {
        DomainError::new(ErrorCode::Internal, format!("read body: {e}"))
    })?;

    if !(200..300).contains(&status) {
        let snippet: String = text.chars().take(280).collect();
        return Err(DomainError::new(
            ErrorCode::Internal,
            format!("HTTP {status}: {snippet}"),
        ));
    }

    match kind {
        CompletionKind::Chat => parse_chat_content(&text),
        CompletionKind::Responses => parse_responses_content(&text),
    }
}

fn parse_chat_content(body: &str) -> DomainResult<String> {
    let v: Value = serde_json::from_str(body).map_err(|e| {
        DomainError::new(ErrorCode::Internal, format!("chat json: {e}"))
    })?;

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

/// OpenAI Responses API: output[] message parts with type output_text.
fn parse_responses_content(body: &str) -> DomainResult<String> {
    let v: Value = serde_json::from_str(body).map_err(|e| {
        DomainError::new(ErrorCode::Internal, format!("responses json: {e}"))
    })?;

    // convenience field some gateways add
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
            if ty == "message" || item.get("role").and_then(|r| r.as_str()) == Some("assistant")
            {
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
mod chat_tests {
    use super::{completion_candidates, parse_chat_content, parse_responses_content, CompletionKind};

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
        assert!(c.iter().any(|(u, k)| u.ends_with("/responses") && *k == CompletionKind::Responses));
    }

    #[test]
    fn candidates_respect_full_responses_url() {
        let c = completion_candidates("https://proxy.ai.200064520.xyz/v1/responses");
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].1, CompletionKind::Responses);
    }
}
