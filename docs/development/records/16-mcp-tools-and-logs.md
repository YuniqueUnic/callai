# MCP tools & logs (callai)

## MCP logs vs plugin logs

| Stream | Source | Where |
|--------|--------|--------|
| **MCP audit** | only `callai mcp-server` tool calls (`source=mcp`) | Settings → MCP → **MCP 日志** drawer |
| **Plugin diagnostics** | plugin window console + invoke history | Plugins → **日志** drawer per plugin |

UI plugin install/delete/invoke **do not** write MCP logs.

## Agent workflow (Codex / Claude)

```text
list_prompts
compose_prompt { kind: "plugin" | "alarm" | "fix" | "chat" }
get_prompt { id: "style" | "sdk" | "capabilities" | … }
get_runtime_context

create_alarm / update_alarm / install_plugin / set_plugin_source
plugin_history / plugin_console / get_plugin_source
list_mcp_logs   # MCP-only audit
```

### Prompt aliases

- `style` / `island` → animal-island-style  
- `sdk` → plugin_sdk  
- `caps` → capabilities  
- `alarm` / `plugin` → generate templates  
- `contract` → output_contract  

### compose_prompt

Returns `{ system, layers[] }` — ready system stack for LLM without hand-merging prompts.

## CLI

```bash
callai mcp-server           # stdio (agent-spawned)
callai mcp-server --http    # long-running daemon
```
