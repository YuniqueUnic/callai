//! MCP tool parameter DTOs (JSON schema for rmcp).
use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateAlarmParams {
    /// Alarm draft as JSON object (AlarmDraft schema).
    pub draft: Value,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateAlarmParams {
    pub id: String,
    pub draft: Value,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct AlarmIdParams {
    pub id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct InstallPluginParams {
    /// PluginDraft: { manifest, ui_html } or dual-part friendly fields.
    pub draft: Value,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct OpenPluginWindowParams {
    pub id: String,
    #[serde(default)]
    pub params: Option<serde_json::Map<String, Value>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct PluginIdParams {
    pub id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SetPluginSourceParams {
    pub id: String,
    /// Full ui.html document (not JSON-escaped HTML).
    pub html: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct PluginInvokeParams {
    pub plugin_id: String,
    pub method: String,
    #[serde(default)]
    pub args: Value,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct PluginConsoleParams {
    pub id: String,
    /// Max lines (default 100, hard cap 300). Prefer errors for AI fix.
    #[serde(default = "default_console_limit")]
    pub limit: u32,
    /// When true, only error/fatal levels.
    #[serde(default)]
    pub errors_only: bool,
}

fn default_console_limit() -> u32 {
    100
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct PluginHistoryParams {
    pub id: String,
    #[serde(default = "default_history_limit")]
    pub limit: u32,
}

fn default_history_limit() -> u32 {
    40
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct RestoreBuiltinParams {
    pub id: String,
    /// When true, also wipe data.db.
    #[serde(default)]
    pub wipe_data: bool,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListLogsParams {
    #[serde(default = "default_log_limit")]
    pub limit: u32,
}

fn default_log_limit() -> u32 {
    100
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct PromptParams {
    /// Prompt id or alias: system, capabilities/caps, style/island, sdk,
    /// alarm, plugin, contract, ai2ui, continue_user, …
    pub id: String,
    /// Optional mini-jinja vars (e.g. continue_user: incomplete_tail, round).
    #[serde(default)]
    pub vars: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ComposePromptParams {
    /// Task kind: `alarm` | `plugin` | `fix` | `chat`
    pub kind: String,
    /// Include animal-island style layer (default true for plugin/fix).
    #[serde(default)]
    pub style: Option<bool>,
    /// Include plugin SDK layer (default true for plugin/fix).
    #[serde(default)]
    pub sdk: Option<bool>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListExecutionLogsParams {
    #[serde(default)]
    pub alarm_id: Option<String>,
    /// Optional status filter: success|failed|running|canceled|timeout|retrying
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default = "default_log_limit")]
    pub limit: u32,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SetAlarmEnabledParams {
    pub id: String,
    pub enabled: bool,
}
