//! stdio MCP server backed by AlarmService + PluginManager + McpLogStore.
use std::sync::Arc;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::app::AlarmService;
use crate::domain::{AlarmDraft, DomainError, DomainResult, PluginDraft, PromptId, MCP_LOG_MAX};
use crate::infra::plugin::{McpLogStore, PluginManager};

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
    #[allow(dead_code)]
    tool_router: rmcp::handler::server::router::tool::ToolRouter<CallaiMcp>,
}

impl CallaiMcp {
    pub(crate) fn new(
        service: Arc<AlarmService>,
        plugins: Arc<PluginManager>,
        logs: Arc<McpLogStore>,
    ) -> Self {
        Self {
            service,
            plugins,
            logs,
            tool_router: Self::tool_router(),
        }
    }

    fn audit(&self, tool: &str, args: &Value, result: &DomainResult<Value>) {
        let (ok, preview) = match result {
            Ok(v) => (true, v.to_string()),
            Err(e) => (false, e.message.clone()),
        };
        let _ = self
            .logs
            .append(tool, &args.to_string(), &preview, ok, "mcp");
    }

    fn ok_text(v: impl Into<String>) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        use rmcp::model::IntoContents;
        let s: String = v.into();
        Ok(rmcp::model::CallToolResult::success(s.into_contents()))
    }

    fn map_err(e: DomainError) -> rmcp::ErrorData {
        rmcp::ErrorData::invalid_params(e.message, None)
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateAlarmParams {
    /// Alarm draft as JSON object (AlarmDraft schema).
    pub draft: Value,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct AlarmIdParams {
    pub id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct InstallPluginParams {
    pub draft: Value,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct PluginIdParams {
    pub id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct PluginInvokeParams {
    pub plugin_id: String,
    pub method: String,
    #[serde(default)]
    pub args: Value,
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
    /// system | alarm_generate | plugin_generate | ai2ui | animal_island_style
    pub id: String,
}

#[rmcp::tool_router]
impl CallaiMcp {
    #[rmcp::tool(description = "List all callai alarms")]
    fn list_alarms(&self) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({});
        let res = self.service.list_alarms().map(|v| json!(v));
        self.audit("list_alarms", &args, &res);
        let v = res.map_err(Self::map_err)?;
        Self::ok_text(v.to_string())
    }

    #[rmcp::tool(description = "Create an alarm from AlarmDraft JSON")]
    fn create_alarm(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            CreateAlarmParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!(&params.draft);
        let draft: AlarmDraft = serde_json::from_value(params.draft).map_err(|e| {
            rmcp::ErrorData::invalid_params(format!("invalid AlarmDraft: {e}"), None)
        })?;
        let res = self.service.create_alarm(draft).map(|v| json!(v));
        self.audit("create_alarm", &args, &res);
        let v = res.map_err(Self::map_err)?;
        Self::ok_text(v.to_string())
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
        let v = res.map_err(Self::map_err)?;
        Self::ok_text(v.to_string())
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
        let v = res.map_err(Self::map_err)?;
        Self::ok_text(v.to_string())
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
        let v = res.map_err(Self::map_err)?;
        Self::ok_text(v.to_string())
    }

    #[rmcp::tool(description = "List installed plugins")]
    fn list_plugins(&self) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({});
        let res = self.plugins.list().map(|p| json!(p));
        self.audit("list_plugins", &args, &res);
        let v = res.map_err(Self::map_err)?;
        Self::ok_text(v.to_string())
    }

    #[rmcp::tool(description = "Install a plugin from PluginDraft JSON (manifest + ui_html)")]
    fn install_plugin(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            InstallPluginParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!(&params.draft);
        let draft: PluginDraft = serde_json::from_value(params.draft).map_err(|e| {
            rmcp::ErrorData::invalid_params(format!("invalid PluginDraft: {e}"), None)
        })?;
        let res = self.plugins.install(draft).map(|p| json!(p));
        self.audit("install_plugin", &args, &res);
        let v = res.map_err(Self::map_err)?;
        Self::ok_text(v.to_string())
    }

    #[rmcp::tool(description = "Delete a plugin by id (removes data.db)")]
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
        let v = res.map_err(Self::map_err)?;
        Self::ok_text(v.to_string())
    }

    #[rmcp::tool(description = "Invoke a plugin method (plugin_invoke)")]
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
        let v = res.map_err(Self::map_err)?;
        Self::ok_text(v.to_string())
    }

    #[rmcp::tool(description = "List MCP audit logs (max 500 retained)")]
    fn list_mcp_logs(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            ListLogsParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let limit = params.limit.min(MCP_LOG_MAX as u32);
        let res = self.logs.list(limit).map(|l| json!(l));
        // Don't audit list_mcp_logs to avoid noise feedback loops.
        let v = res.map_err(Self::map_err)?;
        Self::ok_text(v.to_string())
    }

    #[rmcp::tool(description = "Get an embedded prompt template body by id")]
    fn get_prompt(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            PromptParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let id = PromptId::parse(&params.id).ok_or_else(|| {
            rmcp::ErrorData::invalid_params(
                "unknown prompt id (system|alarm_generate|plugin_generate|ai2ui|animal_island_style)",
                None,
            )
        })?;
        Self::ok_text(id.body().to_string())
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
            "callai MCP server: create/list/run alarms, install/invoke plugins, read prompts, list MCP logs (max 500)."
                .into(),
        );
        info
    }
}
