//! stdio MCP server backed by AlarmService + PluginManager + McpLogStore.
//!
//! Tool surface (agent-facing):
//! - Discovery: `list_prompts`, `get_prompt`, `compose_prompt`, `get_runtime_context`
//! - Alarms: `list_alarms`, `get_alarm`, `create_alarm`, `update_alarm`, `delete_alarm`, `run_alarm`
//! - Plugins: `list_plugins`, `get_plugin`, `install_plugin`, `delete_plugin`,
//!   `get_plugin_source`, `set_plugin_source`, `plugin_console`, `plugin_history`, `plugin_invoke`
//! - Audit: `list_mcp_logs`, `clear_mcp_logs` (MCP-only source)
use std::collections::BTreeMap;
use std::sync::Arc;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::app::AlarmService;
use crate::domain::{
    AiRuntimeContext, AlarmDraft, DomainError, DomainResult, PluginDraft, PromptId, MCP_LOG_MAX,
};
use crate::infra::plugin::{McpLogStore, PluginConsoleStore, PluginManager};
use crate::infra::AppPaths;

/// Run MCP over stdio. Blocks until client disconnects.
pub fn run_mcp_server(
    service: Arc<AlarmService>,
    plugins: Arc<PluginManager>,
    logs: Arc<McpLogStore>,
) -> Result<(), String> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("tokio runtime: {e}"))?;
    rt.block_on(async move {
        let handler = CallaiMcp::new(service, plugins, logs);
        let transport = rmcp::transport::stdio();
        let server = rmcp::ServiceExt::serve(handler, transport)
            .await
            .map_err(|e| format!("mcp serve: {e}"))?;
        server
            .waiting()
            .await
            .map_err(|e| format!("mcp wait: {e}"))?;
        Ok(())
    })
}

#[derive(Clone)]
pub(crate) struct CallaiMcp {
    service: Arc<AlarmService>,
    plugins: Arc<PluginManager>,
    logs: Arc<McpLogStore>,
    /// Shared with App when available; empty ring in pure CLI MCP.
    console: Arc<PluginConsoleStore>,
    #[allow(dead_code)]
    tool_router: rmcp::handler::server::router::tool::ToolRouter<CallaiMcp>,
}

impl CallaiMcp {
    pub(crate) fn new(
        service: Arc<AlarmService>,
        plugins: Arc<PluginManager>,
        logs: Arc<McpLogStore>,
    ) -> Self {
        Self::with_console(service, plugins, logs, Arc::new(PluginConsoleStore::new()))
    }

    pub(crate) fn with_console(
        service: Arc<AlarmService>,
        plugins: Arc<PluginManager>,
        logs: Arc<McpLogStore>,
        console: Arc<PluginConsoleStore>,
    ) -> Self {
        Self {
            service,
            plugins,
            logs,
            console,
            tool_router: Self::tool_router(),
        }
    }

    /// Only MCP-originated tool calls write audit logs (never UI/plugin host).
    fn audit(&self, tool: &str, args: &Value, result: &DomainResult<Value>) {
        let (ok, preview) = match result {
            Ok(v) => (true, truncate(&v.to_string(), 4_000)),
            Err(e) => (false, truncate(&e.message, 4_000)),
        };
        let _ = self.logs.append(
            tool,
            &truncate(&args.to_string(), 2_000),
            &preview,
            ok,
            "mcp",
        );
    }

    fn ok_text(v: impl Into<String>) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        use rmcp::model::IntoContents;
        let s: String = v.into();
        Ok(rmcp::model::CallToolResult::success(s.into_contents()))
    }

    fn ok_json(v: &Value) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        Self::ok_text(v.to_string())
    }

    fn map_err(e: DomainError) -> rmcp::ErrorData {
        rmcp::ErrorData::invalid_params(e.message, None)
    }

    fn parse_alarm_draft(v: Value) -> Result<AlarmDraft, rmcp::ErrorData> {
        serde_json::from_value(v)
            .map_err(|e| rmcp::ErrorData::invalid_params(format!("invalid AlarmDraft: {e}"), None))
    }

    fn parse_plugin_draft(v: Value) -> Result<PluginDraft, rmcp::ErrorData> {
        serde_json::from_value(v)
            .map_err(|e| rmcp::ErrorData::invalid_params(format!("invalid PluginDraft: {e}"), None))
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let head: String = s.chars().take(max.saturating_sub(20)).collect();
    format!("{head}…[truncated]")
}

// ── Param schemas ───────────────────────────────────────────────────────────

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

// ── Tools ───────────────────────────────────────────────────────────────────

#[rmcp::tool_router]
impl CallaiMcp {
    // —— Discovery / prompts ————————————————————————————————

    #[rmcp::tool(
        description = "List embedded prompt templates (id, aliases, summary). Use get_prompt(id) next."
    )]
    fn list_prompts(&self) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let items: Vec<Value> = PromptId::all()
            .into_iter()
            .map(|p| {
                json!({
                    "id": p.as_str(),
                    "aliases": p.aliases(),
                    "summary": p.summary(),
                })
            })
            .collect();
        Self::ok_json(&json!({ "prompts": items }))
    }

    #[rmcp::tool(
        description = "Get one prompt body by id/alias (system, capabilities, style, sdk, alarm, plugin, …). Optional vars for continue_user."
    )]
    fn get_prompt(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            PromptParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let id = PromptId::parse(&params.id).ok_or_else(|| {
            let known: Vec<&str> = PromptId::all()
                .into_iter()
                .flat_map(|p| p.aliases().iter().copied())
                .collect();
            rmcp::ErrorData::invalid_params(
                format!(
                    "unknown prompt id {:?}; known: {}",
                    params.id,
                    known.join(", ")
                ),
                None,
            )
        })?;
        let body = if params.vars.is_empty() {
            id.body().to_string()
        } else {
            crate::domain::render_prompt_id_with(id, &params.vars)
        };
        Self::ok_json(&json!({
            "id": id.as_str(),
            "aliases": id.aliases(),
            "summary": id.summary(),
            "body": body,
        }))
    }

    #[rmcp::tool(
        description = "Compose the standard system prompt stack for a task. kind=alarm|plugin|fix|chat. Returns {layers, system} ready for LLM."
    )]
    fn compose_prompt(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            ComposePromptParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let kind = params.kind.trim().to_ascii_lowercase();
        let want_style = params
            .style
            .unwrap_or(matches!(kind.as_str(), "plugin" | "fix"));
        let want_sdk = params
            .sdk
            .unwrap_or(matches!(kind.as_str(), "plugin" | "fix"));

        let mut layers: Vec<Value> = Vec::new();
        let mut push = |id: PromptId| {
            layers.push(json!({
                "id": id.as_str(),
                "summary": id.summary(),
                "body": id.body(),
            }));
        };

        push(PromptId::System);
        push(PromptId::Capabilities);
        match kind.as_str() {
            "alarm" => {
                push(PromptId::AlarmGenerate);
                if want_style {
                    push(PromptId::AnimalIslandStyle);
                }
            }
            "plugin" => {
                push(PromptId::PluginGenerate);
                if want_style {
                    push(PromptId::AnimalIslandStyle);
                }
                if want_sdk {
                    push(PromptId::PluginSdk);
                }
            }
            "fix" => {
                push(PromptId::PluginGenerate);
                if want_sdk {
                    push(PromptId::PluginSdk);
                }
                if want_style {
                    push(PromptId::AnimalIslandStyle);
                }
            }
            "chat" => {}
            other => {
                return Err(rmcp::ErrorData::invalid_params(
                    format!("unknown kind {other:?}; use alarm|plugin|fix|chat"),
                    None,
                ));
            }
        }
        push(PromptId::OutputContract);

        let system = layers
            .iter()
            .filter_map(|l| l.get("body").and_then(|b| b.as_str()))
            .collect::<Vec<_>>()
            .join("\n\n---\n\n");

        Self::ok_json(&json!({
            "kind": kind,
            "layers": layers.iter().map(|l| json!({
                "id": l.get("id"),
                "summary": l.get("summary"),
            })).collect::<Vec<_>>(),
            "system": system,
            "hint": "Pass `system` as system message; put user requirements + diagnostics in the user message. For plugin fix, also call plugin_console(errors_only=true) and get_plugin_source."
        }))
    }

    #[rmcp::tool(
        description = "Host runtime context (OS, locale, timezone, version, AI settings summary) for external agents."
    )]
    fn get_runtime_context(&self) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({});
        let res = (|| -> DomainResult<Value> {
            let settings = self.service.get_settings()?;
            let paths = AppPaths::resolve()?;
            let ctx = AiRuntimeContext::collect(
                &settings,
                paths.config_dir().display().to_string(),
                paths.data_dir().display().to_string(),
            );
            Ok(json!(ctx))
        })();
        self.audit("get_runtime_context", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    // —— Alarms ——————————————————————————————————————————————

    #[rmcp::tool(description = "List all alarms")]
    fn list_alarms(&self) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({});
        let res = self.service.list_alarms().map(|v| json!(v));
        self.audit("list_alarms", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(description = "Get one alarm by id")]
    fn get_alarm(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            AlarmIdParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({ "id": &params.id });
        let res = self.service.get_alarm(&params.id).map(|v| json!(v));
        self.audit("get_alarm", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(description = "Create an alarm from AlarmDraft JSON")]
    fn create_alarm(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            CreateAlarmParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!(&params.draft);
        let draft = Self::parse_alarm_draft(params.draft)?;
        let res = self.service.create_alarm(draft).map(|v| json!(v));
        self.audit("create_alarm", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(description = "Update an existing alarm (id + AlarmDraft JSON)")]
    fn update_alarm(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            UpdateAlarmParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({ "id": &params.id, "draft": &params.draft });
        let draft = Self::parse_alarm_draft(params.draft)?;
        let res = self
            .service
            .update_alarm(&params.id, draft)
            .map(|v| json!(v));
        self.audit("update_alarm", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(description = "Delete an alarm by id")]
    fn delete_alarm(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            AlarmIdParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({ "id": &params.id });
        let res = self
            .service
            .delete_alarm(&params.id)
            .map(|_| json!({ "ok": true }));
        self.audit("delete_alarm", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(description = "Run one alarm immediately by id")]
    fn run_alarm(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            AlarmIdParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({ "id": &params.id });
        let res = self.service.run_alarm_once(&params.id).map(|l| json!(l));
        self.audit("run_alarm", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    // —— Plugins —————————————————————————————————————————————

    #[rmcp::tool(description = "List installed plugins")]
    fn list_plugins(&self) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({});
        let res = self.plugins.list().map(|p| json!(p));
        self.audit("list_plugins", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(description = "Get plugin summary by id")]
    fn get_plugin(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            PluginIdParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({ "id": &params.id });
        let res = self.plugins.get_summary(&params.id).map(|p| json!(p));
        self.audit("get_plugin", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(
        description = "Install/create a plugin from PluginDraft JSON (manifest + ui_html). For AI-authored plugins."
    )]
    fn install_plugin(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            InstallPluginParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!(&params.draft);
        let draft = Self::parse_plugin_draft(params.draft)?;
        let res = self.plugins.install(draft).map(|p| json!(p));
        self.audit("install_plugin", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(description = "Delete a plugin by id (removes ui + isolated storage)")]
    fn delete_plugin(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            PluginIdParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({ "id": &params.id });
        let res = self
            .plugins
            .delete(&params.id)
            .map(|_| json!({ "ok": true }));
        self.audit("delete_plugin", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(
        description = "Read plugin ui.html source (for fix/debug). Prefer with plugin_console(errors_only=true)."
    )]
    fn get_plugin_source(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            PluginIdParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({ "id": &params.id });
        let res = self
            .plugins
            .read_ui_html(&params.id)
            .map(|s| json!({ "id": params.id, "html": s }));
        self.audit("get_plugin_source", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(
        description = "Overwrite plugin ui.html (apply fix). Keep same plugin id / manifest unless intentionally renaming."
    )]
    fn set_plugin_source(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            SetPluginSourceParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({ "id": &params.id, "html_chars": params.html.chars().count() });
        let res = self
            .plugins
            .write_ui_html(&params.id, &params.html)
            .map(|_| json!({ "ok": true, "id": params.id }));
        self.audit("set_plugin_source", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(
        description = "Plugin console ring buffer (captured from plugin window). Use errors_only=true for AI fix (≤10 errors budget)."
    )]
    fn plugin_console(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            PluginConsoleParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({
            "id": &params.id,
            "limit": params.limit,
            "errors_only": params.errors_only,
        });
        let lim = params.limit.min(300) as usize;
        let mut entries = self.console.list(&params.id, lim);
        if params.errors_only {
            entries.retain(|e| {
                let l = e.level.to_ascii_lowercase();
                l == "error" || l == "err" || l == "fatal" || l == "exception"
            });
        }
        let count = entries.len();
        let empty = count == 0;
        let hint = if empty {
            "Empty: open the plugin window in the desktop app so console is captured, or use plugin_history."
        } else {
            ""
        };
        let res: DomainResult<Value> = Ok(json!({
            "id": params.id,
            "entries": entries,
            "count": count,
            "hint": hint,
        }));
        self.audit("plugin_console", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(description = "Plugin invoke history (method/ok/preview) from plugin data.db")]
    fn plugin_history(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            PluginHistoryParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({ "id": &params.id, "limit": params.limit });
        let res = self
            .plugins
            .list_history(&params.id, params.limit.min(200))
            .map(|h| json!(h));
        self.audit("plugin_history", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(description = "Invoke a plugin host method (storage/timer/notification bridge)")]
    fn plugin_invoke(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            PluginInvokeParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({
            "plugin_id": &params.plugin_id,
            "method": &params.method,
            "args": &params.args,
        });
        let res = self
            .plugins
            .invoke(&params.plugin_id, &params.method, params.args);
        self.audit("plugin_invoke", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    // —— MCP audit logs ——————————————————————————————————————

    #[rmcp::tool(
        description = "List MCP audit logs only (max 500, source=mcp). UI/plugin host never writes here."
    )]
    fn list_mcp_logs(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            ListLogsParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let limit = params.limit.min(MCP_LOG_MAX as u32);
        let res = self.logs.list(limit).map(|l| json!(l));
        // Don't audit list_mcp_logs (feedback loop).
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(description = "Clear all MCP audit logs")]
    fn clear_mcp_logs(&self) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let res = self.logs.clear().map(|n| json!({ "deleted": n }));
        // Don't audit clear either.
        Self::ok_json(&res.map_err(Self::map_err)?)
    }
}

#[rmcp::tool_handler]
impl rmcp::ServerHandler for CallaiMcp {
    fn get_info(&self) -> rmcp::model::ServerInfo {
        let mut info = rmcp::model::ServerInfo::default();
        info.capabilities = rmcp::model::ServerCapabilities::builder()
            .enable_tools()
            .build();
        info.server_info = {
            let mut i = rmcp::model::Implementation::from_build_env();
            i.name = "callai".into();
            i.version = env!("CARGO_PKG_VERSION").into();
            i.website_url = Some("https://github.com/YuniqueUnic/callai".into());
            i
        };
        info.instructions = Some(
            "callai MCP — external agent API (Codex/Claude).\n\
             Workflow:\n\
             1) list_prompts / compose_prompt(kind=alarm|plugin|fix) for system stack\n\
             2) get_prompt(style|sdk|capabilities) for single layers\n\
             3) create_alarm / install_plugin / set_plugin_source for apply\n\
             4) plugin_history + get_plugin_source for debug; list_mcp_logs for MCP audit only\n\
             MCP logs never include in-app plugin UI activity."
                .into(),
        );
        info
    }
}
