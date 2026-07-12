# media — 截图与演示视频优化

把 CleanShot / 系统录屏产出的大图、大视频，变成适合 GitHub README 的体积。

## 依赖

- `ffmpeg`（仅处理 `original/record.mp4` 时需要）
- `img2webp`（Homebrew `webp`）
- Python3 + 脚本内自动创建的 `assets/screenshot/.venv`（Pillow）

## 输入 / 输出约定

```
assets/screenshot/
  original/                     # 原始备份（gitignore，禁止提交）
    alarm.dark.png              # 主页闹钟列表 · 暗色
    edit.light.png              # 编辑/新建闹钟 · 浅色
    edit.alarm.dark.png         # 编辑闹钟 · 暗色（可选第五张）
    logs.light.png              # 日志 drawer · 浅色
    settings.light.png          # 设置 · 浅色
    record.mp4                  # 可选演示录屏
  alarms.png …                 # 工作副本（脚本写出，gitignore，不提交）
  edit-alarm-dark.png
  record.mp4                    # 压缩后的演示视频（gitignore）
  .venv/                        # 本地工具 venv（gitignore）

docs/assets/screenshot/         # README 引用（提交）
  alarms.webp|.png
  new-alarm.webp|.png           # ← edit.light
  logs.webp|.png
  settings.webp|.png
  edit-alarm-dark.webp|.png     # ← edit.alarm.dark
  record-preview.webp|.gif
  record.mp4 / record.webp
```

### 文件名映射（`optimize_screenshots.sh`）

| `original/` 源文件 | docs / 工作副本 stem | README 标签 |
| --- | --- | --- |
| `alarm.dark.png` | `alarms` | Alarms · dark |
| `edit.light.png` | `new-alarm` | Edit alarm · light |
| `logs.light.png` | `logs` | Logs · light |
| `settings.light.png` | `settings` | Settings · light |
| `edit.alarm.dark.png` | `edit-alarm-dark` | Edit alarm · dark |

旧文件名（`alarms.png` / `new-alarm.png` 等）已废弃；脚本仅读上表，勿再放回 `original/`。

## 一键执行

```bash
# 1) 把最新截图放进 assets/screenshot/original/（上表文件名）
# 2) 优化并写出 docs/assets/screenshot/*

just optimize-screenshots
# 或
./scripts/media/optimize_screenshots.sh
```

无 `original/record.mp4` 时会 **跳过视频**，只更新静帧。

## 参数语义

演示视频默认 **1.7×**（`setpts=PTS/$SPEED`）。临时加速：`CALLAI_DEMO_SPEED=1.8 just optimize-screenshots`。


| 产物 | 策略 |
| --- | --- |
| 静帧 PNG | Pillow `optimize + compress_level=9` |
| 静帧 WebP | quality≈86，method=6 |
| 完整 MP4 | `setpts=PTS/1.7`，x264 crf 28，无音轨 |
| 完整 WebP 动图 | fps 6，宽 300，lossy q≈40 |
| 预览 GIF/WebP | 从 5s 起取 12s，再 1.7×，宽≈300 |

## 复用流程

1. 截图命名后放入 `assets/screenshot/original/`
2. 运行 `just optimize-screenshots`
3. `README.md` / `README.zh.md` 引用 `docs/assets/screenshot/*`
4. `git status` 确认 **没有** `original/` 或 `.venv/`
5. 提交 docs 产物；原始大文件只留本机

## 体积参考

| 文件 | 原始量级 | 优化后量级 |
| --- | --- | --- |
| 单张 UI PNG | ~250–300KB | PNG ~220–240KB · WebP ~55–85KB |
| record.mp4 | ~69MB | ~3.3MB @1.7× |
| 预览动图 | — | WebP ~230KB · GIF ~500KB |

## 故障排查

- `img2webp: command not found` → `brew install webp`
- `externally-managed-environment` → 脚本用 venv，勿用系统 pip
- 静帧 OK、视频慢 → 正常；可先只更新静帧（去掉 original/record.mp4）
- 缺 primary 源图 → 按上表补齐 `alarm.dark` / `edit.light` / `logs.light` / `settings.light`
