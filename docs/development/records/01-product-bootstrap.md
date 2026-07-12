# 01 · 产品与用例读入：先规格，后代码

## 1. 思想：为什么这一步必须存在

AI agent 最常见的失败模式不是「写不出代码」，而是：

- **Scope 膨胀**：把闹钟做成 Airflow / n8n  
- **风格漂移**：动森风写成灰蓝 SaaS  
- **双源真相**：代码一种行为，嘴上另一种产品故事  

所以 callai 的第一推动力不是 `tauri init`，而是 **可读、可引用、可验收的规格**。  
`4eeb02e` 把 PRODUCT / README 问题陈述 / usecases 一次写齐，等于给后续所有 prompt 装上「导航仪」。

### 为什么会有 callai 这个需求（业务动机）

真实痛点（PRODUCT / README 一致）：

> 主流 AI 工具使用 **滚动额度窗口**。上午高强度用完，下午要干等窗口滑出。

用户要的不是「更强的调度器」，而是：

- 像定闹钟一样 **轻、固定、可忽略**  
- 后台安静跑，到点执行极轻量任务（`echo` / `codex exec hi`）  
- 有一点 **治愈感**，降低「我在黑科技运维」的心理负担  

这决定了后面所有技术选型：Tauri 本地、SQLite 简单、UI 用 animal-island-ui，而不是 K8s CronJob。

---

## 2. 原始 prompt 摘录与拆解

### 2.1 开场 prompt（`TODO` 末段，高质量样板）

```text
callai 的风格；一个可爱的 动森的风格的软件；
使用 animal-island-ui lib 做 tauri 的前端库；
ts + bun + react + vite 8+ + rust 技术栈；
dark/light， i18n 都需要支持； 不需要太复杂；就做成类似闹钟一样就行；
只是闹钟配置时还需要配置任务；

仔细阅读这里的所有文章了解项目需求；
…/README.md …/DESIGN.md …/PRODUCT.md …/usecases/*.md
```

### 2.2 为什么这段 prompt「好」

| 维度 | 表现 | 对 agent 的作用 |
| --- | --- | --- |
| **风格锚点** | 「动森」「可爱」 | 锁 UI 气质，减少默认 shadcn 灰风 |
| **组件库指定** | animal-island-ui + URL | 禁止另起设计系统 |
| **技术栈钉死** | TS/Bun/React/Vite8/Rust/Tauri | 避免「要不要用 Electron」讨论 |
| **复杂度上限** | 「不需要太复杂」「类似闹钟」 | 反膨胀 |
| **关键差异点** | 「闹钟配置时还要配置任务」 | 定义「配置即任务」 |
| **强制读规格** | 列出绝对路径文档 | 减少幻觉实现 |

### 2.3 仍可改进之处（教学：好 prompt 也能再尖）

原文缺的：

- **非目标**（后来写在 PRODUCT Anti-references，但首 prompt 可复述）  
- **验收句**（例如「主路径 3 步内完成新建」）  
- **分层约束**（UI/domain/infra）— 仓库 AGENTS.md 补了，但产品 prompt 可点一句  

### 2.4 反例：同样意图，糟糕写法

```text
帮我做一个 AI 定时任务系统，好看一点，跨平台，功能尽量多。
```

问题：无隐喻、无栈、无边界 → agent 会给你企业调度器骨架。

---

## 3. 如何把需求说清楚（可复用模板）

把「闹钟产品」类需求压成 6 块，直接复制给 agent：

```markdown
## 产品一句话
[谁] 在 [场景] 用 [产品] 完成 [核心动作]，而不是 [反例]。

## 体验隐喻
像 ____，不要像 ____。

## 技术钉死
前端/壳/语言/包管理器/UI 库：…

## 范围 In
- …
## 范围 Out
- …

## 必读
- 路径1, 路径2…

## 验收
- [ ] 主路径步骤 ≤ N
- [ ] 主题/i18n 从第一天可用
- [ ] …
```

**callai 填空示例**：

- 一句话：重度 AI 用户在固定工作时段，用 callai 自动触发轻量命令，平移滚动额度窗口。  
- 隐喻：像定闹钟 / 不要像 cron 控制台。  
- Out：工作流编排、团队权限、云同步（MVP）。  

---

## 4. 功能划分（从 usecases 拆）

### 4.1 用例优先级（`usecases/basic.md`）

| 优先级 | 用例 | MVP？ |
| --- | --- | --- |
| ★★★★★ | 日常额度窗口维护（到点执行） | 是 |
| ★★★★★ | 新建/编辑闹钟 | 是 |
| ★★★★ | 手动立即执行 | 是 |
| ★★★★ | 暂停/启用 | 是 |
| ★★★ | 日志 | 是（次级入口） |
| ★★ | 复制闹钟 | 可后置 |

### 4.2 信息架构（页面）

```
Home（列表） ──FAB──► Edit（新建/编辑）
   │                      │
   └──── Settings ←───────┘
              └── Logs（Drawer，非顶级 Tab）
```

日志后来被明确要求「从 Settings 进 / Drawer」，这是对「轻量优先」的交互落实，不是功能删减。

### 4.3 领域对象（给 agent 的最小模型）

- `Alarm`：name, schedule, binary, args, env, retry, enabled  
- `ExecutionLog`：status, timing, stdout/stderr, retry_count  
- `AppSettings`：theme, locale, notify, backup, retention  

domain 纯规则；I/O 进 infra。这是后续 CLI 与 GUI 共享的前提。

---

## 5. 交互扩展（规格里已埋下的「钩子」）

| 扩展点 | 来源 | 后续真实演化 |
| --- | --- | --- |
| 托盘菜单 | detail.md | `8e945a3` template tray + i18n 文案 |
| 可爱错误文案 | dev.1.md | toast 体系 `7d39013` |
| 配置备份 | i18n.md / dev.1 | 删除备份 + 最多 10 份 `c5b6dc7` |
| 时间选择 | basic/detail | wheel popup + min width 386 |
| 失败通知 | detail | macOS notification permission |

教学点：**好规格会预埋扩展点，但不强迫一次做完。**

---

## 6. 推进流程：如何提示 agent 快速开工

### 推荐顺序（对 agent 下指令时直接贴）

```text
1. 只读 PRODUCT.md DESIGN.md usecases/*，输出：
   - 一句话定位
   - In/Out 列表
   - 页面地图
   - 领域对象
   禁止写业务代码。
2. 搭建 monorepo 骨架：Vite React + Tauri + 空 domain 模块。
3. 实现 Alarm CRUD + 列表（mock 可）。
4. 接 SQLite + 调度 poller（20s）+ 单 worker。
5. 主题/i18n 最小可用。
6. 每步结束跑 just gate / 相关测试。
```

### 为什么「先只读再写」有效

- 降低 agent 跳读  
- 产出可 diff 的「理解备忘」  
- 讲师可在第 1 步就抓理解偏差  

---

## 7. 真实执行、偏差与调整

| 计划（规格） | 实际 | 偏差原因 | 纠偏 |
| --- | --- | --- | --- |
| 顶栏有日志入口 | 后改为 Settings + Drawer | 沉浸式 UI、减顶栏噪音 | prompt 明确「日志进 settings」 |
| 文案「我的 AI 闹钟」 | 改为 `callai` + `Ciallo～` | 品牌收敛 | 单行 prompt 改文案 |
| 仅 GUI | 增加 CLI/daemon | 服务器/无界面场景 | 03 篇 |
| animal-island Notification | 自研 toast | 层级/遮挡 | 05 篇 |

**关键提交**：

- `4eeb02e` — 规格与用户指南  
- `79dcbba` — 技术 README / 架构图 / 数据路径  

---

## 8. 验收清单

- [ ] 能用 30 秒向新人讲清 callai「是什么 / 不是什么」  
- [ ] 能指出主路径 4 步（开 App → 新建 → 配时间与 binary → 保存后台跑）  
- [ ] 能列出至少 4 条 Anti-references  
- [ ] 知道文档路径，不靠聊天记录回忆需求  

## 9. 练习

1. **改写练习**：把 `TODO` 里任意一段只含抱怨的 UI 话，改写成 §3 模板。  
2. **边界练习**：若用户说「再加个工作流编辑器」，写 5 句拒绝并给替代方案（模板闹钟）。  
3. **Agent 开场白**：写一段 ≤15 行的 system/user 混合提示，强制 agent 先输出 In/Out。  

## 10. 关键文件

- `PRODUCT.md` `DESIGN.md`  
- `usecases/basic.md` `detail.md` `dev.1.md` `i18n.md`  
- `4eeb02e` `79dcbba`
