#![allow(dead_code)]
use tauri::State;

use crate::domain::{
    draft_from_template, AlarmDraft, AppSettings, BuiltinSoundId, ExecutionLog, LogFilter,
    TEMPLATES,
};
use crate::infra::alarm_sound;

use super::{map_err, AppState, TemplateDto};

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
pub fn list_templates(state: State<'_, AppState>) -> Result<Vec<TemplateDto>, String> {
    use crate::domain::{BUILTIN_PLUGIN_BINARY, AlarmPluginConfig};
    let mut out: Vec<TemplateDto> = TEMPLATES
        .iter()
        .map(|t| TemplateDto {
            id: t.id.into(),
            name_zh: t.name_zh.into(),
            name_en: t.name_en.into(),
            binary: t.binary.into(),
            args: t.args.iter().map(|s| (*s).to_string()).collect(),
            kind: "builtin".into(),
            plugin: None,
        })
        .collect();
    // Installed plugins as templates (display name unique already at install).
    if let Ok(plugins) = state.plugins.list() {
        for p in plugins {
            out.push(TemplateDto {
                id: format!("plugin:{}", p.id),
                name_zh: format!("插件 · {}", p.name),
                name_en: format!("Plugin · {}", p.name),
                binary: BUILTIN_PLUGIN_BINARY.into(),
                args: vec![p.id.clone()],
                kind: "plugin".into(),
                plugin: Some(AlarmPluginConfig {
                    plugin_id: p.id,
                    popup: true,
                    suppress_when_fullscreen: true,
                    params: serde_json::Map::new(),
                }),
            });
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn template_draft(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<AlarmDraft>, String> {
    use crate::domain::{BUILTIN_PLUGIN_BINARY, AlarmPluginConfig, DEFAULT_TIMEOUT_SECS};
    if let Some(rest) = id.strip_prefix("plugin:") {
        let summary = state.plugins.get_summary(rest).map_err(map_err)?;
        return Ok(Some(AlarmDraft {
            name: format!("{} 定时", summary.name),
            enabled: true,
            schedule: crate::domain::ScheduleSpec::Daily {
                times: vec!["16:50".into()],
            },
            binary: BUILTIN_PLUGIN_BINARY.into(),
            args: vec![summary.id.clone()],
            env_vars: vec![],
            retry: Default::default(),
            timeout_secs: DEFAULT_TIMEOUT_SECS,
            notification: Default::default(),
            plugin: Some(AlarmPluginConfig {
                plugin_id: summary.id,
                popup: true,
                suppress_when_fullscreen: true,
                params: serde_json::Map::new(),
            }),
        }));
    }
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

