//! Long-running Streamable HTTP MCP daemon.
use std::sync::Arc;

use axum::{
    Router,
    extract::Request,
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::Response,
    routing::get,
};
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService,
    session::local::LocalSessionManager,
};
use tokio_util::sync::CancellationToken;

use crate::app::AlarmService;
use crate::infra::plugin::{McpLogStore, PluginManager};

use super::server::CallaiMcp;

/// Keep-alive HTTP MCP until Ctrl+C. Requires non-empty bearer token.
pub fn run_mcp_http_server(
    service: Arc<AlarmService>,
    plugins: Arc<PluginManager>,
    logs: Arc<McpLogStore>,
    host: &str,
    port: u16,
    auth_token: &str,
) -> Result<(), String> {
    let host = host.trim().to_string();
    let token = auth_token.trim().to_string();
    if token.is_empty() {
        return Err(
            "MCP auth token is empty; open the app once or run any command to bootstrap a token"
                .into(),
        );
    }
    if host.is_empty() {
        return Err("MCP listen host is empty".into());
    }
    let bind = format!("{host}:{port}");

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("tokio runtime: {e}"))?;

    rt.block_on(async move {
        let expected = Arc::new(token);
        let cancel = CancellationToken::new();

        {
            let cancel = cancel.clone();
            tokio::spawn(async move {
                let _ = tokio::signal::ctrl_c().await;
                eprintln!("\n^C shutting down MCP HTTP…");
                cancel.cancel();
            });
        }

        let allowed_hosts = vec![
            "localhost".into(),
            "127.0.0.1".into(),
            "::1".into(),
            host.clone(),
            format!("{host}:{port}"),
        ];

        let mcp: StreamableHttpService<CallaiMcp, LocalSessionManager> =
            StreamableHttpService::new(
                {
                    let service = service.clone();
                    let plugins = plugins.clone();
                    let logs = logs.clone();
                    move || Ok(CallaiMcp::new(service.clone(), plugins.clone(), logs.clone()))
                },
                Default::default(),
                StreamableHttpServerConfig::default()
                    .with_cancellation_token(cancel.child_token())
                    .with_allowed_hosts(allowed_hosts),
            );

        let expected_auth = expected.clone();
        let mcp_router = Router::new().fallback_service(mcp).layer(
            middleware::from_fn(move |req: Request, next: Next| {
                let exp = expected_auth.clone();
                async move { require_bearer(exp, req, next).await }
            }),
        );

        let app = Router::new()
            .route("/health", get(|| async { "ok" }))
            .nest("/mcp", mcp_router);

        let listener = tokio::net::TcpListener::bind(&bind)
            .await
            .map_err(|e| format!("bind {bind}: {e}"))?;
        let addr = listener
            .local_addr()
            .map_err(|e| format!("local_addr: {e}"))?;

        eprintln!("callai MCP HTTP daemon listening on http://{addr}/mcp");
        eprintln!("  health: http://{addr}/health  (no auth)");
        eprintln!("  auth:   Authorization: Bearer <mcp.auth_token>");
        eprintln!("  stop:   Ctrl+C");

        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                cancel.cancelled_owned().await;
            })
            .await
            .map_err(|e| format!("mcp http serve: {e}"))?;
        Ok(())
    })
}

async fn require_bearer(
    expected: Arc<String>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let headers: &HeaderMap = req.headers();
    let provided = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .map(|v| {
            v.strip_prefix("Bearer ")
                .or_else(|| v.strip_prefix("bearer "))
                .unwrap_or(v)
                .trim()
        });
    match provided {
        Some(p) if p == expected.as_str() => Ok(next.run(req).await),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}
