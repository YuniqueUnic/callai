# Records 总目录

面向：**想用 AI agent 从 0 到可发布桌面应用** 的学员。  
案例产品：**callai** — 给 AI 定闹钟的动森风工具（Tauri + CLI）。

## 推荐学习路径

### 路径 A · 产品落地（最短闭环）

1. [01 产品与用例读入](./01-product-bootstrap.md)
2. [02 品牌与托盘素材流水线](./02-brand-and-tray.md)
3. [03 CLI / daemon 与共享数据](./03-cli-and-daemon.md)
4. [06 CI/CD 与 release-please](./06-cicd-release-please.md)
5. [07 自动更新与未签名安装说明](./07-updater-and-unsigned-install.md)

### 路径 B · 动森风 UI 深潜

1. [01 产品与用例读入](./01-product-bootstrap.md)
2. [04 沉浸式 UI：海浪、Tab、动效](./04-ui-island-motion.md)
3. [05 交互硬化：层级、Toast、日志 Drawer](./05-ui-interaction-hardening.md)
4. [08 截图媒体优化与 README 展示](./08-media-readme-pipeline.md)

### 路径 C · 发布工程

1. [06 CI/CD 与 release-please](./06-cicd-release-please.md)
2. [07 自动更新与未签名安装说明](./07-updater-and-unsigned-install.md)
3. [09 仓库元数据、许可证与教学沉淀](./09-docs-meta-and-teaching.md)

## 阶段 ↔ 关键提交（摘要）

| 阶段 | 代表 commit（短 hash） | 主题 |
| --- | --- | --- |
| 文档基线 | `4eeb02e` | PRODUCT / DESIGN / usecases |
| 工程脚手架 | `79dcbba` `263c12c` | gitignore、just、品牌入口 |
| 托盘 | `8e945a3` `e677adf` | macOS template tray |
| i18n / 备份 | `514c873` `c5b6dc7` | 托盘文案、备份删除 |
| CLI | `21d13b4` `aaa486b` | 共用数据、daemon 保活 |
| Icon 按钮与 Toast | `8ae654c` `7d39013` | 交互与反馈 |
| CI 引入 | `45343c8` … `1e7423f` | gate、rfd/apt、icons 入库 |
| README / 元数据 | `f3ab0ff` `fec4fe6` | 双语 README、版本标记 |
| v0.2.0 发布 | `6868380` | release-please merge |
| Updater + 媒体 | `d8d9182` | tauri updater、截图管线 |

完整列表以 `git log --oneline` 为准。

## 源材料

- 用户 prompt 总集：仓库根 [`TODO`](../../../TODO)（口语化、有重复与缺漏）
- 需求文档：`PRODUCT.md` `DESIGN.md` `usecases/*`
- 脚本：`scripts/README.md`
