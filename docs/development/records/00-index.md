# Records 总目录 · callai AI Coding 实战教材

> 这不是变更日志摘要，而是：**如何把口语需求变成可执行规格，并驱动 AI agent 连续交付** 的课堂笔记。  
> 证据链：`TODO`（口语 prompt 总集）→ `PRODUCT/DESIGN/usecases`（规格真源）→ `git log`（落地）→ 本目录（教学重构）。

## 每篇统一骨架（学员请按此读）

1. **思想 / 为什么有这个需求**  
2. **原始 prompt 摘录 + 拆解**（好在哪 / 还缺什么）  
3. **如何把需求说清楚**（给 AI 的提示模板）  
4. **功能划分与交互扩展**  
5. **推进流程**（agent 执行顺序）  
6. **真实提交 / 偏差与纠偏**  
7. **验收清单 + 练习**

## 三条学习路径

### 路径 A · 从 0 到可发布（推荐第一遍）

| 顺序 | 文档 | 你将学会 |
| --- | --- | --- |
| 1 | [01 产品与用例读入](./01-product-bootstrap.md) | 先规格后代码；防 scope 膨胀 |
| 2 | [02 品牌与托盘](./02-brand-and-tray.md) | 资产流水线；视觉 QA 语言 |
| 3 | [03 CLI 与 daemon](./03-cli-and-daemon.md) | 单二进制双入口；共享 domain |
| 4 | [04 沉浸式 UI](./04-ui-island-motion.md) | 组件语义驱动布局 |
| 5 | [05 交互硬化](./05-ui-interaction-hardening.md) | 层级 / 状态机 / 反馈 |
| 6 | [06 CI/CD](./06-cicd-release-please.md) | gate → release-please → 多平台 |
| 7 | [07 Updater 与未签名安装](./07-updater-and-unsigned-install.md) | 信任模型与文档诚实 |
| 8 | [08 媒体与 README](./08-media-readme-pipeline.md) | 素材卫生；展示即获客 |
| 9 | [09 元数据与教学沉淀](./09-docs-meta-and-teaching.md) | 把对话炼成教材 |
| 10 | [10 CI 现代化与仓库治理](./10-cicd-hardening-and-governance.md) | Node/runner 警告、分支保护、验收剧本 |
| 11 | [11 包管理器分发](./11-packaging-brew-scoop-winget.md) | brew/scoop/winget；**winget 一应用一 PR + CLA** |
| 12 | [12 运行时硬化与音效](./12-runtime-hardening-and-sfx.md) | 超时/取消/shlex/DurationPicker/SFX/去 hint |
| 13 | [13 GitHub Issue/PR 周期](./13-github-issue-pr-lifecycle.md) | Issue→分支→PR→gate→rebase merge；#16–#19 样板 |

### 路径 B · 只学「如何写 prompt」

精读每篇 **§原始 prompt 拆解** 与 **§给 AI 的提示模板**，对照根目录 `TODO` 原文。

### 路径 C · 只学发布工程

`06` → `10` → `13` → `07` → `08` → `09` → `11`（含 §9 winget-pkgs CLA / 一应用一 PR），配合 `gh run list` / Releases 页实操。

### 路径 D · 只学执行语义与交互硬化

`05` → `12` → `03`（CLI 对等），配合本地 `sleep`/`osascript`/`say` 手测。

## 提交时间线（证据）

| 阶段 | Commits | 对应 record |
| --- | --- | --- |
| 规格落地 | `4eeb02e` | 01 |
| 工程脚手架 | `79dcbba` `263c12c` | 01–02 |
| 托盘 / i18n / 备份 | `8e945a3` `514c873` `c5b6dc7` | 02, 05 |
| CLI | `21d13b4` `aaa486b` | 03 |
| UI 反馈与层级 | `8ae654c` `7d39013` `2b5c142` | 04–05 |
| 品牌校准 | `e677adf` | 02 |
| CI 引入与修绿 | `45343c8`…`1e7423f` | 06 |
| 仓库开源化 | `f3ab0ff` `fec4fe6` | 06, 09 |
| v0.2.0 | `6868380` | 06 |
| Updater + 媒体 | `d8d9182` | 07–08 |
| v0.2.1 + updater 产物 | `60110aa` | 06–07 |
| CI Node24 / pin runners | `ea94e42` | 06, 10 |
| 分支保护文档 | PR docs/protection | 10 |
| 本教材 | `3f4a97f` + 本轮扩写 | 09 |
| 包管理 | `68aa339` `d798362` | 11 |
| 运行时硬化 | `f9cc5ba` `7eaf32d` `0db6b62` `6bc6223` | 12 |
| UI 浮层顶栏 / 海浪无缝 / 时区墙钟 | `ce863f6` `909a0cb` + SeaMarquee 续 | 04 附录 B · 05 附录 B · 12 附录 A |
| Issues #16–#19 功能与周期教材 | `fix/issues-16-19` | 13 |

```bash
git log --oneline --reverse
```

## 源材料优先级

1. **代码与 git** — 最终真相  
2. **PRODUCT / DESIGN / usecases** — 产品真源  
3. **本 records** — 教学叙事  
4. **TODO** — 原始口语，有重复、缺漏、乱序，不要当唯一规格  

## 给授课者的 10 分钟开场

1. 打开 `PRODUCT.md` 读 Anti-references（先讲「不要做成什么」）。  
2. 打开 `TODO` 任意一段海浪相关抱怨 → 跳到 record 04 看如何结构化。  
3. 打开 GitHub Actions 绿勾与 `v0.2.0` Release 资产列表 → 证明「可交付」。  
4. 强调：**好的 AI 协作 = 好的边界 + 好的验收 + 诚实的偏差记录**。
