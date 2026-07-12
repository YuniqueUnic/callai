# 11 · 包管理器分发：Homebrew / Scoop / winget

## 1. 思想：发版资产 ≠ 用户装得上

GitHub Release 有了 dmg/msi/cli，用户仍会问 brew/scoop/winget 怎么装，以及 GUI 与 CLI 能否分开装。

**包管理器清单是第二层分发契约**：把 Release 资产映射为可重复安装的「版本 + URL + hash」。

### 为什么 GUI 和 CLI 都要

| 形态 | 用户 | 资产 |
| --- | --- | --- |
| GUI | 日常托盘 / 设置闹钟 | dmg / msi / setup.exe |
| CLI | 无界面 daemon / 服务器旁挂 | `callai-cli-*` 单文件 |

## 2. 调研结论

| 管理器 | 中央仓 | 本仓库策略 |
| --- | --- | --- |
| Homebrew Cask | homebrew-cask | `callai-app` @ `packaging/homebrew/Casks` 自托管 |
| Homebrew Formula | homebrew-core | `packaging/homebrew/Formula` 自托管 |
| Scoop | 各 bucket | `packaging/scoop/bucket/*.json` |
| winget | microsoft/winget-pkgs | `packaging/winget/manifests/...` |

成熟路径：Release 资产 → 脚本算 sha 写 manifest → CI 校验 → 可选上游 PR。没有零审核自动进三大中央仓的银弹。

## 3. 需求拆解

- brew/scoop/winget 都要，且 GUI + CLI 都支持
- packaging README + 根 README 中英 Install
- logo/标题左右 one-row
- 流程写入 records

## 4. 资产映射

| Release 资产 | 包 |
| --- | --- |
| `*_aarch64.dmg` / `*_x64.dmg` | Homebrew Cask |
| `callai-cli-*-apple-darwin` / linux | Homebrew Formula |
| `*_x64-setup.exe` | Scoop callai |
| `callai-cli-*-windows-msvc.exe` | Scoop callai-cli + winget Callai.CLI |
| `*_x64_en-US.msi` | winget Callai |

## 5. 维护流程

```bash
./packaging/scripts/generate_from_release.sh v0.2.1
just packaging-validate
# PR 合入 packaging/**
```

CI：`.github/workflows/packaging.yml`（validate；可选 dispatch regenerate）

## 6. 验收

- [x] 三管理器 GUI+CLI 清单
- [x] validate 脚本
- [x] README Install + 左右 header
- [x] record 11

## 7. 关键

`packaging/**` · `.github/workflows/packaging.yml` · `just packaging-*`


## 8. 原始 prompt 与纠偏（补强）

### 口语需求

```text
brew / scoop / winget 都要；GUI cask + CLI formula 都要
packaging README；根 README 中英同步
logo 与标题 one-row 居中
流程写进 records
winget 若需 PR 就提交
brew cask 命名 callai-app 避免冲突
```

### 为什么好

- **GUI/CLI 成对** 防止只做一半分发  
- **命名冲突前置**（callai-app）  
- **脚本化刷新 hash** 而不是手改  

### winget 真实偏差（必读）

`microsoft/winget-pkgs` PR #401342 被拒（已关闭）：

> The pull request contains more than one application.

**规则：** 一个 PR 只能有一个 PackageIdentifier 树。  
`YuniqueUnic.Callai` 与 `YuniqueUnic.Callai.CLI` 必须 **拆成两个 PR**，并完成 CLA。

### 给 AI 的提示

```markdown
Split winget into two PRs against microsoft/winget-pkgs.
PR1: manifests/y/YuniqueUnic/Callai/0.2.1 only
PR2: manifests/y/YuniqueUnic/Callai.CLI/0.2.1 only
Comment CLA: @microsoft-github-policy-service agree
Do not mix identifiers in one PR.
```

已拆分提交：
- GUI: https://github.com/microsoft/winget-pkgs/pull/401366
- CLI: https://github.com/microsoft/winget-pkgs/pull/401367

---

## 9. winget-pkgs 上游要求（必读 · 投稿 checklist）

> 本节把 **真实踩坑 + 官方规则** 写进教材，避免下一次发版再踩「多应用 PR / CLA 假失败 / 验证流水线」同一坑。  
> 权威入口：
>
> - 仓库：https://github.com/microsoft/winget-pkgs  
> - CLA 说明：https://opensource.microsoft.com/cla/  
> - CLA PDF：https://opensource.microsoft.com/pdf/microsoft-contribution-license-agreement.pdf  
> - 验证失败常见问题：https://github.com/microsoft/winget-pkgs/blob/master/doc/ValidationFailureGuide.md  

### 9.1 一条铁律：一个 PR 只能有一个 PackageIdentifier

| 允许 | 禁止 |
| --- | --- |
| PR 只含 `manifests/y/YuniqueUnic/Callai/0.2.1/**` | 同一 PR 里同时有 `Callai` **和** `Callai.CLI` |
| PR 只含 `manifests/y/YuniqueUnic/Callai.CLI/0.2.1/**` | 「图省事」一次提交 GUI + CLI |
| 同一版本发 **两个 PR** | 用 monorepo 式路径塞两个应用树 |

**真实失败（callai）：**

- PR：https://github.com/microsoft/winget-pkgs/pull/401342 （已关闭）  
- 错误（wingetbot）：

```text
PullRequest-Error The pull request contains more than one application.
Multiple manifests changes must be under the same application.
```

**纠偏后的正确提交：**

| PackageIdentifier | 资产 | PR |
| --- | --- | --- |
| `YuniqueUnic.Callai` | MSI GUI | https://github.com/microsoft/winget-pkgs/pull/401366 |
| `YuniqueUnic.Callai.CLI` | portable exe | https://github.com/microsoft/winget-pkgs/pull/401367 |

**给 agent / 维护者的硬约束：**

```markdown
## winget submission
- Never put two PackageIdentifier trees in one PR
- GUI path: manifests/y/YuniqueUnic/Callai/<ver>/
- CLI path: manifests/y/YuniqueUnic/Callai.CLI/<ver>/
- Open two PRs; close any multi-app PR with a comment linking the split PRs
```

### 9.2 CLA（Contributor License Agreement）怎么签

Microsoft 的 CLA **嵌在 GitHub PR 体验里**，不需要单独填网页表单（个人场景）。

#### 签署步骤（个人贡献 · 默认）

1. 用 **提交该 PR 的同一 GitHub 账号** 登录（callai 为 `YuniqueUnic`）。  
2. 打开对应 winget-pkgs PR 页面。  
3. 在评论框 **单独发一行**（不要夹杂其它说明）：

```text
@microsoft-github-policy-service agree
```

4. 等 1–2 分钟，刷新 **Checks**。  
5. 看到 `license/cla` 为 **SUCCESS**，且描述类似：

```text
All CLA requirements met.
```

即表示签署完成。

#### 公司签署（少用）

若贡献属于雇主职务作品，用：

```text
@microsoft-github-policy-service agree company="Legal Company Name"
```

#### 常见误解

| 误解 | 事实 |
| --- | --- |
| bot 评论 *needsCLA* 就一定没签 | 旧模板评论可能残留；**以 Checks 里 `license/cla` 为准** |
| API/别人代发 `agree` 一定生效 | 最稳是 **本人在网页上评论** |
| CLA 绿了就能立刻 merge | 还要过 **WinGet 验证流水线 + 人工审核** |
| 微软员工也要手动 agree | 内部账号关联后通常免签；社区贡献者走 agree |

#### 检查是否已签过

```bash
# 看 PR 的 license/cla 结论
gh pr view 401366 --repo microsoft/winget-pkgs \
  --json statusCheckRollup \
  --jq '.statusCheckRollup[] | select(.name=="license/cla")'
```

或浏览器：PR → **Checks** → `license/cla` 绿勾。

### 9.3 验证流水线（WinGetSvc-Validation）

投稿后 `wingetbot` 会贴 Azure Pipelines 链接，例如：

```text
Validation Pipeline Run [WinGetSvc-Validation-…](https://dev.azure.com/shine-oss/...)
```

典型检查包括（随官方演进，以当次 pipeline 为准）：

- manifest schema / 字段完整性  
- InstallerUrl 可达  
- InstallerSha256 与真实文件一致  
- PackageIdentifier / 版本路径约定  
- **单应用边界**（§9.1）  
- 未签名安装包可能出现 SmartScreen 相关提示（描述里诚实写明即可）

失败时优先读：

1. pipeline 日志  
2. [ValidationFailureGuide](https://github.com/microsoft/winget-pkgs/blob/master/doc/ValidationFailureGuide.md)  
3. 本仓库 `packaging/winget/manifests/...` 与 Release 资产是否仍对齐  

### 9.4 本地与本仓清单要求

```bash
# 发版后刷新 hash/version
./packaging/scripts/generate_from_release.sh vX.Y.Z
just packaging-validate

# Windows 上（装了 winget 客户端时）
winget validate packaging\winget\manifests\y\YuniqueUnic\Callai\X.Y.Z
winget validate packaging\winget\manifests\y\YuniqueUnic\Callai.CLI\X.Y.Z

# 合入官方仓前可本地试装
winget install --manifest packaging\winget\manifests\y\YuniqueUnic\Callai\X.Y.Z
winget install --manifest packaging\winget\manifests\y\YuniqueUnic\Callai.CLI\X.Y.Z
```

每个版本目录通常三件套：

| 文件 | 作用 |
| --- | --- |
| `*.yaml`（version） | PackageIdentifier + Version + DefaultLocale |
| `*.installer.yaml` | URL / SHA256 / InstallerType / Architecture |
| `*.locale.en-US.yaml` | 名称、描述、License、Tags |

callai 约定：

| 包 | InstallerType | 命令 |
| --- | --- | --- |
| `YuniqueUnic.Callai` | wix (MSI) | GUI |
| `YuniqueUnic.Callai.CLI` | portable | `Commands: [callai]` |

### 9.5 投稿操作剧本（发新版本时）

```text
1. GitHub Release 出齐：MSI + callai-cli-*-windows-msvc.exe（及 .sig 可选）
2. generate_from_release.sh vX.Y.Z → 更新 packaging/winget/**
3. just packaging-validate / winget validate 两个目录
4. fork microsoft/winget-pkgs（或已有 fork）基于最新 master
5. 开 PR-A：只加 Callai/X.Y.Z
6. 开 PR-B：只加 Callai.CLI/X.Y.Z
7. 每个 PR 用同一 GitHub 账号评论：
     @microsoft-github-policy-service agree
8. 确认 license/cla = SUCCESS
9. 等 WinGetSvc-Validation；红了按 ValidationFailureGuide 修 manifest 后 push 同分支
10. 合入后 README 把「pending PR」改成 winget install 命令
```

### 9.6 给 AI agent 的完整提示模板

```markdown
# Goal
Submit callai GUI + CLI to microsoft/winget-pkgs for version X.Y.Z.

# Hard rules
1. ONE PackageIdentifier per PR (never mix Callai and Callai.CLI).
2. Author must CLA-sign by commenting on each PR (as the GitHub user):
   @microsoft-github-policy-service agree
3. InstallerSha256 must match Release assets; regenerate via
   ./packaging/scripts/generate_from_release.sh vX.Y.Z
4. Base branch: microsoft/winget-pkgs master (keep fork master synced).

# PR A — GUI
- Paths only under manifests/y/YuniqueUnic/Callai/X.Y.Z/
- Title: New package: YuniqueUnic.Callai version X.Y.Z
  (or "New version: …" if package already exists)

# PR B — CLI
- Paths only under manifests/y/YuniqueUnic/Callai.CLI/X.Y.Z/
- Title: New package: YuniqueUnic.Callai.CLI version X.Y.Z

# If an old multi-app PR exists
- Close it with comment linking PR A + PR B and quote the validation error.

# Do not
- Put both trees in one commit/PR
- Hand-edit SHA without re-downloading assets
- Claim CLA failed when license/cla check is already green (stale comment)
```

### 9.7 学员练习

1. 用一句话解释：为什么 GUI 与 CLI 在 winget 里是两个 PackageIdentifier，而 brew 用 `callai-app` cask + `callai` formula。  
2. 模拟 bot 报 “more than one application”：写出你关闭旧 PR 的评论全文。  
3. 在假 PR 上写出个人 CLA 与公司 CLA 两条评论的区别。  
4. 从 `latest` Release 拉 MSI，本地算 SHA-256，与 `*.installer.yaml` 对照。  

### 9.8 一句话收束

> **winget 投稿 = 正确 manifest + 一应用一 PR + 本人 CLA agree + 验证流水线绿。**  
> 缺任何一环都「合不进去」；其中最多人栽的是 **双包装塞同一 PR**，其次是 **把旧 needsCLA 评论当成当前状态**。



---

## 10. 仓库怎么拆？用户体验优先 + xidl 式同步

### 决策（当前）

| 仓库 | 保留？ | 原因 |
| --- | --- | --- |
| `callai` + `packaging/**` | **必须** | 真源、脚本、winget、校验 |
| `homebrew-callai` | **保留** | 用户 `brew tap` 习惯；根目录布局 |
| `scoop-callai` | **保留** | 用户 `scoop bucket add` 习惯 |
| 再拆「产品级」第三仓 | **不要** | 重复元数据、无自动同步会腐烂 |

### 同步模型（避免发版 CI 跨仓耦合）

```text
Release 只出资产
    -> packaging-sync（定时/手动）拉 Release 写 monorepo packaging/
    -> 开 PR 合入 main
    -> 同 workflow 可选 mirror 到 tap/bucket（PACKAGING_MIRROR_TOKEN）
```

本地：

```bash
./packaging/scripts/generate_from_release.sh vX.Y.Z
MIRROR_TOKEN=... TAG=vX.Y.Z ./packaging/scripts/mirror_to_tap_bucket.sh
gh workflow run packaging-sync.yml -f tag=vX.Y.Z
```

详见 `packaging/README.md` § Strategy。
