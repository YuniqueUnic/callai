# scripts/

可复用的本地工程脚本。开发期优先走 `just --list`，需要细节时再打开本目录。

| 目录 / 脚本 | 用途 |
| --- | --- |
| [`brand/`](./brand/) | Logo / 托盘剪影 / elements 切片 / UI 模块生成与 QA |
| [`media/`](./media/) | 截图与演示视频压缩（PNG/WebP/GIF/MP4 1.4×） |
| [`check_versions.sh`](./check_versions.sh) | 校验 package / tauri / Cargo / README 版本一致 |

## 常用入口

```bash
just brand                 # 全量品牌资源
just brand-logo
just brand-elements
just brand-check
just optimize-screenshots  # README 截图 + demo 媒体
./scripts/check_versions.sh
```

## 不要提交的东西

| 路径 | 原因 |
| --- | --- |
| `assets/screenshot/original/` | 原始 69MB+ 录屏与未优化 PNG（仅本机备份） |
| `assets/screenshot/.venv/` | Pillow 虚拟环境 |
| `.keys/*.key` | Updater 私钥（公钥已写入 `tauri.conf.json`） |
| `assets/brand/_dbg*` / `qa-*.png` | 品牌抠图 QA 中间产物 |

仓库只保留 **已压缩** 的 `assets/screenshot/*` 与 `docs/assets/screenshot/*`。
