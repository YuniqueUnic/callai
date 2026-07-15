# 16 · MCP Tools / Logs / In-App HTTP：外部 Agent 可操作面与审计边界

> 阶段：`v0.2.7+` · 接续 [15 AI/MCP Prompt 分层](./15-ai-mcp-prompt-composition.md)  
> 证据 commits（节选）：
>
> | Commit | 主题 |
> | --- | --- |
> | `2d8e1d3` | 首版 MCP（rmcp）依赖与 tools 面 |
> | `6e00da2` | 扩展 tools：prompts / plugin source / history / compose；MCP log 与 UI 分离 |
> | `8fb8b57` | **App 内 HTTP supervisor** + Settings 实时状态；默认端口 `33927` |
> | `7b9a443` | 插件独立窗口、Fix seed、prompt 组合测 |
>
> 规格：`docs/mcp.md` · `src-tauri/src/infra/mcp/*` · `src-tauri/prompts/*` · Settings MCP 面板

---

## 1. 思想 / 为什么有这个需求

### 1.1 内置 AI 不够用时，必须有「同一 domain 的外挂入口」

内置 AI 助手适合：口语 → AlarmDraft / PluginDraft → 一键入库。  
真实研发却会碰到：

- 模型一次吐不完巨型 `ui.html`，要 **Codex / Claude 多轮修**  
- 要批量改闹钟、读源码、看 console、按 SDK 合同 patch  
- 要在 CI / 另一台机用 **stdio spawn** 或 **HTTP 长连接** 调同一套数据  

**思想：**

> MCP 不是第二套产品，而是 **同一 SQLite + 同一 PluginManager + 同一 Prompt 真源** 的工具投影。  
> 外部 Agent 能做的事 ⊆ 程序 domain 能校验的事。

### 1.2 为什么 MCP 日志必须与插件日志拆开

| 流 | 写者 | 读者 | 禁止 |
| --- | --- | --- | --- |
| **MCP audit** | 仅 `source=mcp` 的 tool 调用 | Settings → MCP 日志 drawer | UI 装插件 / invoke **不得**写入 |
| **Plugin diagnostics** | 插件窗 console + invoke history | Plugins → 每插件日志 drawer | 与 MCP audit 混表筛选 |

**为什么：** 若 `install_plugin`（UI）也写 MCP 日志，Agent 无法分辨「用户点了安装」与「MCP 工具装了安装」，排障信噪比崩盘。

### 1.3 为什么 App 内也要 bind HTTP（纠偏 record 15）

15 曾定案：「设置开关只记意图，不 bind」。  
用户当场否决：

> CLI 能 `mcp-server --http`，App 为什么不能？

**纠偏后的正确模型：**

| 入口 | 生命周期 | 适用 |
| --- | --- | --- |
| stdio `callai mcp-server` | Client spawn / 断则退 | Codex / Claude Desktop |
| HTTP CLI `--http` | 前台进程 Ctrl+C | 无 GUI 的小主机 |
| **HTTP in-app supervisor** | 随 `settings.mcp.enabled` 启停 | 用户开着 callai 就要给 Agent 连 |

三者共享 DB；**勿抢同一端口**（默认 **33927**）。

---

## 2. 原始 prompt 拆解（好在哪）

### 2.1 日志边界（高质量约束型）

```text
MCP 日志中不该有 plugin 日志，mcp 日志就该只在 mcp 的功能触发时才有日志！！
所以 mcp 日志也可以做成 mcp log drawer！！
并且把 plugin tab 的 mcp log 做成 setting mcp 处的一个 log button 来触发 mcp log drawer！！！
```

| 说法 | 好在哪 |
| --- | --- |
| 「不该有 plugin 日志」 | 直接定义 **写入边界**，不是「感觉乱」 |
| 「做成 drawer」 | 交互模式已有（Logs / plugin logs），**复用 chrome 规则** |
| 「从 Settings MCP 进」 | 信息架构：MCP 审计属于 **连接/设置**，不属于插件列表 |

**可复制模板：**

```text
把 X 日志与 Y 日志按「写者」拆开；
X 只在 A 代码路径 append；
UI 入口放在 Z 模块的 drawer，不要新导航顶层。
```

### 2.2 能力暴露给外部 Agent

```text
创建 alarm/plugin 以及修复 plugin、调试 plugin 这些相关功能也都需要暴露出来，
从而当我们程序内置的 AI 流程不够时，用户可以对接 codex / claude 这些 agent…
还需要 get_prompt(xxx) 提取 animal-island-style / capabilities / plugin_sdk…
接口要简单且易懂，且功能强大
```

| 维度 | 拆解 |
| --- | --- |
| **为什么** | 内置生成 = happy path；外挂 Agent = hard path |
| **边界** | 仍走 domain validate；不给裸 SQL / 任意 shell |
| **验收** | list/get/create/update + get/set source + compose_prompt |

### 2.3 Host allowlist 去掉

```text
allowed_hosts 不要加限制，用户想 bind 什么就什么
```

**思想：** bind 地址是用户运维决策；安全边界用 **Bearer token**，不要用 Host 白名单假装安全却绑死 LAN/0.0.0.0。

---

## 3. 如何把需求说清楚（给 AI 的提示模板）

### 3.1 MCP 工具面改造

```text
目标：扩展 callai MCP tools，让 Codex/Claude 能完成 alarm/plugin CRUD、读 prompt、修 plugin。
硬约束：
- audit log 仅 source=mcp；UI plugin 路径禁止 append
- get_prompt 支持别名 style/sdk/caps/alarm/plugin/contract
- compose_prompt(kind=alarm|plugin|fix|chat) 返回 { system, layers }
- set_plugin_source 覆盖 ui.html；fix 保持同一 id
- Host allowlist 关闭（disable_allowed_hosts）；鉴权仅 Bearer
验收：
- [ ] list_prompts / compose_prompt 可被 stdio client 调用
- [ ] install_plugin + get_plugin_source + set_plugin_source 闭环
- [ ] list_mcp_logs 不含 UI install 记录
- [ ] Settings 开启 MCP 后 App 内监听 33927（或用户端口）
```

### 3.2 In-app supervisor

```text
实现 McpHttpSupervisor：
- apply(settings.mcp)：enabled→start；false→cancel；host/port/token 变则 restart
- status：running / error / endpoint / health_url
- 线程名 callai-mcp-http；cancel token 优雅停
- 启动失败（bind EADDRINUSE）写入 status.error 并在 UI 展示
禁止：再写「开关不 bind」文案
```

---

## 4. 功能划分与交互扩展

### 4.1 模块地图

```text
src-tauri/src/infra/mcp/
  server.rs      # rmcp tools + audit()
  http.rs        # serve + disable_allowed_hosts + Bearer
  supervisor.rs  # App 内启停
  mod.rs

commands::save_settings → mcp_http.apply
commands::mcp_http_status

SettingsAiMcpPanel
  Switch enabled → save → supervisor
  状态行：运行中 / 失败原因 / 重新应用
  MCP 日志按钮 → McpLogsPanel drawer

PluginsPage
  仅插件列表 + 每插件 日志/AI修复（无 MCP tab）
```

### 4.2 Tool 面（Agent 工作流）

```text
Discovery
  list_prompts → get_prompt(id|alias) → compose_prompt(kind)
  get_runtime_context

Alarms
  list_alarms / get_alarm / create_alarm / update_alarm / delete_alarm / run_alarm

Plugins
  list_plugins / get_plugin / install_plugin / delete_plugin
  get_plugin_source / set_plugin_source
  plugin_history / plugin_console / plugin_invoke

Audit
  list_mcp_logs / clear_mcp_logs   # MCP-only
```

**推荐 hard-path 修插件：**

```text
1 compose_prompt { kind: "fix" }
2 plugin_console { id, errors_only: true }
3 get_plugin_source { id }
4 （Agent 本地改）
5 set_plugin_source { id, html }
6 list_mcp_logs 核对 tool 是否 ok
```

### 4.3 Prompt 别名（为什么好）

| 别名 | id | 为何存在 |
| --- | --- | --- |
| `style` / `island` | animal_island_style | Agent 记不住长文件名 |
| `sdk` | plugin_sdk | 修 bug 第一要读 |
| `caps` | capabilities | 防止 invent API |
| `contract` | output_contract | 防止 Markdown 散文 JSON |
| `alarm` / `plugin` | *_generate | 任务层快选 |

---

## 5. 推进流程（agent 推荐顺序）

1. 拆日志写入：删 UI `mcp_logs.append`；list `WHERE source='mcp'`  
2. McpLogsPanel + Settings 入口；Plugins 去 MCP tab  
3. 扩 server tools + PromptId aliases/summary/compose  
4. supervisor + save_settings 挂钩 + status 命令  
5. 文案与默认端口 33927；migrate bump 旧 3927  
6. `disable_allowed_hosts`  
7. 测：mcp_logs 单测 + typecheck + 手测开关  

---

## 6. 真实执行 / 偏差与调整

| 偏差（含 15 旧定案） | 调整 |
| --- | --- |
| MCP enabled 不 bind | **App 内 supervisor 真 bind** |
| UI install 写 MCP 日志 | 删除；list 过滤 source |
| MCP 日志塞在插件 Tab | 迁 Settings drawer |
| Host 白名单绑死 localhost | `disable_allowed_hosts` |
| 默认端口 3927 | **33927** + 迁移 UPDATE |
| plugin_console 在 CLI 空 | 文档说明：console 在 App 进程；CLI 用 history+source |

### 6.1 为什么 dual-part prompt 与 MCP set_source 配套

JSON 内嵌 HTML → 转义地狱 + 截断。  
dual-part 让：

- 内置 AI `splitModelOutput` 稳  
- 外部 Agent `set_plugin_source` 直接喂完整 HTML  
- Fix 路径与 Create 路径同构  

### 6.2 为什么 compose_prompt 比「自己拼 system」好

Agent 常漏 `plugin_sdk` 或 `output_contract` → 生成好看但 storage 调用错。  
`compose_prompt(kind=fix)` 强制层序：system → capabilities → task → sdk/style → contract。

---

## 7. Prompt 拆解：为什么这些文件「好」

| 文件 | 解决的失败模式 | 好在哪 |
| --- | --- | --- |
| `system.prompt` | 模型不知道读哪一层 | 明示层序表 + contracts win |
| `capabilities.prompt` | invent n8n 级能力 | 白名单对象/字段/禁区 |
| `output_contract.prompt` | 散文 + 坏 JSON | 成功标准 = parse 公式 |
| `alarm_generate` | 日程形态乱 | 四模式互斥 +  pure chime 默认 |
| `plugin_generate` | HTML 塞 JSON | dual-part 硬格式 |
| `plugin_sdk` | 乱调 Tauri | 只认 window.callai |
| `animal-island-style` | 灰蓝 SaaS | 视觉真源 + classic Babel |
| `continue_*` | 截断重开全文 | 只补 suffix |

**写 prompt 的元原则（给学员）：**

1. **一个文件一个失败模式**  
2. **成功标准可机器判定**（parse / validate / id 连续）  
3. **别名与 compose** 降低 Agent 记忆负担  
4. **产品变量** `{{ product.* }}` mini-jinja，避免硬编码吉祥物名  

---

## 8. 验收清单 + 练习

### 8.1 手测

1. Settings → 开启 HTTP MCP → 状态「运行中」→ `curl -s http://127.0.0.1:33927/health`  
2. 错误 token → 401；正确 Bearer → tools 列表  
3. App 内装插件 → MCP 日志 **不应**出现 install_plugin  
4. stdio client 调 `compose_prompt` / `get_prompt style`  
5. 改 host 为 `0.0.0.0` 仍可从 LAN 访问（有 token）  
6. 关闭开关 → 端口释放  

### 8.2 练习

1. 用表格对比「内置 AI 修插件」vs「MCP Agent 修插件」的步骤差。  
2. 设计一个失败用例：端口占用时 UI 应显示什么 `status.error`。  
3. 为 `get_prompt` 再增加一个合理别名，并写清 parse 映射与文档一行说明。  

### 8.3 最短复述

```text
MCP audit 仅 source=mcp；插件诊断走插件 drawer。
Tools = domain 投影 + compose_prompt/get_prompt。
HTTP：App supervisor 与 CLI --http 二选一端口；默认 33927；Host 不白名单，Bearer 鉴权。
```

---

## 9. 关键路径

| 路径 | 说明 |
| --- | --- |
| `src-tauri/src/infra/mcp/server.rs` | tools |
| `src-tauri/src/infra/mcp/supervisor.rs` | in-app HTTP |
| `src-tauri/src/infra/mcp/http.rs` | serve + disable_allowed_hosts |
| `src/pages/McpLogsPanel.tsx` | MCP 日志 UI |
| `src-tauri/prompts/*` | 真源 |
| `docs/mcp.md` | 操作手册 |

## 10. 与相邻 records

| Record | 关系 |
| --- | --- |
| 03 CLI/daemon | HTTP keep-alive 家族；本篇补 App 内 supervisor |
| 15 Prompt 分层 | 生成契约；本篇补 **外挂工具与审计** |
| 12 运行时 | 执行语义；本篇补 **调试/修复入口** |
