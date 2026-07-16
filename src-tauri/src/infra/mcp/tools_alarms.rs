//! MCP tool group
use serde_json::json;

use super::params::*;
use super::server::CallaiMcp;

#[rmcp::tool_router(router = tool_router_alarms, vis = "pub(crate)")]
impl CallaiMcp {
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

    #[rmcp::tool(
        description = "List alarm execution logs (stdout/stderr/status). Filter by alarm_id/status/query. Use after run_alarm to debug failures."
    )]
    fn list_execution_logs(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            ListExecutionLogsParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        use crate::domain::{ExecutionStatus, LogFilter};
        let status =
            params
                .status
                .as_deref()
                .and_then(|s| match s.trim().to_ascii_lowercase().as_str() {
                    "success" => Some(ExecutionStatus::Success),
                    "failed" => Some(ExecutionStatus::Failed),
                    "running" => Some(ExecutionStatus::Running),
                    "canceled" | "cancelled" => Some(ExecutionStatus::Canceled),
                    "timeout" => Some(ExecutionStatus::Timeout),
                    "retrying" => Some(ExecutionStatus::Retrying),
                    _ => None,
                });
        let filter = LogFilter {
            alarm_id: params.alarm_id.clone(),
            status,
            query: params.query.clone(),
            limit: params.limit.clamp(1, 200),
        };
        let args = json!({
            "alarm_id": &params.alarm_id,
            "status": &params.status,
            "query": &params.query,
            "limit": filter.limit,
        });
        let res = self.service.list_logs(filter).map(|v| json!(v));
        self.audit("list_execution_logs", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(description = "Enable or disable one alarm by id (does not delete)")]
    fn set_alarm_enabled(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            SetAlarmEnabledParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({ "id": &params.id, "enabled": params.enabled });
        let res = self
            .service
            .set_enabled(&params.id, params.enabled)
            .map(|a| json!(a));
        self.audit("set_alarm_enabled", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }
}
