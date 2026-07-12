# 05 · 交互硬化：状态机、层级与反馈

## 1. 思想：好看之后，要「经得起连点」

沉浸式 UI 完成后，用户进入 **真实操作压测**：

- 时间 popup 与下一张 card 抢 active  
- 手动执行 dialog 卡到任务结束  
- FAB 盖住日志 Drawer  
- 成功无反馈 / 删除无效  

这些不是美术问题，是 **交互状态机 + 层叠上下文 + 异步边界** 问题。  
思想：

> 每个异步动作都有显性状态；每个浮层都有明确宿主（portal）与 z 序；每个破坏性操作都有确认与真删除。

### 需求动机

- 闹钟产品 **误触成本高**（误跑 binary）→ 二次确认  
- 动森风仍要 **清晰反馈**（dev.1 可爱文案）  
- 托盘/多入口打开日志 → 与主界面 FAB 冲突  

---

## 2. 原始 prompt 拆解

### 2.1 高质量缺陷报告模板（用户已接近）

```text
[Image] add button 怎么会被遮挡
手动执行：dialog 确认后应消失，但一直等到任务结束
被执行 item 按钮状态要变，防止再次触发
tray 打开日志 → FAB 浮在 drawer 上
drawer 底部 height 裁切日志；后来无法滚动
保存成功 / 手动执行成功 / 设置保存 → 要 toast
删除要真实有效；删除与手动执行换位
```

### 2.2 为什么「好」

| 要素 | 作用 |
| --- | --- |
| 图 | 定位遮挡物 |
| 期望 vs 实际 | dialog 生命周期 |
| 防误触 | busy 态 |
| 多入口 | tray vs 主界面 |
| 验收文案 | 具体 toast 句子 |

### 2.3 可进一步结构化的写法

```markdown
## Bug
标题：手动执行确认框生命周期错误
## 复现
1. … 2. …
## 期望
确认后 dialog 立即 close；item.status=running；run 按钮 disabled
## 实际
dialog 直到 run_alarm_now resolve 才关
## 范围
不要改调度算法
```

---

## 3. 给 AI 的提示模板（交互 bug 包）

```markdown
按严重级别修下列问题，每个问题单独 commit 或同一 commit 内分节说明：
1) …
约束：
- 浮层用 portal 到 document.body
- 列表项用状态机：idle|running|busy|error（禁止散落 isLoading 布尔）
- toast 用 src/ui/toast（非库 Notification）
验收：手测步骤…
```

---

## 4. 功能划分

| 模块 | 职责 |
| --- | --- |
| `toast.ts` | 全局反馈，高 z-index |
| Dialog/Modal | 仅确认，不承担长任务等待 |
| Alarm card actions | 按 status 禁用 |
| Logs Drawer | 独立滚动容器；打开时 `body.callai-logs-open` |
| FAB | portal；日志打开时隐藏 |
| Backup UI | 删除确认 + 最多 10 份（`c5b6dc7`） |
| Time popup | 焦点隔离，防 card 抢 active |

### i18n 同步

`514c873` 为 time picker / tray / notify 补中英文——**交互文案与功能同 PR 或紧随**，避免半截 i18n。

---

## 5. 推进流程

```text
1. 列 bug 表（用户原话 → 期望状态机）
2. 先修数据正确性（删除无效）
3. 再修异步 UX（dialog/busy）
4. 再修层叠（portal/z-index/FAB）
5. 统一 toast 文案（对照 dev.1）
6. 回归：tray 开日志、快速连点 run、滚动中开 time popup
```

---

## 6. 真实执行与偏差

| Commit | 内容 |
| --- | --- |
| `514c873` | 时间轮选 + tray/i18n 文案 |
| `c5b6dc7` | 备份删除 + 上限 10 + 测试 |
| `8ae654c` | IconButton 化 |
| `7d39013` | 自定义 toast；busy 禁用；FAB portal；z-index |
| `2b5c142` | drawer 滚动链；日志开时藏 FAB；Vite8 plugin |

偏差示例：

- 用库 `Notification` → 被卡片/drawer 挡住 → **换 portal toast**  
- dialog 绑定 promise → **确认与执行解耦**  
- FAB 在页面 DOM 内 → overflow 裁切 → **createPortal**  

---

## 7. 状态机示意（教学板书）

```
item: idle ──run confirm──► running ──ok──► idle
                 │              └──err──► idle (toast)
                 └──cancel──► idle

drawer: closed ──open──► open（FAB hidden, scroll body）
```

---

## 8. 验收清单

- [ ] 确认执行后 dialog 立即关  
- [ ] running 时 run/edit/delete 不可点  
- [ ] 删除后 list 与磁盘/DB 均无该项  
- [ ] 日志 drawer 可滚到底，水印不挡滚动  
- [ ] tray「日志」与 settings 入口体验一致  

## 9. 练习

1. 为 `run_alarm_now` 写前端状态机伪代码。  
2. 说明为何 toast 要 `warm` 启动（`7d39013` perf 注释思想）。  
3. 设计「连点 5 次 run」的自动化测试断言。  

## 10. 关键

`src/ui/toast.ts` · `SettingsPage` backups · `HomePage` run dialog · `2b5c142`

---

## 附录 · 设置控件形态

时区等「长选项」不要用 segmented 堆按钮；与 **TimePicker / DurationPicker** 一致：触发器 + portal 滚轮/列表 + 确认。  
调度模式扩展（每天/每周/每月/cron）见 record 12 附录 A。

---

## 附录 B · Floating overlay chrome 与「不要分段顶栏」（2026-07 续）

> 证据：`edit-hero` / `home-hero` · `animal-tabList` 浮层 · commits 含 `909a0cb` 及后续 CSS 修正  
> 口语：`edit header 和 body 分开` · `要直接覆盖下面` · `参考 tabList` · `去掉背景` · `home 顶部分割线/shadow`

### B.1 思想：Chrome 是**叠层**，不是**文档流两段**

用户要的不是「好看 sticky 灰条」，而是：

> **Floating overlay controls over a full-bleed scrolling surface**  
> （浮层控件叠在整页可滚内容之上；content scrolls underneath）

| 术语 | 含义 | 本项目例子 |
| --- | --- | --- |
| Floating chrome | 顶栏/Tab 浮在内容上 | `animal-tabList` 胶囊、`edit-hero` |
| Overlay header | absolute/fixed 叠内容 | edit 顶栏盖住表单 |
| Chrome-less / panel-less | 无卡片底、无分割线 | 透明 `edit-hero` / `home-hero` |
| Sticky section bar | 吸顶但仍像两段布局 | **易错成「和 body 分开」** |

**产品动机：**

1. 动森小窗垂直空间紧——顶栏占流会挤掉表单。  
2. 与底部 tab 浮层 **同一套空间语言**（上下都是 overlay，不是框中框）。  
3. 编辑页 immersive：无底部 tab 时，更要用浮层顶栏保持「工具浮在岛上」。

### B.2 原始 prompt 拆解

| 用户原话 | 为什么好 | Agent 应抽出的验收 |
| --- | --- | --- |
| 顶部还是和 body 分开 | **否定当前结构**（flex 分栏失败） | 禁止 header/main 上下分栏占流 |
| 直接覆盖底部的感觉 | **叠盖关系** | `position:absolute` + 内容 `padding-top` |
| 参考 `#root … animal-tabList` | **金样例**（可抄 CSS 模式） | 对照 tabList 的 absolute + z-index + 透明底可选 |
| 去掉 header 背景 | **chrome-less** | `background/border/shadow: none` |
| body 顶 shadow 像 line | **像素级缺陷** + 截图 | 去掉 `border-bottom`/`box-shadow` |

**可复制的专业需求句（以后直接用）：**

```text
顶栏做 floating overlay、chrome-less；内容 scroll underneath。
参考 animal-tabList 浮层。不要 sticky 分段面板，不要 card 底。
```

### B.3 功能 / 结构划分

| 表面 | 布局契约 |
| --- | --- |
| `app-shell.with-tabs` | tabList `position:absolute; top…; z-index:300`；content 全高滚动 |
| `app-shell.immersive-edit` | `edit-page` relative 满高；`edit-hero` absolute 浮层；`edit-main` absolute inset 滚动 |
| `home-hero` | 可 sticky，但 **无底部分割线**；列表紧贴，不靠阴影「切开」 |

### B.4 推进流程（agent 串行）

```text
1. 用 DevTools 确认：header 与 main 是 flex 兄弟还是 overlay
2. 若 flex 分栏 → 改 absolute overlay（对照 tabList）
3. main 全区域滚动 + padding-top 为浮层让路
4. 去掉 panel 视觉（bg/border/shadow/blur）
5. 截图对比用户「分开/盖住」二词
6. 检查 dark 主题覆盖规则是否又加回背景
```

### B.5 偏差与调整

| Commit / 改动 | 意图 | 偏差 | 调整 |
| --- | --- | --- | --- |
| `909a0cb` | edit 顶栏像 home | 先做成 sticky 灰条，仍「分段」 | 改为 absolute 浮层 + main 全页滚 |
| 半透明 blur 面板 | 「高级」 | 用户要的是 **透明 HUD** 不是 glass card | 强制 transparent |
| home sticky + border-bottom | 吸顶可读 | 列表上方出现 **line/shadow** | 去掉 divider/shadow |

### B.6 交互扩展

- **TimezonePicker / DurationPicker / TimePicker**：同一「触发器 + portal + 确认」家族，**禁止** segmented 堆 IANA 列表（见附录·设置控件形态）。  
- 浮层顶栏按钮必须 `pointer-events: auto`，装饰 `none`。  
- z-index 阶梯：列表 < 海浪 footer(30) < 浮层顶栏/tab(300) < toast/tooltip(2e4+)。

### B.7 给 AI 的提示模板（顶栏浮层）

```markdown
## Goal
Edit/new alarm header as floating overlay chrome (not document-flow section).

## Pattern (copy from tabs)
- Container: position relative; full height; overflow hidden
- Header: position absolute; top/left/right inset; high z-index
- Body: position absolute; inset 0; overflow-y auto; padding-top clears header
- Header chrome-less: no background, border, box-shadow, backdrop-filter

## Do not
- flex-column with flex:0 header + flex:1 scroll (looks "split from body")
- sticky bar with border-bottom divider line
- card/surface panel behind title

## Reference selectors
- Floating tabs: .main-tabs [class*="animal-tabList"]
- Edit: .edit-page > header.edit-hero over .edit-main
```

### B.8 验收

- [ ] 编辑页滚动时，内容从标题/按钮 **下方穿过**，不是整页被顶栏切开  
- [ ] 顶栏无实色底、无描边胶囊（除非产品明确要 pill）  
- [ ] 闹钟列表顶无细线/阴影分割  
- [ ] 与顶部 tab 浮层同一「叠在内容上」的语言  

### B.9 关键

`src/pages/EditAlarmPage.tsx` · `src/theme/global.css`（`.edit-hero` / `.home-hero` / `.main-tabs … tabList`）


## 附录 C · UI 切换卡顿（闹钟 ↔ 设置 ↔ 编辑返回）与加载链路硬化（2026-07 续）

> 用户体感：**点 Settings 卡 1–2s**；**从编辑闹钟返回主列表也卡一下**。  
> 不是「再加 loading 动画」，而是 **卸载/重挂 + 关键路径串行 IPC + N+1 nextTrigger + 时区探测** 叠在一起。  
> 本附录按教材骨架写：**思想 → prompt 拆解 → 需求怎么说清楚 → 功能拆分 → 流程 → 偏差 → 验收**。

---

### C.1 思想 / 为什么会有这个需求

桌面小工具的「可爱」会被 **操作延迟** 直接毁掉：

| 场景 | 用户预期 | 实际（修复前） | 情绪结果 |
| --- | --- | --- | --- |
| 闹钟 tab → 设置 | 像翻页，瞬间 | 白屏/转圈 1–2s | 「这软件沉」 |
| 编辑返回列表 | 列表还在 | 整页重拉 + 进度条重算 | 「每次改完都等」 |
| 再进设置 | 已看过 | 又整页加载 | 「没记忆」 |

产品原则（与 PRODUCT Overlay HUD 一致）：**壳与列表应常驻；切换只改可见性；网络/磁盘/OS 探测不得挡首帧。**

**思想一句话**：交互硬化不只 z-index，还包括 **导航生命周期（mount 策略）+ 缓存边界（谁可以慢）**。

---

### C.2 原始 prompt 拆解

#### C.2.1 用户话术（浓缩）

```text
从闹钟 tab 切换 settings tab 时会卡上 1–2s，
是因为在加载 sqlite 和 bkp 吗？！？需要修复和改进！！

还可能是检测时区的问题！？！？
时区也可以整个后台检测，前台拿的是 cache！？

仔细调查这些都可能的原因，然后修复！！
然后确保 alarm 功能也做好了！？！？

从编辑闹钟界面返回主页面（alarm）也是会卡一下，
需要也调查和找到问题根源，并且修复！！

然后把 UI 加载交互缓慢也整理一下，输出到合适的已有文章中；
（进一步分析 commits / prompt / 思想 / 流程 / 偏差…）
```

#### C.2.2 为什么这些 prompt「好」

| 说法 | 好在哪 | 驱动 agent 做什么 |
| --- | --- | --- |
| **给出体感数字 1–2s** | 可验收，不是「感觉慢」 | 用性能预算衡量 |
| **猜测 sqlite / bkp / 时区** | 给排查假说，但不锁死 | 对照代码验证/否证 |
| **「前台 cache / 后台检测」** | 已是架构解法暗示 | 直接做 cache 模块 |
| **「仔细调查都可能的原因」** | 禁止单点修补 | 列因果链再改 |
| **编辑返回也卡** | 暴露第二卸载点 | keep-alive 扩展到 edit |
| **写进已有 record** | 防文档碎片 | 附录进 05 而非新开流水账 |

#### C.2.3 还可写得更清楚（教学对照）

```markdown
## 性能预算
- tab 切换到可交互：< 100ms（本地）
- 编辑返回列表：列表不得整页 loading；允许后台 silent refresh
## 禁止
- 每次 tab 切换 unmount Settings/Home
- 首屏 await 串行：settings → backups → tz → version → autostart
- Home mount 时 listAlarms + N×nextTrigger 阻塞首屏
## 允许
- 先 paint cache，再 force refresh
- 时区 Intl 先显，OS 探测 refine 一次
```

---

### C.3 根因图谱（调查结论，按杀伤力排序）

```text
[导航层]
  A. animal-island Tabs 只渲染 active children → Settings 每次切换 remount
  B. App 用 page==="edit" 整段替换 body → Home 进编辑即 unmount
        ↓ remount
[数据层·Settings]
  C. useEffect 串行 await getSettings → listBackups → detectTimezone → version → autostart
  D. detectTimezone 走 Tauri IPC + 系统时区（可慢；且可缓存）
  E. getAutostartEnabled 读 OS 登录项（可慢）
  F. listBackups 读目录（通常快，但串在后面仍拖尾）
        ↓ remount
[数据层·Home]
  G. mount 时 refresh：listAlarms + 每个闹钟 nextTrigger → N+1 IPC
  H. setLoading(true) 全页 loading，cache 未命中时白一下
  I. 12s/2s interval 也会 silent refresh（次要）
[渲染层]
  J. SeaMarquee / 多 ElementImage 随 Home 重挂再启动（编辑返回时）
  K. leafAnimation 等 tab 动效（已关；次要）
```

**否证**：

- 「只是 sqlite 慢」→ `get_settings` 通常毫秒级；真凶是 **remount + 串行次要 IO + N+1**。  
- 「只是 bkp」→ backups 不是唯一瓶颈；即使去掉仍有 autostart/tz/N+1。  
- 「时区一定慢」→ 慢的是 **重复探测**；cache 后可忽略。

---

### C.4 功能划分（解法模块）

| 层 | 模块 | 职责 |
| --- | --- | --- |
| 导航 | `App.tsx` tab-panes + `hidden` | Home/Settings **常驻**；Tabs 只负责 pill 标签 |
| 导航 | `edit-overlay` | 编辑盖在主壳上，**不拆掉** Home/Settings/Sea |
| 缓存 | `timezoneCache.ts` | 后台 `ensure` 一次；`peek` 同步 Intl/cache |
| 缓存 | `settingsCache.ts` | settings/version/backups/autostart 共享 inflight |
| 缓存 | `alarmsCache.ts` | list + nextMap；分块拉 nextTrigger；`warm`/`invalidate` |
| 页面 | Settings | 先 `getSettingsCached` 再并行次要；初值 peek |
| 页面 | Home | cache-first refresh；`callai:alarms-changed` 强制刷新 |
| 启动 | App bootstrap | `warmAlarmsCache` + `ensureDetectedTimezone` + settings warm |

**分层纪律**：cache 在 **前端 infra**，不进 domain；OS 探测失败用 Intl 兜底，不挡 UI。

---

### C.5 推进流程（agent 推荐串行）

```text
1. 复现：devtools Performance / 日志点 tab 切换与 edit 返回
2. 读 App 条件渲染：是否 unmount Home/Settings
3. 读 Settings useEffect：是否串行 await 次要 IO
4. 读 Home refresh：是否 N+1 nextTrigger + loading 闪白
5. 改导航 keep-alive（tab panes + edit overlay）—— 收益最大
6. 加 timezone/settings/alarms cache + 启动预热
7. Settings/Home 改为 cache-first / progressive
8. 保存闹钟：invalidate + event，Home silent force refresh
9. typecheck；手测三条路径 < 体感瞬时
10. 附录写入 record 05（本文）
```

**为何先导航后缓存**：即使 cache 完美，**unmount 仍会重跑 effect、重建动画**；先保活再缓存是正确顺序。

---

### C.6 真实执行 / 偏差与调整

| 现象 / 假设 | 验证 | 动作 | 结果 |
| --- | --- | --- | --- |
| Tabs 卸载 Settings | 读 Tabs 源：`children: o?.children` 仅 active | tabItems 空 children + 外置 panes | 设置页不卸载 |
| 串行 settings 加载 | 读 Settings effect | settings 优先；backups/tz/version/autostart 并行 | 首帧可出表单 |
| 时区拖慢 | 用户提示 + IPC 路径 | `timezoneCache` + App 预热 | 前台 peek，无阻塞 |
| 编辑返回卡 | `page==edit` 替换 body | 主壳常驻 + `edit-overlay` | Home/Sea 不重挂 |
| 列表仍可能慢 | N+1 nextTrigger | `alarmsCache` + chunk(8) + warm | 有 cache 秒开 |
| 保存后列表旧 | keep-alive 不 remount | `invalidate` + `callai:alarms-changed` | silent force 刷新 |
| domain→infra 引用 | cargo 分层风险 | builtin id 放 domain，执行在 infra | 编译边界干净 |

**关键代码指针**（写作时工作区，以 tree 为准）：

- `src/App.tsx` — tab-panes、edit-overlay、warm*  
- `src/infra/timezoneCache.ts` / `settingsCache.ts` / `alarmsCache.ts`  
- `src/pages/SettingsPage.tsx` / `HomePage.tsx`  
- `src/theme/global.css` — `.tab-panes` / `.edit-overlay`

---

### C.7 交互扩展与「加载 UX」原则

1. **Never full-page loading on re-entry**  
   有 cache → 直接画旧数据；后台 silent refresh。  
2. **Critical vs secondary**  
   设置表单需要 `AppSettings`；备份列表/版本/开机启动可以晚 100–300ms 填。  
3. **OS 探测 = 后台单例**  
   时区、autostart 都「进程内一次 + inflight 合并」。  
4. **N+1 必须显式**  
   `nextTrigger` 批量/分块；禁止 `list.map(await)` 无策略。  
5. **动画可关**  
   tab `leafAnimation={false}`；保活后动画价值下降。  
6. **事件优于 prop 钻透**  
   编辑保存 → `window` 事件 → Home 刷新，避免把 refresh 从 App 层层传入。

---

### C.8 给 AI 的提示模板（导航卡顿类）

```markdown
## Symptom
- Tab A → Tab B feels 1–2s stuck
- Edit → back to list also hitch

## Investigate (ordered)
1. Does navigation unmount the heavy page? (Tabs children / conditional render)
2. What does useEffect await on mount? serial vs parallel?
3. Any OS/IPC (timezone, autostart, N×nextTrigger)?
4. Any full-page loading gate until ALL data ready?

## Fix strategy
1. Keep-alive: mount once, toggle hidden/is-active (or CSS display)
2. Cache module per domain surface (settings / alarms / tz)
3. Progressive: paint critical cache → background fill
4. Prefetch on app start for likely next screens
5. On mutation: invalidate + event; silent force refresh

## Do not
- Add longer spinners as "fix"
- Remount SeaMarquee / heavy lists for route cosmetics
- Block first paint on detectTimezone/listBackups/autostart

## Accept
- [ ] tab switch interactive < ~100ms local
- [ ] edit back: list visible immediately (no blank loading)
- [ ] settings re-entry uses cache (no loading flash if warm)
- [ ] save alarm updates list without manual remount
```

---

### C.9 验收清单

**导航**

- [ ] 闹钟 ↔ 设置：无明显卡顿、无整页 loading 闪白  
- [ ] 编辑 → 返回：列表立即在；海浪不「重启感」过重  

**缓存**

- [ ] 杀进程再开：允许首次略慢；之后切换应暖  
- [ ] 改主题/语言仍即时；备份列表可稍后出现  

**正确性**

- [ ] 保存/删除闹钟后列表与下次触发时间正确  
- [ ] 时区「跟随系统」标签合理（Intl 或 OS refine）  

**回归**

- [ ] `bun run typecheck`  
- [ ] 手测：新建闹钟模板「小闹钟提醒」可保存并触发（builtin 路径另见实现）  

---

### C.10 练习（课堂）

1. 故意恢复 `page==="edit" ? <Edit/> : <Home/>`，录屏对比 keep-alive。  
2. 在 Settings 再串行 `await detectTimezone()`，用 Performance 标出 Long Task。  
3. 画一张「导航 × 缓存」矩阵：哪些页面 keep-alive、哪些数据 cache、失效条件是什么。  
4. 写 5 条 PR 验收句，禁止出现「优化一下手感」这种不可测表述。  

---

### C.11 与其它 record 的链接

| 主题 | 文档 |
| --- | --- |
| Overlay HUD 视觉 | 本文件附录 B；PRODUCT 原则 7–8 |
| 时区语义 / next trigger | record 12 附录 A |
| 自绘 titlebar 透明链 | record 14 |
| 内置跨平台闹钟执行 | 实现：`infra/builtin_alarm` + domain `BUILTIN_ALARM_BINARY`（可另开运行时附录） |

**一句话收束**：  
卡顿的根是 **把「页面切换」做成了「应用冷启动」**；修好导航生命周期后，缓存才是锦上添花。
