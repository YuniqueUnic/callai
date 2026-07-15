use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ThemeMode {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum LocaleCode {
    #[default]
    #[serde(rename = "zh-CN")]
    ZhCn,
    #[serde(rename = "en")]
    En,
}

impl LocaleCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ZhCn => "zh-CN",
            Self::En => "en",
        }
    }

    pub fn parse(raw: &str) -> Self {
        match raw {
            "en" | "en-US" | "en-GB" => Self::En,
            _ => Self::ZhCn,
        }
    }
}

/// Theme + language.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct AppearanceSettings {
    pub theme: ThemeMode,
    pub locale: LocaleCode,
}

/// Launch / timezone / log retention.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeSettings {
    pub launch_minimized: bool,
    pub log_retention_days: u32,
    /// IANA timezone name, or "system" to auto-detect host timezone.
    pub timezone: String,
}

impl Default for RuntimeSettings {
    fn default() -> Self {
        Self {
            launch_minimized: false,
            log_retention_days: 30,
            timezone: "system".into(),
        }
    }
}

/// Failure notification + UI sound.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NotifySettings {
    pub notify_on_failure: bool,
    pub sound_enabled: bool,
}

impl Default for NotifySettings {
    fn default() -> Self {
        Self {
            notify_on_failure: false,
            sound_enabled: true,
        }
    }
}

/// Config.toml backup policy.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BackupSettings {
    pub auto_backup_on_start: bool,
    pub backup_keep_count: u32,
}

impl Default for BackupSettings {
    fn default() -> Self {
        Self {
            auto_backup_on_start: true,
            backup_keep_count: 10,
        }
    }
}

/// LLM provider family for in-app AI chat.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AiProvider {
    #[default]
    Openai,
    Claude,
    Gemini,
    /// Any OpenAI-compatible gateway (Groq, DeepSeek, local, etc.)
    OpenaiCompatible,
}

impl AiProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Openai => "openai",
            Self::Claude => "claude",
            Self::Gemini => "gemini",
            Self::OpenaiCompatible => "openai_compatible",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.trim() {
            "claude" | "anthropic" => Self::Claude,
            "gemini" | "google" => Self::Gemini,
            "openai_compatible" | "compatible" | "custom" => Self::OpenaiCompatible,
            _ => Self::Openai,
        }
    }

    /// Default public API base URL (empty for compatible = user must set).
    pub fn default_base_url(self) -> &'static str {
        match self {
            Self::Openai => "https://api.openai.com/v1",
            Self::Claude => "https://api.anthropic.com/v1",
            Self::Gemini => "https://generativelanguage.googleapis.com/v1beta/openai",
            Self::OpenaiCompatible => "",
        }
    }

    pub fn default_model(self) -> &'static str {
        match self {
            // GPT-5.6 Terra: balanced intelligence/cost (OpenAI API, 2026-07).
            Self::Openai => "gpt-5.6-terra",
            // Claude Sonnet 5 (claude-sonnet-4-20250514 retired 2026-06-15).
            Self::Claude => "claude-sonnet-5",
            Self::Gemini => "gemini-2.5-flash",
            Self::OpenaiCompatible => "gpt-5.6-terra",
        }
    }
}

/// In-app AI chat settings (nested wire key: `ai`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AiSettings {
    #[serde(default)]
    pub provider: AiProvider,
    /// API base URL; empty disables AI until filled.
    #[serde(default)]
    pub base_url: String,
    /// Local-only secret; never write to logs/MCP audit.
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_ai_model")]
    pub model: String,
}

fn default_ai_model() -> String {
    AiProvider::Openai.default_model().into()
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            provider: AiProvider::Openai,
            base_url: AiProvider::Openai.default_base_url().into(),
            api_key: String::new(),
            model: default_ai_model(),
        }
    }
}

#[allow(dead_code)]
impl AiSettings {
    pub fn is_configured(&self) -> bool {
        !self.base_url.trim().is_empty() && !self.api_key.trim().is_empty()
    }

    pub fn resolved_model(&self) -> &str {
        let m = self.model.trim();
        if m.is_empty() {
            self.provider.default_model()
        } else {
            m
        }
    }

    pub fn apply_provider_defaults(&mut self) {
        let def = self.provider.default_base_url();
        if self.base_url.trim().is_empty() && !def.is_empty() {
            self.base_url = def.into();
        }
        if self.model.trim().is_empty() {
            self.model = self.provider.default_model().into();
        }
    }
}

/// Optional in-process MCP HTTP endpoint (stdio remains via `callai mcp-server`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct McpSettings {
    /// When true, app tries to serve MCP over HTTP on listen_host:port.
    #[serde(default)]
    pub enabled: bool,
    /// Bind address, default loopback.
    #[serde(default = "default_mcp_host")]
    pub listen_host: String,
    #[serde(default = "default_mcp_port")]
    pub port: u16,
    /// Bearer token required by HTTP clients; empty = reject remote (stdio only).
    #[serde(default)]
    pub auth_token: String,
}

fn default_mcp_host() -> String {
    "127.0.0.1".into()
}

fn default_mcp_port() -> u16 {
    3927
}

impl Default for McpSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            listen_host: default_mcp_host(),
            port: default_mcp_port(),
            auth_token: String::new(),
        }
    }
}

#[allow(dead_code)]
impl McpSettings {
    pub fn listen_addr(&self) -> String {
        format!("{}:{}", self.listen_host.trim(), self.port)
    }

    pub fn endpoint_url(&self) -> String {
        format!("http://{}:{}/mcp", self.listen_host.trim(), self.port)
    }
}

/// Composed application settings.
///
/// Flat groups use `serde(flatten)` so legacy top-level keys stay stable;
/// `ai` and `mcp` are nested objects.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct AppSettings {
    #[serde(flatten)]
    pub appearance: AppearanceSettings,
    #[serde(flatten)]
    pub runtime: RuntimeSettings,
    #[serde(flatten)]
    pub notify: NotifySettings,
    #[serde(flatten)]
    pub backup: BackupSettings,
    #[serde(default)]
    pub ai: AiSettings,
    #[serde(default)]
    pub mcp: McpSettings,
}

impl AppSettings {
    pub fn theme(&self) -> ThemeMode {
        self.appearance.theme
    }

    pub fn locale(&self) -> LocaleCode {
        self.appearance.locale
    }

    pub fn timezone(&self) -> &str {
        &self.runtime.timezone
    }

    #[allow(dead_code)]
    pub fn sound_enabled(&self) -> bool {
        self.notify.sound_enabled
    }

    pub fn notify_on_failure(&self) -> bool {
        self.notify.notify_on_failure
    }

    pub fn launch_minimized(&self) -> bool {
        self.runtime.launch_minimized
    }

    pub fn log_retention_days(&self) -> u32 {
        self.runtime.log_retention_days
    }

    pub fn auto_backup_on_start(&self) -> bool {
        self.backup.auto_backup_on_start
    }

    #[allow(dead_code)]
    pub fn backup_keep_count(&self) -> u32 {
        self.backup.backup_keep_count
    }
}
