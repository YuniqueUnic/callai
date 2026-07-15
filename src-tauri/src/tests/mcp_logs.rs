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
                "test",
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
fn mcp_log_clear_and_source() {
    let store = McpLogStore::open_in_memory().unwrap();
    store
        .append("list_alarms", "{}", "[]", true, "mcp")
        .unwrap();
    store
        .append("plugin_invoke", "demo.ping", "err", false, "ui")
        .unwrap();
    let rows = store.list(10).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].source, "ui");
    assert!(!rows[0].ok);
    let n = store.clear().unwrap();
    assert_eq!(n, 2);
    assert!(store.list(10).unwrap().is_empty());
}
