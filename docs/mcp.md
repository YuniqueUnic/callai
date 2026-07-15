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
callai mcp-server --http --host 127.0.0.1 --port 3927 --token "$TOKEN"
```

- Endpoint: `http://<host>:<port>/mcp`
- Health: `http://<host>:<port>/health` (no auth)
- Header: `Authorization: Bearer <token>`

Settings → MCP also shows the endpoint and stdio/http commands.  
Toggle **Enable HTTP MCP** records intent in settings; the long-running process is still started via CLI `mcp-server --http` (or a future in-app supervisor).

## Tools

| Tool | Description |
|------|-------------|
| `list_alarms` | List alarms |
| `create_alarm` | Create from AlarmDraft JSON |
| `get_alarm` | Get by id |
| `delete_alarm` | Delete by id |
| `run_alarm` | Run immediately |
| `list_plugins` | List plugins |
| `install_plugin` | Install PluginDraft |
| `delete_plugin` | Delete plugin + data |
| `plugin_invoke` | Unified plugin invoke |
| `list_mcp_logs` | Audit log (max 500) |
| `get_prompt` | Embedded prompt template (`system`, `capabilities`, `output_contract`, `alarm_generate`, `plugin_generate`, `ai2ui`, `animal_island_style`) (`system`, `alarm_generate`, `plugin_generate`, `ai2ui`, **`animal_island_style`**) |

## Shared data

CLI and desktop app share:

- `~/.config/callai`
- `~/.local/share/callai`


## In-app AI HTTP (not MCP)

The desktop AI assistant does **not** call the LLM from the WebView.

- UI → `invoke("ai_chat_completion")` → Rust `ureq` → user-configured OpenAI-compatible base URL
- This avoids CORS (`Origin: http://localhost:1420`) and forbidden `User-Agent` headers in WebKit
- Chat Completions only: `{base}/chat/completions`
