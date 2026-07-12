# 14 · 自绘 Titlebar 与窗口铬：跨平台一致性 + 透明圆角坑

> 承接 [04 沉浸式 UI](./04-ui-island-motion.md) / [05 交互硬化](./05-ui-interaction-hardening.md)。  
> 本篇记录 callai 从 **系统三大金刚顶栏** 换成 **动森风自绘 titlebar** 的完整链路：需求动机、prompt 拆解、调研坑点、功能拆分、偏差纠偏、验收剧本。  
> 证据：`src/ui/TitleBar.tsx` · `src-tauri/tauri.conf.json` · `src-tauri/capabilities/default.json` · `src/theme/global.css` · commits `50af3fa` 及后续 titlebar 增强。

---

## 1. 思想：为什么要自绘 titlebar？

### 1.1 产品动机（为什么有这个需求）

callai 的视觉承诺是 **Animal Crossing / animal-island-ui 一整岛**：卡片、海浪、小鸟、tag、modal 都是羊皮纸与圆角语言。  
系统原生 titlebar（macOS traffic lights / Windows 11 吸附条 / Linux 各桌面环境）会在窗口顶部撕开一道 **平台差异裂缝**：

| 原生顶栏带来的问题 | 产品后果 |
| --- | --- |
| 三套控件布局与交互 | 截图/录屏/教程无法统一 |
| 直角或系统阴影与岛 UI 圆角冲突 | 「可爱」被系统铬打断 |
| dark/light 由 OS 控制，难跟 token | 顶栏与 body 色温不一致 |
| 高度与 safe area 各平台不同 | 沉浸式 header / 海浪叠加计算变脏 |

用户原话（本轮）核心意图：

```text
把 tauri-app 默认的状态顶栏，三大金刚去掉，改成自绘，自己实现的；
应该也有好用的库，拿来用用；
从而确保 linux/windows/macOS 上表现一致，并且 UI 一直下更强！！！
还有窗口圆角呢！？
圆角后面还有方的
仔细上网查查 tauri 自实现 titlebar 的相关坑点和难点，然后修复！！
titlebar 都自我实现了，那么该思考实现一些花样，一些更高级的东西呀！！
```

**思想一句话**：自绘 titlebar 不是为了炫技，而是 **把窗口铬收编进设计系统**，让「岛」从屏幕边缘就开始成立。

### 1.2 工程动机（为什么现在做）

1. 已经做过 **托盘 template / 浮层 header / 无系统 scrollbar**——窗口铬是下一刀。  
2. 关闭窗口语义已是 **hide to tray**（Rust `CloseRequested`）——自绘 close 按钮必须复用同一语义，不能 `destroy` 杀进程。  
3. dark mode 对比度刚硬化——titlebar / 圆角透明链若漏色，会立刻在截图里露馅。

---

## 2. 原始 prompt 拆解（为什么好 / 还缺什么）

### 2.1 有效片段

| 用户说法 | 为什么好 | 可执行信息 |
| --- | --- | --- |
| 「去掉三大金刚，自绘」 | 目标明确，禁止「半原生半自绘」 | `decorations: false` |
| 「linux/windows/macOS 一致」 | 验收维度是跨平台，不是只修 Mac | 同一套 React 控件 + window API |
| 「有好用的库就用」 | 鼓励调研，但未锁死选型 | 允许否决 `tauri-controls` |
| 「窗口圆角」 | 单独验收项 | transparent + shell radius |
| 「圆角后面还有方的」 | 给了 **失败现象**（透明链漏底） | 查 cascade / host bg |
| 「查坑点再修」 | 强制先调研后改 | 读官方 Window Customization |
| 「自绘后要花样」 | 允许增强，但应挂在同一模块 | pin / fullscreen / resize grips |

### 2.2 还可以写得更清楚的（教学用）

口语缺省时 agent 容易猜错，理想规格应补：

```markdown
## 窗口铬规格
- decorations: false
- close 语义: hide-to-tray（与现有 Rust 一致），不是退出
- 圆角: 16px；最大化/全屏: 0
- 拖拽: data-tauri-drag-region；按钮不得在 drag 子树内
- 平台: macOS 控件在左（traffic 风格自绘），Win/Linux 在右
- 库: 优先 @tauri-apps/api/window；避免强绑 Tailwind/React18 的 titlebar 包
- 禁止: -webkit-app-region 作为唯一拖拽方案
```

### 2.3 为什么「先查坑再实现」是好 prompt

Tauri 自绘窗口 **不是改 CSS 圆角就结束**。官方文档明确：

- 透明窗口必须 **整条 HTML 链透明**，只在内容壳上上色  
- 拖拽推荐 `data-tauri-drag-region`，交互元素不要塞进 drag 节点  
- 无边框窗口在部分平台 **没有系统缩放边**，要自管 resize  

用户说「上网查查」= 把 agent 从「脑补实现」拽回 **证据驱动实现**。

---

## 3. 调研结论：库选型与官方坑点地图

### 3.1 库怎么选？

| 选项 | 优点 | 否决/采用原因（callai） |
| --- | --- | --- |
| **`@tauri-apps/api/window`**（官方） | 一等公民；min/max/close/drag/resize/pin/fullscreen | **采用**；与 React 19 / 自有 CSS 零冲突 |
| `tauri-controls` | 开箱控件 | peer：React 18 + Tailwind；与 React 19 / 动森 CSS 打架 → **不用** |
| 纯 CSS 假顶栏 + 仍开 decorations | 实现快 | 平台三大金刚还在 → **违背需求** |
| macOS `titleBarStyle: Overlay` + 原生灯 | 系统感 | 与 Win/Linux 不一致 → **不用** |

**选型原则（可复用）**：跨平台一致性优先时，**自绘 + 官方 window API**；要系统原生手感时，才考虑 Overlay/traffic lights。

### 3.2 官方与社区高频坑点（必须写进教材）

参考：[Tauri 2 — Window Customization](https://v2.tauri.app/learn/window-customization/) 及透明窗实践。

#### 坑 A · 圆角后面还有方块（本轮真实 bug）

**现象**：shell 已有 `border-radius`，但四角仍有不透明直角「托底」。

**根因链**：

1. `decorations: false` 后 OS 窗口本身是矩形位图  
2. 只有 `transparent: true` 才能让圆角外变「洞」  
3. 若 `html/body/#root/Cursor 包装层` **任意一层** 仍 `background: var(--callai-bg)`，洞会被填回矩形  
4. callai 曾有 **后写的 `body { background: var(--callai-bg) }` 覆盖** 先写的 transparent 规则  

**修法**：

- conf：`transparent: true` + `shadow: true`  
- macOS：`macOSPrivateApi` + Cargo feature `macos-private-api`（透明/私有窗口 API 需要）  
- CSS：仅 `.app-shell.has-titlebar` 上色；`html.tauri *host*` 强制 transparent 且 **放在 cascade 末尾**  
- 最大化/全屏：去掉 radius（否则透明洞露出「圆耳朵」）

#### 坑 B · 拖不动 / 点按钮也在拖

| 错误做法 | 正确做法 |
| --- | --- |
| 整个 header 设 drag，按钮是子元素 | **拖拽区与控件兄弟布局**；控件在 drag 外 |
| 只用 `-webkit-app-region: drag` | 用 `data-tauri-drag-region`；必要时 `startDragging()` 兜底 |
| 按钮上也写 drag-region | 控件 **禁止** drag-region |

#### 坑 C · 双击最大化行为不一致

- Windows 在 drag-region 上常有原生 double-click maximize  
- 其他平台要 **自己听 `detail === 2`** 并 `toggleMaximize()`  
- 全屏中时双击应优先 **退全屏**，而不是再 maximize 叠状态

#### 坑 D · close 语义

| 错误 | 正确（callai） |
| --- | --- |
| `destroy()` 杀进程 | `close()` → Rust `CloseRequested` `prevent_close` + `hide` 托盘 |
| 自绘 close 调 `exit` | 与菜单「退出」分离；close = 藏，tray Quit 才退 |

#### 坑 E · 无边框不能缩放

`decorations: false` 后 Linux/部分 Win 环境边缘缩放消失。  
→ 自绘 8 向 `startResizeDragging(direction)` grip；最大化/全屏时隐藏 grip。

#### 坑 F · 权限遗漏

前端调 API 无 permission 会 silent fail：  
至少需要：`allow-close/minimize/maximize/unmaximize/toggle-maximize/is-maximized/start-dragging/start-resize-dragging/set-always-on-top/set-fullscreen/is-fullscreen`。

#### 坑 G · 只测 Mac

traffic lights 位置、阴影、透明实现各不同。  
验收必须：**Mac + Win + Linux**（或至少两桌面）截图对比。

---

## 4. 功能划分（模块边界）

```text
src/ui/TitleBar.tsx          # 纯 UI + 调用 window API（无业务）
src-tauri/tauri.conf.json    # decorations/transparent/shadow/macOSPrivateApi
src-tauri/capabilities/…     # ACL
src-tauri/src/lib.rs         # CloseRequested → hide tray（既有）
src/theme/global.css         # 透明链 + 圆角壳 + grip + titlebar 视觉
src/i18n/.../common.json     # 控件/增强文案
```

**禁止**：TitleBar 里读闹钟/设置业务；业务仍走 domain/app。

### 4.1 MVP vs 增强（「花样」清单）

| 层级 | 能力 | 状态（callai） |
| --- | --- | --- |
| MVP | 去原生顶栏、拖拽、min/max/close、跨平台一致 | ✅ |
| MVP | 透明 + 圆角壳；max/fullscreen 去圆角 | ✅ |
| 增强 | 平台布局：macOS 左 traffic 风 / 其它右 Win 风 | ✅ |
| 增强 | 置顶 pin（alwaysOnTop）+ 状态 pill | ✅ |
| 增强 | 全屏 toggle + 状态 pill | ✅ |
| 增强 | 8 向 resize grips | ✅ |
| 可选下一刀 | 自定义 snap 布局、标题随路由变化、双击空白 maximize 动画 | 未做 |

「花样」原则：**不换设计语言**；增强必须仍是小岛按钮/胶囊，而不是系统原生控件照搬。

---

## 5. 给 AI 的提示模板（可直接抄）

```markdown
## 任务：Tauri 2 自绘 titlebar（跨平台）

### 目标
- 去掉系统三大金刚/默认 titlebar
- React 自绘，动森/animal-island 视觉语言
- Linux / Windows / macOS 控件与行为一致（布局可平台适配）
- 窗口圆角 16px；最大化/全屏直角
- close = hide to tray（已有 Rust CloseRequested），不是退出

### 约束
- 用 @tauri-apps/api/window，不要 tauri-controls（React18/Tailwind）
- drag: data-tauri-drag-region；按钮不在 drag 子树
- 禁止仅依赖 -webkit-app-region
- transparent 时：html/body/#root/Cursor 包装 transparent；只给 .app-shell 上色
- macOS: macOSPrivateApi + feature macos-private-api
- capabilities 补齐 window allow-*

### 增强（在 MVP 后）
- pin alwaysOnTop、fullscreen、8-edge resize grips
- macOS 控件靠左（自绘 traffic 风格），Win/Linux 靠右

### 验收
- [ ] 三平台拖拽 / 双击最大化 / min max close
- [ ] 圆角外无直角托底色
- [ ] max/fullscreen 无圆耳朵
- [ ] close 进托盘，进程仍在
- [ ] dark/light titlebar 对比度可读
- [ ] 置顶/全屏状态可见

### 先读
- https://v2.tauri.app/learn/window-customization/
- 本仓 src/ui/TitleBar.tsx 与 lib.rs CloseRequested
```

### 5.1 为什么这份模板能加速 agent

1. **先否决库** → 避免装半套 Tailwind  
2. **close 语义写死** → 避免 `destroy` 回归  
3. **透明链写死** → 避免只改 border-radius  
4. **验收可勾选** → PR 不会停在「看起来圆了」  

---

## 6. 推进流程（agent 推荐顺序）

```text
1. 调研官方 Window Customization + 对比 tauri-controls
2. conf: decorations false / transparent / shadow / macOSPrivateApi
3. Cargo feature macos-private-api；capabilities window allows
4. TitleBar MVP（drag + min/max/close）挂到 App shell 顶部
5. CSS 透明链 + shell radius；修 body 不透明覆盖
6. max/fullscreen 去圆角 class 同步
7. 增强：平台布局、pin、fullscreen、resize grips
8. dark mode titlebar 对比度
9. typecheck + cargo check；本地 just dev 手测
10. 写 record 14；PR 描述带验收清单
```

**串行理由**：先透明链再圆角视觉；先 MVP 控件再花样——否则 debug 时分不清是 drag 坏了还是 transparent 坏了。

---

## 7. 真实执行 / 偏差与纠偏

| 偏差 | 表现 | 纠偏 |
| --- | --- | --- |
| 只设 `border-radius` | 圆角后仍有方底 | `transparent` + 全链 transparent + shell 上色 |
| `body { background: token }` 后写覆盖 | 开发时「有时圆有时不圆」 | cascade 末尾 `html.tauri … !important` |
| 按钮在 drag 内 | 点 max 变成拖窗 | 兄弟布局 + controls 无 drag-region |
| 引入 tauri-controls | 依赖冲突/样式侵入 | 官方 window API + 自绘按钮 |
| 最大化仍 16px 圆角 | 四角透明缺口 | `is-maximized` / `is-fullscreen` 去 radius |
| 忽略 resize | Linux 边拖不动 | 8 grip + `startResizeDragging` |
| close 用 destroy | 托盘保活失效 | 保持 `close()` + Rust prevent |

### 7.1 与用户反馈的对应（证据链）

1. 「三大金刚去掉」→ conf decorations false + TitleBar  
2. 「窗口圆角」→ shell radius  
3. 「圆角后面还有方的」→ 修 transparent 链 / body 覆盖  
4. 「查坑点再修」→ 官方文档 + 本 record 坑点表  
5. 「要花样」→ pin / fullscreen / traffic 布局 / grips / 状态 pill  

---

## 8. 关键文件速查

| 文件 | 职责 |
| --- | --- |
| [`src/ui/TitleBar.tsx`](../../../src/ui/TitleBar.tsx) | 控件、拖拽、pin/fullscreen、resize grips |
| [`src/App.tsx`](../../../src/App.tsx) | `has-titlebar` shell 挂载 |
| [`src/main.tsx`](../../../src/main.tsx) | `html/body.tauri` + inline transparent |
| [`index.html`](../../../index.html) | 首屏 transparent 防闪白/闪方 |
| [`src/theme/global.css`](../../../src/theme/global.css) | 圆角壳、透明 host、titlebar、grips |
| [`src-tauri/tauri.conf.json`](../../../src-tauri/tauri.conf.json) | decorations/transparent/shadow/macOSPrivateApi |
| [`src-tauri/Cargo.toml`](../../../src-tauri/Cargo.toml) | `macos-private-api` feature |
| [`src-tauri/capabilities/default.json`](../../../src-tauri/capabilities/default.json) | window ACL |
| [`src-tauri/src/lib.rs`](../../../src-tauri/src/lib.rs) | CloseRequested → hide tray |

---

## 9. 验收清单（学员作业可抄）

### 9.1 窗口铬

- [ ] 无系统三大金刚  
- [ ] 拖拽移动；双击切换最大化  
- [ ] min / max / close 可用  
- [ ] close 后进程在、托盘可恢复  
- [ ] 圆角 16px，角外无直角色块  
- [ ] 最大化/全屏直角贴边  

### 9.2 增强

- [ ] 置顶开关与 pill  
- [ ] 全屏开关与 pill  
- [ ] 未最大化时可边缘缩放  
- [ ] macOS 控件在左；Win/Linux 在右  

### 9.3 主题

- [ ] dark/light titlebar 文字与按钮可读  
- [ ] 与闹钟卡片 dark 对比度不互相污染  

### 9.4 回归

- [ ] `bun run typecheck`  
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml`  
- [ ] `just dev` 手测拖拽/圆角/托盘  

---

## 10. 练习（课堂教学）

1. **复现圆角方底**：故意给 `body` 加不透明背景，截图对比，再写修复 commit message。  
2. **拖拽实验**：把 close 放进 `data-tauri-drag-region` 内，记录错误交互，再改回兄弟布局。  
3. **写一份「给新人」的 10 行 titlebar checklist**，不许提具体库名，只写原则。  
4. **对比 Overlay 方案**：写一段 200 字：为何 callai 不用 macOS overlay traffic lights。  

---

## 11. 一句话收束

**自绘 titlebar = 设计系统的窗口边界。**  
先收编 chromium（一致、可主题、可增强），再谈花样；透明圆角的本质不是 CSS radius，而是 **「谁被允许上色」**。  

官方入口：[Window Customization](https://v2.tauri.app/learn/window-customization/)。

---

## 附录 A · 本轮相关 commits / PR（写作时）

| 节点 | 内容 |
| --- | --- |
| `66919f8` | dark modal/drawer/overlay 对比度 |
| `50af3fa` | 首版 custom titlebar + dark modal 合集 |
| 后续工作区 | 透明链修复、圆角方底、高级 pin/fullscreen/grips、平台布局 |
| PR | `fix/dark-modal-contrast` 系列（以 GitHub 最新 PR 为准） |

更新本表：`git log --oneline --grep=titlebar` / `git log --oneline src/ui/TitleBar.tsx`。

## 附录 B · 给授课者的 8 分钟演示脚本

1. 打开系统装饰版截图（历史）vs 自绘版（现在）  
2. DevTools 给 body 上色 → 圆角立刻「长出方底」  
3. 演示 drag 区内按钮 vs 区外按钮  
4. close → tray → 再 show  
5. pin / fullscreen / 边缘缩放  
6. 打开本 record 坑点表，对照官方文档一节


## 附录 C · 底部仍直角：海浪 `position: fixed` 的二次坑

用户反馈：**顶部圆角好了，底部还是方的**。

### 根因

`.app-footer-band` / 海浪层用了 **`position: fixed; left/right/bottom: 0`**。  
`fixed` 相对 **viewport** 定位，不吃 `.app-shell` 的 `border-radius` + `overflow: hidden`。

于是：

1. shell 底部两角已透明挖圆  
2. 海浪仍按矩形屏宽铺到底边  
3. 视觉上 = 「圆角后面/下面还有方的」——不一定是 host 不透明，也可能是 **footer 图层越界**

### 修法

- 海浪改为 **`position: absolute`**，挂在 `position: relative` 的 `.app-shell` 内  
- band `overflow: hidden` + 底部 radius 与 shell 对齐  
- 最大化/全屏时 radius 归零  

### 验收

- [ ] 非最大化：底角圆，海浪不穿出直角  
- [ ] 最大化：海浪贴底直角  
- [ ] 列表仍可透过海浪顶部渐隐看到卡片  

### 与 titlebar dark 对比度

「置顶中 / 全屏」pill 与 extras 按钮在 dark 下若用浅 ink 画在深底上不够，或 dark 规则误设成深字浅感：  
→ pill 强制 **浅羊皮纸底 + 深棕字**；extras **active = 青绿底 + 深字**。


## 附录 D · Titlebar = Overlay HUD（content scrolls underneath）

用户后续要求：titlebar 背景透明，语义对齐 alarm 页浮层：

| 说法 | 含义 |
| --- | --- |
| Overlay header | `position: absolute; top:0` 盖在内容上 |
| Content scrolls underneath | 列表/设置/编辑表单在 z 轴下方滚动 |
| HUD / heads-up controls | 控件自带半透明小托盘，不是整条实心栏 |

实现要点：

1. `.titlebar` 去 solid gradient / border-bottom  
2. 仅软 scrim + `backdrop-filter: blur`  
3. `.titlebar-controls` / `.titlebar-extras` 各自半透明胶囊  
4. tab pill / edit hero / settings hero 的 `top/margin` 加上 `--callai-titlebar-h`  
5. titlebar `pointer-events: none`，子控件 `auto`，避免挡住下方滚动命中（拖拽区仍可点）
