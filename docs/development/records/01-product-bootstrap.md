# 01 · 产品与用例读入

## 学员目标

- 能从 `PRODUCT.md` / `DESIGN.md` / `usecases/*` 提炼出 **MVP 边界**
- 理解「闹钟 = 任务」隐喻，避免做成通用工作流平台
- 会用「先读需求文档再改代码」约束 AI agent

## 原始诉求（摘要）

> callai 风格：可爱的动森风软件；animal-island-ui；TS + Bun + React + Vite 8+ + Rust；dark/light + i18n；类似闹钟，配置时还要配置任务。  
> 仔细阅读 README / DESIGN / PRODUCT / usecases。

（出处：根目录 `TODO` 末段 + 对话开场）

## 约束与原则（工程课重点）

| 原则 | 落地 |
| --- | --- |
| 分层 | UI 只表达意图；domain 纯规则；infra 做 SQLite / process / TOML |
| KISS | 页面少：列表 / 编辑 / 设置（日志次级） |
| 非企业调度 | 不做复杂 DAG、不做冷灰仪表盘 |
| 许可 | animal-island-ui 为 CC BY-NC，商业需换库 |

## 关键提交

| Commit | 说明 |
| --- | --- |
| `4eeb02e` | 产品文档与用户指南 |
| `79dcbba` | 项目 README / gitignore / 编辑器配置 |

## 必读文件

- [`PRODUCT.md`](../../../PRODUCT.md)
- [`DESIGN.md`](../../../DESIGN.md)
- [`usecases/basic.md`](../../../usecases/basic.md)
- [`usecases/detail.md`](../../../usecases/detail.md)
- [`usecases/i18n.md`](../../../usecases/i18n.md)

## 复现命令

```bash
# 无代码，纯阅读与画边界
sed -n '1,80p' PRODUCT.md
ls usecases/
```

## 踩坑 / 教学提示

- AI 容易「功能膨胀」：提醒学员把 `usecases/detail.md` 里未点名的能力标成 **Out of scope**。
- 中英文案（`Ciallo～`）是品牌资产，不要随意改成冷冰冰 product copy。

## 练习

1. 用 5 条 bullet 写出 callai 的非目标（Anti-references）。
2. 画一张「新建闹钟」主路径状态机（idle → editing → saved → due → running）。
