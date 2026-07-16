pub mod builtins;
mod console_buf;
mod manager;
pub mod package;
mod runtime;
mod storage;
mod templates;

pub use builtins::ensure_builtin_plugins;
pub use console_buf::{PluginConsoleEntry, PluginConsoleStore};
pub use manager::PluginManager;
pub use package::InstallConflictMode;
pub use runtime::{
    is_builtin_plugin, open_plugin_window_with_params, run_builtin_plugin, set_app_handle,
};
pub use storage::McpLogStore;
