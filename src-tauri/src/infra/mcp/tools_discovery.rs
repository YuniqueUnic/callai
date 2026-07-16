//! MCP tool group
use serde_json::{json, Value};

use super::params::*;
use super::server::CallaiMcp;
use crate::domain::{AiRuntimeContext, DomainResult, PromptId};
use crate::infra::paths::AppPaths;

#[rmcp::tool_router(router = tool_router_discovery, vis = "pub(crate)")]
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
}
