//! Runtime snapshot for AI prompt injection (OS, locale, prefs — no secrets).

use serde::{Deserialize, Serialize};

use super::{AppSettings, LocaleCode, ThemeMode};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiRuntimeContext {
    pub app_name: String,
    pub app_version: String,
    pub os_family: String,
    pub os_name: String,
    pub os_version: String,
    pub arch: String,
    pub locale: String,
    pub theme: String,
    pub timezone_setting: String,
    pub timezone_resolved: String,
    pub sound_enabled: bool,
    pub notify_on_failure: bool,
    pub launch_minimized: bool,
    pub auto_backup_on_start: bool,
    pub log_retention_days: u32,
    pub ai_provider: String,
    pub ai_model: String,
    /// Base URL host only (never the API key).
    pub ai_base_host: String,
    pub mcp_enabled: bool,
    pub mcp_listen: String,
    pub now_local: String,
    pub now_utc: String,
    pub shell_hint: String,
    pub path_sep: String,
    pub config_dir: String,
    pub data_dir: String,
    pub notes: Vec<String>,
}

impl AiRuntimeContext {
    pub fn collect(settings: &AppSettings, config_dir: String, data_dir: String) -> Self {
        let info = os_info::get();
        let os_family = if cfg!(target_os = "macos") {
            "macos"
        } else if cfg!(target_os = "windows") {
            "windows"
        } else if cfg!(target_os = "linux") {
            "linux"
        } else {
            std::env::consts::OS
        }
        .to_string();

        let os_name = info.os_type().to_string();
        let os_version = info.version().to_string();
        let arch = std::env::consts::ARCH.to_string();

        let tz_setting = settings.timezone().to_string();
        let tz_resolved = crate::domain::resolve_timezone(settings.timezone())
            .map(|tz| tz.name().to_string())
            .unwrap_or_else(|_| crate::domain::detect_system_timezone().name().to_string());

        let now_utc = chrono::Utc::now();
        let now_local = crate::domain::resolve_timezone(settings.timezone())
            .ok()
            .map(|tz| now_utc.with_timezone(&tz).to_rfc3339())
            .unwrap_or_else(|| now_utc.to_rfc3339());

        let shell_hint = match os_family.as_str() {
            "windows" => "powershell / cmd; prefer PowerShell for scripts".into(),
            "macos" => "zsh/bash; open, osascript, say available".into(),
            "linux" => "bash/sh; notify-send may be available".into(),
            _ => "posix shell".into(),
        };

        let path_sep = if cfg!(windows) { "\\" } else { "/" }.to_string();

        let locale = match settings.locale() {
            LocaleCode::ZhCn => "zh-CN",
            LocaleCode::En => "en",
        }
        .to_string();

        let theme = match settings.theme() {
            ThemeMode::System => "system",
            ThemeMode::Light => "light",
            ThemeMode::Dark => "dark",
        }
        .to_string();

        let base = settings.ai.base_url.trim();
        let ai_base_host = url_host(base).unwrap_or_else(|| base.chars().take(64).collect());

        let mut notes = vec![
            "Never echo or request API keys / MCP tokens.".into(),
            "For pure chime reminders use binary `__callai_alarm__`.".into(),
            "Respond in the user's locale when writing names/copy.".into(),
        ];
        if os_family == "macos" {
            notes.push("macOS: prefer `say`, `osascript`, `open`; avoid Windows-only cmds.".into());
        } else if os_family == "windows" {
            notes.push("Windows: prefer `powershell` / `pwsh`; avoid bash-only one-liners.".into());
        } else if os_family == "linux" {
            notes.push("Linux: prefer portable shell; check binary exists before using.".into());
        }

        Self {
            app_name: "callai".into(),
            app_version: env!("CARGO_PKG_VERSION").into(),
            os_family,
            os_name,
            os_version,
            arch,
            locale,
            theme,
            timezone_setting: tz_setting,
            timezone_resolved: tz_resolved,
            sound_enabled: settings.notify.sound_enabled,
            notify_on_failure: settings.notify.notify_on_failure,
            launch_minimized: settings.runtime.launch_minimized,
            auto_backup_on_start: settings.backup.auto_backup_on_start,
            log_retention_days: settings.runtime.log_retention_days,
            ai_provider: settings.ai.provider.as_str().to_string(),
            ai_model: settings.ai.model.clone(),
            ai_base_host,
            mcp_enabled: settings.mcp.enabled,
            mcp_listen: settings.mcp.listen_addr(),
            now_local,
            now_utc: now_utc.to_rfc3339(),
            shell_hint,
            path_sep,
            config_dir,
            data_dir,
            notes,
        }
    }

    /// Markdown-ish block injected into AI system prompts.
    pub fn to_prompt_block(&self) -> String {
        let notes = self
            .notes
            .iter()
            .map(|n| format!("- {n}"))
            .collect::<Vec<_>>()
            .join("\n");
        format!(
            r#"<callai_runtime_context>
app: {app} v{ver}
os: {family} / {name} {os_ver} ({arch})
locale: {locale}
theme: {theme}
timezone.setting: {tz_set}
timezone.resolved: {tz_res}
now.local: {now_local}
now.utc: {now_utc}
shell: {shell}
path_sep: {sep}
dirs.config: {cfg}
dirs.data: {data}
prefs.sound_enabled: {sound}
prefs.notify_on_failure: {notify}
prefs.launch_minimized: {min}
prefs.auto_backup_on_start: {backup}
prefs.log_retention_days: {ret}
ai.provider: {ai_p}
ai.model: {ai_m}
ai.base_host: {ai_h}
mcp.enabled: {mcp_on}
mcp.listen: {mcp_listen}
notes:
{notes}
</callai_runtime_context>

Treat this block as authoritative environment/preferences for generation.
Pick binaries, paths, schedule times, and UI copy that fit this machine and locale.
Do not invent paths outside dirs.config / dirs.data unless the user asked.
"#,
            app = self.app_name,
            ver = self.app_version,
            family = self.os_family,
            name = self.os_name,
            os_ver = self.os_version,
            arch = self.arch,
            locale = self.locale,
            theme = self.theme,
            tz_set = self.timezone_setting,
            tz_res = self.timezone_resolved,
            now_local = self.now_local,
            now_utc = self.now_utc,
            shell = self.shell_hint,
            sep = self.path_sep,
            cfg = self.config_dir,
            data = self.data_dir,
            sound = self.sound_enabled,
            notify = self.notify_on_failure,
            min = self.launch_minimized,
            backup = self.auto_backup_on_start,
            ret = self.log_retention_days,
            ai_p = self.ai_provider,
            ai_m = self.ai_model,
            ai_h = self.ai_base_host,
            mcp_on = self.mcp_enabled,
            mcp_listen = self.mcp_listen,
            notes = notes,
        )
    }
}

fn url_host(base: &str) -> Option<String> {
    let b = base.trim().trim_end_matches('/');
    if b.is_empty() {
        return None;
    }
    // crude parse without full URL crate dependency
    let rest = b
        .strip_prefix("https://")
        .or_else(|| b.strip_prefix("http://"))
        .unwrap_or(b);
    let host = rest.split('/').next().unwrap_or(rest);
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::AppSettings;

    #[test]
    fn prompt_block_contains_markers() {
        let ctx = AiRuntimeContext::collect(&AppSettings::default(), "/cfg".into(), "/data".into());
        let block = ctx.to_prompt_block();
        assert!(block.contains("<callai_runtime_context>"));
        assert!(block.contains("app: callai"));
        assert!(block.contains("timezone.resolved:"));
        assert!(!block.contains("api_key"));
    }

    #[test]
    fn url_host_strips_path() {
        assert_eq!(
            url_host("https://api.openai.com/v1"),
            Some("api.openai.com".into())
        );
    }
}
