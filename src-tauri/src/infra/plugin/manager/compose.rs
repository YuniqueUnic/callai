//! Host HTML composition + sanitization.
use super::PluginManager;
use crate::domain::DomainResult;
use crate::infra::plugin::templates;

impl PluginManager {
    /// Compose host HTML that injects the callai bridge + host chrome CSS.
    /// Snippets live under `src-tauri/templates/plugin/` and are rendered via minijinja.
    pub fn compose_host_html(&self, id: &str) -> DomainResult<String> {
        let ui_path = {
            let manifest = self.read_manifest(id)?;
            self.plugin_dir(id).join(&manifest.ui)
        };
        let mtime = std::fs::metadata(&ui_path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if let Ok(cache) = self.compose_cache.lock() {
            if let Some((mt, html)) = cache.get(id) {
                if *mt == mtime {
                    return Ok(html.clone());
                }
            }
        }

        let body = Self::sanitize_plugin_html(&self.read_ui_html(id)?);
        let runtime = templates::render_host_runtime(id);
        let chrome = templates::host_chrome_style_tag();

        // Chrome CSS in <head>; bridge + host panel before </body>.
        let lower = body.to_lowercase();
        let out = if lower.contains("</head>") && lower.contains("</body>") {
            let with_chrome = body.replacen("</head>", &format!("{chrome}</head>"), 1);
            with_chrome.replacen("</body>", &format!("{runtime}</body>"), 1)
        } else if lower.contains("</head>") {
            let with_chrome = body.replacen("</head>", &format!("{chrome}</head>"), 1);
            format!("{with_chrome}{runtime}")
        } else if lower.contains("<body") {
            format!("{chrome}{body}{runtime}")
        } else {
            templates::wrap_bare_document(&body, &runtime)
        };
        if let Ok(mut cache) = self.compose_cache.lock() {
            cache.insert(id.to_string(), (mtime, out.clone()));
        }
        Ok(out)
    }

    /// Fix common model-output HTML issues before sandbox execution.
    ///
    /// Critical: modern `@babel/standalone` defaults React JSX to **automatic**
    /// runtime (`import { jsx } from "react/jsx-runtime"`). That cannot run in a
    /// classic `<script>` / UMD page. We inject `babel_boot.html` which registers
    /// `react-classic` (`runtime: "classic"` → `React.createElement`).
    pub(super) fn sanitize_plugin_html(html: &str) -> String {
        let mut s = html.to_string();

        for old in [
            r#"data-presets="react,typescript""#,
            r#"data-presets="typescript,react""#,
            r#"data-presets="react""#,
            "data-presets='react,typescript'",
            "data-presets='react'",
        ] {
            s = s.replace(old, r#"data-presets="react-classic""#);
        }

        let babel_boot = templates::babel_boot_html();
        if s.contains("registerPreset(\"react-classic\"")
            || s.contains("registerPreset('react-classic'")
        {
            // already bootstrapped (e.g. re-saved source)
            return s;
        }

        let babel_markers = [
            r#"@babel/standalone/babel.min.js"></script>"#,
            r#"babel.min.js"></script>"#,
            r#"babel.js"></script>"#,
        ];
        let mut injected = false;
        for m in babel_markers {
            if let Some(idx) = s.find(m) {
                let at = idx + m.len();
                s.insert_str(at, babel_boot);
                injected = true;
                break;
            }
        }
        if !injected {
            if let Some(idx) = s.find(r#"type="text/babel""#) {
                let head = s[..idx].rfind("<script").unwrap_or(idx);
                s.insert_str(head, babel_boot);
            } else if let Some(idx) = s.to_lowercase().find("</head>") {
                s.insert_str(idx, babel_boot);
            }
        }

        // Ensure host chrome CSS is present once (hide scrollbars, tight shell).
        let chrome = templates::host_chrome_style_tag();
        if !s.contains("/* Injected into plugin host document") {
            if let Some(idx) = s.to_lowercase().find("</head>") {
                s.insert_str(idx, &chrome);
            } else {
                s = format!("{chrome}{s}");
            }
        }

        s
    }
}
