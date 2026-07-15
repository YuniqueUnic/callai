#![allow(dead_code)]
use std::sync::Arc;

use serde::Serialize;
use crate::app::AlarmService;
use crate::domain::DomainError;
use crate::infra::plugin::{McpLogStore, PluginConsoleStore, PluginManager};
use crate::infra::AlarmScheduler;

pub mod ai;
pub mod alarms;
pub mod plugins;
pub mod system;

#[derive(Debug, Serialize)]
pub struct TemplateDto {
    pub id: String,
    pub name_zh: String,
    pub name_en: String,
    pub binary: String,
    pub args: Vec<String>,
    /// "builtin" | "plugin"
    #[serde(default = "template_kind_builtin")]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugin: Option<crate::domain::AlarmPluginConfig>,
}

pub(crate) fn template_kind_builtin() -> String {
    "builtin".into()
}

pub(crate) fn map_err(err: DomainError) -> String {
    serde_json::to_string(&err).unwrap_or(err.message)
}

pub struct AppState {
    pub service: Arc<AlarmService>,
    pub scheduler: Arc<AlarmScheduler>,
    pub plugins: Arc<PluginManager>,
    pub plugin_console: Arc<PluginConsoleStore>,
    pub mcp_logs: Arc<McpLogStore>,
    /// Shared SQLite store (alarms + AI chat history).
    pub store: Arc<crate::infra::SqliteStore>,
}

// Re-export commands so `commands::list_alarms` keep working for generate_handler!.
pub use ai::*;
pub use alarms::*;
pub use plugins::*;
pub use system::*;
