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

```bash
bun install
bun run tauri dev
```

仅前端（浏览器 mock API）：

```bash
bun run dev
```

#### 质量门禁

```bash
# Frontend
bun run typecheck
bun test
bun run build

# Rust / Tauri core
cargo fmt --manifest-path src-tauri/Cargo.toml --all
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
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

#### 桌面交互

- 托盘菜单「New alarm」会显示主窗口并跳到新建页
- 编辑页 binary 支持「浏览」选择本地可执行文件（Tauri dialog）

#### 许可说明

前端使用 `animal-island-ui`（CC BY-NC 4.0）。该组件库声明禁止商业用途；本项目当前定位为内部 / 非商业学习与自用工具。若要商业分发，需替换 UI 库或取得授权。
