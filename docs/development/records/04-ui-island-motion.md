# 04 · 沉浸式 UI：海浪、Tab、动效

## 学员目标

- 在 **不换设计语言** 的前提下做布局升级  
- 使用 animal-island-ui 组件语义（Footer/Tab/Time/Drawer/Progress…）  
- 做出：浮层 Tab、海浪叠层、执行中小鸟动画  

## 原始诉求（摘要）

- 顶栏改底部 tabs；日志进 settings  
- 海浪要动、有远近、接缝对齐、别裁掉船  
- 海浪 abs 盖在列表上；顶部 Tab 同样叠层  
- 文案改为 `callai` / `Ciallo～`  
- 底部 tab 水平循环滚动；执行时小鸟摇晃/轻跳  
- 多用 icon button；参考 island 文档页  

## 关键提交（代表性）

| Commit | 说明 |
| --- | --- |
| `8ae654c` | 全面 icon button |
| `2b5c142` 等 UI 提交 | drawer / FAB / toast 与布局 |

（更早大量 UI 迭代在本地对话中完成，合并进后续 feat 提交；教学时以当前 `src/pages/*` + CSS 为准。）

## 关键文件

- `src/pages/HomePage.tsx`、`SettingsPage.tsx`、`EditAlarmPage.tsx`
- `public/brand/footer-sea.svg` 或等价海浪资源
- animal-island-ui 组件用法

## 设计决策（可板书）

1. **Card in card 禁止**：页面区用 band，card 只给列表项。  
2. **装饰元素 abs**：logo / 小鸟贴图大胆放大，而不是挤进 flex 行。  
3. **时间标签**：`Tag` 展示多个触发点，溢出用 `+N`。  
4. **动效曲线**：执行中 `shake`/`hop`，空闲 `breathe`。  

## 练习

1. 指出首页 z-index 栈：列表 < 海浪 < FAB < toast < drawer。  
2. 改一处海浪 offset 并说明如何用视觉 QA 验收接缝。
