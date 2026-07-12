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
