//! MCP tool group
use serde_json::{json, Value};

use super::params::*;
use super::server::CallaiMcp;
use crate::domain::DomainResult;

#[rmcp::tool_router(router = tool_router_plugins, vis = "pub(crate)")]
impl CallaiMcp {
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
        let lim = params.limit.min(crate::domain::PLUGIN_CONSOLE_MAX as u32) as usize;
        let entries = if params.errors_only {
            self.console.list_errors(
                &params.id,
                params.limit.min(crate::domain::PLUGIN_ERROR_LOG_MAX as u32) as usize,
            )
        } else {
            self.console.list(&params.id, lim)
        };
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
            .list_history(
                &params.id,
                params
                    .limit
                    .min(crate::domain::PLUGIN_INVOKE_HISTORY_MAX as u32),
            )
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

    #[rmcp::tool(
        description = "List built-in plugin catalog with install/update/user_edited flags"
    )]
    fn list_builtin_catalog(&self) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({});
        let res = crate::infra::plugin::builtins::list_catalog(&self.plugins).map(|c| json!(c));
        self.audit("list_builtin_catalog", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(
        description = "Restore a built-in plugin UI/manifest from catalog (keeps data.db unless wipe_data=true)"
    )]
    fn restore_builtin(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            RestoreBuiltinParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({ "id": &params.id, "wipe_data": params.wipe_data });
        let res = crate::infra::plugin::builtins::restore_builtin(
            &self.plugins,
            &params.id,
            params.wipe_data,
        )
        .map(|s| json!(s));
        self.audit("restore_builtin", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(
        description = "Upgrade all eligible built-in plugins (skips user-edited UI; seeds new catalog ids)"
    )]
    fn upgrade_builtins(&self) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let args = json!({});
        let res = crate::infra::plugin::builtins::upgrade_builtins(&self.plugins).map(|v| json!(v));
        self.audit("upgrade_builtins", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }

    #[rmcp::tool(
        description = "Open/focus plugin host window. REQUIRES desktop `callai` GUI running (in-app MCP). Pure `mcp-server --http` without GUI returns app-handle error — then ask user to open app or use UI. Returns {action, ms, plugin_id}."
    )]
    fn open_plugin_window(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            OpenPluginWindowParams,
        >,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        use std::time::Instant;
        if crate::infra::plugin::is_internal_plugin(&params.id) {
            return Err(Self::map_err(crate::domain::DomainError::new(
                crate::domain::ErrorCode::InvalidArgs,
                "internal plugin cannot be opened",
            )));
        }
        let map = params.params.clone().unwrap_or_default();
        let args = json!({ "id": &params.id, "params": &map });
        let t0 = Instant::now();
        let res =
            crate::infra::plugin::open_plugin_from_app_handle(&params.id, &map).map(|action| {
                json!({
                    "action": action,
                    "plugin_id": params.id,
                    "ms": t0.elapsed().as_millis() as u64,
                })
            });
        self.audit("open_plugin_window", &args, &res);
        Self::ok_json(&res.map_err(Self::map_err)?)
    }
}
