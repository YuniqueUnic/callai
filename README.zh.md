<p align="center">
  <img src="docs/assets/callai-logo.png" alt="callai logo" width="144" />
</p>

<h1 align="center">callai</h1>

<p align="center">
  <strong>Ciallo～(∠・ω&lt; )</strong><br />
  给 AI 定闹钟，让额度窗口保持新鲜。
</p>

<p align="center">
  <img src="docs/assets/elements/hero-perch.png" alt="栖息小鸟" height="72" />
  &nbsp;
  <img src="docs/assets/elements/sprout-fresh.png" alt="新鲜窗口" height="72" />
  &nbsp;
  <img src="docs/assets/elements/running.png" alt="执行中" height="72" />
  &nbsp;
  <img src="docs/assets/elements/success-check.png" alt="成功" height="72" />
</p>

<p align="center">
  <a href="./README.md">English</a>
  ·
  <a href="https://github.com/YuniqueUnic/callai/releases">发布页</a>
  ·
  <a href="./CONTRIBUTING.md">贡献指南</a>
</p>

<p align="center">
  <a href="https://github.com/YuniqueUnic/callai/actions/workflows/ci.yml"><img src="https://github.com/YuniqueUnic/callai/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/YuniqueUnic/callai/actions/workflows/release.yml"><img src="https://github.com/YuniqueUnic/callai/actions/workflows/release.yml/badge.svg" alt="Release" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/version-0.1.0-88c0d0?logo=github" alt="version 0.1.0" /><!-- x-release-please-version -->
  <img src="https://img.shields.io/badge/Tauri-2-ffc131?logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/Rust-stable-dea584?logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/Bun-React-fbf0df?logo=bun&logoColor=black" alt="Bun React" />
</p>

---

## 为什么需要 callai？

<p align="center">
  <img src="docs/assets/elements/paused-sleep.png" alt="等待" height="88" />
  &nbsp;&nbsp;→&nbsp;&nbsp;
  <img src="docs/assets/elements/set-time.png" alt="设闹钟" height="88" />
  &nbsp;&nbsp;→&nbsp;&nbsp;
  <img src="docs/assets/elements/sprout-fresh.png" alt="新鲜窗口" height="88" />
</p>

Claude、ChatGPT、Codex 等常见 AI 工具普遍采用**滚动窗口（Rolling Window）**额度机制。真实痛点：

> 上午 9:30 开始高强度使用，中午前后额度烧光；午后再等很久窗口才滑出旧消耗。  
> 结果往往是：上午高效、下午等待、晚上继续等。

**callai** 是一个动森气质的小闹钟：在设定时间触发极轻量任务（如 `echo hi` / `codex exec hi`），提前“占位”，让黄金工作时段窗口更新鲜。

推荐配置：每天几次温和触发（例如 08:00 / 13:00 / 18:00）。

## 功能概览

| | 功能 | 说明 |
| :---: | --- | --- |
| <img src="docs/assets/elements/create-alarm.png" height="48" alt="新建" /> | **闹钟 = 任务** | 新建闹钟时一并配置 binary、参数与调度 |
| <img src="docs/assets/elements/set-time.png" height="48" alt="时间" /> | **温柔的时间** | 可视化时间 + cron 风格规则 |
| <img src="docs/assets/elements/running.png" height="48" alt="运行" /> | **桌面 + CLI** | Tauri App 与无 GUI 的 `run` / `daemon` 共用数据 |
| <img src="docs/assets/elements/theme-light.png" height="48" alt="主题" /> | **主题 + 多语言** | 亮 / 暗 / 跟随系统 · 中英双语 |
| <img src="docs/assets/elements/logs-clipboard.png" height="48" alt="日志" /> | **日志与重试** | 本地历史、柔和重试、失败系统通知 |
| <img src="docs/assets/elements/notify-badge.png" height="48" alt="托盘" /> | **原生托盘** | macOS 自适应托盘剪影 |
| <img src="docs/assets/elements/multi-device.png" height="48" alt="跨平台" /> | **跨平台** | macOS · Windows · Linux CI 构建 |

## 小岛贴纸

与应用内使用的同一批切片（来自 `callai.elements.png`）：

<p align="center">
  <img src="docs/assets/elements/hero-perch.png" height="64" alt="hero-perch" />
  <img src="docs/assets/elements/create-alarm.png" height="64" alt="create-alarm" />
  <img src="docs/assets/elements/set-time.png" height="64" alt="set-time" />
  <img src="docs/assets/elements/task-checklist.png" height="64" alt="task-checklist" />
  <img src="docs/assets/elements/running.png" height="64" alt="running" />
  <img src="docs/assets/elements/sprout-fresh.png" height="64" alt="sprout-fresh" />
  <img src="docs/assets/elements/theme-light.png" height="64" alt="theme-light" />
  <img src="docs/assets/elements/theme-dark.png" height="64" alt="theme-dark" />
  <img src="docs/assets/elements/success-check.png" height="64" alt="success-check" />
  <img src="docs/assets/elements/logs-clipboard.png" height="64" alt="logs-clipboard" />
  <img src="docs/assets/elements/notify-badge.png" height="64" alt="notify-badge" />
  <img src="docs/assets/elements/multi-device.png" height="64" alt="multi-device" />
</p>

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | TypeScript · React · Vite 8 · Bun · [animal-island-ui](https://github.com/guokaigdg/animal-island-ui) |
| 壳 | Tauri 2 |
| 核心 | Rust（`domain` / `app` / `infra`） |
| 存储 | SQLite + `config.toml` 备份 |
| 发布 | release-please（semver）+ GitHub Actions 多平台构建 |

**当前版本：** `0.1.0` <!-- x-release-please-version -->

## 快速开始

```bash
# 依赖：bun、rustup stable、可选 just
just setup
just dev          # 桌面
just dev-web      # 仅前端 mock
```

等价命令：

```bash
bun install
bun run tauri dev
```

### CLI（与桌面共享数据）

```bash
cargo build --manifest-path src-tauri/Cargo.toml
./src-tauri/target/debug/callai list
./src-tauri/target/debug/callai run                 # 无 GUI 调度保活
./src-tauri/target/debug/callai daemon              # run 别名
./src-tauri/target/debug/callai run-once <name|id>
./src-tauri/target/debug/callai validate
./src-tauri/target/debug/callai app                 # 显式 GUI
```

或：`just cli-list` / `just cli-run` / `just cli-validate` …

### 数据位置

| 类型 | 路径 |
| --- | --- |
| 配置 | `~/.config/callai/config.toml` |
| 备份 | `~/.config/callai/backups/`（最多 10 份） |
| 数据库 | `~/.local/share/callai/callai.db` |

## 架构（简）

```
src/                 # UI + 前端领域 + Tauri bridge
src-tauri/
  src/domain/        # 纯 Rust 规则
  src/app/           # 用例 + ports
  src/infra/         # sqlite / process / toml / scheduler
  src/commands.rs    # Tauri 命令 + CLI 入口
```

依赖方向：**UI → domain ← infra**。领域层不依赖 React / 网络 / 文件系统细节。

## 质量门禁

```bash
./scripts/check_versions.sh
just gate
# 或
just ci
```

覆盖：版本一致性（含 README 标记）、typecheck、前端测试与构建、`cargo fmt` / `test --lib` / `clippy -D warnings`、CLI smoke。

## CI / CD 与版本管理

- **CI**（`.github/workflows/ci.yml`）— 每次 `main` 的 push / PR
- **Release**（`.github/workflows/release.yml`）— [release-please](https://github.com/googleapis/release-please) 按 Conventional Commits 开 Release PR；合并后打 tag / 发 GitHub Release，并构建：
  - 桌面：macOS arm64/x64、Linux、Windows（[tauri-action](https://github.com/tauri-apps/tauri-action)）
  - CLI：同矩阵产物 `callai-cli-<target>`

版本源（必须一致；发版时由 release-please 同步）：

| 文件 | 字段 |
| --- | --- |
| `package.json` | `version` |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `package.version` |
| `.release-please-manifest.json` | `"."` |
| `README.md` / `README.zh.md` | version badge 与 **当前版本** 行（`x-release-please-version`） |

提交规范：[Conventional Commits](https://www.conventionalcommits.org/)（`feat:`、`fix:`、`chore:` …）。

## 品牌脚本

```bash
just brand
just brand-logo
just brand-elements
just brand-check
python3 scripts/brand/make_tray_template.py --help
```

托盘图为纯黑 + alpha 剪影，适配 macOS 菜单栏浅色 / 深色。

## 文档

- [PRODUCT.md](./PRODUCT.md) — 产品定位
- [DESIGN.md](./DESIGN.md) — 交互与结构
- [usecases/](./usecases/) — 场景
- [CONTRIBUTING.md](./CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) · [SECURITY.md](./SECURITY.md)

## 许可

- 本仓库源码：[MIT](./LICENSE)
- UI 依赖：[`animal-island-ui`](https://github.com/guokaigdg/animal-island-ui) 为 **CC BY-NC 4.0**（非商业）。个人 / 非商业使用 callai 没问题；若要商业分发，需替换 UI 库或取得授权。详见 `LICENSE` 中第三方说明。

---

<p align="center">
  <img src="docs/assets/elements/hero-perch.png" height="56" alt="小鸟" />
  <br />
  <em>Ciallo～(∠・ω&lt; ) — 让 AI 的窗口一直暖着。</em>
</p>
