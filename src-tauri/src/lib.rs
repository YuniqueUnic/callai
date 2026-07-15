mod app;
pub mod cli;
mod commands;
mod tray_runtime;
mod domain;
mod infra;

use std::sync::Arc;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    AppHandle, Runtime,
};
use tracing_subscriber::EnvFilter;

use app::{AlarmService, SystemClock, SystemSleeper};
use commands::AppState;
use domain::{LocaleCode, ThemeMode};
use infra::{
    AlarmScheduler, AppPaths, SqliteStore, SystemProcessRunner,
    TomlConfigBackup,
};
use infra::plugin::set_app_handle as set_plugin_app_handle;

pub const EVENT_NAVIGATE: &str = "callai://navigate";

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]

fn build_app_state() -> AppState {
    let paths = AppPaths::resolve().expect("resolve paths");
    paths.ensure().expect("ensure dirs");

    let store = Arc::new(SqliteStore::open(paths.db_file()).expect("open db"));
    let runner = Arc::new(SystemProcessRunner);
    let clock = Arc::new(SystemClock);
    let plugins = Arc::new(crate::infra::PluginManager::new(&paths).expect("plugin manager"));
    let plugin_console = Arc::new(crate::infra::PluginConsoleStore::new());
    let mcp_logs =
        Arc::new(crate::infra::McpLogStore::open(paths.mcp_log_file()).expect("mcp log store"));
    let backup = Arc::new(TomlConfigBackup::new(paths));
    let sleeper = Arc::new(SystemSleeper);
    let service = Arc::new(AlarmService::new(
        Arc::clone(&store) as Arc<dyn crate::app::AlarmStore>,
        runner,
        clock,
        backup,
        sleeper,
    ));
    let _ = service.bootstrap();

    let scheduler = Arc::new(AlarmScheduler::new(Arc::clone(&service)));
    scheduler.start();

    let mcp_http = crate::infra::mcp::McpHttpSupervisor::new(
        Arc::clone(&service),
        Arc::clone(&plugins),
        Arc::clone(&mcp_logs),
        Arc::clone(&plugin_console),
    );
    if let Ok(s) = service.get_settings() {
        mcp_http.apply(&s.mcp);
    }

    AppState {
        service: Arc::clone(&service),
        scheduler: Arc::clone(&scheduler),
        plugins,
        plugin_console,
        mcp_logs,
        store,
        mcp_http,
    }
}

pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("info".parse().unwrap()))
        .try_init();

    let state = build_app_state();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
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
            commands::mcp_http_status,
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
            commands::get_ai_runtime_context,
            commands::get_ai_runtime_context_prompt,
            commands::get_autostart_enabled,
            commands::set_autostart_enabled,
            commands::get_backups_dir,
            commands::open_backups_dir,
            commands::refresh_tray_menu,
            commands::list_alarm_sounds,
            commands::preview_alarm_sound,
            commands::list_plugins,
            commands::get_plugin,
            commands::install_plugin,
            commands::delete_plugin,
            commands::plugin_invoke,
            commands::plugin_ui_html,
            commands::plugin_get_source,
            commands::plugin_set_source,
            commands::plugin_append_console,
            commands::plugin_get_console,
            commands::plugin_clear_console,
            commands::open_plugin_window,
            commands::plugin_mark_run,
            commands::plugin_list_history,
            commands::list_mcp_logs,
            commands::clear_mcp_logs,
            commands::get_prompt,
            commands::render_prompt,
            commands::list_prompts,
            commands::generate_secret_token,
            commands::list_ai_models,
            commands::ai_chat_completion,
            commands::list_ai_chat_messages,
            commands::upsert_ai_chat_message,
            commands::delete_ai_chat_messages,
            commands::clear_ai_chat_messages,
            commands::set_ai_chat_applied,
        ])
        .setup(|app| {
            tray_runtime::install_tray(app)?;
            tray_runtime::apply_launch_minimized(app);
            tray_runtime::wire_close_to_hide(app);
            set_plugin_app_handle(app.handle().clone());
            tray_runtime::wire_failure_hook(app);

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
