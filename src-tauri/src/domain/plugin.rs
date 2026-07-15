//! Plugin domain: manifest, permissions, install draft, invoke routing contracts.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::{DomainError, DomainResult, ErrorCode};

/// Max retained MCP/tool audit log entries (ring).
pub const MCP_LOG_MAX: usize = 500;

/// Plugin id: lowercase letters, digits, hyphen; 2..=64 chars.
pub fn validate_plugin_id(id: &str) -> DomainResult<()> {
    let id = id.trim();
    if id.len() < 2 || id.len() > 64 {
        return Err(DomainError::new(
            ErrorCode::InvalidArgs,
            "plugin id must be 2..=64 chars",
        ));
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err(DomainError::new(
            ErrorCode::InvalidArgs,
            "plugin id must be lowercase alphanumeric/hyphen",
        ));
    }
    if id.starts_with('-') || id.ends_with('-') || id.contains("--") {
        return Err(DomainError::new(
            ErrorCode::InvalidArgs,
            "plugin id cannot start/end with hyphen or contain --",
        ));
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginPermission {
    Storage,
    Timer,
    Notification,
    NetworkLimited,
    LimitedExec,
    History,
}

impl PluginPermission {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Storage => "storage",
            Self::Timer => "timer",
            Self::Notification => "notification",
            Self::NetworkLimited => "network_limited",
            Self::LimitedExec => "limited_exec",
            Self::History => "history",
        }
    }

    #[allow(dead_code)]
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim() {
            "storage" => Some(Self::Storage),
            "timer" => Some(Self::Timer),
            "notification" => Some(Self::Notification),
            "network_limited" => Some(Self::NetworkLimited),
            "limited_exec" => Some(Self::LimitedExec),
            "history" => Some(Self::History),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub permissions: Vec<PluginPermission>,
    /// Relative UI file name inside plugin dir (default ui.html).
    #[serde(default = "default_ui")]
    pub ui: String,
}

fn default_ui() -> String {
    "ui.html".into()
}

impl PluginManifest {
    pub fn validate(&self) -> DomainResult<()> {
        validate_plugin_id(&self.id)?;
        if self.name.trim().is_empty() {
            return Err(DomainError::new(
                ErrorCode::InvalidName,
                "plugin name is required",
            ));
        }
        if self.version.trim().is_empty() {
            return Err(DomainError::new(
                ErrorCode::InvalidArgs,
                "plugin version is required",
            ));
        }
        if self.ui.trim().is_empty()
            || self.ui.contains("..")
            || self.ui.contains('/')
            || self.ui.contains('\\')
        {
            return Err(DomainError::new(
                ErrorCode::InvalidArgs,
                "plugin ui must be a simple filename",
            ));
        }
        Ok(())
    }

    pub fn allows(&self, perm: PluginPermission) -> bool {
        self.permissions.contains(&perm)
    }
}

/// Install / AI-generated plugin payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginDraft {
    pub manifest: PluginManifest,
    /// HTML UI content (AI-generated or template).
    pub ui_html: String,
}

impl PluginDraft {
    pub fn validate(&self) -> DomainResult<()> {
        self.manifest.validate()?;
        if self.ui_html.trim().is_empty() {
            return Err(DomainError::new(
                ErrorCode::InvalidArgs,
                "plugin ui_html is required",
            ));
        }
        // Soft size guard (1 MiB).
        if self.ui_html.len() > 1024 * 1024 {
            return Err(DomainError::new(
                ErrorCode::InvalidArgs,
                "plugin ui_html too large (max 1MiB)",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginSummary {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub permissions: Vec<PluginPermission>,
    pub ui: String,
    pub installed_at: DateTime<Utc>,
    pub last_run_at: Option<DateTime<Utc>>,
    pub record_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginHistoryEntry {
    pub id: i64,
    pub method: String,
    pub args_preview: String,
    pub result_preview: String,
    pub ok: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpLogEntry {
    pub id: i64,
    pub tool: String,
    pub args_preview: String,
    pub result_preview: String,
    pub ok: bool,
    pub source: String,
    pub created_at: DateTime<Utc>,
}

/// Methods routed by `plugin_invoke`.
pub mod methods {
    pub const STORAGE_GET: &str = "storage.get";
    pub const STORAGE_SET: &str = "storage.set";
    pub const STORAGE_DELETE: &str = "storage.delete";
    pub const STORAGE_LIST: &str = "storage.list";
    pub const HISTORY_LIST: &str = "history.list";
    pub const HISTORY_APPEND: &str = "history.append";
    pub const TIMER_NOW: &str = "timer.now";
    pub const NOTIFY: &str = "notification.show";
    pub const PING: &str = "ping";
}

pub fn permission_for_method(method: &str) -> Option<PluginPermission> {
    use methods::*;
    match method {
        STORAGE_GET | STORAGE_SET | STORAGE_DELETE | STORAGE_LIST => {
            Some(PluginPermission::Storage)
        }
        HISTORY_LIST | HISTORY_APPEND => Some(PluginPermission::History),
        TIMER_NOW => Some(PluginPermission::Timer),
        NOTIFY => Some(PluginPermission::Notification),
        PING => None, // always allowed
        _ => None,
    }
}
