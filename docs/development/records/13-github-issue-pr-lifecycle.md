# 13 · GitHub Issue → PR → Gate → Merge：把「提需求」变成可交付周期

> 承接 [06](./06-cicd-release-please.md) / [10](./10-cicd-hardening-and-governance.md)。  
> 本篇用 callai 自己的 **#16–#19** 与历史 **#15** 当样板，教新人：**Issue 不是吐槽墙，是可合并的契约；PR 不是「我改完了」，是证据包。**

---

## 1. 思想：为什么软件开发要有 Issue / PR 周期

口语需求（`TODO`、聊天、截图）有三个问题：

| 问题 | 后果 |
| --- | --- |
| 无边界 | 越做越大，永远「差不多」 |
| 无验收 | 改完了也说不清「做完」是什么 |
| 无追溯 | 三个月后没人记得为什么这样 |

GitHub Issue + PR 把口语变成：

1. **Issue** = 问题陈述 + 范围 + 验收  
2. **Branch** = 可丢弃的实验空间  
3. **PR** = 变更说明 + 链接 Issue + 自动门禁  
4. **Merge** = 进入 main 的唯一合法入口（受 branch protection）  
5. **Release** = release-please / tag / 资产（下一环，见 06）

**callai 的治理现实**（见 10）：`main` 保护、**只允许 rebase merge**、**必过 `gate`**。  
所以新人不能 `git push main` 绕过讨论——这是特性，不是刁难。

---

## 2. 四个真实 Issue 拆解（#16–#19）

用户在本轮明确说：**查看这 4 个 issues 并修复**。  
这是最干净的「周期起点」：需求已经落成 Issue，不必再从截图猜。

### #16 `[enhance] Add version on cli and GUI in properly part`

| 维度 | 内容 |
| --- | --- |
| **为什么** | CLI 用户靠 `-V` 排障；GUI 用户在「设置/关于」确认是否已更新。版本不在「正确位置」等于产品失忆。 |
| **范围** | CLI 显式版本；Settings 关于区展示同一 semver 源。 |
| **不做** | 不重做 updater UI；不手改三个 version 文件（仍归 release-please）。 |
| **验收** | `callai --version` / `callai version` 输出 `CARGO_PKG_VERSION`；设置页有 `vX.Y.Z`。 |

**Prompt 为什么好**：用「properly part」暗示**位置语义**（关于区 / CLI 元命令），而不是「随便印个字符串」。

### #17 `[bug] Some UI components are not fit in dark mode`

Issue 正文拆成两条对比度故障：

1. Edit Alarm：模板 Select、popup、正文对比度不足  
2. Env vars：图标与前景不可读  

| 维度 | 内容 |
| --- | --- |
| **为什么** | 动森风浅色 parchment 控件在 dark 页上若继承错 ink，会「看得见控件、看不清字」。 |
| **修法原则** | 不换设计语言；提高 `token` 与局部 override；env row 强制浅色输入底 + 深色字。 |
| **验收** | dark 下 Edit 标签、Select、env 输入、删除 icon 均可辨。 |

**Prompt 为什么好**：用 **Issue 1 / Issue 2** 分场景，避免 agent 只改全局 token、漏掉 env icon。

### #18 `[enhance] … open the system explorer easily`

| 维度 | 内容 |
| --- | --- |
| **为什么** | 备份文件名对用户是黑盒；「在系统文件管理器中打开」比复制路径低认知负担。 |
| **选型** | Tauri 2 **`tauri-plugin-opener`** 的 `openPath`（跨平台打开目录）。 |
| **边界** | 只打开 **backups 目录**；不打开任意路径（命令返回 `AppPaths.backups_dir`）。 |
| **验收** | 设置 → 备份区按钮 → 系统文件管理器打开备份目录。 |

### #19 `[feat] Add the auto-start feature and setting`

| 维度 | 内容 |
| --- | --- |
| **为什么** | 闹钟产品必须在登录后活着；手动开 app 会漏触发。 |
| **不是什么** | **不是** `launch_minimized`（启动后藏托盘）。那是窗口策略，不是 OS 登录项。 |
| **选型** | 官方 **`tauri-plugin-autostart`**（Linux/Windows/macOS；macOS 用 LaunchAgent）。 |
| **验收** | 设置开关 ↔ `isEnabled/enable/disable`；重登后进程仍可被系统拉起（平台手测）。 |

**「用 properly lib」为什么关键**：自写 registry / plist / `.desktop` 极易漏权限与路径；插件把差异收敛。

---

## 3. 原始 prompt 拆解（本轮用户话术）

```text
查看这 4 个 issues，并且修复！！完成；
然后将 github issue, pr 这一套运作逻辑，也写成 records
从而让新人也能理解 github 和 软件开发周期
```

| 片段 | 作用 | 为什么好 / 仍可增强 |
| --- | --- | --- |
| 「查看这 4 个 issues」 | 指定真源 URL 上的契约 | 好：避免重新发明需求 |
| 「并且修复！！完成」 | 强制交付闭环，不是分析报告 | 好：agent 不得停在 plan |
| 「写成 records…新人」 | 第二交付物 = 教材 | 好：双产物（代码+教学） |
| （隐含）合 PR / 过 CI | 工程周期默认动作 | 可更明示：`Fixes #16 #17…` |

**给 AI 的强化模板**（学员可抄）：

```text
Repo: YuniqueUnic/callai
Issues: #16 #17 #18 #19（全文约束验收）
Branch: fix/issues-16-19 from main
Do: implement + tests + i18n + capabilities
PR body must include: Fixes #16 Fixes #17 Fixes #18 Fixes #19
Gate: cargo fmt/test/clippy -D warnings, bun typecheck
Docs: docs/development/records/13-… 讲 Issue→PR 生命周期，用本 PR 当证据
Do not: change design language; do not hand-bump version
```

---

## 4. 标准运作流程（新人照抄）

### 4.1 读 Issue → 写验收表

```bash
gh issue list --repo YuniqueUnic/callai --state open
gh issue view 16 --repo YuniqueUnic/callai
# …17 18 19
```

输出一张表：| Issue | 类型 | 验收 | 关键文件 |。

### 4.2 拉分支（永远从最新 main）

```bash
git checkout main && git pull
git checkout -b fix/issues-16-19
```

### 4.3 实现顺序（callai 推荐）

1. **基础设施**（plugin、capability、command）— #18 #19  
2. **领域/API 面**（version command、backups_dir）— #16 #18  
3. **UI / i18n** — Settings / dark CSS — #16 #17 #18 #19  
4. **测试** — 路径、版本字符串、回归 migrate  
5. **教材 record** — 本文件  

### 4.4 本地门禁

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
bun run typecheck
```

### 4.5 开 PR（链接自动关 Issue）

```bash
git push -u origin HEAD
gh pr create --title "fix: issues #16–#19 version, dark contrast, open backups, autostart" \
  --body "$(cat <<'EOF'
## Summary
- #16 GUI+CLI version surfaces
- #17 dark mode Edit/env contrast
- #18 open backups folder (opener)
- #19 launch-at-login (autostart plugin)

## Test plan
- [ ] `callai --version` / `callai version`
- [ ] Settings shows version badge
- [ ] dark theme Edit + env readable
- [ ] Open backups folder
- [ ] Autostart toggle enable/disable

Fixes #16
Fixes #17
Fixes #18
Fixes #19
EOF
)"
```

**关键词**：`Fixes #N`（或 `Closes #N`）写在 PR 正文 → merge 后 Issue **自动关闭**。  
不要只在 commit message 里提一句「related」——GitHub 默认认 PR 正文。

### 4.6 等 gate → rebase merge

```bash
gh pr checks
# gate 绿后
gh pr merge --rebase --delete-branch
```

main 保护策略下：**没有 gate 不能合**；**squash 若被禁用就用 rebase**（callai 当前是 rebase）。

### 4.7 发布环（理解即可）

常规 commit 进 main → `release-please` 可能开「Release PR」→ 合那个 PR 才 tag/发资产。  
**功能 PR ≠ 发版 PR**。新人常把「合进 main」当成「用户已能下到包」——错。

---

## 5. Issue 写作规范（让下一次 agent 更快）

好 Issue 至少有：

1. **标题前缀**：`[bug]` / `[feat]` / `[enhance]` / `[docs]`  
2. **场景**：在哪个页面 / CLI 子命令  
3. **期望 vs 实际**（bug）或 **用户故事**（feat）  
4. **验收清单**（checkbox）  
5. **平台**（若相关：macOS/Win/Linux）  
6. **反范围**（不要做成 X）

坏 Issue 示例：「UI 有点奇怪」——agent 只能瞎猜。

---

## 6. PR 写作规范

| 段 | 写什么 |
| --- | --- |
| Summary | 用户可感知变化，3–6 条 |
| Linked issues | `Fixes #…` |
| Test plan | 可勾选；含 CLI 与 GUI |
| Risk | 权限（opener/autostart）、迁移、破坏性 |
| Screenshots | UI 对比度 / 新开关（可选） |

**一个 PR 多个 Issue 可以吗？** 可以，当它们共享同一主题与测试面（本轮四个设置/元数据向）。  
若一个是重构一个是无关 bug，拆 PR 更容易过审。

---

## 7. 与 callai 已有机制的对照

| 机制 | 在周期中的位置 |
| --- | --- |
| `gate` workflow | PR 合并前的机器审稿人 |
| release-please | main 上的版本与 changelog 机器人 |
| packaging-sync | 发版后的 brew/scoop 镜像（见 11） |
| branch protection | 把流程「焊死」 |
| records 教材 | 把一次 PR 炼成可复用课 |

**外部对比：winget-pkgs CLA**（见 11）  
那是「跨组织 PR」：你还要签 CLA、遵守一应用一 PR。  
本仓 Issue/PR 是「产品内循环」；上游 packaging 是「生态循环」。新人应先精通内循环。

---

## 8. 本轮落地证据（#16–#19）

| Issue | 关键落地 |
| --- | --- |
| #16 | `get_app_version` + Settings 关于区；CLI `version` / `--version` → `CARGO_PKG_VERSION` |
| #17 | `global.css` dark 下 Edit/env/Select/icon 对比度 |
| #18 | `get_backups_dir` + `@tauri-apps/plugin-opener` `openPath` + 备份区 icon button |
| #19 | `tauri-plugin-autostart` + Settings 开关（与 `launch_minimized` 并列但不混淆） |

Capabilities 增量：`autostart:default`、`opener:default`、`opener:allow-open-path`。

---

## 9. 偏差与纠偏（教学点）

| 偏差风险 | 纠偏 |
| --- | --- |
| 把 autostart 做成再存一个 SQLite 布尔却不同步 OS | **OS 状态为真源**；UI 启动时 `isEnabled()` 回读 |
| 打开备份用 `shell open` 自拼命令 | 用 opener 插件，权限进 capability |
| GUI 版本读 `package.json` 另一条管道 | 统一 `CARGO_PKG_VERSION`（与二进制一致） |
| PR 不写 `Fixes` | Issue 合完仍 OPEN，看板脏 |

---

## 10. 验收清单（学员作业）

- [ ] 能用 `gh issue view` 讲清四个 Issue 的验收  
- [ ] 本地跑通 fmt/test/clippy/typecheck  
- [ ] PR 正文含四条 `Fixes`  
- [ ] 说明 `launch_minimized` vs `autostart` 差异  
- [ ] 画一张：Issue → branch → PR → gate → rebase merge →（可选）release-please  

---

## 11. 练习

1. 给 callai 写一个虚构 `[bug]` Issue（含期望/实际/验收），再写对应 PR 模板正文。  
2. 故意去掉 `Fixes #N` 开一个 PR，观察 merge 后 Issue 是否仍 open——体会关键词的作用。  
3. 对比本仓 PR 与 `microsoft/winget-pkgs` PR：多了哪些政策（CLA、目录结构）。

---

## 12. 一句话收束

**Issue 定义「做对」；PR 证明「做完」；gate 保证「没弄坏」；merge 才是团队共识。**  
AI coding 不是跳过这个周期，而是把周期里的「写代码」段加速——**契约与证据仍要人机一起写清楚。**
