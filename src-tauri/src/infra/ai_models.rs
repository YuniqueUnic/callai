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

/// One-shot OpenAI-compatible chat completion (non-streaming).
/// Used by the desktop UI so requests never leave the WebView origin (no CORS).
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
    let url = format!("{base}/chat/completions");
    let temp = temperature.clamp(0.0, 2.0);

    let body = serde_json::json!({
        "model": model,
        "temperature": temp,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user },
        ],
    });

    let agent: Agent = Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(120)))
        .build()
        .into();

    let mut request = agent.post(&url);
    request = if provider == "claude" || provider == "anthropic" {
        // Many gateways still expect OpenAI shape even for Claude keys;
        // Anthropic native is /messages — prefer OpenAI-compat path here.
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
            format!("chat completion request failed: {e}"),
        )
    })?;

    let status = res.status().as_u16();
    let text = res.body_mut().read_to_string().map_err(|e| {
        DomainError::new(
            ErrorCode::Internal,
            format!("chat completion read body: {e}"),
        )
    })?;

    if !(200..300).contains(&status) {
        let snippet: String = text.chars().take(400).collect();
        return Err(DomainError::new(
            ErrorCode::Internal,
            format!("chat completion HTTP {status}: {snippet}"),
        ));
    }

    parse_chat_content(&text)
}

fn parse_chat_content(body: &str) -> DomainResult<String> {
    let v: Value = serde_json::from_str(body).map_err(|e| {
        DomainError::new(
            ErrorCode::Internal,
            format!("chat completion json: {e}"),
        )
    })?;

    // OpenAI: choices[0].message.content
    if let Some(content) = v
        .pointer("/choices/0/message/content")
        .and_then(|c| c.as_str())
    {
        let s = content.trim();
        if !s.is_empty() {
            return Ok(s.to_string());
        }
    }

    // Some gateways: choices[0].text
    if let Some(content) = v.pointer("/choices/0/text").and_then(|c| c.as_str()) {
        let s = content.trim();
        if !s.is_empty() {
            return Ok(s.to_string());
        }
    }

    // content as array of parts
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

#[cfg(test)]
mod chat_tests {
    use super::parse_chat_content;

    #[test]
    fn parse_openai_chat_shape() {
        let body = r#"{"choices":[{"message":{"role":"assistant","content":"  hello  "}}]}"#;
        assert_eq!(parse_chat_content(body).unwrap(), "hello");
    }
}
