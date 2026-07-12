# 04 · 沉浸式 UI：组件语义、海浪与动效

## 1. 思想：UI 迭代不是「换皮肤」，是「换信息架构 + 物理层」

callai 的 UI 长对话非常典型：

- 用户 **不换设计系统**（animal-island-ui）  
- 但强烈要求 **空间叙事**：海浪压列表、贴纸 abs、Tab 变浮层  
- 同时要求 **组件语义对齐官网**（Footer / Drawer / Time / Tag / Progress）  

核心思想：

> 先选对组件的「角色」，再调像素；先定 z-index 物理层，再谈颜色。

### 为什么需求会这样演化

1. MVP 能用之后，用户开始 **用截图说话**（比抽象形容词准）。  
2. 「像闹钟」不够，还要「像小岛」——情绪价值。  
3. 顶栏信息过重 → 沉浸式底部 Tab + 日志降级。  

---

## 2. 原始 prompt 群像与拆解

### 2.1 结构型需求（好）

```text
把顶栏改成底部 tabs，日志入口放到 settings 底部
https://…/animal-island-ui/#/footer 拿来做 tab
#/drawer 看日志；#/progress 下次执行；#/time 时间
icon button 更美观；不要切换设计语言，impeccable 仅参考
```

**好在哪**：

- 有 **信息架构变更**（Tab 位置、日志降级）  
- 有 **组件级引用**（URL 锚点 = 具体 API 心智）  
- 有 **负向约束**（不换设计语言）  

### 2.2 像素型需求（好，但需 agent 会看图）

```text
海浪占用太多 / 颜色太深 / 接缝空隙 / 船被裁剪
前后海浪高度 offset；abs 盖住列表；背景透明
card in card；时间用 Tag，过多 (+N)
文案改 callai / Ciallo～
执行时小鸟摇晃、轻跳；tab 水平循环滚动
```

**好在哪**：每句几乎对应一个 **可验证 UI bug** 或 **动效验收**。

### 2.3 差的写法对比

| 差 | 好 |
| --- | --- |
| UI 优化一下 | 禁止 card-in-card；列表项才用 card |
| 海浪不对 | 前景/中景/远景三层，y-offset=…，接缝无缝 |
| 动效酷炫点 | running=`soft-shake` 800ms ease；idle=`breathe` |

---

## 3. 给 AI 的提示模板（布局迭代）

```markdown
## 不变
- 设计系统：animal-island-ui only
- 品牌文案：callai / Ciallo～(∠・ω< )

## 信息架构
- 主导航：底部 tabs = [alarms, settings]
- 日志：settings 内入口 → Drawer

## 物理层 z-index（低→高）
list < sea layers < floating tabs < FAB < modal < toast < drawer

## 组件映射
- 时间展示：Tag（多值 +N）
- 时间编辑：Time popup（滚动选择）
- 日志：Drawer
- 下次执行：Progress

## 验收（截图）
- [ ] 无 card-in-card
- [ ] 海浪不裁船、接缝无空隙
- [ ] 对比度 dark/light 可读
```

---

## 4. 功能 / 界面划分

| 表面 | 职责 | 非职责 |
| --- | --- | --- |
| Home | 列表、状态、进度、FAB | 复杂筛选器 |
| Edit | 时间+任务强绑定表单 | 日志 |
| Settings | 主题/语言/备份/更新/日志入口 | 调度核心 |
| Drawer Logs | 只读历史 | 编辑闹钟 |
| Sea/Stickers | 情绪与品牌 | 承载点击（除装饰外 hit-test 要让出） |

### 交互扩展

- Tab marquee：降低「工具感」  
- 鸟 motion 绑定 `running|busy`：状态可见性  
- Tag +N：信息密度控制  

---

## 5. 推进流程

```text
1. 信息架构 PR（路由/tab 状态）——先可点
2. 去 card-in-card 与对比度（可用性）
3. 海浪层与 z-index（氛围）
4. Time/Tag/Progress 组件替换
5. 动效与 marquee（锦上添花）
6. 每步截图对比用户图
```

**原则**：先可访问性与结构，后氛围；否则永远在拧海浪。

---

## 6. 真实执行与偏差

| 用户说 | Agent 易错 | 纠偏 |
| --- | --- | --- |
| abs 海浪盖列表 | 用占位推高 footer | `position:absolute` + 列表 padding-bottom |
| 透明 footer | 只改一层 | 查伪元素/叠加带 |
| 不换设计语言 | 引入另一套 CSS 框架 | prompt 负向约束 + code review |
| icon button | 去掉文字导致无障碍 | `aria-label` / tooltip |

代表提交：`8ae654c`（icon buttons）、后续 UI fix 合入 `7d39013` `2b5c142` 等。

---

## 7. 验收清单

- [ ] 底部 tabs 可点，且不与海浪抢 hit-test  
- [ ] dark 模式正文对比度可读  
- [ ] 多触发时间 Tag 溢出 `+N`  
- [ ] running 状态鸟动画可感知但不可恶心（尊重 reduce-motion 更佳）  

## 8. 练习

1. 把用户五句海浪抱怨改写成 z-index + CSS 变量表。  
2. 设计 `prefers-reduced-motion` 下降级策略。  
3. 评审：为何日志不是第三个 Tab？（用 PRODUCT 轻量原则论证）  

## 9. 关键

`src/pages/*` · animal-island-ui docs · `usecases/basic.md`
