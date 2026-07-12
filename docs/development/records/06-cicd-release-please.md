# 06 · CI/CD 与 release-please

## 学员目标

- 用 GitHub Actions 跑通：前端门禁 + Rust 门禁 + CLI smoke  
- 用 release-please 做 semver 与多文件版本同步  
- 合并 Release PR 后触发多平台 Tauri + CLI 产物上传  

## 原始诉求（摘要）

> 使用 gh 构建 workflow：Tauri（官方或更好用的 tauri-action）+ CLI；version 用 semver + google release-please；确保 CI/CD 正常。

## 关键提交

| Commit | 说明 |
| --- | --- |
| `45343c8` | 引入 CI + release-please + publish 矩阵 |
| `fc24400` | Ubuntu apt 包冲突（appindicator） |
| `773afe0` | cargo fmt 过 gate |
| `1e7423f` | `tauri-plugin-dialog` 默认 features（Linux rfd） |
| `f3ab0ff` | icons 强制入库、双语 README、LICENSE… |
| `fec4fe6` | README 作为 generic extra-files |
| `09c6f87` / `ba217cd` / `6868380` | Release PR 与 v0.2.0 merge |

## 工作流文件

- `.github/workflows/ci.yml` — PR/main gate  
- `.github/workflows/release.yml` — release-please + publish  
- `release-please-config.json`、`.release-please-manifest.json`  
- `scripts/check_versions.sh`

## 版本源（必须一致）

`package.json` · `src-tauri/tauri.conf.json` · `src-tauri/Cargo.toml` · `.release-please-manifest.json` · README 标记

## 复现命令

```bash
./scripts/check_versions.sh
just ci   # 或 just gate
gh run list --limit 5
gh pr list
# 仅当确认要发版时：merge release-please PR
```

## 实战故障树（课堂金句）

1. **icons 未进库** → 编译 `include_bytes!` 失败（全局 `Icon?` ignore）  
2. **rfd 无 backend** → dialog plugin 勿乱关 default-features  
3. **README 版本未涨** → check_versions 失败；需要 `x-release-please-version` + generic extra-files  
4. **Release PR CI action_required** → rebase 到最新 main 再跑  

## 练习

1. 画 release-please 状态机：main push → PR → merge → tag → publish matrix。  
2. 解释为何 CLI 与 GUI 共用 `cargo build --release` 同一二进制。
