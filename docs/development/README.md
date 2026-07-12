# callai 开发过程记录（AI Coding 教学用）

本目录把 **真实需求提示词 → 工程决策 → 关键提交 → 可复现命令** 串成可授课材料。

| 路径 | 说明 |
| --- | --- |
| [`records/`](./records/) | 分阶段实战文档（按时间线 / 主题） |
| [`records/00-index.md`](./records/00-index.md) | 总目录 + 学习路径 |
| 仓库根 `TODO` | 用户历次 prompt 的粗糙总集（有缺漏，以 records 讲解为准） |
| [`scripts/`](../../scripts/) | 可复用脚本与媒体/品牌流程 |

## 怎么用这份材料上课

1. 先读 `records/00-index.md` 选一条学习路径（产品 / UI / CI / 发布）。
2. 每一篇 record 都按统一结构：**学员目标 → 原始诉求 → 约束 → 关键提交 → 关键文件 → 命令 → 踩坑 → 练习题**。
3. 需要复现时优先 `just --list` 与 `scripts/README.md`，不要手抄一次性命令。
4. 对照 GitHub：https://github.com/YuniqueUnic/callai

## 技术基线（课程始终围绕）

- **栈**：TS + Bun + React + Vite 8 + Rust + Tauri 2
- **UI**：animal-island-ui（动森风，CC BY-NC 注意商业边界）
- **架构**：UI → domain ← infra（端口/依赖倒转）
- **发布**：Conventional Commits + release-please + GitHub Actions 多平台

## 维护约定

- 新的大需求落地后：补一篇 `records/NN-*.md`，并更新 `00-index.md`。
- prompt 原文可摘自 `TODO` 或对话；**缺漏时以 git log + 代码现状为准**。
- 禁止把 `assets/screenshot/original/`、私钥、本机绝对路径密钥写进 records 正文以外的附件。
