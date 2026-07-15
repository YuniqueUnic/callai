//! Scheduled / on-demand plugin runs (`__callai_plugin__`).

use std::sync::{Arc, OnceLock};
use std::time::Instant;

use tauri::{AppHandle, Manager};

use crate::app::{CancelFlag, ProcessOutput};
use crate::domain::{
    AlarmPluginConfig, DomainError, DomainResult, ErrorCode, BUILTIN_PLUGIN_ALIAS,
    BUILTIN_PLUGIN_BINARY,
};

static APP: OnceLock<AppHandle> = OnceLock::new();

pub fn set_app_handle(app: AppHandle) {
    let _ = APP.set(app);
}

pub fn is_builtin_plugin(binary: &str) -> bool {
    let b = binary.trim();
    b == BUILTIN_PLUGIN_BINARY || b.eq_ignore_ascii_case(BUILTIN_PLUGIN_ALIAS)
}

fn any_fullscreen(app: &AppHandle) -> bool {
    app.webview_windows()
        .values()
        .any(|w| w.is_fullscreen().unwrap_or(false))
}

/// Resolve plugin id + config from args/env.
pub fn config_from_args_env(args: &[String], env: &[(String, String)]) -> AlarmPluginConfig {
    if let Some((_, json)) = env.iter().find(|(k, _)| k == "CALLAI_PLUGIN") {
        if let Ok(cfg) = serde_json::from_str::<AlarmPluginConfig>(json) {
            return cfg;
        }
    }
    let plugin_id = args
        .first()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_default();
    let mut params = serde_json::Map::new();
    for a in args.iter().skip(1) {
        if let Some((k, v)) = a.split_once('=') {
            params.insert(
                k.trim().to_string(),
                serde_json::Value::String(v.to_string()),
            );
        }
    }
    let popup = env
        .iter()
        .find(|(k, _)| k == "CALLAI_PLUGIN_POPUP")
        .map(|(_, v)| v != "0" && !v.eq_ignore_ascii_case("false"))
        .unwrap_or(true);
    let suppress = env
        .iter()
        .find(|(k, _)| k == "CALLAI_PLUGIN_SUPPRESS_FS")
        .map(|(_, v)| v != "0" && !v.eq_ignore_ascii_case("false"))
        .unwrap_or(true);
    AlarmPluginConfig {
        plugin_id,
        popup,
        suppress_when_fullscreen: suppress,
        params,
    }
}

pub fn run_builtin_plugin(
    args: &[String],
    env: &[(String, String)],
    _timeout_secs: u32,
    cancel: Option<Arc<CancelFlag>>,
) -> DomainResult<ProcessOutput> {
    let started = Instant::now();
    if cancel.as_ref().is_some_and(|c| c.is_requested()) {
        return Ok(ProcessOutput {
            exit_code: -1,
            stdout: String::new(),
            stderr: "execution canceled by user".into(),
            duration_ms: started.elapsed().as_millis() as i64,
            canceled: true,
            timed_out: false,
        });
    }

    let cfg = config_from_args_env(args, env);
    if cfg.plugin_id.trim().is_empty() {
        return Err(DomainError::new(
            ErrorCode::InvalidArgs,
            "plugin id required for __callai_plugin__",
        ));
    }

    let Some(app) = APP.get() else {
        return Err(DomainError::new(
            ErrorCode::ExecutionFailed,
            "plugin runtime not ready (no app handle)",
        ));
    };

    let fullscreen = any_fullscreen(app);
    let mut actions = Vec::new();

    // Always best-effort notify (desktop toast).
    {
        use tauri_plugin_notification::NotificationExt;
        let title = format!("callai · {}", cfg.plugin_id);
        let body = if cfg.params.is_empty() {
            "插件定时任务触发了".into()
        } else {
            format!(
                "插件参数: {}",
                serde_json::to_string(&cfg.params).unwrap_or_default()
            )
        };
        let _ = app.notification().builder().title(title).body(body).show();
        actions.push("notify".to_string());
    }

    let should_popup = cfg.popup && !(cfg.suppress_when_fullscreen && fullscreen);
    if should_popup {
        // Reuse open_plugin_window command logic inline (same label).
        let id = cfg.plugin_id.clone();
        let label = format!("plugin-{id}");
        if let Some(existing) = app.get_webview_window(&label) {
            let _ = existing.unminimize();
            let _ = existing.show();
            let _ = existing.set_focus();
            actions.push("focus_window".into());
        } else {
            use tauri::{WebviewUrl, WebviewWindowBuilder};
            let url = WebviewUrl::App(format!("plugin.html?id={id}#id={id}").into());
            match WebviewWindowBuilder::new(app, &label, url)
                .title(id.clone())
                .inner_size(440.0, 720.0)
                .min_inner_size(280.0, 44.0)
                .resizable(true)
                .decorations(false)
                .transparent(true)
                .visible(true)
                .center()
                .build()
            {
                Ok(_) => actions.push("open_window".into()),
                Err(e) => {
                    return Ok(ProcessOutput {
                        exit_code: 1,
                        stdout: actions.join(","),
                        stderr: format!("open plugin window: {e}"),
                        duration_ms: started.elapsed().as_millis() as i64,
                        canceled: false,
                        timed_out: false,
                    });
                }
            }
        }
    } else if cfg.suppress_when_fullscreen && fullscreen {
        actions.push("suppressed_fullscreen".into());
    } else {
        actions.push("popup_disabled".into());
    }

    Ok(ProcessOutput {
        exit_code: 0,
        stdout: format!("plugin={} actions={}", cfg.plugin_id, actions.join("+")),
        stderr: String::new(),
        duration_ms: started.elapsed().as_millis() as i64,
        canceled: false,
        timed_out: false,
    })
}
