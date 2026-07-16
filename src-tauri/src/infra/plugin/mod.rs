pub mod builtins;
mod console_buf;
mod manager;
pub mod package;
mod runtime;
mod storage;
mod templates;

pub use builtins::ensure_builtin_plugins;
pub use console_buf::{PluginConsoleEntry, PluginConsoleStore};
pub use manager::InstallPackageOpts;
pub use manager::PluginManager;
pub use package::InstallConflictMode;
pub use runtime::{
    ensure_warmup_plugin, is_builtin_plugin, is_internal_plugin, open_plugin_from_app_handle,
    open_plugin_window_with_params, run_builtin_plugin, set_app_handle, warmup_plugin_host,
};
pub use storage::McpLogStore;
