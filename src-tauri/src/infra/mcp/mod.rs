//! MCP server (rmcp) exposing callai tools over stdio / HTTP, with audit logs (max 500).
mod http;
mod params;
mod server;
mod supervisor;
mod tools_alarms;
mod tools_audit;
mod tools_discovery;
mod tools_plugins;

pub use http::run_mcp_http_server;
pub use server::run_mcp_server;
pub use supervisor::{McpHttpStatus, McpHttpSupervisor};
