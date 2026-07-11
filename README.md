### callai —— 给 AI 定闹钟，让你的额度窗口永远保持新鲜

#### 核心问题

Claude、ChatGPT、Codex 等主流 AI 工具普遍采用**滚动窗口（Rolling Window）**的额度限制机制。以 Claude 的 5 小时窗口为例：额度不是固定时间点重置，而是从你第一次发送消息的那一刻开始计算。

这就导致一个非常现实的痛点：

> 你每天上午 9:30 开始高强度使用 AI，到 11:30–12:00 就可能把当天的额度用光。
> 中午吃完饭回来，下午还要等很久才能等到窗口自然滑出之前的消耗。
> 结果就是：上午高效、下午等待、晚上继续等。

#### 解决方案：给 AI 定闹钟

**callai** 通过定时任务，在特定时间点主动触发一次极轻量任务（比如 `echo hi` 或 `codex exec hi`），提前“占位”并平移滚动窗口的起始时间。

按推荐的 3 次触发配置（例如每天 8:00、13:00、18:00），你可以在黄金工作时段保持更新鲜的额度窗口。

#### 技术栈

- 前端：TypeScript + React + Vite 8 + Bun + [animal-island-ui](https://github.com/guokaigdg/animal-island-ui)
- 后端：Rust + Tauri 2
- 存储：SQLite（闹钟/日志）+ TOML（可编辑配置 + 备份）
- i18n：中 / 英
- 主题：Light / Dark / System

#### 本地开发

推荐用 [just](https://github.com/casey/just)（见根目录 `justfile`）：

```bash
just setup      # bun install + cargo fetch
just dev        # Tauri 桌面开发
just dev-web    # 仅前端 mock
just test       # 前端 + Rust 测试
just gate       # 完整本地门禁
just --list     # 全部命令
```

等价的原始命令：

```bash
bun install
bun run tauri dev
# 仅前端
bun run dev
```



#### CLI（与桌面 App 共用数据）

不带子命令时启动 **GUI**；带子命令时走 **CLI**（同一套 SQLite + `config.toml`）。

```bash
# 构建
cargo build --manifest-path src-tauri/Cargo.toml

# 或 just
just cli-list
just cli-run
just cli-run-once morning-warmup
just cli-validate
just cli-example
```

```bash
./src-tauri/target/debug/callai list
./src-tauri/target/debug/callai run                 # 前台调度保活（无 GUI）
./src-tauri/target/debug/callai daemon              # run 的别名（daemon 保活）
./src-tauri/target/debug/callai run --import-toml   # 先从 config.toml 导入缺失闹钟
./src-tauri/target/debug/callai run-once <name|id>
./src-tauri/target/debug/callai validate
./src-tauri/target/debug/callai generate-example --out callai.example.toml
./src-tauri/target/debug/callai app                 # 显式启动 GUI
```

环境变量（可选）：沿用系统 `PATH` 查找 binary；数据目录见上文「数据位置」。

#### 质量门禁

```bash
just gate
# 或分步：
just typecheck && just test-web && just build-web
just fmt && just test-rs && just clippy
```

#### 运行时调度

- 轮询线程每 20s 检查 due 闹钟
- **单 worker 队列**串行执行任务（含真实重试等待），避免线程堆积
- 同一 alarm 在队列中 / 执行中时不会重复入队

#### 架构

```
src/                 # UI + frontend domain + Tauri bridge
  domain/            # pure rules (validate, preview, schedule labels)
  infra/             # tauri invoke + browser mock
  pages/             # Home / Edit / Logs / Settings
  i18n/              # zh-CN + en
  theme/             # dark/light tokens
src-tauri/
  src/domain/        # pure Rust domain
  src/app/           # use-cases + ports
  src/infra/         # sqlite / process / toml backup / scheduler
  src/commands.rs    # Tauri commands
  src/tests/         # mirrored unit/integration tests
```

#### 数据位置

- 配置：`~/.config/callai/config.toml`
- 备份：`~/.config/callai/backups/`
- 数据库：`~/.local/share/callai/callai.db`

#### 文档

- [PRODUCT.md](./PRODUCT.md)
- [DESIGN.md](./DESIGN.md)
- [usecases/](./usecases/)

#### 品牌素材

- 源图：`callai.logo.png`（应用/托盘 icon）、`callai.elements.png`（UI 插画精灵表）
- 透明主 icon：`assets/brand/callai-icon-master.png` / `src-tauri/icons/*`
- UI 切片：`src/assets/elements/*.png`（命名见 `catalog.json`）
- 生成脚本：`scripts/brand/`（`just brand` / `just brand-check`）

```bash
just brand          # 全量重生 icons + elements + index.ts
just brand-logo     # 仅 logo → app/tray icons
just brand-elements # 仅精灵表切片 + UI 模块
just brand-check    # 校验产物
```

#### 桌面交互

- 托盘菜单「New alarm」会显示主窗口并跳到新建页
- 编辑页 binary 支持「浏览」选择本地可执行文件（Tauri dialog）

#### 许可说明

前端使用 `animal-island-ui`（CC BY-NC 4.0）。该组件库声明禁止商业用途；本项目当前定位为内部 / 非商业学习与自用工具。若要商业分发，需替换 UI 库或取得授权。
