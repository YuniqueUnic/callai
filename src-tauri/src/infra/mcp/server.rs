//! stdio MCP server backed by AlarmService + PluginManager + McpLogStore.
//!
//! Tool surface (agent-facing):
//! - Discovery: `list_prompts`, `get_prompt`, `compose_prompt`, `get_runtime_context`
//! - Alarms: `list_alarms`, `get_alarm`, `create_alarm`, `update_alarm`, `delete_alarm`, `run_alarm`
//! - Plugins: `list_plugins`, `get_plugin`, `install_plugin`, `delete_plugin`,
//!   `get_plugin_source`, `set_plugin_source`, `plugin_console`, `plugin_history`, `plugin_invoke`
//! - Audit: `list_mcp_logs`, `clear_mcp_logs` (MCP-only source)
use std::sync::Arc;

use serde_json::Value;

use crate::app::AlarmService;
use crate::domain::{AlarmDraft, DomainError, DomainResult, PluginDraft};
use crate::infra::plugin::{McpLogStore, PluginConsoleStore, PluginManager};

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
    pub(crate) service: Arc<AlarmService>,
    pub(crate) plugins: Arc<PluginManager>,
    pub(crate) logs: Arc<McpLogStore>,
    /// Shared with App when available; empty ring in pure CLI MCP.
    pub(crate) console: Arc<PluginConsoleStore>,
    #[allow(dead_code)]
    pub(crate) tool_router: rmcp::handler::server::router::tool::ToolRouter<CallaiMcp>,
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

    pub(crate) fn tool_router() -> rmcp::handler::server::router::tool::ToolRouter<Self> {
        Self::tool_router_discovery()
            + Self::tool_router_alarms()
            + Self::tool_router_plugins()
            + Self::tool_router_audit()
    }

    /// Only MCP-originated tool calls write audit logs (never UI/plugin host).
    pub(crate) fn audit(&self, tool: &str, args: &Value, result: &DomainResult<Value>) {
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

    pub(crate) fn ok_text(
        v: impl Into<String>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        use rmcp::model::IntoContents;
        let s: String = v.into();
        Ok(rmcp::model::CallToolResult::success(s.into_contents()))
    }

    pub(crate) fn ok_json(v: &Value) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        Self::ok_text(v.to_string())
    }

    pub(crate) fn map_err(e: DomainError) -> rmcp::ErrorData {
        rmcp::ErrorData::invalid_params(e.message, None)
    }

    pub(crate) fn parse_alarm_draft(v: Value) -> Result<AlarmDraft, rmcp::ErrorData> {
        serde_json::from_value(v)
            .map_err(|e| rmcp::ErrorData::invalid_params(format!("invalid AlarmDraft: {e}"), None))
    }

    pub(crate) fn parse_plugin_draft(v: Value) -> Result<PluginDraft, rmcp::ErrorData> {
        serde_json::from_value(v)
            .map_err(|e| rmcp::ErrorData::invalid_params(format!("invalid PluginDraft: {e}"), None))
    }
}

pub(crate) fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let head: String = s.chars().take(max.saturating_sub(20)).collect();
    format!("{head}…[truncated]")
}

// ── Param schemas ───────────────────────────────────────────────────────────

// ── Tools ───────────────────────────────────────────────────────────────────

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
