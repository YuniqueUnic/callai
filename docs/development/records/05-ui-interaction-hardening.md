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
