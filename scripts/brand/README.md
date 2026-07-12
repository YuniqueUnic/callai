# Brand asset pipeline

从源图生成 **应用 / 托盘 icon** 与 **UI 插画切片**，可重复执行。

## 源文件（仓库根）

| 文件 | 用途 |
|------|------|
| `callai.logo.png` | 主品牌图（鸟 + 闹钟）→ app/tray/favicon |
| `callai.elements.png` | 8×2 精灵表 → UI 插画 |

## 脚本

| 脚本 | 作用 |
|------|------|
| `generate_all.sh` | 全量：logo icons + elements 切片 + UI 模块 |
| `generate_logo_icons.sh` | 去背景 → `src-tauri/icons/*` + `public/*` |
| `slice_elements.sh` | 网格切片、去背景 → `src/assets/elements/*.png` + catalog |
| `generate_ui_module.sh` | 根据 catalog 生成 `index.ts`（及缺失时的 `ElementImage.tsx`） |
| `check.sh` | 校验产物是否存在、可被 ImageMagick 识别 |
| `config.sh` | 路径、命名、网格参数 |
| `lib.sh` | 去背景 / 缩放等公共函数 |

## 用法

依赖：`magick`（ImageMagick 7）、`python3`；macOS 生成 `.icns` 需要 `iconutil`。

```bash
# 推荐
just brand          # 全量生成
just brand-check    # 校验

# 或直接
./scripts/brand/generate_all.sh
./scripts/brand/generate_logo_icons.sh
./scripts/brand/slice_elements.sh
./scripts/brand/generate_ui_module.sh
./scripts/brand/check.sh
```

## 输出布局（只保留必要产物）

```
# 源图（仓库根，手改入口）
callai.logo.png
callai.elements.png

# 品牌中间态（尽量少）
assets/brand/
  callai-icon-master.png      # 透明主 logo（唯一品牌主图）
  callai-icon-1024.png        # 方图，供生成多尺寸 icons
  elements-catalog.json       # 切片目录元数据

# 应用真正使用
src-tauri/icons/              # Tauri / 托盘 / 安装包
public/favicon.png
public/icons/{app,tray,32,128,icon}.png
src/assets/elements/          # UI 插画 + catalog.json + index.ts
src/ui/ElementImage.tsx
```

调试目录 `assets/brand/_dbg*`、`qa-*.png`、`preview-*.png`、`elements-raw/` **不要提交**；`just brand` 也不会再默认写出 QA 预览图。

## 命名约定（elements）

见 `config.sh` 中 `ELEMENT_NAMES` 与 `element_usage.tsv`。改命名后请：

1. 更新 `config.sh`
2. `just brand`
3. 检查引用该 id 的页面（`ElementImage id="..."`）

## 去背景策略

对奶油色底（约 `#FCFCFD`）做多角 flood-fill。源图底色若变化，改 `config.sh` 里的：

- `BG_COLOR` / `BG_FUZZ`（logo）
- `ELEMENTS_BG_COLOR` / `ELEMENTS_BG_FUZZ`（切片）

## 注意

- `index.ts` 为生成物，勿手改；UI 接线改 `ElementImage` 与各 page。
- 商业分发时确认源图与 `animal-island-ui` 许可边界。

## 兼容性

脚本按 **macOS 自带 Bash 3.2** 编写（无 `declare -A`）。需要 ImageMagick 7 的 `magick` 命令。

## QA

背景残留 / 灰度损坏检查：

```bash
just brand-qa
```

完整说明与排障步骤见 [docs/background-cleanup-qa.md](./docs/background-cleanup-qa.md)。

## Related

- Screenshot/demo media: [`../media/README.md`](../media/README.md)
- Scripts index: [`../README.md`](../README.md)
