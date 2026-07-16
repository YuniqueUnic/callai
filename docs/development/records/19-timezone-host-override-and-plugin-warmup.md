# 19 · 时区墙钟再闭合 / Host 闹钟覆盖 / 插件窗 Warmup：把「看起来对」修成「量出来对」

> 阶段：`v0.2.8+` 工作区 · 接续 [12 运行时硬化 · 附录 A/B 墙钟](./12-runtime-hardening-and-sfx.md) · [15 AI/MCP · §12 浇花案](./15-ai-mcp-prompt-composition.md) · [17 内置插件 / Host Panel](./17-builtin-plugins-host-panel-and-zip-packages.md) · [18 市场/拖放](./18-plugin-marketplace-dnd-update-and-feedback-loop.md)  
> 证据（代码真源；落地以工作区 + `git log` 为准）：
>
> | 路径 | 主题 |
> | --- | --- |
> | `src-tauri/src/domain/timezone_detect.rs` | 跨平台 IANA 探测 + offset 拒绝 GMT |
> | `src/infra/timezoneCache.ts` · `src/domain/timezone.ts` | 前端同源 resolve / format |
> | `src-tauri/prompts/alarm_generate.prompt` | 墙钟 CRITICAL + 对错表 |
> | `src-tauri/templates/plugin/host_panel.js` · `host_chrome.css` | 闹钟覆盖只认 alarm 层；host 时钟标 |
> | `src-tauri/templates/builtin_plugins/*/ui.html` | 去掉「闹钟覆盖」黄条 dump |
> | `src-tauri/templates/builtin_plugins/callai-warmup/` | 隐藏预热插件 |
> | `src-tauri/src/infra/plugin/runtime.rs` | warmup 窗 keep-alive；open 计时；MCP open |
> | `src-tauri/src/infra/mcp/tools_plugins.rs` | `open_plugin_window` 自测工具 |
>
> 关联口语：晚上 8 点浇花 · 13h vs 5h · 标签 Shanghai 时刻 04:00 · Clash TUN · 闹钟覆盖 mode=food · 首开 2s+ · 不要每个插件预创建隐藏窗 · MCP 自测

---

## 1. 思想 / 为什么有这个阶段

### 1.1 三条线其实是同一类病

本轮用户反馈看起来像三坨无关需求：

| 线 | 用户原话（压缩） | 表面像 | 实际病 |
| --- | --- | --- | --- |
| **A 时区** | 每天 20:00，下次却是 04:00 / 13 小时后 | AI 生成错了 | **身份 zone 错** 或 **前后端 zone 分叉** |
| **B 覆盖条** | 插件里「闹钟覆盖 mode=…」有时有有时没有 | 随机 bug | **settings 被当成 alarm overlay** |
| **C 首开慢** | 第一次开 plugin 要 2s+，后面很快 | 预热插件关太早 / 预创建太多 | **热错层**（进程 vs 每窗） |

**思想一句话：**

> 桌面产品的「正确」必须是 **可算术、可同源、可分层** 的：  
> 时刻用墙钟身份算；覆盖只认 runtime 层；性能热在「第一扇 WebView」，不要给每个插件复制一扇隐藏窗。

### 1.2 为什么教学上要把三线写成一篇

学员容易只记「改了 timezone」或「加了 warmup」。  
合在一起才能看出 **agent 如何在多轮反馈里换假设**：

```text
用户报现象 → 先算术/读库/分层
  → 错误假设（改 times / 关掉 warmup 窗 / 每个插件预创建）
  → 用户纠偏
  → 正确分层与终态验收
```

这正是 callai records 的核心教法：**偏差表比功能清单更有价值**。

### 1.3 与前篇的分工

| 文档 | 已覆盖 | 本篇补什么 |
| --- | --- | --- |
| 12 附录 A | cron 字段别当 UTC 迭代 | — |
| 12 附录 B / 15§12 | GMT 误判、浇花 prompt 摘要 | **完整三线闭环 + warmup 策略选型 + MCP 自测** |
| 17 | host panel 减负 | **覆盖条误标 settings 的纠偏** |
| 18 | 拖放/市场 | 不重复 |

---

## 2. 线 A · 时区：需求、prompt、算术、写库

### 2.1 原始需求为什么「好」

```text
帮我弄一个每天晚上 8 点提示我浇花的闹钟
→ 生成每天 20:00，但下次触发 7月17日 04:00 / 约 13 小时后
```

| 维度 | 评价 |
| --- | --- |
| **好** | 同时给了 **期望语义**（晚上 8 点）和 **UI 数字**（04:00、13h） |
| **可机判** | 上海下午 ≈15:00 → 到 20:00 应 ≈5h；13h ⇔ 20:00 **UTC 墙钟** |
| **可升级** | 用户追问「全局时区不统一」「标签已是 Asia/Shanghai 仍 04:00」 |

**板书算术（课堂必写）：**

```text
now ≈ 15:00 Asia/Shanghai  (= 07:00 UTC)
正确 next = 20:00 Asia/Shanghai (= 12:00 UTC)  → 剩余 ≈ 5h，显示 20:00
错误 next = 20:00 UTC (= 次日 04:00 Asia/Shanghai) → 剩余 ≈ 13h，显示 04:00
```

### 2.2 坏 prompt → 好 prompt

| 坏 | 为什么坏 | 好 |
| --- | --- | --- |
| 修一下时区 | 无验收 | 15:00 上海 → 20:00 剩余 5h；禁止 04:00/13h |
| AI 记得用户在中国 | 不可机判 | runtime `timezone.resolved` + times 1:1 墙钟 |
| 改 times 修 next | 数据往往没错 | 先读库：修 **timezone 身份**，不乱改 `20:00` |
| 只靠 /etc/localtime | Windows 无此路径 | **`iana-time-zone` 主源** + offset 校验 |

### 2.3 给 agent 的可复制规格

```markdown
# Goal
Schedule next-trigger and AI AlarmDraft share ONE resolved IANA zone.

# Rules
1. times[] / cron h-m = civil wall-clock in settings.timezone resolved zone
2. NEVER UTC-convert "晚上 8 点" → "12:00" in JSON
3. detect via iana-time-zone (Win/macOS/Linux); sanity-check vs Local UTC offset
4. Reject bare GMT/UTC when process offset is clearly non-zero (VPN/TUN / polluted TZ)
5. Frontend label and backend next_trigger MUST use the same resolve path
6. Do not rewrite correct times[]; fix timezone identity instead

# Acceptance (Asia/Shanghai afternoon ~15:00)
- daily 20:00 → today 20:00, remaining ~5h (NOT ~13h, NOT 04:00 next day)
- UI shows resolved zone string
- cargo test: wall-clock + real_db next
```

### 2.4 模块划分

```text
settings.timezone (system | IANA)
        │
        ▼
 timezone_detect.rs  ── iana-time-zone + /etc/localtime(unix) + offset reject GMT
        │
        ▼
 next_trigger_after_in_tz(schedule, now, tz)   // 12 附录 A 墙钟
        │
        ▼
 RFC3339 absolute ──► formatDateTime(..., scheduleTz)
                      remainingLabel(Date.now())  // 只信绝对时刻

并行：alarm_generate.prompt CRITICAL 禁止 UTC 换算 times[]
```

### 2.5 偏差表（时区线）

| # | 现象 | 错误假设 | 正确假设 | 纠偏 |
| --- | --- | --- | --- | --- |
| 1 | 20:00 → next 04:00 | AI 写错 times | 求值 zone=UTC/GMT | detect + 墙钟 |
| 2 | 剩余 13h | 倒计时坏了 | 13h 是 UTC 20:00 的正确剩余 | 算术板书 |
| 3 | 标签 Shanghai 仍 04:00 | 标签可信 | **展示 zone ≠ 求值 zone** | 同源 resolve；重启二进制 |
| 4 | Clash TUN | 无关 | 可污染探测 | offset 校验；可显式写库 IANA |
| 5 | 要不要改 DB times | 数据坏 | times 对，`timezone=system` 不稳 | `UPDATE … Asia/Shanghai` |
| 6 | 终态 4h27m · 20:00 · Shanghai | — | 三元一致 | **验收通过** |

### 2.6 写库原则（可抄）

```sql
-- 只改身份，不改墙钟字段
UPDATE app_settings SET timezone = 'Asia/Shanghai' WHERE id = 1;
-- schedule_json 保持 {"mode":"daily","times":["20:00"]}
```

同步 `config.toml` 的 `timezone`。  
**禁止**为了「修 next」把用户语义 20:00 改成 12:00。

---

## 3. 线 B · Host 闹钟覆盖条：需求、分层、交互

### 3.1 用户现象

```text
插件里：闹钟覆盖 mode=food · spinSeconds=4 · autoNotify=true · lockMode=false
有时有、有时没有；启动后第一次打开有，关掉再开没有
#root > div > div.banner > span.tag.warn 影响体验
```

### 3.2 根因（分层错了）

| 层 | 应有语义 | 错误实现 |
| --- | --- | --- |
| `storage.settings` | 插件长期设置 | — |
| `callai.launchParams` | **仅本次**闹钟 ENV | — |
| host `getLaunchParams()` | 曾做成 `settings ∪ alarm` | 插件整包当「闹钟覆盖」 |
| `OverrideBanner` | 应只显示 alarm | 黄条 dump 全部 key |

启动后第一次：host 加载 settings 后广播 merge → 黄条把设置全列成「闹钟覆盖」。  
手动再开：时序不同 → 有时只见空 alarm → 条消失。  
**不是随机，是 merge + 竞态。**

### 3.3 为什么这样改「好」

1. **单一职责**：黄条/徽章只表达 runtime 临时层  
2. **Host 减负继续**：完整列表进 host 设置「本次闹钟」，插件内容区安静  
3. **与 17 一致**：settings ≡ params；ENV 同名覆盖不写回  

### 3.4 功能拆解

```text
alarmLaunchOnly()     → 原始 launchParams
mergeLaunchParams()   → hostParams ∪ alarm（给 effective 计算）
getAlarmLaunchParams  → 徽章 / 覆盖 UI 唯一数据源
host bar 时钟标       → 有 alarm 条目才显示
host modal「本次闹钟」 → 只读 key=value
插件 ui.html          → 去掉 OverrideBanner dump
```

### 3.5 给 agent 的提示模板

```markdown
# Goal
Stop labeling plugin settings as "闹钟覆盖".

# Rules
- override UI uses getAlarmLaunchParams() only
- getLaunchParams() may still mean effective(settings∪alarm) for simple plugins
- host bar chip + host modal section for alarm-only overrides
- remove warn-tag dump from builtin plugin banners
- force-update installed builtin ui.html or bump version for auto-upgrade

# Acceptance
- Manual open from Plugins list: no "闹钟覆盖 mode=…" strip
- Alarm open with ENV mode=food: host clock chip + optional soft summary only
```

### 3.6 偏差

| # | 现象 | 错误假设 | 正确假设 | 纠偏 |
| --- | --- | --- | --- | --- |
| 1 | 黄条像闹钟覆盖 | 真是 ENV | 是 settings merge | alarm-only |
| 2 | 改了模板仍出现 | 热更失败 | **安装目录旧 ui.html** | 覆盖 Application Support 或恢复内置 |
| 3 | 第一次有第二次无 | 随机 | merge 广播时序 | 分层 + 事件 detail `{alarm,host,effective}` |

---

## 4. 线 C · 插件窗 Warmup：需求、错误路线、定案

### 4.1 用户需求（好在哪）

```text
程序第一次打开 plugin window 要 2s+ 才有内容；后面打开都很快。
内置一个不显示的 plugin，启动后隐藏打开再关掉做 warmup？
```

| 维度 | 评价 |
| --- | --- |
| **好** | 指明 **首开 vs 后续**，暗示热的是进程/框架，不是每个插件业务 |
| **可测** | 日志 + MCP `open_plugin_window` 返回 `action`/`ms` |
| **易走偏** | create→destroy；或「每个已装插件预创建隐藏窗」 |

### 4.2 错误路线与用户纠偏（最有教学价值）

| 路线 | 做法 | 结果 | 用户/实测 |
| --- | --- | --- | --- |
| **V1** | 隐藏开 warmup → **1.8s 后 close** | 日志有 opened | 首开仍 2s+（热态被扔） |
| **V2** | 每个已装插件 **precreate** 隐藏窗 | open 变 focus，ms≈0 | **内存差**；用户否决 |
| **V3 定案** | **只保留 1 个** warmup 窗 **整会话不销毁** | 建窗 34–62ms | 用户：**看起来不错了** |

**金句：**

> 只热 **第一扇** WebView；不要给每个插件复制一扇隐藏窗。  
> 热完 **不要关**——关掉等于没热。

### 4.3 架构事实（必须写进规格）

```text
每个插件 = 独立 WebviewWindow label（plugin-{id}）
warmup 窗 ≠ 用户插件窗
但：同进程内第一扇 WKWebView 贵，后续建窗便宜
```

因此：

- **有效**：keep-alive 一扇隐藏 host（`plugin-callai-warmup`）  
- **无效**：对该窗 create→destroy  
- **过度**：为 meal-spin/pomodoro/… 各预创建一扇（用内存换 focus，产品上不划算）

### 4.4 模块与流程

```text
build_app_state
  ├ ensure_builtin_plugins
  ├ ensure_warmup_plugin        // 落盘 callai-warmup，不进 list
  └ compose prewarm (可选, ms 级)

setup (after set_plugin_app_handle)
  └ thread sleep 600ms
       └ warmup_plugin_host
            ├ WebviewWindowBuilder visible 片刻 → hide + skip_taskbar
            ├ 停在屏外，ignore cursor
            └ **不 close**，会话内保活

PluginManager::list 过滤 is_internal_plugin
open_plugin_window 拒绝内部 id
```

### 4.5 MCP 自测（agent 应会）

GUI 内 MCP HTTP（settings 开启）后：

```text
tools/call open_plugin_window { id: "meal-spin" }
→ { action: "open_window"|"focus_window", ms: N }
```

本轮实测（precreate 路线时）：focus ≈ 4–26ms。  
定案 keep-alive 后：用户日志 **WebviewWindowBuilder 34ms / 62ms**（相对原先 2s+ 建窗级改善）。

**纪律：** agent 应用 MCP/日志自测，少让用户当秒表。

### 4.6 给 agent 的提示模板

```markdown
# Goal
Make first plugin window open feel like second open, without high memory.

# Do
- One hidden internal plugin host window, kept alive for the session
- id callai-warmup; filtered from list; cannot open from UI
- Force real load (brief visible or off-screen), then hide — not never-shown
- Log: warmup ready (kept hidden, not destroyed)
- Optional: compose_host_html prewarm for installed ids (cheap)

# Don't
- Create then destroy warmup (throws away warm state)
- Precreate one hidden window per installed plugin (memory)
- Rely on warmup window label equaling user plugin label

# Acceptance
- Logs show warmup ready before user open
- First user plugin WebviewWindowBuilder ≪ 2s (tens of ms class after warm)
- Plugins list does not show callai-warmup
```

### 4.7 偏差表（warmup）

| # | 现象 | 错误假设 | 正确假设 | 纠偏 |
| --- | --- | --- | --- | --- |
| 1 | 有 warmup 日志仍慢 | 没执行 | **关窗扔热态** | keep-alive |
| 2 | 每插件预创建 | 越热越好 | 只热第一扇 | 用户否决 → 删 precreate |
| 3 | visible=false 永不加载 | 隐藏=已热 | 部分平台推迟加载 | 先可见再 hide |
| 4 | ms=0 的 create | 瞬间建好 | 仅 builder 返回；内容另算 | 分「建窗」与「内容」 |
| 5 | 用户满意 34/62ms | — | 建窗已热 | **V3 验收** |

---

## 5. 三线合一的推进流程（agent 推荐顺序）

```text
1. 时区：算术 5h vs 13h → 读库 → detect 硬化 → prompt CRITICAL → 可选写库 IANA
2. 覆盖条：分清 settings vs alarm → host 徽章 → 去掉插件黄条 → 覆盖安装目录旧 ui
3. Warmup：测首开 vs 二开 → 禁 create-destroy → 禁每插件预创建 → keep-alive 一扇
4. 自测：RUST_LOG + MCP open_plugin_window + 用户终态截图/日志
5. 写 record（本篇）
```

**为什么这个顺序：**  
时区是数据/调度正确性；覆盖条是信息架构；warmup 是体验。先正确再安静再快。

---

## 6. 原始 prompt 总拆解：如何写才驱动 agent

### 6.1 好需求的共性（本轮证据）

1. **现象 + 数字**（13h、04:00、2s+）  
2. **对照**（第一次 vs 第二次；标签 vs 时刻）  
3. **否决错误路线**（不要每个插件隐藏窗）  
4. **终态确认**（「看起来不错了」「4h27m 对了」）  

### 6.2 坏需求长什么样

| 坏 | 本轮若写成这样会怎样 |
| --- | --- |
| 优化插件打开速度 | agent 可能每插件预创建 |
| 修时区 | 可能改 times 而不是 identity |
| 去掉黄条 | 可能连真 alarm 提示也删光 |

### 6.3 一页纸「三线总规格」（可直接贴给 agent）

```markdown
## A Timezone
- Wall-clock times; one resolved IANA for schedule + UI + AI
- Reject GMT when offset is +8; prefer iana-time-zone cross-platform
- Accept: Shanghai 15:00 → daily 20:00 remaining ~5h

## B Alarm overlay UI
- Only getAlarmLaunchParams for badges
- Host chip + modal; no warn-tag dump in plugin content
- Accept: manual open has no "闹钟覆盖 mode=…" strip of all settings

## C Plugin window warm
- One hidden callai-warmup window, kept alive whole session
- No per-plugin precreate; no create-then-destroy warmup
- Accept: first open WebviewWindowBuilder tens of ms after warm ready log
```

---

## 7. 交互与增强说明

### 7.1 已落地

| 增强 | 说明 |
| --- | --- |
| 首页 next 显示 zone 字符串 | 一眼看出 GMT vs Shanghai |
| 时区变更清 next 缓存 | 防旧绝对时刻 |
| host 时钟标 +「本次闹钟」 | 临时参数不污染内容区 |
| MCP `open_plugin_window` | agent 自测 focus/create 与 ms |
| open 路径日志 | `plugin window created … ms=` |

### 7.2 可选后续（作业）

| 项 | 何时做 |
| --- | --- |
| 内容区首屏（Babel/大 HTML）再压 | 建窗已快但仍「白一下」 |
| warmup 与 main 的 PageLoad 同步 | 启动竞态 |
| 设置里「插件窗预热」开关 | 极低配机器省内存 |
| 时区探测失败 toast | 仅当 offset 与 zone 长期不一致 |

---

## 8. 验收清单（手测 + 日志）

### 8.1 时区

- [ ] 上海下午 daily 20:00 → 今日 20:00，剩余 ~4–6h  
- [ ] 不出现「标签 Shanghai + 时刻 04:00」  
- [ ] 显式 `Asia/Shanghai` 与 system 纠偏后一致  

### 8.2 覆盖 UI

- [ ] 插件列表手动打开：无设置 dump 黄条  
- [ ] 闹钟 ENV 打开：host 时钟标；内容区安静  
- [ ] 恢复/升级内置后 ui 为新版  

### 8.3 Warmup

- [ ] 日志：`warmup window opened` → `warmup ready (kept hidden, not destroyed)`  
- [ ] 列表无 `callai-warmup`  
- [ ] 首开建窗日志 `WebviewWindowBuilder … ms=` 远小于 2000  
- [ ] 用户体感接近「第二次打开」  

### 8.4 工程

```bash
cargo test --lib timezone_detect
cargo test --lib plugin_builtins
cargo test --lib internal_warmup
cargo check --lib
```

---

## 9. 练习（学员）

1. 用 5h/13h 算术解释「标签对、时刻错」。  
2. 画出 settings / launchParams / getLaunchParams / getAlarmLaunchParams 数据流。  
3. 写一段 prompt：禁止每插件预创建，只允许一扇 keep-alive warmup。  
4. 用 MCP `open_plugin_window` 打两次同一插件，解释 action 差异。  
5. 讨论：若第一扇窗必须是用户插件而不是 warmup，如何改启动序？  

---

## 10. 给授课者的 12 分钟演示

1. 写板书：5h vs 13h（2 min）  
2. 打开 12 附录 A → 本篇线 A（2 min）  
3. 展示 host 时钟标 vs 旧黄条截图（2 min）  
4. 讲 V1/V2/V3 warmup 路线（3 min）  
5. 放日志：warmup ready + Builder 34ms/62ms（2 min）  
6. 强调：**用户否决「每插件隐藏窗」是正确产品判断**（1 min）  

---

## 11. 与相邻 records

| Record | 关系 |
| --- | --- |
| [12](./12-runtime-hardening-and-sfx.md) | 墙钟求值 A；GMT 附录 B 摘要 |
| [15](./15-ai-mcp-prompt-composition.md) | alarm_generate CRITICAL；runtime 注入 |
| [16](./16-mcp-tools-and-logs.md) | MCP 工具边界；本篇加 open_plugin_window |
| [17](./17-builtin-plugins-host-panel-and-zip-packages.md) | host 减负；本篇纠正覆盖条 |
| [18](./18-plugin-marketplace-dnd-update-and-feedback-loop.md) | 反馈闭环教法同构 |

路径建议：`12A → 15§12 → **19** → 17`（调度正确 → 生成正确 → 体验与 host 信息架构）。

---

## 12. 小结

| 线 | 错误诱惑 | 定案 | 终态证据 |
| --- | --- | --- | --- |
| **时区** | 改 times / 信标签 | 墙钟身份 + 跨平台 detect + 可选显式 IANA | 4h27m · 20:00 · Shanghai |
| **覆盖 UI** | 整包 getLaunchParams | alarm-only + host 展示 | 无设置 dump 黄条 |
| **Warmup** | 关窗 / 每插件预创建 | **一扇 keep-alive** | Builder 34–62ms；用户认可 |

**一句话收束：**

> 正确、安静、够快 —— 各热各的层：  
> **zone 身份** 保正确，**alarm 层** 保安静，**第一扇 WebView** 保够快。

---

## 附录 A · Commits / 工作区证据怎么读

### A.1 历史锚点（已进 git 的相关提交）

| Commit | 主题 | 与本篇关系 |
| --- | --- | --- |
| `2c13cd8` | wall-clock TZ evaluation, weekly/monthly, TimezonePicker | 线 A 的墙钟求值基线（12 附录 A） |
| `aabe5c9` / epic 系 | AI + plugins + MCP | 线 B/C 的宿主与工具面 |
| 工作区（写作时） | `timezone_detect.rs` · host_panel · callai-warmup · MCP open | 本篇闭环主体 |

```bash
git log --oneline -20 -- src-tauri/src/domain/schedule.rs src-tauri/src/domain/timezone_detect.rs
git log --oneline -15 -- src-tauri/src/infra/plugin/runtime.rs
git status -sb -- src-tauri/templates/plugin/ src-tauri/templates/builtin_plugins/
```

### A.2 为什么「工作区未 commit」也要写进教材

callai 的 records 原则：**代码与手测是真相，commit 是证据之一**。  
本篇大量落在工作区时，应写明：

- 已手测通过的日志片段（warmup ready、Builder ms）  
- 用户终态确认句（「看起来不错了」「4h27m 对了」）  
- 路径表指向当前文件  

避免学员误以为「没 push = 没发生」。

---

## 附录 B · 日志读法（agent 自测剧本）

### B.1 健康启动

```text
compose prewarm ok plugin_id=meal-spin …
plugin host warmup window opened (will stay hidden)
plugin host warmup ready (kept hidden, not destroyed) label=plugin-callai-warmup
```

### B.2 用户打开插件

```text
plugin window created (WebviewWindowBuilder) plugin_id="pomodoro" ms=34
plugin window created (WebviewWindowBuilder) plugin_id="meal-spin" ms=62
```

| 信号 | 解读 |
| --- | --- |
| ms 几十 | 建窗已热（相对 2s+ 成功） |
| ms 仍 >1000 | 热失败或路径未走 warm 进程 |
| 无 warmup ready 就 open | 启动竞态；加 delay 或等 ready |

### B.3 MCP 剧本（GUI 内 HTTP MCP）

```text
1. settings.mcp.enabled = true（应用内 supervisor）
2. initialize → tools/list
3. tools/call open_plugin_window { "id": "meal-spin" }
4. 读返回 action + ms；读应用日志
```

注意：stdio `callai mcp-server` **无 GUI AppHandle** 时 open 会失败——这是边界，不是 bug。

---

## 附录 C · 数据流总图（三线）

```text
┌─────────────────────────────────────────────────────────────┐
│ settings.timezone                                           │
│   system ──► timezone_detect (iana + offset)                │
│   IANA   ──► parse                                          │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
              schedule next_trigger_after_in_tz
                            │
                            ▼
              absolute RFC3339 ── UI format + remaining
                            │
┌───────────────────────────┴─────────────────────────────────┐
│ AI: runtime.timezone.resolved + alarm_generate wall-clock   │
│     times[] 1:1 用户钟点，禁止 UTC 换算                        │
└─────────────────────────────────────────────────────────────┘

┌─ Plugin params ─────────────────────────────────────────────┐
│ storage.settings  ── 长期设置                                 │
│ launchParams      ── 本次闹钟 ENV                             │
│ effective         ── settings ∪ alarm                        │
│ UI 徽章           ── 仅 alarm（getAlarmLaunchParams）         │
│ host 时钟标       ── 仅 alarm 非空                            │
└─────────────────────────────────────────────────────────────┘

┌─ Plugin windows ────────────────────────────────────────────┐
│ callai-warmup (hidden, keep-alive)  ── 热第一扇 WKWebView     │
│ plugin-{id} user windows            ── 用时再 create          │
│ 禁止：warmup create→destroy；禁止：每 id 预创建隐藏窗          │
└─────────────────────────────────────────────────────────────┘
```

---

## 附录 D · 安装目录 vs 模板（线 B 专坑）

| 位置 | 角色 |
| --- | --- |
| `templates/builtin_plugins/*/ui.html` | 源码真源、`include_str!` 编进二进制 |
| `~/Library/Application Support/callai/plugins/*/ui.html` | **运行时实际加载** |

改模板后若用户仍见「闹钟覆盖」：

1. 未重启 / 未关插件窗  
2. 安装目录仍是旧文件 → 需 **恢复内置** 或拷贝 / 升 version 触发 upgrade  

教材必须写清，否则 agent 会以为「改了源码就热更了所有用户数据」。

---

## 附录 E · 产品决策记录（可引用到 ADR）

### E1. 时区默认

- 开发机 TUN 环境：允许 DB 写死 `Asia/Shanghai`  
- 产品默认仍可为 `system`，但 detect 必须 **offset 校验**  
- 不在每闹钟上存 timezone（全局身份）

### E2. 覆盖展示

- 不在内容区 dump key=value  
- host 承担「本次临时」信息架构  
- 真 alarm 覆盖仍可有轻量提示，但不等于 settings 列表

### E3. Warmup 成本

- 接受 **1 个** 隐藏 WebView 的常驻内存  
- 拒绝 N 个预创建窗  
- 接受启动后 2–3s 后台热完；用户可稍等再点插件  

---

## 附录 F · 与 PRODUCT 语气

面向用户文案：

- 「本次闹钟临时参数」而不是「launch params merge」  
- 「跟随系统 / 上海」而不是「resolve_timezone」  
- 错误提示不暴露 `WebviewWindowBuilder`  

开发 records 可写术语；**i18n 与 UI 字符串** 对齐 PRODUCT.md。

---
