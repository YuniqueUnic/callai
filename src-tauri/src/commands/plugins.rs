#![allow(dead_code)]
use serde_json::Value;
use tauri::State;

use crate::domain::{
    DomainError, McpLogEntry, PluginDraft, PluginHistoryEntry, PluginSummary, PromptId,
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
        let _ = app.notification().builder().title(title).body(body).show();
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
    let lim = limit.unwrap_or(100).min(crate::domain::PLUGIN_CONSOLE_MAX as u32) as usize;
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
/// Optional `params` are passed as launch query JSON so the plugin can open a specific page/mode.
#[tauri::command]
pub fn open_plugin_window(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    params: Option<serde_json::Map<String, Value>>,
) -> Result<(), String> {
    crate::domain::validate_plugin_id(&id).map_err(map_err)?;
    let summary = state.plugins.get_summary(&id).map_err(map_err)?;
    let map = params.unwrap_or_default();
    crate::infra::plugin::open_plugin_window_with_params(
        &app,
        &id,
        &map,
        Some(summary.name.as_str()),
    )
    .map_err(map_err)?;
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
    let map: std::collections::BTreeMap<String, String> =
        vars.unwrap_or_default().into_iter().collect();
    Ok(crate::domain::render_prompt_id_with(pid, &map))
}

#[tauri::command]
pub fn list_prompts() -> Result<Vec<String>, String> {
    Ok(PromptId::all()
        .into_iter()
        .map(|p| p.as_str().to_string())
        .collect())
}

/// Install a plugin from zip bytes (drag-and-drop / FileReader).
/// `conflict`: rename | overwrite | fail | skip
#[tauri::command]
pub fn import_plugin_zip_bytes(
    state: State<'_, AppState>,
    bytes: Vec<u8>,
    conflict: Option<String>,
) -> Result<Option<PluginSummary>, String> {
    use crate::infra::plugin::InstallConflictMode;
    let mode = conflict
        .as_deref()
        .map(InstallConflictMode::parse)
        .unwrap_or_default();
    state
        .plugins
        .import_zip_bytes(&bytes, mode)
        .map_err(map_err)
}

/// Install a plugin from a filesystem path (native file picker).
#[tauri::command]
pub fn import_plugin_zip_path(
    state: State<'_, AppState>,
    path: String,
    conflict: Option<String>,
) -> Result<Option<PluginSummary>, String> {
    use crate::infra::plugin::InstallConflictMode;
    let mode = conflict
        .as_deref()
        .map(InstallConflictMode::parse)
        .unwrap_or_default();
    state
        .plugins
        .import_zip_path(std::path::Path::new(&path), mode)
        .map_err(map_err)
}

#[tauri::command]
pub fn list_builtin_catalog(
    state: State<'_, AppState>,
) -> Result<Vec<crate::infra::plugin::builtins::BuiltinCatalogItem>, String> {
    crate::infra::plugin::builtins::list_catalog(&state.plugins).map_err(map_err)
}

#[tauri::command]
pub fn restore_builtin_plugin(
    state: State<'_, AppState>,
    id: String,
    wipe_data: Option<bool>,
) -> Result<PluginSummary, String> {
    crate::infra::plugin::builtins::restore_builtin(&state.plugins, &id, wipe_data.unwrap_or(false))
        .map_err(map_err)
}

#[tauri::command]
pub fn upgrade_builtin_plugins(state: State<'_, AppState>) -> Result<Vec<PluginSummary>, String> {
    crate::infra::plugin::builtins::upgrade_builtins(&state.plugins).map_err(map_err)
}

/// Marketplace prep: download zip from https URL and install.
#[tauri::command]
pub async fn import_plugin_zip_url(
    state: State<'_, AppState>,
    url: String,
    conflict: Option<String>,
) -> Result<Option<PluginSummary>, String> {
    use crate::infra::plugin::InstallConflictMode;
    let url = url.trim();
    if !(url.starts_with("https://")
        || url.starts_with("http://127.0.0.1")
        || url.starts_with("http://localhost"))
    {
        return Err("only https (or localhost) plugin URLs allowed".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("download failed: HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();
    if bytes.len() > 12 * 1024 * 1024 {
        return Err("downloaded zip too large".into());
    }
    let mode = conflict
        .as_deref()
        .map(InstallConflictMode::parse)
        .unwrap_or_default();
    state
        .plugins
        .import_zip_bytes(&bytes, mode)
        .map_err(map_err)
}

/// Export plugin zip to a filesystem path.
/// `include_data=true` packs data.db; false = bare plugin (manifest + ui only).
#[tauri::command]
pub fn export_plugin_zip_path(
    state: State<'_, AppState>,
    id: String,
    include_data: bool,
    path: String,
) -> Result<(), String> {
    state
        .plugins
        .export_zip_path(&id, include_data, std::path::Path::new(&path))
        .map_err(map_err)
}

/// Export plugin zip as raw bytes (tests / advanced clients).
#[tauri::command]
pub fn export_plugin_zip_bytes(
    state: State<'_, AppState>,
    id: String,
    include_data: bool,
) -> Result<Vec<u8>, String> {
    state
        .plugins
        .export_zip_bytes(&id, include_data)
        .map_err(map_err)
}

#[tauri::command]
pub fn peek_plugin_zip_id(bytes: Vec<u8>) -> Result<String, String> {
    crate::infra::plugin::package::peek_plugin_zip_id(&bytes).map_err(map_err)
}

#[tauri::command]
pub async fn fetch_plugin_registry(url: Option<String>) -> Result<crate::domain::RegistryIndex, String> {
    let url = url
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| crate::domain::DEFAULT_PLUGIN_REGISTRY_URL.to_string());
    if !(url.starts_with("https://")
        || url.starts_with("http://127.0.0.1")
        || url.starts_with("http://localhost"))
    {
        return Err("registry URL must be https (or localhost)".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("registry fetch failed: HTTP {}", resp.status()));
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    crate::domain::parse_registry_index(&text).map_err(map_err)
}
