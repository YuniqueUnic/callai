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
