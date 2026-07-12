mod app;
pub mod cli;
mod commands;
mod domain;
mod infra;

use std::sync::Arc;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, WindowEvent,
};
use tracing_subscriber::EnvFilter;

use app::{AlarmService, SystemClock, SystemSleeper};
use commands::AppState;
use domain::{LocaleCode, ThemeMode};
use infra::{
    set_failure_hook, AlarmScheduler, AppPaths, SqliteStore, SystemProcessRunner, TomlConfigBackup,
};

const EVENT_NAVIGATE: &str = "callai://navigate";

pub struct TrayCopy {
    pub show: &'static str,
    pub new_alarm: &'static str,
    pub logs: &'static str,
    pub run_all: &'static str,
    pub pause_all: &'static str,
    pub resume_all: &'static str,
    pub settings: &'static str,
    pub quit: &'static str,
    pub tooltip: &'static str,
}

pub fn tray_copy_public(locale: LocaleCode) -> TrayCopy {
    match locale {
        LocaleCode::En => TrayCopy {
            show: "Show window",
            new_alarm: "New alarm",
            logs: "Logs",
            run_all: "Run all now",
            pause_all: "Pause all",
            resume_all: "Resume all",
            settings: "Settings",
            quit: "Quit",
            tooltip: "callai",
        },
        LocaleCode::ZhCn => TrayCopy {
            show: "显示窗口",
            new_alarm: "新建闹钟",
            logs: "日志",
            run_all: "全部立即执行",
            pause_all: "全部暂停",
            resume_all: "全部恢复",
            settings: "设置",
            quit: "退出",
            tooltip: "callai",
        },
    }
}

pub fn build_tray_menu_public<R: Runtime>(
    app: &AppHandle<R>,
    copy: &TrayCopy,
) -> tauri::Result<Menu<R>> {
    let show_i = MenuItem::with_id(app, "show", copy.show, true, None::<&str>)?;
    let run_all_i = MenuItem::with_id(app, "run_all", copy.run_all, true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let new_i = MenuItem::with_id(app, "new", copy.new_alarm, true, None::<&str>)?;
    let logs_i = MenuItem::with_id(app, "logs", copy.logs, true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let pause_i = MenuItem::with_id(app, "pause_all", copy.pause_all, true, None::<&str>)?;
    let resume_i = MenuItem::with_id(app, "resume_all", copy.resume_all, true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let settings_i = MenuItem::with_id(app, "settings", copy.settings, true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", copy.quit, true, None::<&str>)?;
    Menu::with_items(
        app,
        &[
            &show_i,
            &run_all_i,
            &sep1,
            &new_i,
            &logs_i,
            &sep2,
            &pause_i,
            &resume_i,
            &sep3,
            &settings_i,
            &quit_i,
        ],
    )
}

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn navigate(app: &AppHandle, target: &str) {
    show_main_window(app);
    let _ = app.emit(EVENT_NAVIGATE, target);
}

fn notify_failure(app: &AppHandle, name: &str, locale: LocaleCode) {
    use tauri_plugin_notification::NotificationExt;
    let (title, body) = match locale {
        LocaleCode::En => ("Task failed".to_string(), format!("{name} failed")),
        LocaleCode::ZhCn => ("任务失败".to_string(), format!("「{name}」未完成")),
    };
    let _ = app.notification().builder().title(title).body(body).show();
}

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
        service: Arc::clone(&service),
        scheduler: Arc::clone(&scheduler),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin({
            #[allow(unused_mut)]
            let mut builder = tauri_plugin_autostart::Builder::new().app_name("callai");
            #[cfg(target_os = "macos")]
            {
                builder =
                    builder.macos_launcher(tauri_plugin_autostart::MacosLauncher::LaunchAgent);
            }
            builder.build()
        })
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
            commands::cancel_alarm_run,
            commands::list_logs,
            commands::delete_log,
            commands::delete_logs,
            commands::get_settings,
            commands::save_settings,
            commands::check_binary,
            commands::list_templates,
            commands::template_draft,
            commands::backup_now,
            commands::list_backups,
            commands::restore_backup,
            commands::delete_backup,
            commands::next_trigger,
            commands::detect_timezone,
            commands::get_app_version,
            commands::get_backups_dir,
            commands::open_backups_dir,
            commands::refresh_tray_menu,
        ])
        .setup(|app| {
            let locale = app
                .state::<AppState>()
                .service
                .get_settings()
                .map(|s| s.locale)
                .unwrap_or(LocaleCode::ZhCn);
            let copy = tray_copy_public(locale);
            let menu = build_tray_menu_public(app.handle(), &copy)?;

            let mut tray_builder = TrayIconBuilder::with_id("main-tray").menu(&menu);
            match tauri::image::Image::from_bytes(include_bytes!("../icons/trayTemplate.png")) {
                Ok(icon) => {
                    tray_builder = tray_builder.icon(icon).icon_as_template(true);
                }
                Err(_) => {
                    if let Some(icon) = app.default_window_icon() {
                        tray_builder = tray_builder.icon(icon.clone());
                    }
                }
            }

            let _tray = tray_builder
                .tooltip(copy.tooltip)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "new" => navigate(app, "new-alarm"),
                    "logs" => navigate(app, "logs"),
                    "settings" => navigate(app, "settings"),
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
                    "run_all" => {
                        if let Some(state) = app.try_state::<AppState>() {
                            if let Ok(alarms) = state.service.list_alarms() {
                                let locale = state
                                    .service
                                    .get_settings()
                                    .map(|s| s.locale)
                                    .unwrap_or(LocaleCode::ZhCn);
                                for alarm in alarms.into_iter().filter(|a| a.enabled) {
                                    let service = Arc::clone(&state.service);
                                    let app2 = app.clone();
                                    let name = alarm.name.clone();
                                    let id = alarm.id.clone();
                                    std::thread::spawn(move || match service.run_alarm_once(&id) {
                                        Ok(log)
                                            if !matches!(
                                                log.status,
                                                crate::domain::ExecutionStatus::Success
                                            ) =>
                                        {
                                            let notify = service
                                                .get_settings()
                                                .map(|s| s.notify_on_failure)
                                                .unwrap_or(false);
                                            if notify {
                                                notify_failure(&app2, &name, locale);
                                            }
                                        }
                                        Err(_) => {
                                            let notify = service
                                                .get_settings()
                                                .map(|s| s.notify_on_failure)
                                                .unwrap_or(false);
                                            if notify {
                                                notify_failure(&app2, &name, locale);
                                            }
                                        }
                                        _ => {}
                                    });
                                }
                            }
                        }
                    }
                    "quit" => app.exit(0),
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

            // Apply launch_minimized
            if let Ok(settings) = app.state::<AppState>().service.get_settings() {
                if settings.launch_minimized {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
                // best-effort theme hint for webview is frontend-owned
                let _ = settings.theme;
            }

            if let Some(window) = app.get_webview_window("main") {
                let window_ = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_.hide();
                    }
                });
            }

            // Scheduled-run failure notifications
            {
                let app_handle = app.handle().clone();
                let service_hook = Arc::clone(&app.state::<AppState>().service);
                set_failure_hook(move |name| {
                    let notify = service_hook
                        .get_settings()
                        .map(|s| s.notify_on_failure)
                        .unwrap_or(false);
                    if !notify {
                        return;
                    }
                    let locale = service_hook
                        .get_settings()
                        .map(|s| s.locale)
                        .unwrap_or(LocaleCode::ZhCn);
                    notify_failure(&app_handle, &name, locale);
                });
            }

            // Request notification permission early (macOS)
            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_notification::NotificationExt;
                let _ = app.notification().request_permission();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running callai");
}

// silence unused ThemeMode import warning path used for future
#[allow(dead_code)]
fn _theme_touch(t: ThemeMode) -> ThemeMode {
    t
}

#[cfg(test)]
mod tests;
