# 15 · AI / MCP 产品面 + Prompt 分层 + WebView 坑：从「能叫 AI」到「可解析、可常驻、可排障」

> 阶段：`v0.2.7` 前后 · Epic [#42](https://github.com/YuniqueUnic/callai/issues/42)（AI / MCP UX）及后续 UI/Settings/生成链路硬化  
> 证据 commits（节选）：
>
> | Commit | 主题 |
> | --- | --- |
> | `2d8e1d3` | MCP server（rmcp）+ AI SDK 依赖与基础面 |
> | `5c663ea` | runtime context + prompt 组合层（system/capabilities/contract…） |
> | `c140399` | 聊天 UX、发送快捷键、MCP 文案语义、旧模型 bump |
> | （工作区 / 后续 commit） | WebView CORS：`ai_chat_completion` Rust 代理，禁止浏览器直连网关 |
>
> 关联：GitHub `#36–#42` · `issues/715` 截图（Tab 挤压 / FAB 遮挡）·  
> 规格：`PRODUCT.md` · `docs/mcp.md` · `src-tauri/prompts/*` · `src/ai/*`

---

## 1. 思想 / 为什么有这个阶段

### 1.1 产品从「本地闹钟」长出「可对话的生成面」

前序 records 已交付：调度、CLI/daemon、岛风 UI、CI、包管理。  
用户下一步要的是：

> **用自然语言创建出可入库的 Alarm / Plugin**，并让外部 Agent（Claude / Codex / Cursor）通过 MCP 操作同一套 domain。

这不是「塞个 ChatGPT 网页」，而是：

```text
用户意图 ──► Prompt 分层 + Runtime 上下文 ──► LLM
                │
                ▼
         严格可解析 JSON（AlarmDraft / PluginDraft）
                │
                ▼
         domain validate ──► SQLite / Plugin sandbox
```

**思想：**

> LLM 是**生成器**，callai domain 是**唯一真相**；  
> Prompt 的工作是让模型输出**本程序能 parse、能校验、能执行**的东西。

### 1.2 为什么 MCP 与 in-app AI 要共享同一内核

| 入口 | 形态 | 生命周期 |
| --- | --- | --- |
| 桌面 AI 助手 | FAB pencil → overlay 聊天 | 随 App |
| MCP stdio | `callai mcp-server` | 由客户端 spawn，断则退 |
| MCP HTTP | `callai mcp-server --http` | **前台 daemon**，Ctrl+C 结束 |

三者必须打同一 SQLite / 同一 PluginManager / 同一 audit log（max 500）。  
否则「设置里配好了、CLI 却是另一套状态」。

### 1.3 为什么 Prompt 必须「分层」而不是「一个超长 system」

早期直觉是：把 schema、OS、风格、用户话全塞进 system。  
结果是：难维护、难 MCP 复用、难做「只换 task 层」。

正确心智（本轮落地）：

```text
1 system          角色 / 安全 / 如何读后面各层
2 runtime         动态：OS / locale / timezone / prefs（无 secrets）
3 capabilities    程序能理解什么、能执行什么操作
4 task            alarm_generate | plugin_generate | chat
5 style（plugin） animal_island_style + ai2ui
6 output_contract 客户端如何 parse、成功标准
7 user            用户需求（+ history）
```

**合同优先于文采**：capabilities + output_contract 与用户需求冲突时，先保证可解析、可校验。

---

## 2. 原始需求拆解（会话浓缩）

### 2.1 开场 Epic / 子 issue（#42 系）

**口语意图（浓缩）：**

```text
继续推进 #42 及子 issues；
用 AI2UI、rmcp、ai-sdk、animal-island-ui 完成：
- 插件系统 + 独立 SQLite
- MCP（stdio）+ logs max 500
- AI 聊天生成 alarm / plugin
- 插件管理 Tab
- prompts 文件化 include_str!，不要写死在程序里
- animal-island-style.prompt 是 AI 生成 UI 的权威视觉源
- FAB + 上 hover pencil 进 AI
- 服务商选择做成齿轮滚动（类似 datetime picker）
- 模型 fetch + 缓存 + autocomplete
- 修 issues/715：Tab 挤压、AI 页 FAB 遮发送键
```

| 维度 | 内容 |
| --- | --- |
| **为什么** | 降低建闹钟/插件门槛；对接外部 Agent 生态 |
| **边界** | 生成结果必须过 domain；不造第二套执行器 |
| **验收** | 可生成并入库；MCP tools 可用；UI 不挡操作 |

**Prompt 为什么好**：点名**库选型** + **产物形态**（prompt 文件 / include_str）+ **视觉真源**（animal-island-style），减少 agent 自造 design system。

### 2.2 模型默认过时

```text
默认 / mock / hint 里的 gpt-4o-mini、claude-sonnet-4-20250514 太老；
默认改为 gpt-5.6-terra；同步 Claude / Gemini 前沿 id
```

**纠偏点**：历史 SQLite `ALTER ... DEFAULT 'gpt-4o-mini'` 不能「改历史 migration 语义」糊弄过去——要对**已落库行**做 bump（migrate UPDATE + bootstrap `is_legacy_ai_model`）。

### 2.3 Settings 输入体验

```text
API Key 等 input 每敲一字就 save，卡；
要 debounce；Token 系统默认生成；
MCP 要能 daemon 常驻；CLI 设计要想清楚
```

| 坑 | 根因 | 修法 |
| --- | --- | --- |
| 输入卡顿 | 每键 `setSettings` 重渲染整页 + 可能触发 models 拉取 | **本地 draft** + debounce/blur 再 persist |
| Token 空 | 默认 `""` | bootstrap 生成 hex token |
| 「常驻」误解 | stdio 本就不该常驻 | HTTP：CLI `--http` **或** App supervisor；stdio 仍 spawn |

### 2.4 Prompt 要带「程序能懂的东西」

```text
prompt 该有系统信息：os、version、language、timezone、用户习惯；
程序能解析的结果、希望的结果、操作面也该有 prompt；
多层关键 prompt + user requirements 才是正确组合
```

落地文件：

| 文件 | 角色 |
| --- | --- |
| `system.prompt` | 角色 + 如何读分层 |
| `capabilities.prompt` | Alarm/Plugin/MCP 能力与禁区 |
| `output_contract.prompt` | 可 parse 契约 |
| `alarm_generate` / `plugin_generate` | task schema |
| `animal-island-style` / `ai2ui` | UI 真源 |
| runtime（动态） | `get_ai_runtime_context` → `<callai_runtime_context>` |

组合实现：`src/ai/generate.ts` → `composeSystemPrompt()`。

### 2.5 AI 页布局与 chrome 细节

```text
聊天区 relative；composer HUD 固定 bottom；
tabs/FAB idle 60% opacity；
插件顶栏要像 alarm 页一样避开 floating tab；
对比度不够；
发送键支持 Enter vs Mod+Enter（分平台）；
输入框要 textarea 可长高但有上限
```

### 2.6 浏览器控制台 / WebView 网络坑（演进）

```text
阶段 A：
1) inert="" React 19 warning
2) User-Agent not allowed by Access-Control-Allow-Headers
3) fetch .../v1/responses 被 CORS 打掉

阶段 B（改 chat completions + 去 UA 后仍失败）：
4) Origin http://localhost:1420 is not allowed by Access-Control-Allow-Origin
5) Status 404 on .../v1/chat/completions（网关 + CORS 叠在一起）
```

**关键理解：** tauri dev 的页面 Origin 仍是 `http://localhost:1420`（Vite）。  
只要 **WebView 里 fetch 外网**，就会触发 CORS——与是否改成 `/chat/completions` 无关。  
见 §6.4–6.4.1。

---

## 3. 如何把需求说清楚（给 AI 的提示模板）

### 3.1 Epic 级模板

```text
目标：在 callai 增加「自然语言 → AlarmDraft/PluginDraft」与 MCP 工具面。
硬约束：
- domain 校验是唯一入库门；禁止绕过 schema
- prompts 只放 src-tauri/prompts/*.prompt，Rust include_str! / get_prompt
- animal-island-style.prompt 是 UI 视觉真源
- MCP audit logs max 500
- 不向后兼容胶水：开发期可 breaking，但 DB 已进迭代期则写 migration
验收：
- [ ] UI 能生成并创建 alarm / 安装 plugin
- [ ] callai mcp-server stdio 可被 client 拉起
- [ ] callai mcp-server --http 可前台常驻 + Bearer
- [ ] bun typecheck/test + cargo test/clippy 绿
不做：App 内再实现一套 LLM 运行时（用 ai-sdk + 用户自备 key）
```

### 3.2 Prompt 分层改造模板

```text
把生成 system 改成显式分层 compose：
system → runtime → capabilities → task → style? → output_contract → user
新增 capabilities.prompt / output_contract.prompt（程序能懂的操作与可解析结果）
runtime 动态注入 OS/locale/timezone/prefs，禁止 secrets
给出 compose 单测（层序断言）
```

### 3.3 WebView LLM 排障模板

```text
现象 A：/v1/responses 或 User-Agent 预检失败
→ 兼容网关用 Chat Completions；禁止自定义 User-Agent

现象 B：Origin http://localhost:1420 is not allowed ... Access-Control-Allow-Origin
→ 这是浏览器同源策略，不是 prompt bug
→ 桌面 App 必须：LLM HTTP 走 Tauri/Rust（ureq/reqwest），前端只 invoke
→ 验收：Network 面板不应再出现对 ai 网关的跨域 fetch；错误应是 invoke 返回的 HTTP body

禁止：只在 Vite 浏览器页测「真网关」当验收（CORS 必然炸）
要求：bun tauri dev / 打包 App 内测
```

### 3.4 Settings 性能模板

```text
禁止：onChange 每键 saveSettings + setSettings 全页。
要求：受控字段本地 state；debounce ≥500ms；blur/unmount flush；
开关/Provider 可立即 save。
```

---

## 4. 功能划分与模块地图

```text
src-tauri/
  prompts/                 # 静态 prompt 真源
  domain/prompts.rs        # include_str! + PromptId
  domain/runtime_context.rs
  infra/mcp/{server,http}.rs
  infra/plugin/            # per-plugin data.db + invoke
  cli.rs                   # mcp-server [--http]

src/ai/
  generate.ts              # compose + completeText（Tauri 优先）
  runtimeContext.ts        # 动态块 / 缓存
  sendKeyMode.ts           # Enter vs Mod+Enter

src-tauri/infra/ai_models.rs
  list_models + chat_completion   # 无 CORS 的出站 HTTP
  commands::ai_chat_completion

src/pages/
  AiChatPage.tsx           # HUD composer + 失败重试
  SettingsAiMcpPanel.tsx   # Provider 齿轮 / 模型 AC / MCP 文案
  PluginsPage.tsx

src/ui/
  ProviderPicker.tsx
  ModelAutocomplete.tsx
```

### 4.1 MCP 产品语义（演进定案）

| 设置项 | 早期定案（已纠偏） | **现行定案**（见 record 16） |
| --- | --- | --- |
| HTTP MCP 开关 | 只记意图、不 bind | **App 内 supervisor 真 bind** `listen_host:port` |
| stdio | `callai mcp-server` spawn | 不变 |
| HTTP CLI | `--http` 前台 daemon | 与 App **二选一端口**（默认 **33927**） |
| Host 校验 | 白名单 localhost | **`disable_allowed_hosts`**，鉴权靠 Bearer |

**为什么曾不做 App bind：** 怕与 CLI 抢端口、和 close-to-tray 纠缠。  
**为什么最终做了：** 用户明确要求「CLI 有的能力 App 也要有」；supervisor + status UI 可表达失败（EADDRINUSE）。

---

## 5. 推进流程（agent 推荐顺序）

1. **读** #42 子 issue + `docs/mcp.md` + 现有 domain Alarm/Plugin  
2. **域** Plugin + MCP log store + prompts embed  
3. **CLI** `mcp-server` / `--http` + 文档  
4. **UI** Tabs / Plugins / Settings AI / FAB / AI overlay  
5. **生成** ai-sdk + compose 分层 + runtime  
6. **硬化** debounce、模型默认、对比度、textarea、发送快捷键  
7. **坑** inert patch、chat()、strip User-Agent  
8. **门禁** bun typecheck/test · cargo test/clippy  
9. **教材** 本 record  

串行原则：先契约（schema/prompt）再 UI；先 stdio 再 HTTP。

---

## 6. 难点 / 坑点过程分析（重点）

### 6.1 Prompt：只写「角色」不够

| 错误做法 | 后果 |
| --- | --- |
| 只 system 一段 | 模型不知 validate 边界，乱造字段 |
| schema 写在 TS 字符串 | 与 Rust domain 漂移；MCP 取不到 |
| 无 runtime | macOS 用户得到 Windows 命令 |

**过程结论：**  
「程序能解析的结果 / 希望的结果 / 操作面」必须**独立成文**（capabilities + output_contract），与 task schema 分开；runtime 必须动态。

### 6.2 Settings 卡顿：debounce 伪解决

第一版：debounce 了 save，但仍 `onLocal → setSettings` 每键全页渲染，且 ModelAutocomplete 依赖 `apiKey` 触发 soft fetch。

**真解决：**

1. 文本字段**只活在子组件 local state**  
2. soft fetch **不要**跟 apiKey 每个字符绑定  
3. unmount 时 flush pending  

### 6.3 模型 Autocomplete「点了不进输入框」

| 根因 | portal 下拉在 `document.body`，capture 阶段 outside-click 先卸掉菜单，`click` 丢失 |
| --- | --- |
| 修法 | `dropdownRef` 算「内部」；**onPointerDown commit**；本地 `text` 状态立刻回填 |

### 6.4 AI SDK + 兼容网关（WebView）— 三层坑

#### 阶段 A：路径与 UA

错误日志：

```text
User-Agent is not allowed by Access-Control-Allow-Headers
Fetch .../v1/responses due to access control checks
```

| 层 | 机制 | 现象 |
| --- | --- | --- |
| AI SDK | `withUserAgentSuffix` 写 UA | 浏览器禁止自定义 UA → 预检失败 |
| `@ai-sdk/openai` v4 | `openai(model)` 默认 **Responses API** | 路径 `/v1/responses`；兼容站多半只有 chat |

第一刀修法（必要但不充分）：

```ts
createOpenAI({ fetch: browserSafeFetch /* delete User-Agent */ })
openai.chat(modelId) // → /v1/chat/completions
```

#### 阶段 B：Origin CORS（真正的桌面解）

改 chat 后仍见：

```text
Origin http://localhost:1420 is not allowed by Access-Control-Allow-Origin. Status code: 404
Fetch API cannot load https://…/v1/chat/completions due to access control checks
```

| 事实 | 含义 |
| --- | --- |
| tauri dev 加载 Vite | 页面 Origin = `http://localhost:1420` |
| WebView `fetch(外网)` | **完整走 CORS**；网关不配 ACAO 就挂 |
| 404 + CORS | 预检/响应被浏览器吃掉，UI 只能看到 CORS，不是真实 body |

**最终修法（本仓库落地）：**

```text
UI completeText()
  ├─ isTauri() → invoke("ai_chat_completion") → Rust ureq → 网关
  └─ browser mock → 仍可走 AI SDK（仅开发无壳）
```

- `src-tauri/src/infra/ai_models.rs::chat_completion`
- `commands::ai_chat_completion`
- `src/ai/generate.ts::completeText`

**给后人的规则（写进肌肉记忆）：**

1. 桌面 App **不要**让 WebView 直连用户 API Key 的网关（CORS + 密钥暴露面）。  
2. Chat Completions + 去 UA 只解决「路径/头」类问题，**解决不了 Origin**。  
3. 验收必须在 **Tauri 窗口**；只开浏览器 `localhost:1420` 测真网关 = 无效验收。  
4. 代理后若仍失败，错误应是 **HTTP status + body 摘要**（401/404 等），再查 base_url / key / 网关路由。

### 6.5 `inert=""`（React 19）

来源：`animal-island-ui@1.2.1` Drawer 关闭态 `inert: ""`。  
React 19 布尔属性不要空字符串。

**修法：** postinstall 脚本改成 `inert: true`（`scripts/patch-animal-island-ui.mjs`）。  
长期：上游发版或 fork。

### 6.6 ureq 3 API 漂移

`list_ai_models` 初写 `AgentBuilder`（ureq 2）→ 编译失败。  
ureq 3：`Agent::config_builder()` + `header` + `status().as_u16()` + rustls feature。

### 6.7 Tab / FAB / 顶栏遮挡

| 现象 | 修法 |
| --- | --- |
| CJK Tab 竖排挤压 | nowrap + min-width + writing-mode |
| AI 页 FAB 挡发送 | immersive 隐藏 body FAB |
| 插件顶栏被 pill 盖住 | 与 home 同一 titlebar + 52px 节奏 |
| idle 太抢眼 | tabs/FAB 60% opacity，hover 1 |

### 6.8 HTTP MCP vs stdio 生命周期

用户说「要能 daemon」。  
stdio **不应** daemon（MCP 客户端管理生命周期）。  
daemon = **HTTP 长连接**：

1. CLI：`callai mcp-server --http`（前台 Ctrl+C）  
2. App：`settings.mcp.enabled` → `McpHttpSupervisor` 线程  

设置开关 **=** 意图 **且** 触发 bind；UI 必须显示 running / error（见 16）。

---

## 7. 真实提交 / 偏差与纠偏

| 偏差 | 纠偏 |
| --- | --- |
| 模型默认只改前端 | 同步 Rust default + COALESCE 旧行 + bootstrap |
| debounce 仍卡 | 本地 draft，父级不每键 setState |
| `openai(model)` 上兼容站 | 改 `openai.chat` |
| 仍 CORS（Origin localhost:1420） | **Rust `ai_chat_completion` 代理**，前端禁止直连 |
| MCP enabled 暗示「已在听」 | 先文案诚实；后 **真 supervisor + 状态行**（16） |
| prompt 全挤 system | 拆 capabilities / output_contract / runtime |

**验收（功能）：**

- [x] Prompt 文件化 + PromptId 可 MCP get  
- [x] compose 层序单测  
- [x] runtime 无 api_key  
- [x] Settings 输入可打字不卡  
- [x] 发送快捷键分平台  
- [x] 生成失败气泡 + 重试  
- [x] stdio + `--http`  
- [x] LLM 出站走 Rust 代理（无 WebView CORS）  
- [ ] 真 key 全链路 E2E（依赖用户网关；不进 CI）  
- [x] App 内 HTTP MCP supervisor（`8fb8b57` + record 16）

---

## 8. 验收清单 + 练习

### 8.1 手测剧本

1. 设置 → AI：Provider 齿轮、模型 refresh、乱打 API Key 不卡、失焦后落库  
2. 设置 → MCP：复制 endpoint / token；读「需 CLI」说明  
3. 终端：`callai mcp-server --http`，health + Bearer  
4. AI 助手：长文本 textarea 增高有上限；切换 Enter / ⌘\|Ctrl+Enter  
5. 故意坏 key / 坏 JSON：出现错误气泡与重试  
6. 控制台：无 `inert` 空串警告  
7. **Network：不应出现** 对 AI 网关的跨域 `fetch`；生成走 `ai_chat_completion` invoke  

### 8.2 学员练习

1. 把一段「帮我做个插件」口语，标出应命中 **哪几层 prompt**。  
2. 假设网关只支持 `/v1/chat/completions`，写两条 agent 验收命令（抓包或日志）。  
3. 设计「App 内 HTTP MCP supervisor」Issue：进程模型、与 close-to-tray、端口占用、和 CLI 互斥策略。  

### 8.3 给 AI 的最短复述（可复制）

```text
callai 的 AI 生成必须：compose(system, runtime, capabilities, task, style?, output_contract) + user；
LLM HTTP 必须 Tauri/Rust 代理（ai_chat_completion），禁止 WebView 直连网关（CORS）；
兼容协议用 Chat Completions；Settings 文本本地 draft + debounce；
MCP HTTP：App supervisor 或 CLI `--http`（勿抢端口，默认 33927）；
UI 视觉以 animal-island-style.prompt 为准。
```

---

## 9. 关键路径速查

| 路径 | 说明 |
| --- | --- |
| `src-tauri/prompts/` | 静态 prompt 真源 |
| `src/ai/generate.ts` | 组合 + `completeText`（Tauri 优先） |
| `src/ai/runtimeContext.ts` | 动态上下文 |
| `src-tauri/src/infra/ai_models.rs` | `list_models` + `chat_completion` |
| `docs/mcp.md` | MCP 操作手册 |
| `scripts/patch-animal-island-ui.mjs` | inert 补丁 |
| `src/tests/promptCompose.test.ts` | 层序回归 |

---

## 10. 与相邻 records 的关系

| Record | 关系 |
| --- | --- |
| 03 CLI/daemon | MCP HTTP 与 `callai daemon` 同属「前台 keep-alive」家族 |
| 05 UI 硬化 | Tab keep-alive、缓存、层级；本篇补 AI overlay / FAB |
| 12 运行时硬化 | 执行语义；本篇补「生成语义」与 WebView 网络语义 |
| 13 Issue 周期 | #42 Epic 是另一轮「Issue→交付」样板 |
| 14 Titlebar | AI 页 top padding / titlebar HUD 共用 chrome 规则 |

**一句话收束：**

> 本阶段把 callai 从「会跑命令的岛风闹钟」推进到「**契约化生成 + 可 MCP 操作**」；  
> 最大教训不是选哪个模型，而是：**输出合同、运行时上下文、WebView 网络现实（必须 Rust 代理）** 三者缺一不可。

---

## 11. 追加：Prompt 美化原则 + 后续 commits 拆解（插件 / 流式 / Fix / MCP tools）

> 本节接 `ba78020` 之后：`5b270af` `0e5480b` `7b9a443` `6e00da2` `8fb8b57` 等。  
> 目标：说明 **prompt 为什么这样写**、需求如何拆给 agent、以及真实偏差如何回灌 prompt。

### 11.1 为什么「美化 prompt」不是文案修辞

美化 = **降低模型失败熵**：

| 失败 | Prompt 对策 | 文件 |
| --- | --- | --- |
| 截断后重开全文 | continue 只补 suffix | `continue_system` / `continue_user` |
| HTML 进 JSON 转义炸 | dual-part 硬格式 | `plugin_generate` + `output_contract` |
| invent Tauri API | 只认 `window.callai` | `plugin_sdk` |
| 灰蓝 SaaS UI | 视觉真源 + classic Babel | `animal-island-style` |
| 不知 OS/时区 | runtime 块 | `runtime_context` 动态层 |
| 外挂 Agent 漏层 | `compose_prompt` / aliases | MCP tools + `PromptId` |

**原则：** 一个文件盯一种失败；成功标准可机器判定。

### 11.2 各 prompt 拆解：好在哪 / 需求从哪来

#### system.prompt
- **需求：** 模型要知道「后面还有很多层，别只听用户一句」。  
- **好：** 层序表 + contracts win + 品牌短约束。  
- **Agent 提示：** 「先读 system 层序再写 task」。

#### capabilities.prompt
- **需求：** 防 scope 膨胀（用户说「像 n8n」时拉回闹钟/插件）。  
- **好：** 对象字段白名单 + plugin 定时语义 + MCP 同域。  
- **Agent 提示：** 「超出 capabilities 要拒绝并给最近替代」。

#### output_contract.prompt
- **需求：** 客户端 `JSON.parse` / dual-part split 必须成功。  
- **好：** 按 mode 写 **Success = …** 公式；补 `plugin_fix` 同构。  
- **真实偏差：** 早期 HTML-in-JSON → 解析失败气泡；回灌 dual-part。

#### alarm_generate.prompt
- **需求：** 「每天下午 4.50 提醒写 TODO」→ 可入库 AlarmDraft。  
- **好：** 四 schedule 互斥；纯提醒默认 `__callai_alarm__`；相对时间靠 runtime。  
- **交互扩展：** AI 草稿卡 → 用户确认入库（不是静默写库）。

#### plugin_generate.prompt + plugin_sdk.prompt + animal-island-style.prompt
- **需求：** 插件是独立小应用，要像岛风、要能存数据、要能被闹钟触发。  
- **好：**  
  - generate：dual-part + 修旧插件保 id  
  - sdk：storage 返回值归一、禁止直调 Tauri  
  - style：CDN React18 + **classic** Babel（automatic runtime 会炸 srcdoc）  
- **真实偏差：**  
  - `import { jsx }` SyntaxError → 强制 `react-classic`  
  - 刷新丢数据 → storage.get 解包 + SDK 写明  
  - 业务参数塞进闹钟编辑页 → **撤回**，参数回插件内  

#### continue_*  
- **需求：** 32000 字仍截断。  
- **好：** mini-jinja `incomplete_tail` / `round`；禁止重开。  
- **限制：** 仍建议「小而完整」页面，而不是无限继续堆装饰。

### 11.3 功能划分：生成 / 执行 / 调试 / 外挂

```text
生成面（AI Chat）
  compose layers → stream → split dual-part → draft card → accept

执行面（Scheduler）
  Alarm binary | __callai_plugin__ runtime → notify / open window

调试面（Plugin window + Logs drawer）
  console ring ≤300 · history · Fix seed（errors≤10, ≤10k tokens 比例截断）

外挂面（MCP）
  同一 domain · compose_prompt · set_plugin_source · audit source=mcp
```

### 11.4 交互扩展（用户能感知的）

| 交互 | 解决什么 | 关键实现 |
| --- | --- | --- |
| FAB hover pencil → AI | 从任意 Tab 进入生成 | App FAB cluster |
| 生成类型 闹钟/插件/聊天 | 换 task 层 | AiChatComposer |
| 草稿卡 + 同意入库 | 人在回路 | AiAlarmDraftCard / AiPluginDraftCard |
| 插件独立 WebviewWindow | 非 iframe 主路径 | PluginWindowApp + capabilities |
| 插件 Logs / AI 修复 | hard path | pluginFixContext + compose fix |
| Settings MCP 开关+状态 | 真 bind + 可观察 | McpHttpSupervisor |
| MCP 日志 drawer | 审计与插件日志分离 | McpLogsPanel |

### 11.5 清晰描述需求 → 快速推进的模板（本阶段总用）

```text
【目标】一句话结果（用户可感知）
【硬约束】domain / 文件位置 / 禁止事项（3–6 条）
【交互】入口在哪、确认在哪、失败长什么样
【验收】可勾选 4–8 条（含 typecheck/test）
【不做】明确砍掉的范围
【偏差预留】已知坑（CORS、Babel classic、端口互斥…）
```

**为什么有效：** Agent 不会在「要不要兼容旧 HTML-in-JSON」上自我纠结——你写了禁止。

### 11.6 关键 commits 过程（偏差 → 回灌）

| Commit | 做了什么 | 回灌到 prompt/docs |
| --- | --- | --- |
| `5c663ea` | runtime + capabilities + contract 分层 | system 层序表 |
| `ba78020` | Rust 代理 LLM | record 15 §6.4；generate.ts Tauri 优先 |
| `5b270af`/`0e5480b` | 流式 + thinking UI | continue 层 + 消息 chrome |
| `7b9a443` | 独立插件窗 + Fix seed + dual-part 测 | plugin_sdk / plugin_generate fix 段 |
| `6e00da2` | MCP tools 扩 + 日志分离 | record 16；compose_prompt |
| `8fb8b57` | App HTTP supervisor | 纠偏 15「不 bind」；默认端口 33927 |

### 11.7 手测补遗（插件 / MCP）

1. 「每天下午 4.50 提醒写 TODO」→ 草稿 16:50 + `__callai_alarm__`  
2. 「TODO 插件要有昨今明 + CRUD」→ dual-part 安装 → 独立窗 → storage 刷新仍在  
3. 故意 `console.error` → 插件日志 drawer → AI 修复 seed 含 errors  
4. Settings 开 MCP → health 200 → MCP 日志仅 tool 调用  
5. `get_prompt style` / `compose_prompt fix` 经 stdio  

### 11.8 与 record 16 的分工

- **15：** 生成契约、WebView 网络、Settings 输入、Prompt 分层思想  
- **16：** MCP 工具面、审计边界、App HTTP supervisor、Host/端口运维  

读完 15 必须读 16，否则会带着「开关不 bind」的过时结论出门。

---

## 12. 追加：Alarm 生成与墙钟时区（2026-07-16 浇花案）

> 详偏差与探测见 [12 附录 B](./12-runtime-hardening-and-sfx.md)。此处只补 **prompt 层** 为何改、怎么写才驱动 agent。

### 12.1 需求从哪来

用户自然语言：

```text
帮我弄一个每天晚上 8 点提示我浇花的闹钟
```

生成结果 `每天 20:00`「看起来对」，但 **下次触发** 曾出现 04:00 / ~13h——暴露：

1. runtime 虽注入 `timezone.resolved`，**task prompt 未用对错表钉死墙钟**；  
2. 全局 `settings.timezone=system` 探测成 GMT 时，再好的 JSON 也会被调度算歪。

### 12.2 prompt 拆解：为什么 CRITICAL 段「好」

`src-tauri/prompts/alarm_generate.prompt` 增补要点：

| 写法 | 作用 |
| --- | --- |
| 「唯一 zone = timezone.resolved」 | 禁止模型另起炉灶 |
| 「禁止 UTC 换算 times[]」 | 针对「聪明换算」失败模式 |
| 对错表：上海 20:00 vs 12:00 | 可机判、可当测试向量 |
| 「无 per-alarm timezone 字段」 | 防 schema 膨胀 |

`system.prompt` / `output_contract.prompt` / runtime 块尾注同步同一 CRITICAL，避免只在一层写、组合时被淹没。

### 12.3 坏 → 好（生成向）

| 坏 | 好 |
| --- | --- |
| 按 UTC 理解用户本地晚上 | times 与用户口头钟点 1:1 |
| 只写「注意时区」 | 对错表 + 失败后果（04:00） |
| 生成后不管 next | 手测剩余小时与日历时刻 |

### 12.4 与 runtime 层的合同

```text
runtime 提供：timezone.setting / timezone.resolved / now.local / now.utc
task 消费：只把 now.local + resolved 用于相对时间；绝对钟点不写进 UTC
domain 消费：times[] 在 resolved zone 墙钟求值 → 绝对瞬间 → UI
```

三层任一断裂都会重现浇花案。完整探测与写库见 record 12 附录 B。

