//! MCP tool group
use serde_json::json;

use super::params::*;
use super::server::CallaiMcp;
use crate::domain::MCP_LOG_MAX;

#[rmcp::tool_router(router = tool_router_audit, vis = "pub(crate)")]
impl CallaiMcp {
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
