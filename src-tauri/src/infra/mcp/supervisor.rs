//! In-app MCP HTTP supervisor: start/stop/restart when settings.mcp changes.
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

use serde::Serialize;
use tokio_util::sync::CancellationToken;

use crate::app::AlarmService;
use crate::domain::McpSettings;
use crate::infra::plugin::{McpLogStore, PluginConsoleStore, PluginManager};

use super::http::run_mcp_http_server_with_console;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpHttpStatus {
    pub enabled: bool,
    pub running: bool,
    pub host: String,
    pub port: u16,
    pub endpoint: String,
    pub health_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, PartialEq, Eq)]
struct Desired {
    enabled: bool,
    host: String,
    port: u16,
    token: String,
}

struct Running {
    desired: Desired,
    cancel: CancellationToken,
    join: JoinHandle<()>,
}

struct Inner {
    desired: Desired,
    running: Option<Running>,
    last_error: Option<String>,
}

/// Thread-safe supervisor held in AppState.
pub struct McpHttpSupervisor {
    service: Arc<AlarmService>,
    plugins: Arc<PluginManager>,
    logs: Arc<McpLogStore>,
    console: Arc<PluginConsoleStore>,
    inner: Mutex<Inner>,
}

impl McpHttpSupervisor {
    pub fn new(
        service: Arc<AlarmService>,
        plugins: Arc<PluginManager>,
        logs: Arc<McpLogStore>,
        console: Arc<PluginConsoleStore>,
    ) -> Arc<Self> {
        Arc::new(Self {
            service,
            plugins,
            logs,
            console,
            inner: Mutex::new(Inner {
                desired: Desired {
                    enabled: false,
                    host: "127.0.0.1".into(),
                    port: 33927,
                    token: String::new(),
                },
                running: None,
                last_error: None,
            }),
        })
    }

    /// Apply MCP settings: start, stop, or restart if bind/token changed.
    pub fn apply(&self, mcp: &McpSettings) {
        let desired = Desired {
            enabled: mcp.enabled,
            host: mcp.listen_host.trim().to_string(),
            port: mcp.port,
            token: mcp.auth_token.trim().to_string(),
        };

        let mut g = self.inner.lock().unwrap();
        g.desired = desired.clone();

        if !desired.enabled {
            self.stop_locked(&mut g);
            g.last_error = None;
            return;
        }

        if desired.token.is_empty() {
            self.stop_locked(&mut g);
            g.last_error = Some("auth token is empty".into());
            return;
        }

        if desired.host.is_empty() {
            self.stop_locked(&mut g);
            g.last_error = Some("listen host is empty".into());
            return;
        }

        // Already running with same config?
        if let Some(ref run) = g.running {
            if run.desired == desired && !run.join.is_finished() {
                g.last_error = None;
                return;
            }
        }

        // Restart
        self.stop_locked(&mut g);
        g.last_error = None;

        let cancel = CancellationToken::new();
        let cancel_thread = cancel.clone();
        let service = Arc::clone(&self.service);
        let plugins = Arc::clone(&self.plugins);
        let logs = Arc::clone(&self.logs);
        let console = Arc::clone(&self.console);
        let host = desired.host.clone();
        let port = desired.port;
        let token = desired.token.clone();
        let err_slot = Arc::new(Mutex::new(None::<String>));
        let err_slot2 = Arc::clone(&err_slot);

        let join = thread::Builder::new()
            .name("callai-mcp-http".into())
            .spawn(move || {
                let res = run_mcp_http_server_with_console(
                    service,
                    plugins,
                    logs,
                    console,
                    &host,
                    port,
                    &token,
                    Some(cancel_thread),
                );
                if let Err(e) = res {
                    // Ignore cancel-driven exit noise when possible.
                    let soft = e.contains("cancel") || e.contains("shutdown");
                    if !soft {
                        tracing::error!(error = %e, "MCP HTTP server stopped with error");
                        if let Ok(mut slot) = err_slot2.lock() {
                            *slot = Some(e);
                        }
                    }
                }
            })
            .expect("spawn mcp http thread");

        // Brief settle: if thread dies immediately, surface bind error.
        thread::sleep(std::time::Duration::from_millis(120));
        if join.is_finished() {
            let err = err_slot.lock().ok().and_then(|g| g.clone());
            g.last_error = err.or_else(|| Some("failed to start MCP HTTP".into()));
            g.running = None;
            return;
        }

        g.running = Some(Running {
            desired,
            cancel,
            join,
        });
        // Pull early bind error if thread already stored one.
        let early = err_slot.lock().ok().and_then(|slot| slot.clone());
        if let Some(e) = early {
            g.last_error = Some(e);
        }
    }

    pub fn status(&self) -> McpHttpStatus {
        let g = self.inner.lock().unwrap();
        let desired = g.desired.clone();
        let running = g
            .running
            .as_ref()
            .map(|r| !r.join.is_finished())
            .unwrap_or(false);
        // If thread died, expose error from last_error
        let mut error = g.last_error.clone();
        if g.running.as_ref().is_some_and(|r| r.join.is_finished()) {
            error = error.or_else(|| Some("MCP HTTP stopped unexpectedly".into()));
        }
        let endpoint = format!(
            "http://{}:{}/mcp",
            if desired.host.is_empty() {
                "127.0.0.1"
            } else {
                &desired.host
            },
            desired.port
        );
        let health_url = format!(
            "http://{}:{}/health",
            if desired.host.is_empty() {
                "127.0.0.1"
            } else {
                &desired.host
            },
            desired.port
        );
        McpHttpStatus {
            enabled: desired.enabled,
            running: running && error.is_none(),
            host: desired.host,
            port: desired.port,
            endpoint,
            health_url,
            error,
        }
    }

    fn stop_locked(&self, g: &mut Inner) {
        if let Some(run) = g.running.take() {
            run.cancel.cancel();
            // Don't block forever on shutdown.
            let _ = run.join.join();
        }
    }
}

impl Drop for McpHttpSupervisor {
    fn drop(&mut self) {
        if let Ok(mut g) = self.inner.lock() {
            self.stop_locked(&mut g);
        }
    }
}
