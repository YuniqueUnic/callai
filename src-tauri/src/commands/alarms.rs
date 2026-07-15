#![allow(dead_code)]
use std::sync::Arc;

use tauri::State;

use crate::domain::{Alarm, AlarmDraft, ExecutionLog};

use super::{map_err, AppState};

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
