# callai MCP

## Correct operation modes

| Mode | Command | Lifecycle | Auth |
|------|---------|-----------|------|
| **stdio** (default) | `callai mcp-server` | Spawned by the AI client; exits when the client closes the pipe | none |
| **HTTP daemon** | `callai mcp-server --http` | Foreground keep-alive until Ctrl+C | `Authorization: Bearer <token>` |

stdio is the right shape for Claude Desktop / Codex / Cursor (`command` + `args`).  
HTTP is for long-running local agents, browser tools, or remote loopback clients.

Auth token is **auto-generated on first app/CLI bootstrap** and stored in settings (`mcp.auth_token`). Rotate from Settings UI.

## stdio (recommended for desktop agents)

```bash
callai mcp-server
```

Example Claude Desktop / Codex config:

```json
{
  "mcpServers": {
    "callai": {
      "command": "callai",
      "args": ["mcp-server"]
    }
  }
}
```

## HTTP daemon (keep-alive)

```bash
# uses settings.mcp.listen_host / port / auth_token
callai mcp-server --http

# overrides
callai mcp-server --http --host 127.0.0.1 --port 33927 --token "$TOKEN"
```

- Endpoint: `http://<host>:<port>/mcp`
- Health: `http://<host>:<port>/health` (no auth)
- Header: `Authorization: Bearer <token>`

Settings → MCP also shows the endpoint and stdio/http commands.  
Toggle **Enable HTTP MCP** records intent in settings; the long-running process is still started via CLI `mcp-server --http` (or a future in-app supervisor).

## Tools (see full table below)



## Tools (current)

| Tool | Description |
|------|-------------|
| `list_alarms` / `get_alarm` | List / get alarms |
| `create_alarm` / `update_alarm` / `delete_alarm` | Alarm CRUD from AlarmDraft JSON |
| `set_alarm_enabled` | Enable/disable without delete |
| `run_alarm` | Run immediately; returns ExecutionLog |
| `list_execution_logs` | Alarm run logs (stdout/stderr/status); filter `alarm_id`/`status`/`limit` |
| `list_plugins` / `get_plugin` | Installed plugins (**excludes** internal `callai-warmup`) |
| `install_plugin` / `delete_plugin` | PluginDraft install / remove |
| `plugin_invoke` | Host bridge: `storage.*` / `timer.*` / `notification.*` |
| `plugin_history` | Per-plugin invoke history from data.db |
| `plugin_console` | Ring buffer from plugin window (`errors_only` for fix) |
| `get_plugin_source` / `set_plugin_source` | Read/write `ui.html` for AI fix loop |
| `list_builtin_catalog` / `restore_builtin` / `upgrade_builtins` | Builtin lifecycle |
| `open_plugin_window` | Open/focus GUI host (**requires desktop app AppHandle**) |
| `list_prompts` / `get_prompt` / `compose_prompt` | Prompt stack for generation |
| `get_runtime_context` | OS/locale/timezone for wall-clock schedules |
| `list_mcp_logs` / `clear_mcp_logs` | MCP audit only (not plugin UI logs) |

## Agent workflow (Codex / Claude / Grok)

### A. Create & run alarm

```text
1. get_runtime_context          # timezone.resolved for wall-clock times
2. compose_prompt(kind=alarm)   # optional LLM system stack
3. create_alarm({ draft: AlarmDraft })
4. run_alarm({ id })
5. list_execution_logs({ alarm_id, limit: 10 })
6. set_alarm_enabled / update_alarm / delete_alarm as needed
```

AlarmDraft times are **wall-clock** in settings timezone (see `timezone.resolved`). Do **not** UTC-convert「晚上 8 点」.

### B. Install / invoke plugin

```text
1. list_plugins / list_builtin_catalog
2. install_plugin({ draft: { manifest, ui_html } })
3. plugin_invoke(storage.set/get, …)
4. plugin_history({ id })
```

### C. Debug & fix plugin UI

```text
1. open_plugin_window({ id })     # only if desktop GUI is running
2. plugin_console({ id, errors_only: true })
3. get_plugin_source({ id })
4. compose_prompt(kind=fix) + LLM
5. set_plugin_source({ id, html })  # full ui.html document
6. open_plugin_window again to verify
```

### D. Transport notes for agents

| Mode | When | open_plugin_window |
|------|------|--------------------|
| `callai mcp-server` (stdio) | Codex/Claude spawn | No GUI → **fails** with app-handle error (expected) |
| `callai mcp-server --http` | Long-running, shared DB | Same unless GUI also running |
| Desktop app with MCP enabled | In-app HTTP supervisor | **Works** (has AppHandle) |

For headless agent loops, prefer CRUD + invoke + logs + set_plugin_source; ask the user to open the app for visual verify, or run desktop + HTTP MCP together.

### E. E2E status (2026-07-16)

HTTP MCP against shared app DB:

- 25–27 tools listed; alarm CRUD + run + execution logs + enable/disable OK  
- plugin list/get/install/delete/invoke/history/source/console OK  
- `callai-warmup` never appears in `list_plugins`  
- `open_plugin_window` correctly errors without GUI  


## Shared data

CLI and desktop app share:

- `~/.config/callai`
- `~/.local/share/callai`


## In-app AI HTTP (not MCP)

The desktop AI assistant does **not** call the LLM from the WebView.

- UI → `invoke("ai_chat_completion")` → Rust `ureq` → user-configured OpenAI-compatible base URL
- This avoids CORS (`Origin: http://localhost:1420`) and forbidden `User-Agent` headers in WebKit
- Chat Completions only: `{base}/chat/completions`
