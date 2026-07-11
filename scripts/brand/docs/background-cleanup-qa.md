# 背景清理与 QA 指南（callai brand）

本文档说明 logo / UI elements 透明化的**正确策略**、禁止做法、自动化 QA 与排障步骤。  
源艺术特征：奶油羊皮纸底 + 圆角卡片；主体（麻雀肚皮、闹钟盘）也是米色。

## 1. 核心原则（必读）

> **只删除「与画面边缘连通」的奶油背景。**  
> **绝不要按颜色全局去掉奶油色**——否则会把麻雀肚皮/闹钟盘抠穿。

| 可以做 | 不能做 |
|--------|--------|
| 从四边/四角 flood-fill 背景 | ` -transparent cream` 作用于整图 |
| 只处理 alpha 通道（threshold / morph） | 把整图转 gray 再当结果输出 |
| 用主体 mask 保留中间连通块 | 用「近白像素全图统计」当 QA（主体本身近白） |

直观理解：

```
[ 边缘奶油底 ──连通── 边缘奶油底 ]  →  删掉
[           麻雀肚皮奶油色        ]  →  保留（与边缘不连通）
```

## 2. 推荐流水线（已实现）

### Logo — `remove_cream_bg`（`scripts/brand/lib.sh`）

1. **Border flood-fill**  
   多点从边界用 `fuzz`（默认 `13%`）填奶油色 → 变透明。  
   此时中间主体仍是不透明（即使颜色也是奶油）。
2. **只动 Alpha**  
   ```
   -channel A -threshold 8% -morphology Erode Disk:1 -morphology Dilate Disk:1 +channel
   ```  
   去掉发丝线/淡灰 fringe，不改 RGB。
3. **trim + 透明 padding**
4. **守卫**  
   - 通道必须含 `rgb`  
   - type 不能是 `Bilevel`  
   - 中心像素 alpha ≥ 0.9（防肚皮被抠穿）  
   - 尺寸不能小得离谱  

### Elements — `remove_card_bg`

同一策略：格子 crop 后只 flood 边缘卡片底，alpha 清理，**不做全局奶油 transparent**。

## 3. 历史翻车记录

| 现象 | 根因 | 正确修法 |
|------|------|----------|
| 右下角一条浅线 | 边缘 AA 残留 | 边界 flood 后对 **alpha** 轻度 erode/dilate |
| 麻雀肚皮半透明/破洞 | 全局 `-transparent` 奶油色 | 禁止颜色抠图；只 flood 边缘连通区 |
| 输出变灰 / Bilevel | 中间步骤把 gray mask 写坏了 RGB | 始终保留彩色图；`PNG32`；`-channel A ... +channel` |
| 输出只剩十几像素 | connected-components / mask 过狠 | 去掉激进 CC；用简单 alpha morph |
| QA 全员 FAIL | 用「全图近白比例」当 residual | 只测外圈边缘条带；主体米色不算 residual |

## 4. 自动化 QA

```bash
just brand-qa          # scripts/brand/qa_background.sh
just brand-check       # 文件存在性
```

### `brand-qa` 检查项

| 检查 | 失败含义 |
|------|----------|
| `NON_RGB` / `BILEVEL` | 彩色丢失 |
| `TOO_SMALL` | 被错误 trim/mask 吃光 |
| `EDGE_RESIDUE` | 上下左右边条仍有近白不透明（可能是残线） |
| `SE_RESIDUE` | 右下角残线高发 |
| `EMPTY_ALPHA` | 几乎全透明 |

### 人工复核（仍建议）

```bash
# 黑底看浅色残线
magick assets/brand/callai-icon-master.png \
  -background '#111' -alpha remove -alpha off -resize 400x400 \
  assets/brand/preview-dark.png

# 品红底：非品红即残留
magick assets/brand/callai-icon-master.png \
  -background '#ff00ff' -alpha remove -alpha off \
  assets/brand/qa-on-magenta-full.png

# 中心必须是实心主体（不该透明）
magick assets/brand/callai-icon-master.png \
  -gravity Center -crop 1x1+0+0 +repage -alpha extract -format 'center_a=%[fx:mean]\n' info:
```

看图顺序：

1. 中心麻雀是否完整、不透  
2. 右下/底座下方是否还有浅横线  
3. 颜色是否正常（非灰剪影）

## 5. 调参顺序（残线还在时）

1. 略增 `BG_FUZZ`（`config.sh`，如 `12% → 14%`）— 仍只 flood 边缘  
2. 略增强 alpha erode（`Disk:1 → Disk:1.5`）— **只对 A 通道**  
3. 提高 alpha threshold（`8% → 12%`）  
4. **不要**加全局 cream `-transparent`  

主体被抠穿时：

1. 立刻检查是否误加了全局 transparent  
2. 减小 erode  
3. 确认 center alpha 守卫在报错  

## 6. 命令速查

```bash
just brand            # logo + elements + UI module
just brand-logo       # 仅 logo/icons
just brand-elements   # 仅切片
just brand-qa         # 背景残线 / 灰度 QA
just brand-check      # 产物存在性
```

脚本目录：`scripts/brand/`  
配置：`scripts/brand/config.sh`  
实现：`scripts/brand/lib.sh`

## 7. 发布前清单

- [ ] `just brand && just brand-check && just brand-qa`
- [ ] `file assets/brand/callai-icon-master.png` → RGBA / srgba，TrueColorAlpha  
- [ ] center alpha ≈ 1  
- [ ] `preview-dark.png` 右下无浅线、主体不透  
- [ ] `just dev` 托盘/窗口 icon 颜色正常  


## Hard vs soft QA

| 级别 | 项 | 说明 |
|------|----|------|
| Hard FAIL | NON_RGB / BILEVEL / TOO_SMALL / EMPTY_ALPHA / **CENTER_HOLE** | 必须修；中心透明=主体被抠穿 |
| Soft WARN | SE 近白 residual | 人工看 preview；脚底贴边可能误报 |

主体脚/阴影贴底是正常的，不要把 bottom strip 米色当 residual。
