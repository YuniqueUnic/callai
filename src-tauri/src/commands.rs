#![allow(dead_code)]
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::app::AlarmService;
use crate::domain::{
    draft_from_template, AiChatMessage, AiChatPage, Alarm, AlarmDraft, AppSettings, BuiltinSoundId,
    DomainError, ExecutionLog, LogFilter, McpLogEntry, PluginDraft, PluginHistoryEntry,
    PluginSummary, PromptId, TEMPLATES,
};
use crate::infra::alarm_sound;
use crate::infra::plugin::{McpLogStore, PluginManager};
use crate::infra::AlarmScheduler;
use serde_json::Value;

#[derive(Debug, Serialize)]
pub struct TemplateDto {
    pub id: String,
    pub name_zh: String,
    pub name_en: String,
    pub binary: String,
    pub args: Vec<String>,
}

fn map_err(err: DomainError) -> String {
    serde_json::to_string(&err).unwrap_or(err.message)
}

#[tauri::command]
pub fn list_alarms(state: State<'_, AppState>) -> Result<Vec<Alarm>, String> {
    state.service.list_alarms().map_err(map_err)
}

#[tauri::command]
pub fn get_alarm(state: State<'_, AppState>, id: String) -> Result<Alarm, String> {
    state.service.get_alarm(&id).map_err(map_err)
}

#[tauri::command]
pub fn create_alarm(state: State<'_, AppState>, draft: AlarmDraft) -> Result<Alarm, String> {
    state.service.create_alarm(draft).map_err(map_err)
}

#[tauri::command]
pub fn update_alarm(
    state: State<'_, AppState>,
    id: String,
    draft: AlarmDraft,
) -> Result<Alarm, String> {
    state.service.update_alarm(&id, draft).map_err(map_err)
}

#[tauri::command]
pub fn delete_alarm(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.service.delete_alarm(&id).map_err(map_err)
}

#[tauri::command]
pub fn set_alarm_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<Alarm, String> {
    state.service.set_enabled(&id, enabled).map_err(map_err)
}

#[tauri::command]
pub fn set_all_enabled(state: State<'_, AppState>, enabled: bool) -> Result<Vec<Alarm>, String> {
    state.service.set_enabled_all(enabled).map_err(map_err)
}

#[tauri::command]
pub async fn run_alarm_now(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<ExecutionLog, String> {
    let service = Arc::clone(&state.service);
    let run_id = id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || service.run_alarm_once(&run_id))
        .await
        .map_err(|e| format!("join error: {e}"))?;

    match result {
        Ok(log) => {
            if !matches!(log.status, crate::domain::ExecutionStatus::Success) {
                maybe_notify_failure(&app, &state, &log.alarm_name);
            }
            Ok(log)
        }
        Err(err) => {
            let name = state
                .service
                .get_alarm(&id)
                .map(|a| a.name)
                .unwrap_or_else(|_| id.clone());
            maybe_notify_failure(&app, &state, &name);
            Err(map_err(err))
        }
    }
}

fn maybe_notify_failure(app: &tauri::AppHandle, state: &AppState, name: &str) {
    use tauri_plugin_notification::NotificationExt;
    let Ok(settings) = state.service.get_settings() else {
        return;
    };
    if !settings.notify_on_failure() {
        return;
    }
    let (title, body) = match settings.locale() {
        crate::domain::LocaleCode::En => ("Task failed".to_string(), format!("{name} failed")),
        crate::domain::LocaleCode::ZhCn => ("任务失败".to_string(), format!("「{name}」未完成")),
    };
    let _ = app.notification().builder().title(title).body(body).show();
}

#[tauri::command]
pub fn cancel_alarm_run(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    state.service.cancel_alarm_run(&id).map_err(map_err)
}

#[tauri::command]
pub fn list_logs(
    state: State<'_, AppState>,
    filter: LogFilter,
) -> Result<Vec<ExecutionLog>, String> {
    state.service.list_logs(filter).map_err(map_err)
}

#[tauri::command]
pub fn delete_log(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    state.service.delete_log(id).map_err(map_err)
}

#[tauri::command]
pub fn delete_logs(state: State<'_, AppState>, ids: Vec<i64>) -> Result<u64, String> {
    state.service.delete_logs(&ids).map_err(map_err)
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    state.service.get_settings().map_err(map_err)
}

#[tauri::command]
pub fn save_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let saved = state.service.save_settings(settings).map_err(map_err)?;
    let _ = rebuild_tray_menu(&app, saved.locale());
    Ok(saved)
}

#[tauri::command]
pub fn check_binary(state: State<'_, AppState>, binary: String) -> Result<Option<String>, String> {
    state.service.check_binary(&binary).map_err(map_err)
}

#[tauri::command]
pub fn list_templates() -> Result<Vec<TemplateDto>, String> {
    Ok(TEMPLATES
        .iter()
        .map(|t| TemplateDto {
            id: t.id.into(),
            name_zh: t.name_zh.into(),
            name_en: t.name_en.into(),
            binary: t.binary.into(),
            args: t.args.iter().map(|s| (*s).to_string()).collect(),
        })
        .collect())
}

#[tauri::command]
pub fn template_draft(id: String) -> Result<Option<AlarmDraft>, String> {
    Ok(draft_from_template(&id))
}

#[tauri::command]
pub fn backup_now(state: State<'_, AppState>) -> Result<String, String> {
    state.service.backup_now().map_err(map_err)
}

#[tauri::command]
pub fn list_backups(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.service.list_backups().map_err(map_err)
}

#[tauri::command]
pub fn restore_backup(state: State<'_, AppState>, name: String) -> Result<(), String> {
    state.service.restore_backup(&name).map_err(map_err)
}

#[tauri::command]
pub fn delete_backup(state: State<'_, AppState>, name: String) -> Result<(), String> {
    state.service.delete_backup(&name).map_err(map_err)
}

#[tauri::command]
pub fn next_trigger(state: State<'_, AppState>, id: String) -> Result<Option<String>, String> {
    let next = state.service.next_trigger_utc(&id).map_err(map_err)?;
    Ok(next.map(|d| d.to_rfc3339()))
}

#[tauri::command]
pub fn detect_timezone() -> Result<String, String> {
    Ok(crate::domain::detect_system_timezone().name().to_string())
}

#[tauri::command]
pub fn get_autostart_enabled() -> Result<bool, String> {
    crate::infra::AutoStart::for_current_exe("callai", &[])
        .and_then(|a| a.is_enabled())
        .map_err(map_err)
}

#[tauri::command]
pub fn set_autostart_enabled(enabled: bool) -> Result<bool, String> {
    crate::infra::AutoStart::for_current_exe("callai", &[])
        .and_then(|a| a.sync_enabled(enabled))
        .map(|s| s.enabled)
        .map_err(map_err)
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn get_ai_runtime_context(
    state: State<'_, AppState>,
) -> Result<crate::domain::AiRuntimeContext, String> {
    let settings = state.service.get_settings().map_err(map_err)?;
    let paths = crate::infra::AppPaths::resolve().map_err(map_err)?;
    paths.ensure().map_err(map_err)?;
    Ok(crate::domain::AiRuntimeContext::collect(
        &settings,
        paths.config_dir().display().to_string(),
        paths.data_dir().display().to_string(),
    ))
}

#[tauri::command]
pub fn get_ai_runtime_context_prompt(state: State<'_, AppState>) -> Result<String, String> {
    let ctx = get_ai_runtime_context(state)?;
    Ok(ctx.to_prompt_block())
}

/// Returns the backups directory path (for display / diagnostics).
#[tauri::command]
pub fn get_backups_dir() -> Result<String, String> {
    let paths = crate::infra::AppPaths::resolve().map_err(map_err)?;
    paths.ensure().map_err(map_err)?;
    Ok(paths.backups_dir().display().to_string())
}

/// Open the backups directory in the OS file manager.
/// Uses the Rust opener API (no frontend path-scope allowlist needed).
#[tauri::command]
pub fn open_backups_dir() -> Result<String, String> {
    let paths = crate::infra::AppPaths::resolve().map_err(map_err)?;
    paths.ensure().map_err(map_err)?;
    let dir = paths.backups_dir().to_path_buf();
    tauri_plugin_opener::open_path(&dir, None::<&str>).map_err(|e| e.to_string())?;
    Ok(dir.display().to_string())
}

#[tauri::command]
pub fn refresh_tray_menu(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let locale = state
        .service
        .get_settings()
        .map(|s| s.locale())
        .map_err(map_err)?;
    rebuild_tray_menu(&app, locale).map_err(|e| e.to_string())
}

fn rebuild_tray_menu(
    app: &tauri::AppHandle,
    locale: crate::domain::LocaleCode,
) -> tauri::Result<()> {
    #[allow(unused_imports)]
    use tauri::Manager;
    let copy = crate::tray_copy_public(locale);
    let menu = crate::build_tray_menu_public(app, &copy)?;
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu))?;
        let _ = tray.set_tooltip(Some(copy.tooltip.to_string()));
    }
    Ok(())
}

pub struct AppState {
    pub service: Arc<AlarmService>,
    pub scheduler: Arc<AlarmScheduler>,
    pub plugins: Arc<PluginManager>,
    pub mcp_logs: Arc<McpLogStore>,
    /// Shared SQLite store (alarms + AI chat history).
    pub store: Arc<crate::infra::SqliteStore>,
}

#[tauri::command]
pub fn list_alarm_sounds() -> Result<Vec<String>, String> {
    Ok(BuiltinSoundId::ALL
        .into_iter()
        .map(|s| s.as_str().to_string())
        .collect())
}

/// Preview a built-in algorithmic sound. Always allowed even in silent mode
/// (user-initiated), but still honors OS output mute/volume.
#[tauri::command]
pub fn preview_alarm_sound(sound_id: Option<String>) -> Result<bool, String> {
    let id = sound_id
        .as_deref()
        .and_then(BuiltinSoundId::parse)
        .unwrap_or_default();
    alarm_sound::play_sound(id)
}

// ---- Plugins / MCP / Prompts ------------------------------------------------

#[tauri::command]
pub fn list_plugins(state: State<'_, AppState>) -> Result<Vec<PluginSummary>, String> {
    state.plugins.list().map_err(map_err)
}

#[tauri::command]
pub fn get_plugin(state: State<'_, AppState>, id: String) -> Result<PluginSummary, String> {
    state.plugins.get_summary(&id).map_err(map_err)
}

#[tauri::command]
pub fn install_plugin(
    state: State<'_, AppState>,
    draft: PluginDraft,
) -> Result<PluginSummary, String> {
    let summary = state.plugins.install(draft).map_err(map_err)?;
    let _ = state.mcp_logs.append(
        "install_plugin",
        &summary.id,
        &format!("{}@{}", summary.name, summary.version),
        true,
        "ui",
    );
    Ok(summary)
}

#[tauri::command]
pub fn delete_plugin(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.plugins.delete(&id).map_err(map_err)?;
    let _ = state
        .mcp_logs
        .append("delete_plugin", &id, "ok", true, "ui");
    Ok(())
}

#[tauri::command]
pub fn plugin_invoke(
    state: State<'_, AppState>,
    plugin_id: String,
    method: String,
    args: Value,
) -> Result<Value, String> {
    let res = state.plugins.invoke(&plugin_id, &method, args.clone());
    let (ok, preview) = match &res {
        Ok(v) => (true, v.to_string()),
        Err(e) => (false, e.message.clone()),
    };
    let _ = state.mcp_logs.append(
        "plugin_invoke",
        &format!("{plugin_id}.{method}"),
        &preview,
        ok,
        "ui",
    );
    res.map_err(map_err)
}

#[tauri::command]
pub fn plugin_ui_html(state: State<'_, AppState>, id: String) -> Result<String, String> {
    state.plugins.compose_host_html(&id).map_err(map_err)
}

#[tauri::command]
pub fn plugin_mark_run(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.plugins.mark_run(&id).map_err(map_err)
}

#[tauri::command]
pub fn plugin_list_history(
    state: State<'_, AppState>,
    id: String,
    limit: Option<u32>,
) -> Result<Vec<PluginHistoryEntry>, String> {
    state
        .plugins
        .list_history(&id, limit.unwrap_or(50))
        .map_err(map_err)
}

#[tauri::command]
pub fn list_mcp_logs(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<McpLogEntry>, String> {
    state.mcp_logs.list(limit.unwrap_or(100)).map_err(map_err)
}

#[tauri::command]
pub fn clear_mcp_logs(state: State<'_, AppState>) -> Result<u64, String> {
    state.mcp_logs.clear().map_err(map_err)
}

#[tauri::command]
pub fn get_prompt(id: String) -> Result<String, String> {
    let pid = PromptId::parse(&id).ok_or_else(|| {
        map_err(DomainError::new(
            crate::domain::ErrorCode::InvalidArgs,
            "unknown prompt id",
        ))
    })?;
    Ok(pid.body().to_string())
}

#[tauri::command]
pub fn list_prompts() -> Result<Vec<String>, String> {
    Ok(PromptId::all()
        .into_iter()
        .map(|p| p.as_str().to_string())
        .collect())
}

#[tauri::command]
pub fn generate_secret_token() -> String {
    crate::domain::generate_secret_token()
}

#[tauri::command]
pub fn list_ai_models(
    provider: String,
    base_url: String,
    api_key: String,
) -> Result<Vec<String>, String> {
    crate::infra::ai_models::list_models(&provider, &base_url, &api_key).map_err(map_err)
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

    let result = tauri::async_runtime::spawn_blocking(move || {
        use std::sync::atomic::{AtomicU32, Ordering};
        let chars = AtomicU32::new(0);
        crate::infra::ai_models::chat_completion_stream(
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
    })
    .await
    .map_err(|e| format!("join error: {e}"))?;

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
    state.store.upsert_ai_chat_message(&message).map_err(map_err)
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
    state.store.set_ai_chat_applied(&id, applied).map_err(map_err)
}

