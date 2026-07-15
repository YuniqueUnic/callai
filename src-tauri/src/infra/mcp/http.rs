//! Streamable HTTP MCP (CLI daemon + in-app supervisor).
use std::sync::Arc;

use axum::{
    extract::Request,
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::Response,
    routing::get,
    Router,
};
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use tokio_util::sync::CancellationToken;

use crate::app::AlarmService;
use crate::infra::plugin::{McpLogStore, PluginConsoleStore, PluginManager};

use super::server::CallaiMcp;

/// CLI: block until Ctrl+C. Requires non-empty bearer token.
pub fn run_mcp_http_server(
    service: Arc<AlarmService>,
    plugins: Arc<PluginManager>,
    logs: Arc<McpLogStore>,
    host: &str,
    port: u16,
    auth_token: &str,
) -> Result<(), String> {
    run_mcp_http_server_with_console(
        service,
        plugins,
        logs,
        Arc::new(PluginConsoleStore::new()),
        host,
        port,
        auth_token,
        None,
    )
}

/// Shared entry: optional external cancel token (App supervisor). When `cancel` is
/// None, installs Ctrl+C handler (CLI).
#[allow(clippy::too_many_arguments)]
pub fn run_mcp_http_server_with_console(
    service: Arc<AlarmService>,
    plugins: Arc<PluginManager>,
    logs: Arc<McpLogStore>,
    console: Arc<PluginConsoleStore>,
    host: &str,
    port: u16,
    auth_token: &str,
    cancel: Option<CancellationToken>,
) -> Result<(), String> {
    let host = host.trim().to_string();
    let token = auth_token.trim().to_string();
    if token.is_empty() {
        return Err(
            "MCP auth token is empty; open the app once or generate a token in Settings".into(),
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
        let cancel = cancel.unwrap_or_else(|| {
            let c = CancellationToken::new();
            let cancel = c.clone();
            tokio::spawn(async move {
                let _ = tokio::signal::ctrl_c().await;
                eprintln!("\n^C shutting down MCP HTTP…");
                cancel.cancel();
            });
            c
        });

        serve_mcp_http(
            service, plugins, logs, console, &host, port, &token, &bind, cancel,
        )
        .await
    })
}

/// Async HTTP MCP serve until `cancel` is triggered.
#[allow(clippy::too_many_arguments)]
pub async fn serve_mcp_http(
    service: Arc<AlarmService>,
    plugins: Arc<PluginManager>,
    logs: Arc<McpLogStore>,
    console: Arc<PluginConsoleStore>,
    host: &str,
    port: u16,
    token: &str,
    bind: &str,
    cancel: CancellationToken,
) -> Result<(), String> {
    let expected = Arc::new(token.to_string());

    // No Host allowlist: bind address is user-controlled (0.0.0.0 / LAN IP / custom).
    // Auth is Bearer token only. (rmcp: empty allowed_hosts = accept any Host.)
    let mcp: StreamableHttpService<CallaiMcp, LocalSessionManager> = StreamableHttpService::new(
        {
            let service = service.clone();
            let plugins = plugins.clone();
            let logs = logs.clone();
            let console = console.clone();
            move || {
                Ok(CallaiMcp::with_console(
                    service.clone(),
                    plugins.clone(),
                    logs.clone(),
                    console.clone(),
                ))
            }
        },
        Default::default(),
        StreamableHttpServerConfig::default()
            .with_cancellation_token(cancel.child_token())
            .disable_allowed_hosts(),
    );

    let expected_auth = expected.clone();
    let mcp_router = Router::new()
        .fallback_service(mcp)
        .layer(middleware::from_fn(move |req: Request, next: Next| {
            let exp = expected_auth.clone();
            async move { require_bearer(exp, req, next).await }
        }));

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .nest("/mcp", mcp_router);

    let listener = tokio::net::TcpListener::bind(bind)
        .await
        .map_err(|e| format!("bind {bind}: {e}"))?;
    let addr = listener
        .local_addr()
        .map_err(|e| format!("local_addr: {e}"))?;

    tracing::info!(%addr, %host, %port, "callai MCP HTTP listening");
    eprintln!("callai MCP HTTP listening on http://{addr}/mcp");
    eprintln!("  health: http://{addr}/health  (no auth)");
    eprintln!("  auth:   Authorization: Bearer <mcp.auth_token>");

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            cancel.cancelled_owned().await;
        })
        .await
        .map_err(|e| format!("mcp http serve: {e}"))?;
    Ok(())
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
