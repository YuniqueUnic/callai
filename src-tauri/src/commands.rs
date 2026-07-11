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
pub async fn run_alarm_now(state: State<'_, AppState>, id: String) -> Result<ExecutionLog, String> {
    // Offload to blocking pool so multi-minute retries don't stall the async runtime.
    let service = Arc::clone(&state.service);
    tauri::async_runtime::spawn_blocking(move || service.run_alarm_once(&id).map_err(map_err))
        .await
        .map_err(|e| format!("join error: {e}"))?
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
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    state.service.save_settings(settings).map_err(map_err)
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
pub fn next_trigger(state: State<'_, AppState>, id: String) -> Result<Option<String>, String> {
    let alarm = state.service.get_alarm(&id).map_err(map_err)?;
    let next = alarm
        .schedule
        .next_trigger_after(chrono::Local::now())
        .map_err(map_err)?;
    Ok(next.map(|d| d.to_rfc3339()))
}

pub struct AppState {
    pub service: Arc<AlarmService>,
    pub scheduler: Arc<AlarmScheduler>,
}
