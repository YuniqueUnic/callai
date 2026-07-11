#![allow(dead_code)]
use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::app::AlarmService;
use crate::domain::{
    draft_from_template, Alarm, AlarmDraft, AppSettings, DomainError, ExecutionLog, LogFilter,
    TEMPLATES,
};
use crate::infra::AlarmScheduler;

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
    if !settings.notify_on_failure {
        return;
    }
    let (title, body) = match settings.locale {
        crate::domain::LocaleCode::En => (
            "A little task needs care".to_string(),
            format!("{name} did not finish. Open logs for details."),
        ),
        crate::domain::LocaleCode::ZhCn => (
            "小任务不太顺利".to_string(),
            format!("「{name}」这次没完成，可以打开日志看看～"),
        ),
    };
    let _ = app.notification().builder().title(title).body(body).show();
}

#[tauri::command]
pub fn list_logs(
    state: State<'_, AppState>,
    filter: LogFilter,
) -> Result<Vec<ExecutionLog>, String> {
    state.service.list_logs(filter).map_err(map_err)
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
    let _ = rebuild_tray_menu(&app, saved.locale);
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
    let alarm = state.service.get_alarm(&id).map_err(map_err)?;
    let next = alarm
        .schedule
        .next_trigger_after(chrono::Local::now())
        .map_err(map_err)?;
    Ok(next.map(|d| d.to_rfc3339()))
}

#[tauri::command]
pub fn refresh_tray_menu(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let locale = state
        .service
        .get_settings()
        .map(|s| s.locale)
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
}
