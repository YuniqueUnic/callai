//! Scheduled / on-demand plugin runs (`__callai_plugin__`).

use std::sync::{Arc, OnceLock};
use std::time::Instant;

use serde_json::{Map, Value};
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

/// Percent-encode a string for use in a query value (RFC 3986 unreserved left as-is).
pub fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 3);
    for &b in input.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Build `plugin.html?...` URL including optional launch params JSON.
pub fn plugin_window_path(plugin_id: &str, params: &Map<String, Value>) -> String {
    let id = plugin_id.trim();
    let mut path = format!("plugin.html?id={id}");
    if !params.is_empty() {
        let json = serde_json::to_string(params).unwrap_or_else(|_| "{}".into());
        path.push_str("&launch=");
        path.push_str(&percent_encode(&json));
    }
    path.push_str(&format!("#id={id}"));
    path
}

fn insert_string_param(map: &mut Map<String, Value>, key: &str, value: &str) {
    let k = key.trim();
    if k.is_empty() {
        return;
    }
    map.insert(k.to_string(), Value::String(value.to_string()));
}


/// Host-injected env keys — never treated as plugin launch params.
fn is_host_injected_env(key: &str) -> bool {
    let u = key.to_ascii_uppercase();
    u == "CALLAI_PLUGIN" || u == "CALLAI_NOTIFY"
}

/// Map alarm Task ENV → launch params (runtime only, no storage write).
///
/// Every non-host key is a param of the **same name** (e.g. `mode=drink`).
/// No prefixed legacy aliases.
pub fn apply_env_param_overrides(params: &mut Map<String, Value>, env: &[(String, String)]) {
    for (k, v) in env {
        if is_host_injected_env(k) {
            continue;
        }
        insert_string_param(params, k, v);
    }
}

/// Resolve plugin id + config from args/env.
///
/// Param precedence (later wins):
/// 1. `CALLAI_PLUGIN` JSON base (popup / suppress / optional params from host)
/// 2. argv `key=value` after plugin id
/// 3. Task ENV direct keys (same name as plugin settings keys)
pub fn config_from_args_env(args: &[String], env: &[(String, String)]) -> AlarmPluginConfig {
    let mut cfg = if let Some((_, json)) = env.iter().find(|(k, _)| k == "CALLAI_PLUGIN") {
        serde_json::from_str::<AlarmPluginConfig>(json).unwrap_or_default()
    } else {
        AlarmPluginConfig::default()
    };

    if cfg.plugin_id.trim().is_empty() {
        cfg.plugin_id = args
            .first()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_default();
    }

    // Argv key=value after plugin id
    for a in args.iter().skip(1) {
        if let Some((k, v)) = a.split_once('=') {
            insert_string_param(&mut cfg.params, k, v);
        }
    }

    apply_env_param_overrides(&mut cfg.params, env);
    cfg
}

/// Open or focus a plugin host window, injecting launch params into the URL.
pub fn open_plugin_window_with_params(
    app: &AppHandle,
    plugin_id: &str,
    params: &Map<String, Value>,
    title: Option<&str>,
) -> DomainResult<&'static str> {
    let id = plugin_id.trim();
    if id.is_empty() {
        return Err(DomainError::new(
            ErrorCode::InvalidArgs,
            "plugin id required",
        ));
    }
    let label = format!("plugin-{id}");
    let path = plugin_window_path(id, params);
    let title = title.unwrap_or(id);

    if let Some(existing) = app.get_webview_window(&label) {
        // Push fresh launch params into the already-open host (no full reload required).
        // PluginWindowApp listens for `callai:host-launch` and re-injects into the iframe bridge.
        let payload = serde_json::to_string(params).unwrap_or_else(|_| "{}".into());
        let script = format!(
            r#"(function(){{try{{var p={payload};window.__callaiPendingLaunch=p;window.dispatchEvent(new CustomEvent('callai:host-launch',{{detail:p}}));}}catch(e){{console.warn('host-launch',e);}}}})();"#,
            payload = payload
        );
        if let Err(e) = existing.eval(&script) {
            tracing::warn!(error = %e, plugin_id = id, "eval host-launch failed; focus only");
        }
        let _ = existing.unminimize();
        let _ = existing.show();
        let _ = existing.set_focus();
        let _ = existing.set_title(title);
        return Ok("focus_window");
    }

    use tauri::{WebviewUrl, WebviewWindowBuilder};
    let url = WebviewUrl::App(path.into());
    WebviewWindowBuilder::new(app, &label, url)
        .title(title.to_string())
        .inner_size(440.0, 720.0)
        .min_inner_size(280.0, 44.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .visible(true)
        .center()
        .build()
        .map_err(|e| {
            DomainError::new(
                ErrorCode::ExecutionFailed,
                format!("open plugin window: {e}"),
            )
        })?;
    Ok("open_window")
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
        match open_plugin_window_with_params(app, &cfg.plugin_id, &cfg.params, Some(&cfg.plugin_id))
        {
            Ok(action) => actions.push(action.into()),
            Err(e) => {
                return Ok(ProcessOutput {
                    exit_code: 1,
                    stdout: actions.join(","),
                    stderr: e.message,
                    duration_ms: started.elapsed().as_millis() as i64,
                    canceled: false,
                    timed_out: false,
                });
            }
        }
    } else if cfg.suppress_when_fullscreen && fullscreen {
        actions.push("suppressed_fullscreen".into());
    } else {
        actions.push("popup_disabled".into());
    }

    Ok(ProcessOutput {
        exit_code: 0,
        stdout: format!(
            "plugin={} actions={} params={}",
            cfg.plugin_id,
            actions.join("+"),
            serde_json::to_string(&cfg.params).unwrap_or_else(|_| "{}".into())
        ),
        stderr: String::new(),
        duration_ms: started.elapsed().as_millis() as i64,
        canceled: false,
        timed_out: false,
    })
}

#[cfg(test)]
mod unit {
    use super::*;
    use serde_json::json;

    #[test]
    fn percent_encode_keeps_unreserved() {
        assert_eq!(percent_encode("abc-._~XYZ09"), "abc-._~XYZ09");
        assert!(percent_encode("a b").contains("%20"));
        assert!(percent_encode("{\"mode\":\"drink\"}").contains("%22"));
    }

    #[test]
    fn plugin_window_path_embeds_launch_json() {
        let mut params = Map::new();
        params.insert("mode".into(), json!("drink"));
        let path = plugin_window_path("meal-spin", &params);
        assert!(path.starts_with("plugin.html?id=meal-spin&launch="));
        assert!(path.contains("#id=meal-spin"));
        assert!(path.contains("drink") || path.contains("%22drink%22") || path.contains("mode"));
    }

    #[test]
    fn env_overrides_win_over_base_and_args() {
        let args = vec!["meal-spin".into(), "mode=food".into(), "extra=1".into()];
        let env = vec![
            (
                "CALLAI_PLUGIN".into(),
                r#"{"plugin_id":"meal-spin","popup":true,"suppress_when_fullscreen":true,"params":{"mode":"food","size":"L"}}"#.into(),
            ),
            ("mode".into(), "drink".into()),
            ("size".into(), "S".into()),
            ("note".into(), "from-env".into()),
        ];
        let cfg = config_from_args_env(&args, &env);
        assert_eq!(cfg.plugin_id, "meal-spin");
        assert_eq!(
            cfg.params.get("mode").and_then(|v| v.as_str()),
            Some("drink")
        );
        assert_eq!(cfg.params.get("size").and_then(|v| v.as_str()), Some("S"));
        assert_eq!(
            cfg.params.get("note").and_then(|v| v.as_str()),
            Some("from-env")
        );
        assert_eq!(cfg.params.get("extra").and_then(|v| v.as_str()), Some("1"));
    }

    #[test]
    fn args_only_params_without_callai_plugin_json() {
        let args = vec!["todo".into(), "filter=open".into()];
        let cfg = config_from_args_env(&args, &[]);
        assert_eq!(cfg.plugin_id, "todo");
        assert_eq!(
            cfg.params.get("filter").and_then(|v| v.as_str()),
            Some("open")
        );
        assert!(cfg.popup);
    }

    #[test]
    fn direct_env_keys_override_as_launch_params() {
        let args = vec!["meal-spin".into()];
        let env = vec![
            (
                "CALLAI_PLUGIN".into(),
                r#"{"plugin_id":"meal-spin","popup":true,"suppress_when_fullscreen":true,"params":{"mode":"food"}}"#.into(),
            ),
            ("mode".into(), "drink".into()),
            ("spinSeconds".into(), "6".into()),
            ("CALLAI_NOTIFY".into(), r#"{"enabled":true}"#.into()), // reserved, not a param
        ];
        let cfg = config_from_args_env(&args, &env);
        assert_eq!(
            cfg.params.get("mode").and_then(|v| v.as_str()),
            Some("drink")
        );
        assert_eq!(
            cfg.params.get("spinSeconds").and_then(|v| v.as_str()),
            Some("6")
        );
        assert!(cfg.params.get("CALLAI_NOTIFY").is_none());
        assert!(cfg.params.get("enabled").is_none());
    }
}
