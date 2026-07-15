#![allow(dead_code)]
use tauri::State;
use serde_json::Value;

use crate::domain::{
    McpLogEntry, PluginDraft, PluginHistoryEntry, PluginSummary, PromptId, DomainError,
};
use crate::infra::plugin::PluginConsoleEntry;

use super::{map_err, AppState};

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
    state.plugins.install(draft).map_err(map_err)
}

#[tauri::command]
pub fn delete_plugin(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.plugins.delete(&id).map_err(map_err)
}

#[tauri::command]
pub fn plugin_invoke(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    plugin_id: String,
    method: String,
    args: Value,
) -> Result<Value, String> {
    let res = state.plugins.invoke(&plugin_id, &method, args.clone());
    // Host-owned OS notification for plugin notification.show (plugin console/history owns diagnostics).
    if res.is_ok() && method.trim() == "notification.show" {
        use tauri_plugin_notification::NotificationExt;
        let title = args
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("callai");
        let body = args.get("body").and_then(|v| v.as_str()).unwrap_or("");
        let _ = app
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show();
    }
    res.map_err(map_err)
}

#[tauri::command]
pub fn plugin_get_source(state: State<'_, AppState>, id: String) -> Result<String, String> {
    state.plugins.read_ui_html(&id).map_err(map_err)
}

#[tauri::command]
pub fn plugin_set_source(
    state: State<'_, AppState>,
    id: String,
    html: String,
) -> Result<(), String> {
    state.plugins.write_ui_html(&id, &html).map_err(map_err)
}

#[tauri::command]
pub fn plugin_append_console(
    state: State<'_, AppState>,
    id: String,
    entries: Vec<PluginConsoleEntry>,
) -> Result<(), String> {
    state.plugin_console.append_many(&id, entries);
    Ok(())
}

#[tauri::command]
pub fn plugin_get_console(
    state: State<'_, AppState>,
    id: String,
    limit: Option<u32>,
) -> Result<Vec<PluginConsoleEntry>, String> {
    let lim = limit.unwrap_or(100).min(300) as usize;
    Ok(state.plugin_console.list(&id, lim))
}

#[tauri::command]
pub fn plugin_clear_console(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.plugin_console.clear(&id);
    Ok(())
}

#[tauri::command]
pub fn plugin_ui_html(state: State<'_, AppState>, id: String) -> Result<String, String> {
    state.plugins.compose_host_html(&id).map_err(map_err)
}

/// Open (or focus) an independent OS window that hosts a plugin HTML UI.
#[tauri::command]
pub fn open_plugin_window(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    crate::domain::validate_plugin_id(&id).map_err(map_err)?;
    let summary = state.plugins.get_summary(&id).map_err(map_err)?;
    let label = format!("plugin-{id}");

    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        let _ = existing.set_title(&summary.name);
        return Ok(());
    }

    let url = WebviewUrl::App(format!("plugin.html?id={id}#id={id}").into());
    // Min height ≈ compact titlebar strip; expanded size is restored by the host UI.
    let win = WebviewWindowBuilder::new(&app, &label, url)
        .title(summary.name.clone())
        .inner_size(440.0, 720.0)
        .min_inner_size(280.0, 44.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .visible(true)
        .center()
        .build()
        .map_err(|e| format!("open plugin window: {e}"))?;

    let _ = win;
    let _ = state.plugins.mark_run(&id);
    Ok(())
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

/// Render a prompt template with runtime vars (mini-jinja).
/// Used for continuation turns (`continue_user` + incomplete_tail, round, …).
#[tauri::command]
pub fn render_prompt(
    id: String,
    vars: Option<std::collections::HashMap<String, String>>,
) -> Result<String, String> {
    let pid = PromptId::parse(&id).ok_or_else(|| {
        map_err(DomainError::new(
            crate::domain::ErrorCode::InvalidArgs,
            "unknown prompt id",
        ))
    })?;
    let map: std::collections::BTreeMap<String, String> = vars
        .unwrap_or_default()
        .into_iter()
        .collect();
    Ok(crate::domain::render_prompt_id_with(pid, &map))
}

#[tauri::command]
pub fn list_prompts() -> Result<Vec<String>, String> {
    Ok(PromptId::all()
        .into_iter()
        .map(|p| p.as_str().to_string())
        .collect())
}

