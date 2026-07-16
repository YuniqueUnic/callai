# 18 · 插件市场 / 拖放安装 / 版本更新 / 反馈闭环：把「能装」变成「能用」

> 阶段：`v0.2.8+` 工作区 · 接续 [17 内置插件 / Host Panel / Zip](./17-builtin-plugins-host-panel-and-zip-packages.md) · [14 窗口铬](./14-custom-titlebar-and-window-chrome.md) · [12 运行时硬化与 SFX](./12-runtime-hardening-and-sfx.md)  
> 证据（代码真源；落地以工作区 + `git log` 为准）：
>
> | 路径 | 主题 |
> | --- | --- |
> | `src-tauri/src/infra/plugin/manager/package_io.rs` | `InstallPackageOpts`：overwrite / 禁降级 / 默认不碰 data.db |
> | `src-tauri/src/infra/plugin/package.rs` | `version_cmp` · `peek_plugin_zip`（id/version/includes_data） |
> | `src/domain/pluginVersion.ts` | 前端 semver-ish 比较（与 Rust 对齐） |
> | `src/pages/plugins/PluginRegistryPanel.tsx` | 市场：有更新 / 更新 / 强制装旧版 |
> | `src/pages/plugins/PluginListCard.tsx` | 已装：更新角标 + 一键更新 |
> | `src/pages/PluginsPage.tsx` | Tauri `onDragDropEvent` · body class overlay |
> | `src/pages/plugins/usePluginZip.ts` · `PluginImportProgressModal.tsx` | 解析/安装进度 · 冲突元数据 |
> | `src-tauri/templates/plugin/host_chrome.css` | Host bar 隔离插件全局 `button{}` |
> | `src-tauri/templates/plugin_packages/test/**` | QA zip 夹具 |
> | `src/ui/TitleBar.tsx` | 透明窗手动 resize（clip-path 外握点） |
>
> 关联口语：拖 zip 上传 overlay · 安装进度态 · 市场 update_available · 同 id 更高 version · 默认保留数据 · ENV 唯一覆盖 · host bar 偏移 · 转盘指针 · 试听卡顿 · MCP 对齐 · model 勿自动 fetch · **overlay 圆角已用户手测确认**

---

## 1. 思想 / 为什么有这个需求

### 1.1 Record 17 交付了「平台骨架」，用户下一句永远是「然后呢」

17 解决了：

- 内置插件 seed  
- storage ≡ settings ≡ params  
- Host FAB 吃公共 UI  
- zip 规范与本地安装/导出  

但学员与真实用户会立刻追问：

| 追问 | 产品含义 |
| --- | --- |
| 拖 zip 怎么装？ | **发现路径**要像访达拖进窗口一样直觉 |
| 装的时候卡死了吗？ | **过程态**必须可见（解析/安装/成功/失败） |
| 市场里怎么更新？ | **同 id + 更高 version**，不是「再装一个」 |
| 更新会不会丢我的待办？ | **覆盖 UI，默认保留 data.db** |
| 为什么测试插件 host 条歪了？ | 插件 CSS 会污染主机注入 DOM |
| 闹钟参数和插件设置又分叉了？ | 继续坚持 **ENV 同名覆盖唯一入口** |

**思想一句话：**

> 插件平台从「能装上」到「敢更新、看得懂、拖得动」，  
> 关键路径是 **身份（id）+ 版本序 + 数据边界 + 反馈回路**，  
> 不是再加第三套参数表单。

### 1.2 为什么更新规则必须「死板」

口语里「更新」极容易变成三种错误实现：

1. **按名字猜是不是同一个插件** → 作者改名就装成两个  
2. **静默覆盖 data.db** → 用户丢待办/转盘选项  
3. **静默降级** → 市场误点旧包把修好的版本盖回去  

本轮**推荐且已落地**的产品规则（刻意死板）：

```text
same plugin     ⇔  manifest.id 相同
可更新           ⇔  id 相同 且 package.version > installed.version
更新动作         ⇔  conflict=overwrite，默认不写 data.db
含数据包         ⇔  覆盖时二次确认是否 replace_data
version 降级     ⇔  默认拒绝；仅 force_downgrade 显式允许
```

**为什么好：**

- **可机判**：id + version_cmp，不靠 NLP  
- **可解释**：冲突弹窗直接写「已装 vX · 包 vY」  
- **可回滚数据边界**：UI 坏了能覆盖；数据默认安全  
- **可教**：学员 5 分钟能复述，AI agent 不易发明第三套语义  

### 1.3 为什么拖放必须走 Tauri 原生事件

实现上曾出现完整「假象」：

| 现象 | 错误判断 | 真实原因 |
| --- | --- | --- |
| 光标变 `+` | 「HTML5 DnD 已经通了」 | 部分 preventDefault / 系统光标 |
| 页面无 overlay | 「React state 没 set」 | **WKWebView 拖文件中途常不重绘 setState** |
| 松手没安装 | 「drop 没绑」 | **Tauri 默认接管 OS drop → 给 paths，不给 FileList** |

Tauri 文档写得很清楚（`dragDropEnabled` 默认 true）：

> 在 Windows 上若要用前端 HTML5 DnD，需关掉原生 drag-drop。  
> 默认开启时，应使用 `onDragDropEvent`。

**思想：**

> 桌面壳的「文件拖入」是 **OS → 壳 → 路径字符串** 的契约，  
> 不是浏览器「File 对象进 `<div onDrop>`」的契约。  
> 错把 Web 教材抄到 Tauri，会得到「半通」：光标对、功能错。

### 1.4 为什么教学文档要写长

用户反馈（接 12 的同一诉求）：

> records 后面几篇太短；要分析 commits 与 prompt；  
> 说明为什么好、需求动机、如何说清、如何驱动 agent；  
> 交互拓展、功能拆解、真实执行与偏差。

**本篇目标：** 不只列文件表，而把 **多轮反馈闭环** 写成可复用的「怎么逼 AI 修对」教材。

---

## 2. 原始 prompt 摘录 + 拆解（为什么好 / 还缺什么）

以下按**对话轮次**拆解。好 prompt 的共性：**身份 / 边界 / 验收 / 反例** 四件套。

### 2.1 参数面：ENV 是唯一覆盖入口

**口语（压缩）：**

```text
alarm 任务 section 的 ENV 是唯一 ENV/params 配置处；
可覆盖插件 storage 同名 params，不存储，只 runtime；
插件配置区那套参数 UI 删掉；
manifest.params 声明 keys 给 autocomplete，没声明也能从 storage 提取。
```

| 维度 | 评价 |
| --- | --- |
| **好** | 明确「唯一入口」→ 可删代码；明确「不写回」→ 数据模型 |
| **好** | manifest 声明 *可选*，不强迫作者完美 |
| **缺** | 初稿仍残留 `CALLAI_PLUGIN_MODE` 等别名 → 后轮要求 **删 legacy** |

**纠偏后更好：**

```text
去掉所有 CALLAI_PLUGIN_* 参数别名；
ENV 直接 mode=drink；
autocomplete 也不要出现 CALLAI_*。
```

→ 实现：`apply_env_param_overrides` 只映射非 `CALLAI_PLUGIN`/`CALLAI_NOTIFY` 的 key。

### 2.2 更新面：同 id + 更高 version

**口语：**

```text
用户安装的插件怎么更新？怎么判断同一个？
same plugin ⇔ id；可更新 ⇔ version 更高；
overwrite 默认保留 data；含数据二次确认；禁止静默降级。
市场/已装列表 update_available + 一键覆盖更新。
```

| 维度 | 评价 |
| --- | --- |
| **好** | 规则可写成表，可写测试 |
| **好** | 区分「更新」与「强制旧版」按钮文案 |
| **缺** | 若只说「覆盖安装」不说 version，agent 会永远 overwrite |

### 2.3 拖放面：overlay + 进度

**口语：**

```text
拖拽上传时 plugin tab 要有 + / 上传 overlay；
上传解析安装要有 progress modal：过程/成功/失败。
```

| 维度 | 评价 |
| --- | --- |
| **好** | 验收可截图：遮罩文案 + modal 三态 |
| **缺** | 没点名 **Tauri onDragDropEvent** → agent 先写 HTML5，必踩坑 |
| **反馈** | 「cursor 变 + 但软件内无变化」→ 暴露 **重绘 + 事件源** 双坑 |

### 2.4 视觉/铬面：圆角与污染

**口语：**

```text
overlay 四角方形 → 要与透明窗圆角一致；
测试插件 host bar 内部按钮偏移，其他插件正常。
```

| 维度 | 评价 |
| --- | --- |
| **好** | 对比样例（正常插件 vs 坏插件）→ 易定位全局 CSS |
| **好** | 圆角问题可对齐 record 14 的 clip-path 教训 |

### 2.5 其它反馈（同会话串联）

| 反馈 | 类型 | 落地要点 |
| --- | --- | --- |
| 转盘指针与结果不一致 | 算法 bug | `final rot ≡ -mid`，勿 `rot + (360-mid)` 累加错误 |
| 试听卡 ~1s | 阻塞 IO | UI 只 WebAudio；Rust `afplay` 改 spawn |
| MCP「已停止」刷新按钮不贴右 | 布局 | `mcp-status-row` nowrap + margin-left auto |
| models 自动 fetch | 产品 | 去掉 auto-fetch，仅刷新按钮 |
| 窗口边缘 resize 不灵 | 桌面铬 | grip portal 出 clip-path + 手动 PhysicalSize |
| 文案像开发文档 | 产品语气 | 对齐 PRODUCT.md，去掉 invert/ENV 术语 |

**串起来的思想：**

> 同一周的插件工作不是「加功能列表」，  
> 而是 **契约（id/version/ENV）+ 壳层（拖放/窗口/host CSS）+ 反馈（进度/SFX/文案）** 三层同时收口。

---

## 3. 如何把需求说清楚（可复制提示模板）

### 3.1 插件更新总包（给 AI agent）

```markdown
# Goal
Make user-installed plugins updatable with clear identity and safe data defaults.

# Identity
- Same plugin ⇔ manifest.id only (never name)
- update_available ⇔ id match AND package.version > installed.version (semver-ish, share logic with Rust version_cmp)

# Install options (Rust)
struct InstallPackageOpts {
  conflict: rename | overwrite | fail | skip,
  force_downgrade: bool,   // default false
  replace_data: bool,      // default false; only if package has data.db
}
- overwrite + !replace_data ⇒ write ui/manifest only, keep data.db
- overwrite + package.version < installed && !force_downgrade ⇒ error "downgrade blocked"

# UI
- Market list: tags 有更新; buttons 安装 | 更新 | 重新安装 | 强制装旧版
- Installed list: badge + one-click update from last fetched registry index
- Zip conflict modal: show installed vs package version; optional replace_data switch

# Tests
- unit: overwrite blocks silent downgrade; force_downgrade keeps storage keys
- cargo test plugin_package; tsc; clippy -D warnings

# Non-goals
- No separate "settings vs params" systems
- No auto-fetch models / no auto network registry install without user click (except optional background index for badges)
```

### 3.2 拖 zip 安装（强调 Tauri）

```markdown
# Goal
Drag-drop plugin zip on Plugins tab with overlay + progress modal.

# Critical platform fact
- Tauri dragDropEnabled defaults ON → use getCurrentWindow().onDragDropEvent
- payload: enter/over/leave/drop with paths: string[]
- On drop: beginImportPathSimple(path) for *.zip
- Do NOT rely on HTML5 dataTransfer.files for the primary path

# Overlay
- Portal to document.body; fixed; match --callai-window-radius + clip-path
- Toggle via html/body class callai-plugin-file-drag (not only React state)
- Visual: large + and label 上传

# Progress modal
- phases: reading | parsing | installing | success | error (conflict uses separate modal)
- busy phases non-dismissible

# Acceptance
- Plugins tab active → drag qa-import-demo-bare.zip from Finder → overlay → install progress → list shows plugin
```

### 3.3 Host 隔离（防插件 CSS 污染）

```markdown
# Goal
Host #callai-host-bar layout immune to plugin page CSS.

# Root cause pattern
Plugin ui.html often has `button { margin-top; padding; border-radius }` which matches host buttons.

# Fix
- In host_chrome.css: #callai-host-root button { all: unset; … } then re-apply bar metrics with !important
- Teach plugin authors: scope selectors (.card button), never bare button/input

# Acceptance
- Open plugin installed from qa-import-demo-*.zip → bar icons aligned like todo/pomodoro
```

### 3.4 「坏 prompt → 好 prompt」对照

| 坏 | 好 |
| --- | --- |
| 支持拖拽上传 | Tauri onDragDropEvent + paths + overlay class + progress 三态 |
| 支持更新 | id 相同 + version_cmp > + overwrite 保 data + 禁降级 |
| 修好 host bar | 全局 button 选择器污染；host 用 all:unset 隔离 |
| 弄好看点 | 透明窗 overlay 必须 clip-path 圆角，禁止方形 fixed 铺满 |

---

## 4. 功能划分与交互扩展

### 4.1 模块边界

```text
┌─────────────────────────────────────────────────────────┐
│ PluginsPage（tab 编排 · registry 缓存 · DnD 监听）        │
├──────────────┬──────────────────┬───────────────────────┤
│ ListCard     │ RegistryPanel    │ usePluginZip          │
│ 更新角标/按钮 │ 安装/更新/强制旧版 │ progress + conflict   │
├──────────────┴──────────────────┴───────────────────────┤
│ Tauri commands: import_* · peek_plugin_zip · registry     │
│ PluginManager.install_package(opts)                      │
└─────────────────────────────────────────────────────────┘
```

### 4.2 安装状态机

```text
idle
  → (drop path | pick file | market install)
reading / parsing
  → conflict? ──→ ConflictModal ──→ installing
  → installing ──→ success | error
```

- **conflict**：同 id 已存在；展示版本对比与 replace_data  
- **success / error**：ImportProgressModal；busy 时不可点遮罩关闭  

### 4.3 更新决策表（UI）

| 市场 version vs 已装 | 主按钮 | 后端 flags |
| --- | --- | --- |
| 未安装 | 安装 | rename 或直接装 |
| 更高 | **更新** | overwrite, force=false, replace_data=false |
| 相同 | 重新安装 | overwrite, force=false |
| 更低 | **强制装旧版** | overwrite, force_downgrade=true |

### 4.4 交互扩展（已做 / 可作业）

| 扩展 | 状态 |
| --- | --- |
| 已装列表一键更新（来自 registry 缓存） | ✅ |
| 拖放 overlay 圆角贴岛 | ✅ |
| 安装进度 modal | ✅ |
| 包签名 / 校验和 | ❌ 作业 |
| 后台定时检查更新 | ❌ 可选；注意勿扰 |
| 更新 changelog 展示 | ❌ 需 registry 字段扩展 |

### 4.5 与闹钟 ENV 的协同（产品故事）

1. 用户装 `meal-spin` 1.0.0  
2. 闹钟 A：`mode=food`；闹钟 B：`mode=drink`  
3. 市场发 1.0.1（修指针算法）→ 一键更新  
4. **数据（吃喝列表）保留**；**ENV 覆盖行为不变**  

故事验收：更新后转盘准了，列表还在，两个闹钟页仍不同。

---

## 5. 推进流程（agent 如何连续交付）

### 5.1 推荐顺序（本轮真实采用的近似）

```text
1. 规则进后端（InstallPackageOpts + version_cmp + tests）
2. peek 元数据（冲突 UI 需要 version/includes_data）
3. 前端 versionCmp + 市场/列表 UI
4. 冲突 modal 升级（更新/降级/替换数据）
5. 拖放：先 HTML5 失败 → 用户反馈 → 改 Tauri onDragDropEvent
6. overlay 视觉：方形 → 圆角 clip-path
7. host CSS 隔离 + 测试包重建
8. 并联杂项反馈（resize / SFX / 文案 / model fetch / 转盘）
9. 写 record 18（本文件）
```

**为什么这个顺序好：**

- 先 **不可协商的数据规则**（降级/data），UI 按钮才有意义  
- 拖放最后用**真实用户手测**校正事件源，避免空想  
- 文档放最后，才能写「偏差」而不是空许诺  

### 5.2 给 agent 的执行纪律（课堂可背）

1. **先写失败测试**（降级阻断）再写 opts  
2. **平台 API 先查官方类型**（`DragDropEvent`）再写前端  
3. **透明窗任何 full-bleed 层** 默认怀疑方形耳朵（record 14）  
4. **插件 HTML 的全局选择器** 默认怀疑污染 host  
5. **每轮用户「还是不行」** → 换假设（state → class → 事件源），不要只加 console.log  

### 5.3 质量门禁

```bash
cd src-tauri && cargo test --lib plugin_package
cargo clippy --lib -- -D warnings
cd .. && bunx tsc --noEmit
```

手测清单见 §8。

---

## 6. 真实执行 / 偏差与纠偏（课堂最有价值）

### 6.1 偏差表（本会话）

| # | 现象 | 错误假设 | 正确假设 | 纠偏 |
| --- | --- | --- | --- | --- |
| 1 | 拖放完全没反应 | 没绑 onDrop | 绑在矮 div 上 | window → window → **Tauri paths** |
| 2 | 光标 + 无 overlay | setState 没跑 | 拖中不重绘 | body class + CSS display |
| 3 | overlay 方形四角 | fixed 全屏即可 | 透明窗圆角岛 | radius + clip-path |
| 4 | host bar 只在测试包歪 | host 布局 bug | **插件全局 button{}** | host all:unset；测试包 scope |
| 5 | 转盘结果与指针不符 | 标签定位问题 | **累加 rot 公式错误** | align = -mid |
| 6 | 试听卡 1s | WebAudio 慢 | **afplay .status() 阻塞** | spawn + UI 只播 WebAudio |
| 7 | 自动拉 models | 方便用户 | 违背「主动刷新」 | 删 soft auto-fetch |
| 8 | 参数区又分叉 | 快捷表单贴心 | 违反唯一 ENV 入口 | 删 QuickParams / legacy 前缀 |
| 9 | resize 光标动不了 | 权限 | **grip 在 clip-path 内** | portal + 手动 resize |

### 6.2 反馈闭环模式（可板书）

```text
用户手测 → 一句现象（含「正常对照」）
    → 重述为可证伪假设（最多 2 个）
    → 用平台文档 / 源码选择器验证假设
    → 最小 diff 修复
    → 同一验收步骤再测
    → 写入 record「偏差表」
```

**对照样例（host bar）：**

> 「**这个** zip 插件 bar 歪，**其他**插件正常」  
> → 假设立刻收窄到 **该 ui.html 的 CSS**，而不是 host_panel.js。

### 6.3 与 git 证据的关系

近期相关提交/主题（工作区可能尚未全部 commit）：

| 主题 | 线索 commit / 区域 |
| --- | --- |
| 文档与 registry 规格 | `7b22b97` enhance(docs) plugin platform |
| ENV 直接 key | `8f68e7b` simplify ENV param overrides |
| 透明窗手动 resize | `02f60f9` manual window resizing |
| 本轮市场/DnD/隔离 | 工作区 `package_io` · `PluginsPage` · `host_chrome` |

```bash
git log --oneline --grep=plugin -i -20
git log --oneline -15 -- src/pages/PluginsPage.tsx src-tauri/src/infra/plugin/
```

### 6.4 进度 modal 与冲突 modal 的分工（设计决策）

| Modal | 负责 |
| --- | --- |
| ImportProgress | 无决策的过程与终态 |
| ImportConflict | **需要用户决策**（覆盖/另存/强制旧版/是否换数据） |

冲突时 progress 进入 `conflict` 相并隐藏过程 modal，避免两层叠罗汉。  
这是交互上的 **KISS**：一个时刻只问一个问题。

---

## 7. 增强说明：身份 / 版本 / 数据 三定律

### 7.1 定律 A · 身份只信 id

```json
{ "id": "meal-spin", "name": "今天吃喝什么", "version": "0.6.1" }
```

- 作者把 name 改成「吃点啥」→ **仍是同一插件**  
- 作者把 id 改成 `meal-spin-2` → **新插件、新 data.db**  

### 7.2 定律 B · 版本只做序关系

`version_cmp("1.2.0", "1.10.0")` 按数字段比较（与 Rust 一致）。  
UI 与后端必须 **同一算法**，否则会出现「列表说有更新、安装却报错」。

### 7.3 定律 C · 数据默认神圣

| 操作 | data.db |
| --- | --- |
| 更新 UI（overwrite, replace_data=false） | **保留** |
| 用户勾选「同时替换本地数据」 | 替换 |
| 新安装且包含 data | 写入包内 data |
| 降级强制覆盖 | 仍默认保留 data，除非勾选替换 |

---

## 8. 验收清单（手测剧本）

### 8.1 拖放安装

1. `bun tauri dev`，打开 **插件** tab。  
2. 访达拖入  
   `src-tauri/templates/plugin_packages/test/qa-import-demo-bare.zip`。  
3. 应见全屏圆角 overlay：`+` / 上传。  
4. 松开 → 进度 modal → 成功。  
5. 列表出现 `qa-import-demo`。  

### 8.2 更新与降级

1. 先装 conflict 包 v1.0.1（或市场更高版）。  
2. 再装更低 version 的同 id 包 → 应 **拒绝** 或 UI 走「强制装旧版」。  
3. 强制旧版后 storage 中业务 key 仍在（若未勾选替换数据）。  

### 8.3 市场角标

1. 刷新市场（或打开市场 tab 拉 index）。  
2. 已装低版本时：已装列表 / 市场条目显示「有更新」。  
3. 点更新 → version 升高，数据保留。  

### 8.4 Host bar 污染

1. 用**新**测试 zip 覆盖安装。  
2. 打开插件窗：host bar 三颗按钮应水平对齐、无被 margin-top 顶歪。  

### 8.5 回归

- meal-spin 指针与结果一致  
- 提示音试听无明显卡顿  
- 透明窗四角 resize 可拖  
- settings 模型仅手动刷新  

---

## 9. 练习（学员）

1. **写 prompt：** 要求 registry 条目增加 `changelog` 字段，更新弹窗展示三行说明；禁止改 id 规则。  
2. **画状态机：** 从 drop 到 success，标出所有可能回到 idle 的边。  
3. **复现污染：** 写一个只有 `button{margin:20px}` 的 ui.html，观察 host bar，再应用 host 隔离 CSS。  
4. **对比事件源：** 在日志里打印 HTML5 drop 的 `files.length` 与 Tauri `paths`，解释差异。  
5. **版本题：** 已装 `1.0.0`，包 `1.0.0-beta`（若 cmp 行为与预期不同）讨论是否要收紧解析。  

---

## 10. 给授课者的 10 分钟演示

1. 打开 record 17 §参数合一，再打开本篇 §7 三定律。  
2. 现场拖 zip：overlay 圆角 + 进度。  
3. 打开 `window.d.ts` 的 `onDragDropEvent` 给学员看「paths 不是 File」。  
4. 装测试包 → 展示坏 button 选择器 → 读 host_chrome 隔离。  
5. 市场更新：改 mock version 或手改本地 manifest 演示角标。  
6. 强调：**用户说「还是不行」时，优先换事件源/平台假设，而不是加 toast。**  

---

## 11. 与相邻 records

| Record | 关系 |
| --- | --- |
| [14](./14-custom-titlebar-and-window-chrome.md) | 透明窗圆角、clip-path、握点 portal、禁止方形 full-bleed |
| [15](./15-ai-mcp-prompt-composition.md) | plugin_sdk 合同；dual-part 生成 |
| [16](./16-mcp-tools-and-logs.md) | 外挂调试插件；日志边界 |
| [17](./17-builtin-plugins-host-panel-and-zip-packages.md) | 内置 seed、host FAB、zip 规范、参数统一 |
| [12](./12-runtime-hardening-and-sfx.md) | SFX、超时；「records 要写长」的元需求 |

路径 **G（插件平台）** 建议追加本篇为终点：

`15 → 16 → 17 → **18** → 手测拖放/更新/隔离`。

---

## 12. 小结

| 层级 | 本轮交付 |
| --- | --- |
| **契约** | id / version_cmp / 禁降级 / 默认保 data |
| **分发** | 市场角标 + 一键更新 + zip 冲突智能化 |
| **导入 UX** | Tauri 拖放 + class overlay + 进度 modal |
| **主机健壮** | host CSS 隔离插件全局样式 |
| **桌面铬** | overlay 圆角；resize portal；深色对比 |
| **工程** | 测试包夹具；plugin_package 降级测试 |
| **教学** | 反馈闭环偏差表；prompt 模板；事件源课 |

**一句话收束：**

> 插件系统的「完整」不是功能清单变长，  
> 而是 **用户能拖进来、看得懂进度、敢点更新、更新不丢数据、坏 CSS 伤不到主机**。  


下一跳（作业）：registry `min_app_version` / 签名校验 / 更新日志字段 / 可选后台检查更新（安静角标，禁止弹窗刷屏）。

---

## 附录 A · 多轮手测时间线（把「还是不行」写成证据链）

本轮最有教学价值的不是「最后写对了什么」，而是用户连续四轮用**同一验收步骤**逼 agent 换假设。

### A.1 时间线（压缩自会话口语）

| 轮次 | 用户原话（压缩） | 表面上「像」什么 | 真实故障层 | agent 纠偏 |
| --- | --- | --- | --- | --- |
| T0 | 拖拽上传看起来还没有做；要 +/上传 overlay + 进度三态 | 功能未实现 | 确实缺 UX | 先做 HTML5 drop + React overlay + ProgressModal |
| T1 | 拖到 plugin tab 没反应 | 监听没绑 | 绑在矮容器；且 Tauri 默认吃 OS drop | 抬到 window；仍半通 |
| T2 | cursor 变 +，软件内无变化 | setState 失败 | **WKWebView 拖文件中途不重绘 React** | `html/body` class `callai-plugin-file-drag` + CSS `display` |
| T3 | 还是不行；导入按钮 OK；要查底层 | 监听还错 | **应走 `onDragDropEvent` paths**，不是 FileList | `getCurrentWindow().onDragDropEvent` |
| T4 | 有 overlay 了，四角方形 | 样式疏漏 | 透明窗 full-bleed fixed 画方耳朵（record 14 同构） | `border-radius` + `clip-path: inset(0 round var(--callai-window-radius))` |
| T5 | **圆角有了，修复好了** | — | 验收闭环 | 写入本附录为 **用户确认** |

**板书金句：**

> 「光标变了」只证明 **OS 认为这是文件拖入**；  
> 不证明 **应用收到了 paths**，更不证明 **UI 层被允许重绘**。

### A.2 为什么 T2 与 T3 必须拆开教

很多 agent（以及很多工程师）会把「没 overlay」和「没安装」合成一个 bug。本会话证明它们是**两层**：

```text
层 1 · 事件源
  OS drop → Tauri paths  还是  HTML5 FileList？
层 2 · 渲染通道
  React setState 在 drag 中途 paint  还是  必须改 DOM class？
```

只修一层会得到：

- 只修层 1：能装，但拖的过程没反馈（体验差）  
- 只修层 2：有漂亮 overlay，松手没 paths（功能假）  

**好需求写法**应同时给验收：

```text
拖入中：必须出现圆角 overlay（视觉）
松开后：必须进入进度 modal 并安装成功（功能）
两步缺一不算通过。
```

### A.3 对照样例法（host bar）

用户同时给了：

> 导入 `qa-import-demo-conflict.zip` 后 host bar 偏移；**其他插件正常**。

这比「host bar 坏了」强一个数量级：

| 弱描述 | 强描述 |
| --- | --- |
| host 条歪了 | **仅该测试包**歪；todo/pomodoro **正常** |
| 可能是布局 bug | 怀疑 **该 ui.html 全局 CSS** |

纠偏路径立刻收窄到 `button { … }` 污染 → `host_chrome.css` 对 `#callai-host-root button { all: unset; … }`。

**教学：** 让用户/PM 学会给「坏样本 + 好样本」，比给截图 alone 更省 agent 轮次。

---

## 附录 B · Commits / 工作区证据拆解（为什么这些提交「好」）

> 落地以 `git log` 与工作区为准；写作时 `main` 已有部分提交，**市场/DnD/版本更新**大量仍在未提交工作区——教材必须诚实写「已提交 vs 待提交」。

### B.1 已提交（本弧相关）

#### `8f68e7b` · `refactor(plugin-sdk): simplify ENV param overrides to direct key mapping`

**主题：** 参数面收口（为 18 的「ENV 唯一入口」奠基）。

| 拆解 | 内容 |
| --- | --- |
| **BREAKING** | 删除 `CALLAI_PLUGIN_MODE` / `CALLAI_PLUGIN_PARAM_*` / `CALLAI_PLUGIN_PARAMS` 等别名 |
| **产品** | Alarm Task → ENV 是 runtime 覆盖唯一入口；同名 key 不写回 storage |
| **工程** | `apply_env_param_overrides` 变短；只保留宿主注入 `CALLAI_PLUGIN` / `CALLAI_NOTIFY` |
| **可发现** | `manifest.params` + storage.settings keys 并集 → `PluginSummary.param_keys` → ENV autocomplete |
| **夹具** | `scripts/build_plugin_test_packages.py` + `plugin_packages/test/*.zip` |
| **并联修复** | 试听 `afplay` 改 spawn；sound cache；host_panel 强化；i18n 瘦身；SuggestInput |

**为什么这个 commit 写得好（给学员学 commit message）：**

1. 标题是 **行为变更**，不是「update stuff」  
2. body 先写 **BREAKING CHANGE**，再写清单  
3. 把「文档 / 内置插件 / 测试包 / 闹钟 UI」放在同一主题下，避免拆成十个无关联 commit 却不改契约  

**与 record 18 的关系：** 没有 ENV 收口，后面「更新插件不丢数据」仍会被第二套参数表单搞乱。

#### `7b22b97` · `enhance(docs): add plugin platform documentation and registry spec`

**主题：** 规格真源（`docs/plugin-registry.md` 等），让「市场」在代码前先有名词表。

**为什么好：** agent 读文档可比猜 UI；后续 `update_available` 实现有落点。

#### `02f60f9` · `fix(titlebar): implement manual window resizing for transparent shells`

**主题：** 用户反馈「cursor 已是 resize 却拖不动」。

| 根因 | 透明窗 + clip-path 把默认 OS 边缘 hit 裁掉 |
| --- | --- |
| 修法 | grip portal 到 body + 手动 `PhysicalSize` |
| 关联 | 与 overlay 圆角同一「桌面铬」课：壳层物理边界 ≠ Web 视觉边界 |

#### `aabe5c9` · `feat: AI assistant, plugins, MCP tools… (#43)`

大史诗合并：插件管理器 / MCP / AI 页骨架。18 是在其之上把 **分发与反馈** 补全。

### B.2 工作区（写作时未全部 commit）— 本篇核心交付面

```text
src-tauri/src/infra/plugin/manager/package_io.rs   InstallPackageOpts
src-tauri/src/infra/plugin/package.rs              peek_plugin_zip · version_cmp
src-tauri/src/tests/plugin_package.rs              overwrite_blocks_silent_downgrade_keeps_data
src/domain/pluginVersion.ts                        前端序关系（对齐 Rust）
src/pages/PluginsPage.tsx                          onDragDropEvent · body class
src/pages/plugins/usePluginZip.ts                  progress + conflict + flags
src/pages/plugins/PluginImportProgressModal.tsx    过程态
src/pages/plugins/PluginImportConflictModal.tsx    决策态
src/pages/plugins/PluginRegistryPanel.tsx          市场按钮矩阵
src/pages/plugins/PluginListCard.tsx               已装一键更新
src-tauri/templates/plugin/host_chrome.css         all:unset 隔离
src/theme/plugins.css                              drop overlay 圆角
```

**授课时演示：**

```bash
git status -sb
git diff --stat HEAD -- src/pages/PluginsPage.tsx src-tauri/src/infra/plugin/
```

让学员看到：**功能已在工作区可运行，教材写的是「可验证真相」而不是「已 push 的假完整」。**

### B.3 测试作为契约锚点

`overwrite_blocks_silent_downgrade_keeps_data` 名字本身就是规格：

1. overwrite 时 version 更低 → **必须 error**（除非 force）  
2. 成功路径 → **业务 storage key 仍在**  

教 agent：先写这种测试，UI 按钮只是 flags 的皮肤。

---

## 附录 C · 拖放三连坑深挖（代码级）

### C.1 正确主路径（Tauri）

`PluginsPage.tsx` 核心纪律（语义，非逐字抄作业）：

```text
if (!tabActive) → 卸监听、藏 overlay
isTauri():
  getCurrentWindow().onDragDropEvent
    enter|over → showDropOverlay()  // class on html+body
    leave      → hideDropOverlay()
    drop       → hide + paths.find(*.zip) → beginImportPathSimple(path)
else:
  window HTML5 dragover/drop 兜底（浏览器 mock）
```

注释里写死三句话（给未来 agent 的防呆）：

1. OS file drops → **paths**  
2. HTML5 FileList 在 dragDrop 开启时 **不可靠**  
3. Overlay 用 **document class**，不指望 drag 中途 React paint  

### C.2 Overlay 圆角（用户 T5 已确认）

`plugins.css`：

```css
.plugins-drop-overlay {
  position: fixed;
  inset: 0;
  display: none;
  border-radius: var(--callai-window-radius, 16px);
  clip-path: inset(0 round var(--callai-window-radius, 16px));
  -webkit-clip-path: inset(0 round var(--callai-window-radius, 16px));
  /* … */
}
html.callai-plugin-file-drag .plugins-drop-overlay,
body.callai-plugin-file-drag .plugins-drop-overlay {
  display: grid !important;
}
/* 最大化/全屏时岛变方，取消圆角 */
html.tauri:has(.app-shell.is-maximized) .plugins-drop-overlay,
html.tauri:has(.app-shell.is-fullscreen) .plugins-drop-overlay,
html.callai-window-chrome-flat .plugins-drop-overlay {
  border-radius: 0 !important;
  clip-path: none !important;
}
```

**与 record 14 的迁移规则：**

| 场景 | 错误 | 正确 |
| --- | --- | --- |
| 透明圆角窗上的遮罩 | `position:fixed; inset:0` 无 clip | 同步 `--callai-window-radius` + clip-path |
| 最大化 | 仍圆角「假耳朵」 | flat 时 radius=0 |

### C.3 为什么「导入按钮 OK、拖放不行」是金线索

文件选择器走 `dialog` / pick files → 直接得到 path → `beginImportPathSimple`。  
拖放若只绑 HTML5，**永远拿不到** Tauri 路径。

因此用户说：

> 点击导入选文件没问题；拖放不行  

几乎直接判定：**安装管线 OK，事件源错**。  
好 agent 应 **30 秒内** 打开 `onDragDropEvent` 文档，而不是重写 progress modal。

---

## 附录 D · 超长口语 prompt 如何拆成可执行包（本会话全景）

用户一次（或连续）抛出的内容横跨：

1. 内置插件清单（TODO / 番茄 / 转盘 / 汇报）— 多在 record **17**  
2. Host content panel / FAB → floating bar — **17**  
3. zip 导入导出 / 市场铺垫 — **17→18**  
4. ENV 唯一入口 / 删 legacy 别名 — **8f68e7b + 18**  
5. 市场更新规则（id/version/data/降级）— **18 核心**  
6. 拖放 overlay + 进度 — **18 核心**  
7. 手测反馈海（host bar、转盘、试听、resize、文案、MCP 对齐、model fetch）— **18 并联**  
8. **写长 development record** — 本文件  

### D.1 拆包原则（给 PM / 学员）

| 原则 | 做法 |
| --- | --- |
| **一层契约，一层壳，一层反馈** | 先 id/version/ENV，再 DnD/窗口，再 toast/SFX/i18n |
| **可机判优先** | 「同 id」可测；「体验好」不可测 |
| **验收可截图** | overlay 有无、角标有无、bar 齐不齐 |
| **对照样例** | 坏插件 vs 好插件 |
| **禁止第三套参数** | 明确删 UI，而不是「也支持」 |
| **平台 API 写进 prompt** | 点名 `onDragDropEvent`，别只说「支持拖拽」 |

### D.2 「好 prompt」解剖：更新规则段

用户给出的定案（略改格式）：

```text
same plugin  ⇔  manifest.id 相同
可更新        ⇔  id 相同 且 package.version > installed.version
更新动作      ⇔  overwrite（换 UI/manifest，默认不碰 data.db）
含数据的包   ⇔  覆盖时要二次确认是否连 data 一起换
version 降级：默认禁止静默降级；硬要则显式「覆盖安装（含旧版）」
不要用名字判断同一插件
```

**为什么好：**

1. **双条件连接词**（⇔ / 且）消除歧义  
2. **默认值**写死（不碰 data、禁降级）  
3. **例外路径**单独命名（force / replace_data），UI 可映射按钮  
4. **反模式**显式写出（不要按名字）  

**还可以更好（模板补丁）：**

```text
- 给出 version_cmp 算法约定（数字段，与 Rust 共用测试向量）
- 给出失败错误文案 key（i18n）
- 要求 cargo test 名字包含 downgrade / keeps_data
```

### D.3 「坏 prompt → 好 prompt」扩表（课堂作业答案）

| 坏 | 为什么坏 | 好 |
| --- | --- | --- |
| 支持插件市场 | 无 id/version/数据语义 | 同 id + 更高 version + overwrite 保 data + 禁降级 |
| 拖 zip 上传 | 无平台、无过程态、无验收 | Tauri onDragDropEvent + class overlay + progress 三态；导入按钮作对照 |
| 修一下 dark mode | 无具体控件 | titlebar 底色、置顶/全屏对比度、ENV input 后方形底、插件窗左侧方角 |
| hint 写清楚点 | 会变成开发者说明书 | 对齐 PRODUCT.md；用户句；删 invert/ENV 术语 |
| 加些内置插件 | 无列表、无删、无 seed | TODO/番茄/meal-spin/汇报；可删；统一目录；animal-island |
| 参数可以覆盖 | 会做出第二套表单 | ENV 唯一；同名 runtime；不写回；manifest.params 可选 autocomplete |

### D.4 如何驱动 agent「连续推进」而不假完成

用户反复说「继续推进」「还是不行」「仔细查看更多底层原因」。

| 用户策略 | 对 agent 的效果 |
| --- | --- |
| 同一验收步骤重测 | 阻止「我改了 CSS 就算修好拖放」 |
| 给对照（导入 OK / 拖放不行） | 缩小搜索空间 |
| 给路径夹具（具体 zip） | 可复现 |
| 要求 records 写长 | 强迫沉淀偏差，而不是只改代码 |

**agent 侧纪律（呼应 §5.2）：**

```text
用户说「还是不行」
  → 禁止只加 toast
  → 换假设类别：事件源 / 渲染通道 / 平台权限 / CSS 污染 / 数据契约
  → 每次只验证一个假设
  → 用官方 API 或最小 PoC 证明
```

---

## 附录 E · 功能清单全景（17 收口 + 18 补全）

便于学员一张表看清「平台完整度」。

### E.1 契约层

| 能力 | 状态 | 真源 |
| --- | --- | --- |
| storage ≡ settings ≡ params | ✅ | 17 + domain |
| ENV 同名 runtime 覆盖、不写回 | ✅ | runtime + 8f68e7b |
| 删除 CALLAI_PLUGIN_* 参数别名 | ✅ | 8f68e7b |
| manifest.params 可选 + storage 提取 keys | ✅ | PluginSummary.param_keys |
| same id / version_cmp / 禁降级 / 默认保 data | ✅ | InstallPackageOpts |

### E.2 分发层

| 能力 | 状态 | 真源 |
| --- | --- | --- |
| zip 规范 import/export | ✅ | package.rs |
| peek id/version/includes_data | ✅ | peek_plugin_zip |
| 冲突 modal（版本对比 / replace_data / force） | ✅ | PluginImportConflictModal |
| 进度 modal（解析/安装/成功/失败） | ✅ | PluginImportProgressModal |
| 市场角标 + 更新/强制旧版 | ✅ | PluginRegistryPanel |
| 已装一键更新 | ✅ | PluginListCard + buildMarketUpdates |
| 拖放 overlay（Tauri + 圆角） | ✅ | PluginsPage + plugins.css（**圆角用户确认**） |
| GitHub registry 真浏览 / 签名 | ❌ 作业 | docs/plugin-registry.md |
| changelog 字段 | ❌ 作业 | — |

### E.3 主机与内置

| 能力 | 状态 | 真源 |
| --- | --- | --- |
| Host floating bar + settings/theme/notify | ✅ | host_panel.js / host_chrome |
| Host 隔离插件全局 CSS | ✅ | host_chrome all:unset |
| 内置 seed 可删可恢复（二次确认） | ✅ | restore modal 等 |
| QA 测试 zip 夹具 | ✅ | plugin_packages/test |
| meal-spin 指针=结果 | ✅ | ui.html rot 公式 |
| 日志 ring ≤100 | ✅ | console_buf 等 |

### E.4 壳层并联（本会话反馈）

| 能力 | 状态 |
| --- | --- |
| 透明窗边缘 resize | ✅ 02f60f9 + grips |
| 试听不卡 UI | ✅ spawn |
| 模型列表仅手动 fetch | ✅ |
| MCP 状态行图标右对齐 | ✅ |
| Plugins 操作 SFX | ✅ |
| 用户可见 i18n 去开发者黑话 | ✅ 对齐 PRODUCT |

---

## 附录 F · 安装状态机与决策表（可印刷）

### F.1 状态机

```text
                    pick / drop / market click
idle ──────────────────────────────────────────► reading
                                                    │
                                                    ▼
                                                 parsing
                                                    │
                         ┌──────────────────────────┴──────────────────────────┐
                         ▼                                                     ▼
                   (id 冲突)                                              (无冲突)
                         │                                                     │
                         ▼                                                     ▼
                 ConflictModal ──用户决策──► installing ◄──────────────────────┘
                         │  cancel
                         ▼
                       idle
                                                    │
                                    ┌───────────────┴───────────────┐
                                    ▼                               ▼
                                 success                          error
                                    │                               │
                                    └──────────► idle ◄─────────────┘
```

### F.2 flags 真值表

| 用户意图 | conflict | force_downgrade | replace_data |
| --- | --- | --- | --- |
| 全新安装 | rename/fail 按产品 | false | 包有 data 则写入 |
| 更新到更高版本 | overwrite | false | false（默认） |
| 更新且重置数据 | overwrite | false | **true**（确认） |
| 重装同版本 | overwrite | false | false |
| 装旧版 | overwrite | **true** | false 或确认后 true |

### F.3 错误文案纪律

- 降级阻断：用户句「已安装更高版本…」+ 可选「仍要装旧版」按钮  
- 禁止把 `force_downgrade` 这种标识符直接 toast 给用户  

---

## 附录 G · 关键路径速查（打开即读）

| 想查… | 打开 |
| --- | --- |
| 安装 opts / 降级 | `src-tauri/src/infra/plugin/manager/package_io.rs` |
| version / peek | `src-tauri/src/infra/plugin/package.rs` |
| 降级测试 | `src-tauri/src/tests/plugin_package.rs` |
| 前端 version | `src/domain/pluginVersion.ts` |
| Tauri 拖放 | `src/pages/PluginsPage.tsx`（`onDragDropEvent`） |
| overlay CSS | `src/theme/plugins.css`（`.plugins-drop-overlay`） |
| 进度/冲突 hook | `src/pages/plugins/usePluginZip.ts` |
| 市场 UI | `src/pages/plugins/PluginRegistryPanel.tsx` |
| Host 隔离 | `src-tauri/templates/plugin/host_chrome.css` |
| 测试包生成 | `scripts/build_plugin_test_packages.py` |
| 市场规格 | `docs/plugin-registry.md` |
| 参数 SDK | `src-tauri/prompts/plugin_sdk.prompt` |
| 前篇平台骨架 | [17](./17-builtin-plugins-host-panel-and-zip-packages.md) |
| 透明窗圆角课 | [14](./14-custom-titlebar-and-window-chrome.md) |

---

## 附录 H · 给 AI agent 的「本弧复盘清单」（下一次同类需求直接贴）

```markdown
# Plugin distribute + feedback arc checklist

## Contract first
- [ ] InstallPackageOpts { conflict, force_downgrade, replace_data }
- [ ] version_cmp shared (Rust test + TS)
- [ ] same plugin = id only
- [ ] default keep data.db on overwrite
- [ ] block silent downgrade

## Import UX
- [ ] peek zip → id, version, includes_data
- [ ] ProgressModal: reading|parsing|installing|success|error
- [ ] ConflictModal: version compare + replace_data + force older
- [ ] Tauri onDragDropEvent (paths), not only HTML5 files
- [ ] Overlay via document class (WKWebView drag paint)
- [ ] Overlay radius = --callai-window-radius + clip-path
- [ ] Flat/maximized: radius 0

## Market
- [ ] update_available badge on registry + installed list
- [ ] buttons: Install | Update | Reinstall | Force older
- [ ] one-click update keeps data

## Host isolation
- [ ] #callai-host-root button { all: unset; … }
- [ ] QA zips must not use bare button{} (or host still wins)

## Product tone
- [ ] i18n user language (PRODUCT.md), no invert/ENV jargon
- [ ] confirm dialogs on delete/restore builtin

## Gates
- [ ] cargo test --lib plugin_package
- [ ] cargo clippy --lib -- -D warnings
- [ ] bunx tsc --noEmit
- [ ] hand: drag zip on Plugins tab; update keeps data; host bar aligned
```

---

## 附录 I · 授课 20 分钟加长版（在 §10 上扩展）

| 分钟 | 动作 | 学员应喊出的关键词 |
| --- | --- | --- |
| 0–2 | 打开 17 三定律 vs 本篇 §7 | id / version / data |
| 2–5 | 读用户更新规则原文 | ⇔ 可机判 |
| 5–8 | `git show 8f68e7b --stat` | BREAKING ENV |
| 8–12 | 现场拖 zip：overlay 圆角 | class + clip-path |
| 12–15 | 对比「导入按钮 vs 拖放」 | paths not FileList |
| 15–17 | 打开坏测试包 vs host_chrome | all:unset |
| 17–20 | 走一遍偏差表 T0–T5 | 换假设类别 |

**课后作业：** 把附录 H 清单复制到下一项目的 PR 描述，删掉不适用项，补一项你们的平台坑。

---

## 附录 J · 本篇元说明（为什么这篇必须长）

用户原话（元需求）：

> 把 overlay、市场完善、测试反馈、BUG 修复、功能新增写成 development 文档；  
> **内容要更多**；分析 commits 与 prompt；说明为什么好、需求动机、如何说清、如何驱动 agent；  
> 交互拓展、功能拆解、真实执行与偏差。

若只写「做了拖放和更新」半页纸：

- 学员学不会 **T2/T3 分层**  
- 下一次 agent 仍会抄 HTML5 DnD  
- 「圆角方形」会再犯 record 14 的错  

因此本篇结构是：

```text
思想 → prompt 拆解 → 模板 → 功能划分 → 推进顺序
  → 偏差表 → 三定律 → 验收
  → 附录（时间线 / commits / 代码 / 超长 prompt / 清单 / 课表）
```

**写长不是注水，是把「多轮对话里昂贵的纠偏」一次性买断成教材。**

---

## 附录 K · 用户确认与残余风险（诚实）

| 项 | 状态 |
| --- | --- |
| overlay 圆角 | **用户确认：圆角有了，修复好了** |
| 拖放主路径 | 代码在 Tauri `onDragDropEvent`；需在 **Plugins tab 激活** 下测 |
| 市场更新 | 依赖 registry index 缓存；无网时角标可能空 |
| 旧已装测试插件 | 若未覆盖安装新 zip，旧 `ui.html` 全局 button 仍可能歪 bar（host 隔离应兜底；仍建议重装夹具） |
| 签名/changelog/后台检查更新 | 未做，见 §12 下一跳 |
| 工作区未 commit 部分 | 授课/发布前应整理 PR，避免「文档说有、main 没有」 |

```bash
# 建议门禁（本弧）
cd src-tauri && cargo test --lib plugin_package
cargo clippy --lib -- -D warnings
cd .. && bunx tsc --noEmit
```

