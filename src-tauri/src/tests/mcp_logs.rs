use crate::domain::MCP_LOG_MAX;
use crate::infra::plugin::McpLogStore;

#[test]
fn mcp_log_ring_caps_at_500() {
    let store = McpLogStore::open_in_memory().unwrap();
    for i in 0..(MCP_LOG_MAX + 40) {
        store
            .append(
                "tool",
                &format!("args-{i}"),
                &format!("ok-{i}"),
                true,
                "mcp",
            )
            .unwrap();
    }
    let all = store.list(MCP_LOG_MAX as u32).unwrap();
    assert_eq!(all.len(), MCP_LOG_MAX);
    // newest first
    assert!(all[0]
        .args_preview
        .contains(&(MCP_LOG_MAX + 39).to_string()));
    let over = store.list(10_000).unwrap();
    assert_eq!(over.len(), MCP_LOG_MAX);
}

#[test]
fn mcp_log_only_lists_mcp_source() {
    let store = McpLogStore::open_in_memory().unwrap();
    store
        .append("list_alarms", "{}", "[]", true, "mcp")
        .unwrap();
    store
        .append("plugin_invoke", "demo.ping", "err", false, "ui")
        .unwrap();
    store
        .append("install_plugin", "demo", "ok", true, "ui")
        .unwrap();
    let rows = store.list(10).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].source, "mcp");
    assert_eq!(rows[0].tool, "list_alarms");
    let n = store.clear().unwrap();
    // clear still wipes whole table (including legacy ui rows)
    assert!(n >= 1);
    assert!(store.list(10).unwrap().is_empty());
}
