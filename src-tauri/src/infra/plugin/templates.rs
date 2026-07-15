//! Plugin host HTML snippets as external templates (minijinja where needed).
//! Keeps `manager.rs` free of giant inline HTML/JS strings.

use minijinja::{context, Environment};
use std::sync::OnceLock;

const BRIDGE_TPL: &str = include_str!("../../../templates/plugin/bridge.js.j2");
const BABEL_BOOT: &str = include_str!("../../../templates/plugin/babel_boot.html");
const HOST_CHROME_CSS: &str = include_str!("../../../templates/plugin/host_chrome.css");
const PRECONNECT: &str = include_str!("../../../templates/plugin/preconnect.html");

fn env() -> &'static Environment<'static> {
    static ENV: OnceLock<Environment<'static>> = OnceLock::new();
    ENV.get_or_init(|| {
        let mut env = Environment::new();
        env.set_undefined_behavior(minijinja::UndefinedBehavior::Lenient);
        env.add_template("bridge", BRIDGE_TPL)
            .expect("plugin bridge template");
        env
    })
}

/// Render the postMessage + callai SDK bridge for a plugin id.
pub fn render_bridge(plugin_id: &str) -> String {
    let plugin_id_js = serde_json::to_string(plugin_id).unwrap_or_else(|_| "\"\"".to_string());
    match env().get_template("bridge").and_then(|t| {
        t.render(context! {
            plugin_id_js => plugin_id_js,
        })
    }) {
        Ok(s) => s,
        Err(e) => {
            tracing::error!(error = %e, "plugin bridge template render failed");
            // Last-resort minimal bridge so the window still loads.
            format!(
                r#"<script>window.callai=window.callai||{{}};window.callai.pluginId={id};</script>"#,
                id = serde_json::to_string(plugin_id).unwrap_or_else(|_| "\"\"".into()),
            )
        }
    }
}

pub fn babel_boot_html() -> &'static str {
    BABEL_BOOT
}

pub fn host_chrome_style_tag() -> String {
    format!("{PRECONNECT}<style>\n{HOST_CHROME_CSS}\n</style>")
}

/// Wrap incomplete plugin documents into a full HTML shell.
pub fn wrap_bare_document(body: &str, bridge: &str) -> String {
    format!(
        r#"<!DOCTYPE html><html><head><meta charset="utf-8"/>{chrome}{csp}</head><body>{body}{bridge}</body></html>"#,
        chrome = host_chrome_style_tag(),
        csp = r#"<meta http-equiv="Content-Security-Policy" content="default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; img-src https: data: blob:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' 'unsafe-eval' https:; font-src https: data:; connect-src https:;">"#,
        body = body,
        bridge = bridge,
    )
}
