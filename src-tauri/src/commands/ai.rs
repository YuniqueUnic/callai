#![allow(dead_code)]
use tauri::{AppHandle, Emitter, State};

use crate::domain::{AiChatMessage, AiChatPage};

use super::{map_err, AppState};

#[tauri::command]
pub fn generate_secret_token() -> String {
    crate::domain::generate_secret_token()
}

#[tauri::command]
pub async fn list_ai_models(
    provider: String,
    base_url: String,
    api_key: String,
) -> Result<Vec<String>, String> {
    crate::infra::ai_models::list_models(&provider, &base_url, &api_key)
        .await
        .map_err(map_err)
}

/// Stream event for AI generation (progress + text deltas).
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStreamEvent {
    pub request_id: String,
    pub phase: String,
    pub delta: String,
    pub chars: u32,
    pub elapsed_ms: u64,
}

const AI_STREAM_EVENT: &str = "callai://ai-stream";

/// OpenAI-compatible chat/responses completion via Rust HTTP (no WebView CORS).
/// Emits `callai://ai-stream` with phase + delta while streaming (or one-shot fallback).
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn ai_chat_completion(
    app: AppHandle,
    request_id: String,
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    system: String,
    user: String,
    temperature: Option<f32>,
) -> Result<String, String> {
    let temp = temperature.unwrap_or(0.4);
    let rid = request_id.clone();
    let app2 = app.clone();
    let started = std::time::Instant::now();

    use std::sync::atomic::{AtomicU32, Ordering};
    let chars = AtomicU32::new(0);
    let result = crate::infra::ai_models::chat_completion_stream(
        &provider,
        &base_url,
        &api_key,
        &model,
        &system,
        &user,
        temp,
        |phase, delta| {
            if !delta.is_empty() {
                let _ = chars.fetch_add(delta.chars().count() as u32, Ordering::Relaxed);
            }
            let ev = AiStreamEvent {
                request_id: rid.clone(),
                phase: phase.as_str().to_string(),
                delta: delta.to_string(),
                chars: chars.load(Ordering::Relaxed),
                elapsed_ms: started.elapsed().as_millis() as u64,
            };
            let _ = app2.emit(AI_STREAM_EVENT, ev);
        },
    )
    .await;

    result.map_err(map_err)
}

// ---- AI chat history --------------------------------------------------------

#[tauri::command]
pub fn list_ai_chat_messages(
    state: State<'_, AppState>,
    before: Option<String>,
    limit: Option<u32>,
) -> Result<AiChatPage, String> {
    state
        .store
        .list_ai_chat_messages(before.as_deref(), limit.unwrap_or(30))
        .map_err(map_err)
}

#[tauri::command]
pub fn upsert_ai_chat_message(
    state: State<'_, AppState>,
    message: AiChatMessage,
) -> Result<(), String> {
    state
        .store
        .upsert_ai_chat_message(&message)
        .map_err(map_err)
}

#[tauri::command]
pub fn delete_ai_chat_messages(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<u64, String> {
    state.store.delete_ai_chat_messages(&ids).map_err(map_err)
}

#[tauri::command]
pub fn clear_ai_chat_messages(state: State<'_, AppState>) -> Result<u64, String> {
    state.store.clear_ai_chat_messages().map_err(map_err)
}

#[tauri::command]
pub fn set_ai_chat_applied(
    state: State<'_, AppState>,
    id: String,
    applied: bool,
) -> Result<(), String> {
    state
        .store
        .set_ai_chat_applied(&id, applied)
        .map_err(map_err)
}
