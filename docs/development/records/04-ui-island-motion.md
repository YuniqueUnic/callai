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

---

## 附录 B · 海浪无缝滚动与缓动速度包络（2026-07 续）

> 证据代码：`src/ui/SeaMarquee.tsx` · `src/theme/global.css`（`.app-footer-band` / `.sea-layer-*`）  
> 相关口语：`TODO` / 会话 —「海浪没动 / 方向反 / 远近景 / 接缝空隙 / 宽屏右侧缺口 / 远景一条一条隔 400px / 要 bezier 时缓时急」

### B.1 思想：氛围层是**连续材质**，不是装饰碎片

海浪属于 **ambient layer**（氛围层）：

- **职责**：品牌情绪、深度（近/远）、与列表叠盖（scroll-under / overlay）  
- **非职责**：承载点击、表达业务状态（running 由鸟 motion / Tag 负责）

用户骂「一条一条 SVG」时，本质不是画得丑，而是 **平铺契约破了**：

> 无缝滚动 =「可平铺素材 + 边对边邻接 + 按单瓦片宽度取模」三件套。  
> 少一件就会出现缝、空带、宽屏露白。

### B.2 原始 prompt 拆解（为什么好）

| 用户说法 | 可执行信息 | 若只说「好看一点」会丢什么 |
| --- | --- | --- |
| 远景隔了约 400px | **量级线索**（tile 宽度/份数问题） | 只会乱加 opacity |
| 前景 1400px 宽后右侧缺口 | **视口依赖** → copies 必须随 `innerWidth` | 固定 3 张永远不够 |
| 远景用前景同款无缝 | **算法统一** 近/远同一 tiling 模型 | 远景另写一套容易再裂 |
| 时缓时急 + 贝塞尔 | **速度包络**，不是匀速 `px/s` | 只会改 base speed 常数 |
| `#root > … > .app-footer-band` | **真实 DOM 路径**（查透明底、裁剪） | 改错容器 |

**好 prompt 结构（提炼）：**

```text
1) 现象 + 视口条件（宽屏/远景）
2) 对比「谁是对的」（前景够长 / 远景不够）
3) 约束：同算法、无缝、曲线变速
4) 可选：DevTools 选择器
```

### B.3 为什么会有这些需求

1. **动森气质**：静止 footer 像 PPT；连续海浪像「岛还活着」。  
2. **信息密度**：列表要滚到底，海浪必须 **overlay** 而不是占文档流推高空白。  
3. **双层深度**：远景更淡、更高、反向漂，近景带船——没有无缝远景会「穿帮成贴纸」。  
4. **性能与可维护**：CSS `animation` 难做非匀速包络；`rAF` + 取模更可控。

### B.4 功能拆解

| 模块 | 职责 |
| --- | --- |
| `tileW = tileH × (1440/186)` | 保持 SVG 宽高比；**禁止**横向单独 stretch |
| `copies = ceil(viewportW / tileW) + 2` | 覆盖视口 + wrap 余量；resize 重算 |
| `x = modular(-tileW, 0]` | 无缝循环（瓦片边对齐时） |
| `seaSpeedPxPerSec` + cubic-bezier 包络 | 时缓时急；近/远 `phase` 错开 |
| `.sea-layer-far/near` | 仅高度/透明度/滤镜/底边偏移不同 |

### B.5 真实偏差链（教学重点）

| 次序 | 错误尝试 | 为何糟 | 纠偏 |
| --- | --- | --- | --- |
| 1 | 远景 `widthScale=1.35` 拉长 | **破坏可平铺接缝** → 条带间隔 | 取消非等比缩放 |
| 2 | 固定 3～5 张 copy | 宽屏覆盖不足 | 视口驱动 copies |
| 3 | 远景 `left:-18%` 硬 bleed | 像补丁，仍可能裁切 | 与近景同「全宽 + 动态份数」 |
| 4 | 匀速 `speed` 常数 | 机械传送带 | bezier 分段包络 + 次级 ripple |
| 5 | 只改 CSS animation | 难做变速与双层相位 | `requestAnimationFrame` |

**用户验收句（最终）：**「现在没问题了」——远近都无缝，宽屏不露缺口。

### B.6 给 AI agent 的提示模板（海浪 / 无缝条带）

```markdown
## Goal
Seamless dual-layer sea marquee at app footer.

## Hard rules
1. Tile width MUST preserve SVG aspect ratio (no non-uniform widthScale).
2. copies = ceil(viewportWidth / tileWidth) + 2; recompute on resize.
3. Scroll with rAF; wrap x into (-tileWidth, 0] (one-tile modular).
4. Near/far share the same tiling algorithm; only height/opacity/filter/y-offset differ.
5. Speed uses cubic-bezier envelopes (calm→push→settle), phase-shift layers.
6. Footer band: fixed bottom, transparent, pointer-events: none; list has padding-bottom.

## Anti-patterns
- Stretching tiles horizontally to "look longer"
- Fixed copy count (3) on desktop 1400px+
- Separate far/near scroll math

## Verify
- Far layer has no 300–400px empty gaps between tiles
- At width≥1400, scroll 30s without right-side hole
- prefers-reduced-motion: static ok
```

### B.7 专业描述词汇（给产品/设计同步）

见会话约定，可在评审里直接用：

- **seamless infinite strip / modular marquee**  
- **ambient overlay**（氛围叠层）  
- **content scrolls underneath**（内容从装饰下穿过）  
- **speed envelope / easing profile**（速度包络）  

### B.8 验收清单（海浪）

- [ ] 远景连续，无「一条一条」空带  
- [ ] 近景宽屏长时间滚动无右侧缺口  
- [ ] 近/远反向 + 相位不同，但都无缝  
- [ ] footer 透明、不挡卡片点击（`pointer-events: none`）  
- [ ] reduce-motion 可静止  

### B.9 关键

`src/ui/SeaMarquee.tsx` · `.app-footer-band` · `public/brand/footer-sea.svg`

