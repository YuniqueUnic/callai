mod console_buf;
mod manager;
mod runtime;
mod storage;
mod templates;

pub use console_buf::{PluginConsoleEntry, PluginConsoleStore};
pub use manager::PluginManager;
pub use runtime::{is_builtin_plugin, run_builtin_plugin, set_app_handle};
pub use storage::McpLogStore;
