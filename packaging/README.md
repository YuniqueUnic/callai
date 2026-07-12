# packaging — Homebrew / Scoop / winget

本目录维护 **callai 桌面 GUI** 与 **CLI** 在主流包管理器中的安装清单，并提供从 GitHub Release **自动刷新 hash/version** 的脚本与 CI 校验。

> 清单默认指向 GitHub Releases 产物（见 [v0.2.1](https://github.com/YuniqueUnic/callai/releases/tag/v0.2.1)）。  
> 正式进入官方 `homebrew-cask` / `winget-pkgs` 中央仓库，仍需额外提交 PR（本仓库先自托管 / 文档化安装路径）。

## Matrix

| Manager | GUI | CLI | 安装示例 |
| --- | --- | --- | --- |
| **Homebrew** | Cask `callai-app` (dmg) | Formula `callai` (cli binary) | 见下方 |
| **Scoop** | `callai` (NSIS setup) | `callai-cli` (portable exe) | 见下方 |
| **winget** | `YuniqueUnic.Callai` (MSI) | `YuniqueUnic.Callai.CLI` (portable) | 见下方 |

GUI 与 CLI **都支持**：桌面要 Cask/Installer；无界面调度用 CLI/daemon。

## Layout

```
packaging/
  README.md
  homebrew/
    Casks/callai-app.rb  # GUI token: callai-app
    Formula/callai.rb    # CLI
  scoop/
    bucket/
      callai.json        # GUI
      callai-cli.json    # CLI
  winget/
    manifests/y/YuniqueUnic/
      Callai/<ver>/      # GUI MSI
      Callai.CLI/<ver>/  # CLI portable
  scripts/
    generate_from_release.sh
    validate_manifests.sh
```

## User install (today)

### Homebrew（推荐自托管路径）

```bash
# GUI (Cask) — 从本仓库路径直接装
brew tap YuniqueUnic/callai && brew install --cask callai-app

# CLI (Formula)
brew tap YuniqueUnic/callai && brew install callai

callai --help
```

若你 fork 了独立 tap（例如 `YuniqueUnic/homebrew-callai`），可改为：

```bash
brew tap YuniqueUnic/callai
brew install --cask callai-app
brew install callai       # formula (CLI)
```

未公证提示：

```bash
xattr -dr com.apple.quarantine /Applications/callai.app
```

### Scoop

```powershell
# 添加本仓库 bucket（git clone 后）
scoop bucket add callai <path-or-git-url-to-this-repo>
# 若用 raw git:
# scoop bucket add callai https://github.com/YuniqueUnic/callai.git
# 注意：scoop bucket 需要 bucket 根目录含 manifest；可用 packaging/scoop/bucket 单独仓库，或：

scoop install ./packaging/scoop/bucket/callai-cli.json
scoop install ./packaging/scoop/bucket/callai.json
```

### winget

> **winget-pkgs rule:** one pull request may only contain **one** package identifier tree.
> Submit `YuniqueUnic.Callai` and `YuniqueUnic.Callai.CLI` as **two separate PRs**.
> Validation error if mixed: *"The pull request contains more than one application."*
>
> Active submissions: [Callai GUI #401366](https://github.com/microsoft/winget-pkgs/pull/401366) · [Callai.CLI #401367](https://github.com/microsoft/winget-pkgs/pull/401367)


#### winget-pkgs hard requirements (upstream)

1. **One application per PR**  
   - `YuniqueUnic.Callai` and `YuniqueUnic.Callai.CLI` must be **two PRs**.  
   - Mixing both trees fails validation: *"The pull request contains more than one application."*

2. **Sign the Microsoft CLA** (same GitHub user as the PR author), comment on **each** PR:

   ```text
   @microsoft-github-policy-service agree
   ```

   - Personal (default): the line above.  
   - Company: `@microsoft-github-policy-service agree company="Legal Name"`  
   - Official guide: https://opensource.microsoft.com/cla/  
   - Trust **Checks → `license/cla` = success** (“All CLA requirements met”), not stale bot comments.

3. After CLA: wait for **WinGetSvc-Validation** (Azure pipeline linked by wingetbot).  
   Common failures guide: https://github.com/microsoft/winget-pkgs/blob/master/doc/ValidationFailureGuide.md

4. Teaching write-up: [`docs/development/records/11-packaging-brew-scoop-winget.md`](../docs/development/records/11-packaging-brew-scoop-winget.md) §9.


清单在合入 [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) 前，可用本地校验：

```powershell
winget validate packaging\winget\manifests\y\YuniqueUnic\Callai\0.2.1
winget validate packaging\winget\manifests\y\YuniqueUnic\Callai.CLI\0.2.1

# 中央仓库收录后：
# winget install YuniqueUnic.Callai
# winget install YuniqueUnic.Callai.CLI
```

本地安装器也可直接：

```powershell
# GUI
winget install --manifest packaging\winget\manifests\y\YuniqueUnic\Callai\0.2.1
# CLI
winget install --manifest packaging\winget\manifests\y\YuniqueUnic\Callai.CLI\0.2.1
```

## Maintainer workflow

### 1) 发版后刷新清单

```bash
# 需要 gh + 已发布 tag
./packaging/scripts/generate_from_release.sh v0.2.1
./packaging/scripts/validate_manifests.sh
```

脚本会：

1. `gh release download` 关键资产  
2. 计算 sha256  
3. 从 MSI 解析 `ProductCode`  
4. 覆写 Homebrew / Scoop / winget 清单  

### 2) CI

`.github/workflows/packaging.yml` 在 PR/main 上校验清单存在且 JSON/Ruby 语法正确；  
可选在 release 后人工或 workflow_dispatch 跑 generate（避免无资产时硬失败）。

### 3) 上游提交（可选）

| 目标 | 动作 |
| --- | --- |
| Homebrew Core/Cask | 另开 PR 到 `Homebrew/homebrew-cask` / formula（需审计） |
| Scoop official | 提交到知名 bucket 或自建 `homebrew-callai` 风格 scoop bucket 仓 |
| winget-pkgs | 用 `wingetcreate` 或直接 PR 到 `microsoft/winget-pkgs` |

本仓库 **先保证 manifests 与脚本正确**，中央收录是下一步分发增强，不阻塞 release。

## Design notes

1. **GUI ≠ CLI 包名分离**  
   - Cask 使用 `callai-app`，CLI Formula 使用 `callai`，避免 brew 命名冲突；Scoop/winget 同样拆 GUI/CLI。  

2. **资产映射**

| 产物 | 包 |
| --- | --- |
| `callai_*_aarch64.dmg` / `*_x64.dmg` | Homebrew Cask |
| `callai-cli-*-apple-darwin` / linux | Homebrew Formula |
| `callai_*_x64-setup.exe` | Scoop GUI |
| `callai-cli-*-windows-msvc.exe` | Scoop CLI + winget CLI |
| `callai_*_x64_en-US.msi` | winget GUI |

3. **签名/公证**  
   - Desktop 仍可能触发 Gatekeeper/SmartScreen；README / caveats / notes 已写明。  
   - Updater 的 minisign 与 OS 公证是不同层（见 records 07）。  

## Related

- 教学记录：[`docs/development/records/11-packaging-brew-scoop-winget.md`](../docs/development/records/11-packaging-brew-scoop-winget.md)  
- Release workflow：`.github/workflows/release.yml`  
- 用户文档：根 README「Install」节  
