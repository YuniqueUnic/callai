# 12 · 运行时硬化：超时 / 取消 / argv 解析 / 音效 / 教程式交付

> 阶段：`v0.2.1` 之后到 `fix/timeout-and-env-focus` 合入前  
> 证据 commits（本分支）：
>
> | Commit | 主题 |
> | --- | --- |
> | `f9cc5ba` | timeout / cancel / log delete / env 焦点 / CLI live |
> | `7eaf32d` | shlex 解析 shell 风格参数（osascript/say） |
> | `0db6b62` | DurationPicker 替代重复超时 UI |
> | `6bc6223` | Web Audio 算法音效 + `sound_enabled` 设置 |
>
> 关联口语总集：根目录 `TODO` 后半段（超时、osascript、玩法菜谱、hint 清理、教材加长）  
> 关联规格：`PRODUCT.md` · `usecases/detail.md` · `usecases/dev.1.md` · `DESIGN.md`

---

## 1. 思想 / 为什么有这个阶段

### 1.1 产品从「会响的闹钟」变成「可托付的执行器」

前一阶段（records 01–11）已经证明：

- 能建闹钟、能调度、有 UI、有 CI、能装包；

但用户真正开始 **挂真实命令** 时，立刻撞到「执行语义」缺口：

| 现象 | 用户感受 | 产品伤害 |
| --- | --- | --- |
| `osascript` 弹窗一直 Running | 「是不是卡死了」 | 信任崩塌 |
| `say` / 复杂参数「成功但没效果」 | 「这软件不能用」 | 玩法（弹窗/语音）全灭 |
| 没有手动停止 | 只能杀进程/重启 App | 不像可控工具 |
| 超时 UI 又臭又长 | 小窗塞满说明文 | 动森气质变表单系统 |
| 没有开始/成功/失败反馈声 | 只有视觉 | 托盘后台场景感知弱 |

**思想：**

> 调度器 MVP 解决的是「什么时候跑」；  
> 本阶段解决的是「跑得像工具，而不是玩具」——**超时、取消、argv 真义、可感知反馈、可配置打扰**。

### 1.2 为什么是「轻量极客触发器」而不只是 AI 额度

用户在 README / 文案上的意图非常清晰：

- **主叙事仍是 AI 滚动窗口**（痛点真、好传播）；
- **副叙事是跨平台定时触发器**（弹窗、语音、git pull、探活）。

这不是 scope 膨胀，而是 **同一内核的应用面扩展**：

```text
Alarm = { schedule, binary, args, env, timeout, retry }
         └── 与「AI 占位」和「osascript 休息弹窗」共享同一执行路径
```

若执行路径不能正确解析 shell 粘贴、不能超时杀进程，副叙事全部写进 README 也是假的。

### 1.3 为什么要写长教材而不是 changelog

学员需要看到：

1. **口语怎么变成可验收规格**  
2. **agent 如何按层改（domain → infra → UI → docs）**  
3. **第一次实现为什么会偏，如何纠偏**（例如 shlex 误拆 AppleScript 正文）

---

## 2. 原始 prompt 拆解（好在哪 / 还缺什么）

### 2.1 运行时缺陷报告（超时 / hang / 假成功）

**口语（浓缩自 TODO）：**

```text
say hi / say -v Mei-Jia "..." → UI 显示成功，但实际没声音？
osascript display dialog → 一直 running
所以一个闹钟还该支持 timeout，默认 20s，picker 选择
执行中也要支持手动停止 + 二次确认 + 优雅取消
CLI 手动执行要有直接输出，支持 Ctrl+C
禁止手写 SQL；logs 也要能删
env 编辑每敲一个字符就丢焦点
```

**为什么这段「好」：**

| 要素 | 作用 |
| --- | --- |
| 具体命令样本 | 可复现，不是「有时候不行」 |
| 期望 vs 实际 | 成功码 vs 真实副作用分离 |
| 默认值 + 范围暗示 | 默认 20s，像产品字段 |
| UI 形态暗示 | picker，不是裸 number |
| CLI 对等 | 桌面与 headless 同一语义 |
| 边界约束 | 取消要优雅；SQL 不要散落 |
| 额外 bug | env 焦点 → 典型 React key 反模式 |

**仍可更硬的写法（给 AI 的验收条）：**

```markdown
## Acceptance
- [ ] timeout_secs default 20, range 1..=3600, persisted
- [ ] sleep 30 + timeout 5 → log status=timeout within ~6s, process dead
- [ ] running task → Stop → confirm → status=canceled, no retry
- [ ] paste: -e 'display dialog "hi"...' as ONE args line → AppleScript runs
- [ ] run-once streams stdout live; Ctrl+C cancels
- [ ] env row key={`env-row-${idx}`} not key={`${key}-${idx}`}
- [ ] delete_log works; no ad-hoc SQL outside sqlite module
```

### 2.2 argv / 复杂命令

**口语：**

```text
0:2: syntax error ... (-2740)
execution canceled by user
感觉稍微复杂一点的就无法解析执行？
是否有合适的 lib？
```

**好：** 附上 **完整命令预览 + 错误码**（AppleScript -2740）。  
**关键洞察（agent 必须用证据，不要猜）：**

查库后发现用户存的是：

```json
["-e 'display dialog \"...\" buttons {...}'"]
```

即 **一整行 shell 被当成单个 argv**，外层 `'` 原样进 `osascript` → 语法错误。  
这不是「需要 shell=true」，而是 **需要 shell 风格拆分**。

**选型：** Rust `shlex`（成熟、无 shell 注入执行，只做 tokenize）。

### 2.3 超时 UI

**口语：**

```text
执行超时 5秒 10秒 ... 300秒 + 数字框 秒
这里的 UI 重复，换成类似 add time 的 time picker 09:00 ▾
```

**好：** 直接给 **对标组件**（已有 TimePicker），禁止另造一套 segmented。  
**产品原则：** 小窗面 **少文案**，控件自解释。

### 2.4 音效

**口语：**

```text
失败、完成、任务开始都要音效
合适的库；算法生成；适合动森气质
设置中可开关
```

**好：** 约束 **无资源文件**（避免打包体积与版权）、**可关**（打扰可控）。  
**选型：** Web Audio API 过程合成（前端边界副作用），不是再引 Howler + wav。

### 2.5 UI hint 清理

**口语：**

```text
UI hint 基本都可以去掉！！不要这么长的文本在小小的 UI 上！！！
毕竟是面向用户，干扰越少越好
```

**思想：**

> 说明文档写 README / records；产品 UI 只留 **不可替代的状态信息**（如解析到的 binary 绝对路径）。  
> 营销句、架构句、「算法合成无资源」不应出现在设置行下方。

### 2.6 教材加长

**口语：**

```text
development records 内容太少；分析 commits 和 prompt；
说明为什么好、需求动机、如何清晰描述、如何驱动 agent；
交互拓展、功能拆解、真实执行与偏差
```

本篇即对该 prompt 的直接响应。

---

## 3. 如何把需求说清楚（可复制提示模板）

### 3.1 运行时硬化总包

```markdown
# Goal
Harden callai task execution so interactive commands are safe and controllable.

# Non-goals
- Do not redesign scheduler to run_at column
- Do not enable shell=true process spawn
- Do not add audio asset files

# Domain
- timeout_secs on Alarm/AlarmDraft, default 20, validate 1..=3600
- ExecutionStatus: + canceled, + timeout
- ProcessRunner::run(binary, args, env, timeout, cancel, on_chunk)
- CancelFlag registry keyed by alarm_id
- resolve_process_argv with shlex on flag-lines starting with `-`

# Infra
- spawn + poll + kill; cooperative cancel during retry wait (1s slices)
- SQL only in sqlite.rs constants; migrate sound_enabled / timeout_secs

# UI
- DurationPicker mm:ss like TimePicker (no segmented chips + number)
- Stop button + confirm while running; dialog closes immediately on run confirm
- env keys stable by index; remove long hints from edit/settings
- sound_enabled setting; Web Audio start/success/fail

# CLI
- run-once live stdout/stderr; Ctrl+C → cancel_alarm_run

# Tests
- unit: domain argv cases from real user logs
- unit: timeout no retry; cancel status
- process: sleep kill/cancel under 3s
- cargo test --lib green; bun typecheck

# Docs
- README recipes still AI-first; document shlex + timeout for pastes
```

### 3.2 单点 bug（argv）提示

```markdown
## Bug
osascript -2740 when args stored as one shell line with outer quotes.

## Evidence
SQLite args_json: ["-e 'display dialog ...'"]
stderr: unknown token (-2740)
Manual repro: osascript -e "'display dialog \"hi\"'" → same error

## Fix
shlex-split lines that start with `-` and contain whitespace.
Do NOT shlex bare AppleScript body lines (one-token-per-line mode).
Add templates for rest dialog / say.

## Tests
Use the exact Chinese dialog string from production logs.
```

### 3.3 UI 精简提示

```markdown
Remove instructional hints from compact UI surfaces.
Keep: empty-state copy, binary resolved path (status).
Delete: timeoutHint, retryHint, argsHint prose, soundHint, backupKeepHint, updateHint, logsHint in UI.
Long explanations belong in README recipes only.
```

---

## 4. 功能划分与架构

### 4.1 分层（保持 DESIGN 纪律）

```text
UI (React)
  ├─ observes lifecycle / busy / sound setting
  ├─ expresses intent: run / stop / save settings
  └─ plays SFX (presentation side-effect)
domain
  ├─ Alarm.timeout_secs validation
  ├─ resolve_process_argv / preview_command
  └─ ExecutionStatus machine
app (AlarmService)
  ├─ cancel registry
  ├─ retry loop (no retry on cancel/timeout)
  └─ ports only
infra
  ├─ SystemProcessRunner (timeout/cancel/chunks)
  ├─ SqliteStore (settings/alarms/logs)
  └─ scheduler worker unchanged (poller + single worker)
```

**明确不做什么：**

- 不改成 `run_at` 列调度（现有 poller 已满足 MVP 与去重）；
- 不 `Command` 走 `sh -c`（注入面与跨平台地狱）；
- 音效不进 Rust（桌面 UI 责任；daemon CLI 保持安静）。

### 4.2 功能清单（可写进验收）

| ID | 功能 | 入口 |
| --- | --- | --- |
| R1 | 每闹钟超时 | Edit DurationPicker · domain · runner |
| R2 | 超时杀进程 + status=timeout | process + service |
| R3 | 手动停止 + 确认 | Home Stop · cancel_alarm_run |
| R4 | 取消不重试 | service loop |
| R5 | shlex 解析 flag 行 | domain/argv.rs |
| R6 | CLI live + Ctrl+C | cli run-once |
| R7 | 日志删除 | delete_log API + LogsPanel |
| R8 | env 焦点稳定 | EditAlarmPage keys |
| R9 | 算法音效 + 开关 | sounds.ts · settings.sound_enabled |
| R10 | UI 去长文 hint | pages + i18n 可留 key 但 UI 不渲染 |

### 4.3 交互扩展

- **运行中卡片：** Run → Stop；busy 禁用 Edit/Delete 误触  
- **确认框：** 点确认立即关（长任务在后台）  
- **超时选择：** `00:20 ▾` +「确认超时」，与每日时间 picker 同一肌肉记忆  
- **设置：** 音效开关 + 试听；失败通知仍独立  
- **粘贴命令：** 用户可继续「一行 shell」；preview 用 shell_quote 显示  

---

## 5. 推进流程（agent 推荐顺序）

```text
1. 读日志 / SQLite 证据（command_preview, args_json, stderr）
2. 对齐 ProcessRunner 签名（先能编译）
3. domain: timeout + status + argv
4. service: cancel registry + 状态映射
5. process: spawn/poll/kill + tests with sleep
6. commands/CLI 接线
7. UI: DurationPicker / Stop / env key / 去 hint
8. sound: pure frontend + sound_enabled 持久化
9. cargo test --lib && bun typecheck
10. 教材 record + README recipes 一句指向
```

**反模式（本阶段踩过的）：**

| 反模式 | 后果 |
| --- | --- |
| 先改 UI 后改 runner | 看起来有 timeout，其实仍 output() 阻塞 |
| 全局 shlex 任意含空格字符串 | 拆坏 one-token-per-line 的 AppleScript 正文 |
| 用 isLoading 布尔堆砌 | 非法状态可表达 |
| 设置页长 hint 解释架构 | 小窗噪声 |

---

## 6. 真实执行、偏差与纠偏

### 6.1 偏差 A：ProcessRunner 签名分叉

**现象：** `process.rs` 已有 cancel/on_chunk，ports/service/tests 仍旧签名 → 无法编译。  
**纠偏：** 以 ports 为契约一次对齐；FakeRunner/HangRunner 同步。  
**教训：** 半成品 PR 最怕「实现超前、边界滞后」。

### 6.2 偏差 B：超时默认当失败重试

**现象：** timeout 后仍按 retry 间隔再跑 → 用户以为杀不死。  
**纠偏：** `canceled || timed_out` 直接 break，不 `attempt++`。  
**测试：** `timeout_does_not_retry`。

### 6.3 偏差 C：重试 sleep 不可中断

**现象：** 2 分钟 sleeper 一次睡死，取消无效。  
**纠偏：** 1s 切片轮询 `CancelFlag`。  
**测试断言变化：** 总秒数 240，而不是 `[120,120]` 两次。

### 6.4 偏差 D：shlex 误拆正文

**现象：** one-token-per-line：

```text
-e
display dialog "hi" buttons {"ok"}
```

第二行被拆成多个 token。  
**纠偏：** `looks_like_shell_line` **仅** `starts_with('-') && contains whitespace`。  
**测试：** `one_token_per_line_still_works` + 中文生产日志样例。

### 6.5 偏差 E：超时 UI 双重控件

**现象：** segmented 秒数 + number 输入重复。  
**纠偏：** `DurationPicker` 对齐 TimePicker 交互。  
**再纠偏：** 用户明确要求 **像 09:00 ▾ + 按钮**，去掉弹层内大量 preset 芯片打扰。

### 6.6 偏差 F：设置页长文 hint

**现象：** soundHint 等教程式句子塞进小 UI。  
**纠偏：** UI 不渲染长 hint；知识放 README / 本 record。  
**原则：** **面向用户的界面，干扰越少越好。**

### 6.7 仍开放 / 外部依赖

| 项 | 状态 |
| --- | --- |
| winget PR #401342 | 失败原因：**一个 PR 两个 PackageIdentifier**；已关闭，拆为 #401366 (GUI) + #401367 (CLI)，CLA 通过 |
| 本分支合入 main | 需 push + gate 绿 + rebase merge |
| 调度器失败音效 | 仅前端手动 run 路径有 SFX；后台 daemon 静音（有意） |

---

## 7. 关键文件地图

| 路径 | 职责 |
| --- | --- |
| `src-tauri/src/domain/argv.rs` | shlex 解析 / preview |
| `src-tauri/src/domain/alarm.rs` | timeout_secs |
| `src-tauri/src/domain/log_entry.rs` | canceled/timeout |
| `src-tauri/src/domain/settings.rs` | sound_enabled |
| `src-tauri/src/infra/process.rs` | 超时/取消/流式 chunk |
| `src-tauri/src/app/service.rs` | 取消注册表、状态映射 |
| `src-tauri/src/cli.rs` | live + Ctrl+C |
| `src/ui/DurationPicker.tsx` | mm:ss 超时 |
| `src/ui/sounds.ts` | Web Audio SFX |
| `src/pages/HomePage.tsx` | Stop / 音效触发 |
| `src/pages/SettingsPage.tsx` | 音效开关（无长 hint） |
| `src/pages/EditAlarmPage.tsx` | env key / DurationPicker / 短 meta |
| `README.md` / `README.zh.md` | Recipes + shlex 说明 |

---

## 8. 验收清单（手测 + 自动）

### 8.1 自动

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib
bun run typecheck
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

### 8.2 手测剧本

1. **超时：** binary=`sleep` args=`30` timeout=`00:05` → 约 5s 结束，日志 timeout。  
2. **取消：** sleep 60 → 确认执行 → Stop → 确认 → canceled。  
3. **osascript：** 模板「macOS 休息弹窗」或粘贴一行 `-e 'display dialog...'`，timeout≥60，应出系统对话框。  
4. **say：** 模板或 `-v Mei-Jia "你好"`。  
5. **env：** 改 KEY 中间字符，焦点不丢。  
6. **音效：** 设置开 → 执行听 start/success；关 → 静音；试听仍可用。  
7. **UI：** 编辑页超时区 **没有** 长说明段；设置音效行 **没有** 长 hint。  
8. **CLI：** `callai run-once <name>` 实时输出；Ctrl+C 取消。

---

## 9. Prompt 写作课：从本阶段抽象 7 条

1. **先给可复现命令与日志**，再给理论。  
2. **默认值 + 范围 + UI 对标组件** 三件套。  
3. **桌面与 CLI 对等验收**（同一 domain）。  
4. **明确非目标**（不 shell=true、不改调度模型）。  
5. **用库名级选型提示**（shlex / Web Audio），但允许 agent 论证。  
6. **UI 文案约束**：用户界面 ≠ 文档；「干扰越少越好」可写进验收。  
7. **要求测试与证据**：生产 args_json、stderr、commit 列表写进 record。

### 反例（弱 prompt）

```text
执行有时候不行，优化一下，顺便加点声音，UI 好看点
```

### 正例（强 prompt 骨架）

见 §3.1。

---

## 10. 学员练习

1. 故意构造一条 **未 shlex** 的错误存储，写测试锁住回归。  
2. 给 `DurationPicker` 增加「仅秒模式」是否合理？写设计 tradeoff 一段。  
3. 后台 scheduler 失败是否应播音效？论证隐私/打扰与托盘场景。  
4. 拆 winget 双包装 PR：写两条 PR 标题与目录树。  
5. 把本 record 的 §6 偏差表扩成课堂讨论：哪一次偏差成本最高？

---

## 11. 一句话收束

> **会调度只是闹钟；会超时、会取消、会解析用户粘贴的真实命令、并在可配置的前提下发出轻反馈，才是可托付的 callai。**  
> 把口语变成验收条，把偏差写进教材——这才是 AI coding 实战该教的东西。
