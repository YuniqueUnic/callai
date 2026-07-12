# 10 · CI 现代化与仓库治理：警告、保护、可教学验收

> 承接 [06](./06-cicd-release-please.md)。本篇专门讲 **平台警告修复**、**main 保护**、以及如何让学员「照着抄也能过审」。

## 1. 思想：CI 警告不是噪音，是日历

GitHub 会提前半年告诉你：

- 某 Node 运行时要退役  
- 某 `*-latest` runner 要换大版本  

若 annnotation 一直黄着，某天会突然红，且刚好卡在发版窗口。  
**治理原则**：黄灯当 bug 修；runner 标签能 pin 就 pin。

另一条思想：**保护分支 = 把「必须过 gate」从口头约定变成物理拦截。**

---

## 2. 三类真实警告 → 标准修法

### 2.1 Node.js 20 deprecated

**原文模式**：

```text
The following actions target Node.js 20 but are being forced to run on Node.js 24:
googleapis/release-please-action@v4
actions/checkout@v4
softprops/action-gh-release@v2
```

**修法表**（查 action.yml 的 `runs.using`）：

| 旧 | 新（callai） | 运行时 |
| --- | --- | --- |
| checkout@v4 | **@v7** | node24 |
| action-gh-release@v2 | **@v3** | node24 |
| release-please-action@v4 | **@v5** | node24 |
| tauri-action@v1 | 可保留 | 已是 node24 |

**指挥 agent 的一句话**：

```text
升级所有仍声明 node20 的 actions 到当前 major；
先查各 action 的 action.yml runs.using，确认是 node24；
不要顺手大改业务 build 逻辑。
```

### 2.2 macos-latest → macOS 26

**原文模式**：

```text
The macos-latest label will migrate to macOS 26 beginning June 15, 2026.
```

**修法**：

```yaml
# bad
runs-on: macos-latest

# good（callai）
runs-on: macos-15   # 明确 15；x64 用 rust target 交叉
```

同步 pin：

- Linux：`ubuntu-24.04`（不要 `ubuntu-latest`）  
- Windows：`windows-2025`（或你验证过的 `windows-2022`）  

### 2.3 「CI 绿但没人拦直推 main」

修法不是再写 workflow，而是 **branch protection / rules**：

- required status check 名称必须与 job `name:` **字符串一致** → callai 是 `gate`  
- `strict: true` → PR 落后 main 必须 rebase  
- 合并方式只开 rebase → 线性历史  
- 实测：`git push origin main` 应失败  

---

## 3. 原始 prompt 拆解（本阶段）

### 3.1 警告修复

用户几乎只贴日志 —— **足够好**，因为：

- 组件定位准确  
- 无需猜测  

你还可以补一句验收：

```text
修完后：任意一次 Release / CI run 的 Annotations 里
不再出现 Node 20 deprecated 与 macos-latest migration 警告。
```

### 3.2 保护分支

```text
main protect
自动 rebase 合并
PR 过了 gate 才能进 main
```

好在：三策分离，可分别 `gh api` 配置。  
solo 项目注意：`required_approving_review_count: 1` 会卡死自己；  
callai 采用 **status check 强制 + 直推禁止**，审批数可为 0（靠 gate 而不是人情 review）。

---

## 4. 给学员的「一天搭建」操作手册

### 上午：gate

1. 复制 `ci.yml` 骨架，改成你的 install/test  
2. job 名称定为 `gate`  
3. 开 PR，确认 Checks 里出现 **gate**  
4. 本地：`just ci` 或等价脚本  

### 下午：release

1. 上 Conventional Commits  
2. release-please config + workflow  
3. 用空 `docs:` commit 练手（不 bump）再用 `feat:` 触发  

### 晚上：治理

1. `gh api` 设 protection（见下）  
2. 故意直推 main，截图失败信息贴进笔记  
3. 再开 PR 合入，截图 gate 绿 + rebase merge  

### 配置命令参考（callai 用过）

```bash
# 仅 rebase
gh api -X PATCH repos/<owner>/<repo> \
  -f allow_rebase_merge=true \
  -f allow_squash_merge=false \
  -f allow_merge_commit=false \
  -f delete_branch_on_merge=true

# main protection（required check = gate）
gh api -X PUT repos/<owner>/<repo>/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input protection.json
```

`protection.json` 关键字段：

```json
{
  "required_status_checks": { "strict": true, "contexts": ["gate"] },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
```

---

## 5. 功能划分：谁负责「能合并」

| 层 | 机制 | 失败表现 |
| --- | --- | --- |
| 代码质量 | CI job `gate` | PR 红灯 |
| 合并策略 | rebase only | UI 无 squash 按钮 |
| 历史形状 | linear history | 拒绝 merge commit |
| 同步 | strict checks | 需 Update branch / rebase |
| 管理员纪律 | enforce_admins | 连 owner 直推也拦 |

---

## 6. 真实执行与偏差

| 计划 | 实际 | 偏差 |
| --- | --- | --- |
| 升 actions | `ea94e42` 一次改完 | 需查 latest major，不是猜 |
| 直推文档上 main | 被 protection 拒绝 | **符合预期**；改走 PR #3 |
| ruleset pull_request 规则 | API 422 schema | 先用 classic protection；不必死磕 ruleset |
| release-please bot PR | 也要过 gate | rebase 到最新 main 再 merge |

### 关键时间线

1. `45343c8` 引入 CI/CD  
2. 修绿若干  
3. `60110aa` v0.2.1 证明 publish+updater  
4. `ea94e42` 清 Node20 / pin runners  
5. Branch protection 生效；CONTRIBUTING 文档化（PR）  

---

## 7. 如何向学员演示「updater 正常」（连 06/07）

不要只说「应该行」，用这三条：

```bash
# 1) endpoint
curl -sL https://github.com/<owner>/<repo>/releases/latest/download/latest.json | jq '{version, platforms: (.platforms|keys)}'

# 2) 资产
gh release view --json assets --jq '.assets[].name' | rg 'latest.json|\\.sig$'

# 3) CI
gh run list --workflow=ci.yml --limit 3
gh run list --workflow=release.yml --limit 3
```

callai v0.2.1 验收过：version `0.2.1`，11 platforms，全部含 signature。

---

## 8. 验收清单

- [ ] CI Annotations 无 Node 20 / macos-latest 迁移警告  
- [ ] `runs-on` 全部为 pin 标签  
- [ ] main 直推失败  
- [ ] PR 仅在 `gate` success 时可 rebase merge  
- [ ] CONTRIBUTING 写了保护策略（新人可读）  
- [ ] （可选）Release 页有 `latest.json`  

## 9. 练习

1. 给「纯前端 Vite 站」写一份 30 行 `ci.yml` + protection 说明。  
2. 模拟 annotation：某 action 仍停在 node20，写出升级检索步骤（`curl action.yml | rg node`）。  
3. 设计：monorepo 两个 package 时，required checks 应叫什么名字？  

## 10. 关键

- `.github/workflows/ci.yml` / `release.yml`  
- commit `ea94e42`  
- `CONTRIBUTING.md` Branch protection 节  
- GitHub Settings → Branches / Actions  
