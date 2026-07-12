# media — 截图与演示视频优化

把 CleanShot / 系统录屏产出的大图、大视频，变成适合 GitHub README 的体积。

## 依赖

- `ffmpeg`
- `img2webp`（Homebrew `webp`）
- Python3 + 脚本内自动创建的 `assets/screenshot/.venv`（Pillow）

可选：ImageMagick `magick`（品牌脚本会用到；本脚本主路径用 Pillow）。

## 输入 / 输出约定

```
assets/screenshot/
  alarms.png ... settings.png   # 工作副本（可被覆盖为优化版）
  record.mp4                    # 压缩后的演示视频
  original/                     # 原始备份（gitignore，禁止提交）
  .venv/                        # 本地工具 venv（gitignore）

docs/assets/screenshot/         # README 引用（提交）
  *.png / *.webp                # 静帧
  record-preview.webp|.gif      # 短预览（约 12s @1.4×）
  record.mp4 / record.webp      # 完整演示（压缩后）
```

## 一键执行

```bash
# 首次：把「未压缩原始」放进 original/，或直接覆盖 assets/screenshot/* 后运行
# 脚本会在 original/ 不存在对应文件时，从当前 assets/screenshot 备份一次

just optimize-screenshots
# 或
./scripts/media/optimize_screenshots.sh
```

## 参数语义（写死在脚本里，改脚本即可）

| 产物 | 策略 |
| --- | --- |
| 静帧 PNG | Pillow `optimize + compress_level=9` |
| 静帧 WebP | quality≈86，method=6 |
| 完整 MP4 | `setpts=PTS/1.4`（约 1.4 倍速），x264 crf 28，无音轨 |
| 完整 WebP 动图 | fps 6，宽 300，lossy q≈40 |
| 预览 GIF/WebP | 从 5s 起取 12s，再 1.4×，宽≈300 |

## 复用流程（给下一次素材）

1. 录屏 / 截图放到 `assets/screenshot/`（或直接写入 `original/`）
2. 运行 `just optimize-screenshots`
3. 在 `README.md` / `README.zh.md` 引用 `docs/assets/screenshot/*`
4. `git status` 确认 **没有** `original/` 或 `.venv/`
5. 提交 docs 产物；原始大文件只留本机

## 体积参考（本仓库一次实战）

| 文件 | 原始量级 | 优化后量级 |
| --- | --- | --- |
| 单张 UI PNG | ~250–290KB | PNG ~200–230KB · WebP ~50–60KB |
| record.mp4 | ~69MB | ~3.3MB @1.4× |
| 预览动图 | — | WebP ~230KB · GIF ~500KB |

## 故障排查

- `img2webp: command not found` → `brew install webp`
- `externally-managed-environment` → 不要用系统 pip；脚本会用 venv
- ffmpeg 无 `libwebp` 编码器 → 用帧序列 + `img2webp`（脚本已采用）
