mod app;
mod commands;
mod domain;
mod infra;

use std::sync::Arc;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tracing_subscriber::EnvFilter;

use app::{AlarmService, SystemClock, SystemSleeper};
use commands::AppState;
use infra::{AlarmScheduler, AppPaths, SqliteStore, SystemProcessRunner, TomlConfigBackup};

const EVENT_NAVIGATE: &str = "callai://navigate";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("info".parse().unwrap()))
        .try_init();

    let paths = AppPaths::resolve().expect("resolve paths");
    paths.ensure().expect("ensure dirs");

    let store = Arc::new(SqliteStore::open(&paths.db_file).expect("open db"));
    let runner = Arc::new(SystemProcessRunner);
    let clock = Arc::new(SystemClock);
    let backup = Arc::new(TomlConfigBackup::new(paths));
    let sleeper = Arc::new(SystemSleeper);
    let service = Arc::new(AlarmService::new(store, runner, clock, backup, sleeper));
    let _ = service.bootstrap();

    let scheduler = Arc::new(AlarmScheduler::new(Arc::clone(&service)));
    scheduler.start();

    let state = AppState {
        service,
        scheduler: Arc::clone(&scheduler),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::list_alarms,
            commands::get_alarm,
            commands::create_alarm,
            commands::update_alarm,
            commands::delete_alarm,
            commands::set_alarm_enabled,
            commands::set_all_enabled,
            commands::run_alarm_now,
            commands::list_logs,
            commands::get_settings,
            commands::save_settings,
            commands::check_binary,
            commands::list_templates,
            commands::template_draft,
            commands::backup_now,
            commands::list_backups,
            commands::restore_backup,
            commands::next_trigger,
        ])
        .setup(|app| {
            let show_i = MenuItem::with_id(app, "show", "Show callai", true, None::<&str>)?;
            let new_i = MenuItem::with_id(app, "new", "New alarm", true, None::<&str>)?;
            let pause_i = MenuItem::with_id(app, "pause_all", "Pause all", true, None::<&str>)?;
            let resume_i = MenuItem::with_id(app, "resume_all", "Resume all", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &new_i, &pause_i, &resume_i, &quit_i])?;

            let mut tray_builder = TrayIconBuilder::new().menu(&menu);
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            let _tray = tray_builder
                .tooltip("callai")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        show_main_window(app);
                    }
                    "new" => {
                        show_main_window(app);
                        let _ = app.emit(EVENT_NAVIGATE, "new-alarm");
                    }
                    "pause_all" => {
                        if let Some(state) = app.try_state::<AppState>() {
                            let _ = state.service.set_enabled_all(false);
                        }
                    }
                    "resume_all" => {
                        if let Some(state) = app.try_state::<AppState>() {
                            let _ = state.service.set_enabled_all(true);
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let window_ = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running callai");
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg(test)]
mod tests;
