# Built-in plugins (callai)

These plugins ship with the app and are **seed-installed once** into the user plugins
directory on first launch (or when a *new* catalog id appears). After that they behave
like any other plugin: open, schedule via `__callai_plugin__`, edit source, or **delete**.

Deleting a built-in plugin does **not** reinstall it on next launch. Only catalog ids
that have never been offered to this install path are seeded.

## Layout

```text
builtin_plugins/
  README.md                 # this file
  shared/
    island.css              # shared design tokens (copy into ui.html or preview)
  <plugin-id>/
    manifest.json           # id / name / version / permissions / ui
    ui.html                 # self-contained host UI (React 18 UMD + Babel classic)
```

## Develop

1. Edit `manifest.json` + `ui.html` under the plugin folder.
2. Prefer `window.callai.storage` / `timer` / `notification` (see `prompts/plugin_sdk.prompt`).
3. Preview: open `ui.html` in a browser (offline fallback uses `localStorage`).
4. Rebuild the Tauri app so `include_str!` picks up changes.
5. To force a re-seed of a *new* id only, add a new folder and register it in
   `src/infra/plugin/builtins.rs` (`CATALOG`). Existing user installs keep their copy.

## Rules

- `id`: lowercase alphanumeric + single hyphens, 2..=64 chars.
- Permissions: request only what you use (`storage`, `timer`, `notification`, `history`).
- Babel: `data-presets="react-classic"` (host also rewrites unsafe presets).
- Persist only through `callai.storage` (not raw `localStorage` in production path).
- Keep one screen; business settings live inside the plugin, not the alarm editor.

## Catalog (current)

| id | name | purpose |
|----|------|---------|
| `todo` | TODO | lightweight task list + optional due notes |
| `pomodoro` | 番茄时钟 | focus / break timer with notifications |
| `meal-spin` | 今天吃喝什么 | food/drink wheel; alarm `mode` / ENV page override |
| `work-report` | 工作汇报 | daily / weekly / monthly report notes |
| `ledger` | 小岛记账 | calendar + timeline ledger with categories & totals |

## 参数模型（settings ≡ launch / ENV 同名覆盖）

插件只有 **一套设置（settings）**，持久化在 `callai.storage`。

闹钟触发时，host 把 Task **ENV 同名 key** 与 argv `key=value` 合并成 **覆盖层** 注入窗口：

```
effective = defaults + saved settings + ENV/argv overrides (same keys)
```

- 覆盖 **只影响本次打开**，不会写回 storage（除非用户在插件设置里点保存）。
- 同一插件、不同闹钟：ENV 不同 → 界面不同。  
  例：`meal-spin`  
  - 闹钟 A 环境变量：`mode=food`  
  - 闹钟 B 环境变量：`mode=drink`

### ENV / params 写法

| 来源 | 示例 |
|------|------|
| 任务 ENV | `mode=drink` |
| argv | `meal-spin` + `mode=drink` |

### 插件内读取

```js
// host 注入
const override = window.callai.getLaunchParams(); // 本次闹钟覆盖
// effective = saved + override（内置插件已封装 usePluginSettings）
```



## Host control panel (do not reimplement in ui.html)

Every plugin gets an injected FAB (drag + edge snap). Modal: params / theme / notifications.
See `src-tauri/prompts/plugin_sdk.prompt` and `docs/development/records/17-builtin-plugins-host-panel-and-zip-packages.md`.
