# 05 · 交互硬化：层级、Toast、日志 Drawer

## 学员目标

- 修「popup 被下一张 card 抢 focus / 遮挡」类问题  
- 成功反馈统一走自定义 toast（非易被遮挡的库通知）  
- 日志 Drawer 可滚动、不与 FAB 打架  

## 原始诉求（摘要）

- 时间 popup 与下一 card 来回跳动  
- 保存成功 / 手动执行成功要提示  
- 删除要真有效；删除与手动执行按钮换位  
- tray 开日志时 FAB 浮在 drawer 上  
- drawer 底部高度裁切日志；随后无法滚动  
- 手动执行 dialog 确认后应立刻关，item 进入 running 防连点  

## 关键提交

| Commit | 说明 |
| --- | --- |
| `7d39013` | 自定义 toast（body portal） |
| `2b5c142` | drawer 滚动、FAB 隐藏、vite react 插件 |

## 关键文件

- `src/ui/toast.ts`
- `src/pages/LogsPanel.tsx`
- `src/pages/HomePage.tsx`（运行确认 dialog）

## 模式总结

| 问题 | 模式 |
| --- | --- |
| 浮层被裁切 | portal 到 `document.body` + 足够 z-index |
| FAB 压住 drawer | `body.callai-logs-open` 隐藏 FAB |
| 长任务 dialog | 确认后立刻 close，异步任务状态机在列表项上 |
| 库组件层级不够 | 自研薄封装 toast，而不是硬刚 CSS |

## 练习

1. 写 E2E 用例提纲：打开时间 popup → 滚动列表 → popup 仍应稳定。  
2. 说明为何 `Notification` 组件不适合当全局成功提示。
