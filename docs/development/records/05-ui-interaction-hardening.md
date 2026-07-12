# 05 · 交互硬化：状态机、层级与反馈

## 1. 思想：好看之后，要「经得起连点」

沉浸式 UI 完成后，用户进入 **真实操作压测**：

- 时间 popup 与下一张 card 抢 active  
- 手动执行 dialog 卡到任务结束  
- FAB 盖住日志 Drawer  
- 成功无反馈 / 删除无效  

这些不是美术问题，是 **交互状态机 + 层叠上下文 + 异步边界** 问题。  
思想：

> 每个异步动作都有显性状态；每个浮层都有明确宿主（portal）与 z 序；每个破坏性操作都有确认与真删除。

### 需求动机

- 闹钟产品 **误触成本高**（误跑 binary）→ 二次确认  
- 动森风仍要 **清晰反馈**（dev.1 可爱文案）  
- 托盘/多入口打开日志 → 与主界面 FAB 冲突  

---

## 2. 原始 prompt 拆解

### 2.1 高质量缺陷报告模板（用户已接近）

```text
[Image] add button 怎么会被遮挡
手动执行：dialog 确认后应消失，但一直等到任务结束
被执行 item 按钮状态要变，防止再次触发
tray 打开日志 → FAB 浮在 drawer 上
drawer 底部 height 裁切日志；后来无法滚动
保存成功 / 手动执行成功 / 设置保存 → 要 toast
删除要真实有效；删除与手动执行换位
```

### 2.2 为什么「好」

| 要素 | 作用 |
| --- | --- |
| 图 | 定位遮挡物 |
| 期望 vs 实际 | dialog 生命周期 |
| 防误触 | busy 态 |
| 多入口 | tray vs 主界面 |
| 验收文案 | 具体 toast 句子 |

### 2.3 可进一步结构化的写法

```markdown
## Bug
标题：手动执行确认框生命周期错误
## 复现
1. … 2. …
## 期望
确认后 dialog 立即 close；item.status=running；run 按钮 disabled
## 实际
dialog 直到 run_alarm_now resolve 才关
## 范围
不要改调度算法
```

---

## 3. 给 AI 的提示模板（交互 bug 包）

```markdown
按严重级别修下列问题，每个问题单独 commit 或同一 commit 内分节说明：
1) …
约束：
- 浮层用 portal 到 document.body
- 列表项用状态机：idle|running|busy|error（禁止散落 isLoading 布尔）
- toast 用 src/ui/toast（非库 Notification）
验收：手测步骤…
```

---

## 4. 功能划分

| 模块 | 职责 |
| --- | --- |
| `toast.ts` | 全局反馈，高 z-index |
| Dialog/Modal | 仅确认，不承担长任务等待 |
| Alarm card actions | 按 status 禁用 |
| Logs Drawer | 独立滚动容器；打开时 `body.callai-logs-open` |
| FAB | portal；日志打开时隐藏 |
| Backup UI | 删除确认 + 最多 10 份（`c5b6dc7`） |
| Time popup | 焦点隔离，防 card 抢 active |

### i18n 同步

`514c873` 为 time picker / tray / notify 补中英文——**交互文案与功能同 PR 或紧随**，避免半截 i18n。

---

## 5. 推进流程

```text
1. 列 bug 表（用户原话 → 期望状态机）
2. 先修数据正确性（删除无效）
3. 再修异步 UX（dialog/busy）
4. 再修层叠（portal/z-index/FAB）
5. 统一 toast 文案（对照 dev.1）
6. 回归：tray 开日志、快速连点 run、滚动中开 time popup
```

---

## 6. 真实执行与偏差

| Commit | 内容 |
| --- | --- |
| `514c873` | 时间轮选 + tray/i18n 文案 |
| `c5b6dc7` | 备份删除 + 上限 10 + 测试 |
| `8ae654c` | IconButton 化 |
| `7d39013` | 自定义 toast；busy 禁用；FAB portal；z-index |
| `2b5c142` | drawer 滚动链；日志开时藏 FAB；Vite8 plugin |

偏差示例：

- 用库 `Notification` → 被卡片/drawer 挡住 → **换 portal toast**  
- dialog 绑定 promise → **确认与执行解耦**  
- FAB 在页面 DOM 内 → overflow 裁切 → **createPortal**  

---

## 7. 状态机示意（教学板书）

```
item: idle ──run confirm──► running ──ok──► idle
                 │              └──err──► idle (toast)
                 └──cancel──► idle

drawer: closed ──open──► open（FAB hidden, scroll body）
```

---

## 8. 验收清单

- [ ] 确认执行后 dialog 立即关  
- [ ] running 时 run/edit/delete 不可点  
- [ ] 删除后 list 与磁盘/DB 均无该项  
- [ ] 日志 drawer 可滚到底，水印不挡滚动  
- [ ] tray「日志」与 settings 入口体验一致  

## 9. 练习

1. 为 `run_alarm_now` 写前端状态机伪代码。  
2. 说明为何 toast 要 `warm` 启动（`7d39013` perf 注释思想）。  
3. 设计「连点 5 次 run」的自动化测试断言。  

## 10. 关键

`src/ui/toast.ts` · `SettingsPage` backups · `HomePage` run dialog · `2b5c142`

---

## 附录 · 设置控件形态

时区等「长选项」不要用 segmented 堆按钮；与 **TimePicker / DurationPicker** 一致：触发器 + portal 滚轮/列表 + 确认。  
调度模式扩展（每天/每周/每月/cron）见 record 12 附录 A。

---

## 附录 B · Floating overlay chrome 与「不要分段顶栏」（2026-07 续）

> 证据：`edit-hero` / `home-hero` · `animal-tabList` 浮层 · commits 含 `909a0cb` 及后续 CSS 修正  
> 口语：`edit header 和 body 分开` · `要直接覆盖下面` · `参考 tabList` · `去掉背景` · `home 顶部分割线/shadow`

### B.1 思想：Chrome 是**叠层**，不是**文档流两段**

用户要的不是「好看 sticky 灰条」，而是：

> **Floating overlay controls over a full-bleed scrolling surface**  
> （浮层控件叠在整页可滚内容之上；content scrolls underneath）

| 术语 | 含义 | 本项目例子 |
| --- | --- | --- |
| Floating chrome | 顶栏/Tab 浮在内容上 | `animal-tabList` 胶囊、`edit-hero` |
| Overlay header | absolute/fixed 叠内容 | edit 顶栏盖住表单 |
| Chrome-less / panel-less | 无卡片底、无分割线 | 透明 `edit-hero` / `home-hero` |
| Sticky section bar | 吸顶但仍像两段布局 | **易错成「和 body 分开」** |

**产品动机：**

1. 动森小窗垂直空间紧——顶栏占流会挤掉表单。  
2. 与底部 tab 浮层 **同一套空间语言**（上下都是 overlay，不是框中框）。  
3. 编辑页 immersive：无底部 tab 时，更要用浮层顶栏保持「工具浮在岛上」。

### B.2 原始 prompt 拆解

| 用户原话 | 为什么好 | Agent 应抽出的验收 |
| --- | --- | --- |
| 顶部还是和 body 分开 | **否定当前结构**（flex 分栏失败） | 禁止 header/main 上下分栏占流 |
| 直接覆盖底部的感觉 | **叠盖关系** | `position:absolute` + 内容 `padding-top` |
| 参考 `#root … animal-tabList` | **金样例**（可抄 CSS 模式） | 对照 tabList 的 absolute + z-index + 透明底可选 |
| 去掉 header 背景 | **chrome-less** | `background/border/shadow: none` |
| body 顶 shadow 像 line | **像素级缺陷** + 截图 | 去掉 `border-bottom`/`box-shadow` |

**可复制的专业需求句（以后直接用）：**

```text
顶栏做 floating overlay、chrome-less；内容 scroll underneath。
参考 animal-tabList 浮层。不要 sticky 分段面板，不要 card 底。
```

### B.3 功能 / 结构划分

| 表面 | 布局契约 |
| --- | --- |
| `app-shell.with-tabs` | tabList `position:absolute; top…; z-index:300`；content 全高滚动 |
| `app-shell.immersive-edit` | `edit-page` relative 满高；`edit-hero` absolute 浮层；`edit-main` absolute inset 滚动 |
| `home-hero` | 可 sticky，但 **无底部分割线**；列表紧贴，不靠阴影「切开」 |

### B.4 推进流程（agent 串行）

```text
1. 用 DevTools 确认：header 与 main 是 flex 兄弟还是 overlay
2. 若 flex 分栏 → 改 absolute overlay（对照 tabList）
3. main 全区域滚动 + padding-top 为浮层让路
4. 去掉 panel 视觉（bg/border/shadow/blur）
5. 截图对比用户「分开/盖住」二词
6. 检查 dark 主题覆盖规则是否又加回背景
```

### B.5 偏差与调整

| Commit / 改动 | 意图 | 偏差 | 调整 |
| --- | --- | --- | --- |
| `909a0cb` | edit 顶栏像 home | 先做成 sticky 灰条，仍「分段」 | 改为 absolute 浮层 + main 全页滚 |
| 半透明 blur 面板 | 「高级」 | 用户要的是 **透明 HUD** 不是 glass card | 强制 transparent |
| home sticky + border-bottom | 吸顶可读 | 列表上方出现 **line/shadow** | 去掉 divider/shadow |

### B.6 交互扩展

- **TimezonePicker / DurationPicker / TimePicker**：同一「触发器 + portal + 确认」家族，**禁止** segmented 堆 IANA 列表（见附录·设置控件形态）。  
- 浮层顶栏按钮必须 `pointer-events: auto`，装饰 `none`。  
- z-index 阶梯：列表 < 海浪 footer(30) < 浮层顶栏/tab(300) < toast/tooltip(2e4+)。

### B.7 给 AI 的提示模板（顶栏浮层）

```markdown
## Goal
Edit/new alarm header as floating overlay chrome (not document-flow section).

## Pattern (copy from tabs)
- Container: position relative; full height; overflow hidden
- Header: position absolute; top/left/right inset; high z-index
- Body: position absolute; inset 0; overflow-y auto; padding-top clears header
- Header chrome-less: no background, border, box-shadow, backdrop-filter

## Do not
- flex-column with flex:0 header + flex:1 scroll (looks "split from body")
- sticky bar with border-bottom divider line
- card/surface panel behind title

## Reference selectors
- Floating tabs: .main-tabs [class*="animal-tabList"]
- Edit: .edit-page > header.edit-hero over .edit-main
```

### B.8 验收

- [ ] 编辑页滚动时，内容从标题/按钮 **下方穿过**，不是整页被顶栏切开  
- [ ] 顶栏无实色底、无描边胶囊（除非产品明确要 pill）  
- [ ] 闹钟列表顶无细线/阴影分割  
- [ ] 与顶部 tab 浮层同一「叠在内容上」的语言  

### B.9 关键

`src/pages/EditAlarmPage.tsx` · `src/theme/global.css`（`.edit-hero` / `.home-hero` / `.main-tabs … tabList`）

