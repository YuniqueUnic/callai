//! OpenAI-compatible model list + chat/responses completion via `async-openai`.
//! Desktop UI calls these through Tauri so the WebView never hits CORS.

use std::time::Duration;

use async_openai::config::OpenAIConfig;
use async_openai::types::chat::{
    ChatCompletionRequestSystemMessageArgs, ChatCompletionRequestUserMessageArgs,
    CreateChatCompletionRequestArgs,
};
use async_openai::types::responses::{CreateResponseArgs, InputParam};
use async_openai::Client;
use futures::StreamExt;

use crate::domain::{DomainError, DomainResult, ErrorCode};

/// End-to-end budget for long plugin HTML streams.
const COMPLETION_TIMEOUT_SECS: u64 = 900;
const COMPLETION_CONNECT_SECS: u64 = 30;
/// High ceiling so large PluginDraft `ui_html` is not cut by default limits.
const COMPLETION_MAX_OUTPUT_TOKENS: u32 = 65_536;

const CODEX_ORIGINATOR: &str = "codex_cli_rs";

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum CompletionKind {
    Chat,
    Responses,
}

/// Build a Codex-CLI-shaped User-Agent (see openai/codex `get_codex_user_agent`).
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

fn map_openai_err(e: impl std::fmt::Display) -> DomainError {
    DomainError::new(ErrorCode::Internal, format!("openai client: {e}"))
}

fn normalize_api_base(base_url: &str) -> String {
    let mut b = base_url.trim().trim_end_matches('/').to_string();
    for suffix in ["/chat/completions", "/responses", "/models"] {
        if let Some(stripped) = b.strip_suffix(suffix) {
            b = stripped.trim_end_matches('/').to_string();
        }
    }
    b
}

fn build_http_client() -> DomainResult<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(COMPLETION_TIMEOUT_SECS))
        .connect_timeout(Duration::from_secs(COMPLETION_CONNECT_SECS))
        .build()
        .map_err(|e| DomainError::new(ErrorCode::Internal, format!("http client: {e}")))
}

fn build_client(
    api_base: &str,
    api_key: &str,
    provider: &str,
) -> DomainResult<Client<OpenAIConfig>> {
    let mut cfg = OpenAIConfig::new()
        .with_api_key(api_key)
        .with_api_base(api_base);
    cfg = cfg
        .with_header(
            reqwest::header::USER_AGENT,
            codex_user_agent().as_str(),
        )
        .map_err(map_openai_err)?;
    cfg = cfg
        .with_header("originator", CODEX_ORIGINATOR)
        .map_err(map_openai_err)?;
    if provider == "claude" || provider == "anthropic" {
        cfg = cfg
            .with_header("anthropic-version", "2023-06-01")
            .map_err(map_openai_err)?;
        // Some Anthropic-compatible gateways still want x-api-key.
        cfg = cfg
            .with_header("x-api-key", api_key)
            .map_err(map_openai_err)?;
    }
    let http = build_http_client()?;
    Ok(Client::with_config(cfg).with_http_client(http))
}

fn completion_candidates(base: &str) -> Vec<(String, CompletionKind)> {
    let b = normalize_api_base(base);
    let mut out: Vec<(String, CompletionKind)> = Vec::new();

    let prefer_responses = b.contains("200064520.xyz") || b.contains("proxy.ai.");
    if prefer_responses {
        out.push((b.clone(), CompletionKind::Responses));
        out.push((b.clone(), CompletionKind::Chat));
    } else {
        out.push((b.clone(), CompletionKind::Chat));
        out.push((b.clone(), CompletionKind::Responses));
    }

    if b.contains("://ai.200064520.xyz") && !b.contains("://proxy.ai.200064520.xyz") {
        let proxy = b.replace("://ai.200064520.xyz", "://proxy.ai.200064520.xyz");
        out.push((proxy.clone(), CompletionKind::Responses));
        out.push((proxy, CompletionKind::Chat));
    }

    let mut seen = std::collections::HashSet::new();
    out.into_iter()
        .filter(|(u, k)| seen.insert((u.clone(), *k)))
        .collect()
}

fn validate_args(base_url: &str, api_key: &str, model: Option<&str>) -> DomainResult<()> {
    if base_url.trim().is_empty() {
        return Err(DomainError::new(
            ErrorCode::InvalidArgs,
            "AI base URL is empty",
        ));
    }
    if api_key.trim().is_empty() {
        return Err(DomainError::new(
            ErrorCode::InvalidArgs,
            "AI API key is empty",
        ));
    }
    if let Some(m) = model {
        if m.trim().is_empty() {
            return Err(DomainError::new(ErrorCode::InvalidArgs, "AI model is empty"));
        }
    }
    Ok(())
}

/// List model ids for the given provider endpoint.
pub async fn list_models(
    provider: &str,
    base_url: &str,
    api_key: &str,
) -> DomainResult<Vec<String>> {
    validate_args(base_url, api_key, None)?;
    let provider = provider.trim().to_ascii_lowercase();
    let base = normalize_api_base(base_url);
    let client = build_client(&base, api_key.trim(), &provider)?;
    let list = client
        .models()
        .list()
        .await
        .map_err(map_openai_err)?;
    let mut ids: Vec<String> = list
        .data
        .into_iter()
        .map(|m| {
            // ids may be "org/model"
            let id = m.id;
            id.rsplit('/')
                .next()
                .unwrap_or(id.as_str())
                .trim()
                .to_string()
        })
        .filter(|s| !s.is_empty())
        .collect();
    ids.sort();
    ids.dedup();
    Ok(ids)
}

/// Non-streaming convenience wrapper.
#[allow(dead_code)]
pub async fn chat_completion(
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
    .await
}

/// Stream chat/responses when the gateway supports it.
/// Falls back across Chat Completions and Responses + proxy host candidates.
#[allow(clippy::too_many_arguments)]
pub async fn chat_completion_stream<F>(
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
    validate_args(base_url, api_key, Some(model))?;
    let provider = provider.trim().to_ascii_lowercase();
    let model = model.trim();
    let key = api_key.trim();
    let temp = temperature.clamp(0.0, 2.0);
    let candidates = completion_candidates(base_url);
    let mut last_err = String::from("no completion endpoint tried");

    on_event(StreamPhase::Connecting, "");

    for (api_base, kind) in candidates {
        match stream_one(
            &provider,
            key,
            &api_base,
            kind,
            model,
            system,
            user,
            temp,
            &mut on_event,
        )
        .await
        {
            Ok(text) => {
                on_event(StreamPhase::Done, "");
                return Ok(text);
            }
            Err(e) => {
                last_err = format!("{api_base} ({kind:?}): {e}");
            }
        }
    }

    Err(DomainError::new(
        ErrorCode::Internal,
        format!("all completion endpoints failed; last: {last_err}"),
    ))
}

#[allow(clippy::too_many_arguments)]
async fn stream_one<F>(
    provider: &str,
    api_key: &str,
    api_base: &str,
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
    let client = build_client(api_base, api_key, provider)?;
    on_event(StreamPhase::WaitingFirstToken, "");

    match kind {
        CompletionKind::Chat => stream_chat(&client, model, system, user, temperature, on_event).await,
        CompletionKind::Responses => {
            stream_responses(&client, model, system, user, temperature, on_event).await
        }
    }
}

async fn stream_chat<F>(
    client: &Client<OpenAIConfig>,
    model: &str,
    system: &str,
    user: &str,
    temperature: f32,
    on_event: &mut F,
) -> DomainResult<String>
where
    F: FnMut(StreamPhase, &str),
{
    let request = CreateChatCompletionRequestArgs::default()
        .model(model)
        .temperature(temperature)
        .max_completion_tokens(COMPLETION_MAX_OUTPUT_TOKENS)
        .max_tokens(COMPLETION_MAX_OUTPUT_TOKENS)
        .messages([
            ChatCompletionRequestSystemMessageArgs::default()
                .content(system)
                .build()
                .map_err(map_openai_err)?
                .into(),
            ChatCompletionRequestUserMessageArgs::default()
                .content(user)
                .build()
                .map_err(map_openai_err)?
                .into(),
        ])
        .build()
        .map_err(map_openai_err)?;

    let mut stream = client
        .chat()
        .create_stream(request)
        .await
        .map_err(map_openai_err)?;

    let mut full = String::new();
    let mut finish_reason = String::new();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(map_openai_err)?;
        for choice in chunk.choices {
            if let Some(content) = choice.delta.content {
                if !content.is_empty() {
                    full.push_str(&content);
                    on_event(StreamPhase::Streaming, &content);
                }
            }
            if let Some(fr) = choice.finish_reason {
                finish_reason = format!("{fr:?}");
            }
        }
    }

    if full.trim().is_empty() {
        return Err(DomainError::new(
            ErrorCode::Internal,
            "stream ended with empty content",
        ));
    }
    if finish_reason.to_ascii_lowercase().contains("length") {
        full.push_str("\n\n/* callai: truncated finish_reason=length */");
    }
    Ok(full)
}

async fn stream_responses<F>(
    client: &Client<OpenAIConfig>,
    model: &str,
    system: &str,
    user: &str,
    temperature: f32,
    on_event: &mut F,
) -> DomainResult<String>
where
    F: FnMut(StreamPhase, &str),
{
    // Responses API: instructions + input (+ stream via create_stream).
    let request = CreateResponseArgs::default()
        .model(model)
        .temperature(temperature)
        .max_output_tokens(COMPLETION_MAX_OUTPUT_TOKENS)
        .instructions(system)
        .input(InputParam::Text(user.to_string()))
        .build()
        .map_err(map_openai_err)?;

    let mut stream = client
        .responses()
        .create_stream(request)
        .await
        .map_err(map_openai_err)?;

    let mut full = String::new();
    let mut truncated = false;

    while let Some(item) = stream.next().await {
        let event = item.map_err(map_openai_err)?;
        // Bring-your-own event shape: serialize and pull known delta paths.
        let v = serde_json::to_value(&event).unwrap_or(serde_json::Value::Null);
        if let Some(delta) = extract_responses_delta(&v) {
            if !delta.is_empty() {
                full.push_str(&delta);
                on_event(StreamPhase::Streaming, &delta);
            }
        }
        let ty = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if ty.contains("incomplete")
            || v.pointer("/response/incomplete_details/reason")
                .and_then(|r| r.as_str())
                .is_some_and(|r| r.contains("max_output") || r == "length")
        {
            truncated = true;
        }
    }

    if full.trim().is_empty() {
        // Non-stream fallback: one-shot create.
        let request = CreateResponseArgs::default()
            .model(model)
            .temperature(temperature)
            .max_output_tokens(COMPLETION_MAX_OUTPUT_TOKENS)
            .instructions(system)
            .input(InputParam::Text(user.to_string()))
            .build()
            .map_err(map_openai_err)?;
        let resp = client
            .responses()
            .create(request)
            .await
            .map_err(map_openai_err)?;
        let v = serde_json::to_value(&resp).unwrap_or(serde_json::Value::Null);
        full = extract_responses_output_text(&v).unwrap_or_default();
        if !full.is_empty() {
            on_event(StreamPhase::Streaming, &full);
        }
    }

    if full.trim().is_empty() {
        return Err(DomainError::new(
            ErrorCode::Internal,
            "responses stream/create returned empty content",
        ));
    }
    if truncated {
        full.push_str("\n\n/* callai: truncated finish_reason=length */");
    }
    Ok(full)
}

fn extract_responses_delta(v: &serde_json::Value) -> Option<String> {
    let ty = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
    if ty.contains("output_text.delta") || ty.ends_with("output_text.delta") {
        if let Some(s) = v.get("delta").and_then(|d| d.as_str()) {
            return Some(s.to_string());
        }
    }
    // Some gateways nest text
    if let Some(s) = v.pointer("/delta/text").and_then(|d| d.as_str()) {
        return Some(s.to_string());
    }
    if let Some(s) = v.get("delta").and_then(|d| d.as_str()) {
        return Some(s.to_string());
    }
    None
}

fn extract_responses_output_text(v: &serde_json::Value) -> Option<String> {
    if let Some(s) = v.get("output_text").and_then(|x| x.as_str()) {
        let s = s.trim();
        if !s.is_empty() {
            return Some(s.to_string());
        }
    }
    let mut texts = Vec::new();
    if let Some(arr) = v.get("output").and_then(|o| o.as_array()) {
        for item in arr {
            let ty = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if ty == "reasoning" {
                if let Some(summary) = item.get("summary").and_then(|s| s.as_array()) {
                    for part in summary {
                        if let Some(txt) = part
                            .get("text")
                            .and_then(|x| x.as_str())
                            .or_else(|| part.as_str())
                        {
                            let s = txt.trim();
                            if !s.is_empty() {
                                texts.push(format!("<think>{s}</think>"));
                            }
                        }
                    }
                }
            }
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
        None
    } else {
        Some(joined)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_paths() {
        assert_eq!(
            normalize_api_base("https://api.openai.com/v1/chat/completions"),
            "https://api.openai.com/v1"
        );
        assert_eq!(
            normalize_api_base("https://proxy.ai.example/v1/responses"),
            "https://proxy.ai.example/v1"
        );
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
    }

    #[test]
    fn extract_responses_delta_output_text() {
        let v = serde_json::json!({
            "type": "response.output_text.delta",
            "delta": "Hi"
        });
        assert_eq!(extract_responses_delta(&v).as_deref(), Some("Hi"));
    }
}
