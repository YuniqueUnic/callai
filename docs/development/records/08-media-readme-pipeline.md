# 08 · 截图媒体优化与 README 展示

## 学员目标

- 建立「原始素材本机化 / 仓库只收优化产物」的卫生习惯  
- 会用 `scripts/media/optimize_screenshots.sh` 一键产出 README 资源  
- 在双语 README 中展示 WebP 静帧 + 1.4× 预览动图  

## 原始诉求（摘要）

> 压缩 `assets/screenshot/*` 图片；视频变 webp/gif 且 1.4 倍速；再增强 README.md / README.zh.md。  
> 后续补充：`original/` 太大，不该提交 GitHub。

## 关键提交

| Commit | 说明 |
| --- | --- |
| `d8d9182` | 优化媒体 + README 展示 |
| （本篇文档提交） | scripts 说明 + records + ignore 加固 |

## 路径约定

| 路径 | 是否提交 | 说明 |
| --- | --- | --- |
| `assets/screenshot/original/` | **否** | 原始 69MB 录屏等，gitignore |
| `assets/screenshot/.venv/` | **否** | Pillow 环境 |
| `assets/screenshot/*.{png,mp4}` | 可 | 优化后工作副本 |
| `docs/assets/screenshot/*` | **是** | README 引用 |

## 复现命令

```bash
# 1) 把原始大文件只放进 original/（勿 git add）
# 2) 优化
just optimize-screenshots
# 3) 检查
git check-ignore -v assets/screenshot/original/record.mp4
du -sh assets/screenshot/original docs/assets/screenshot
ls -lah docs/assets/screenshot/
```

## 脚本入口

- 说明：[`scripts/media/README.md`](../../../scripts/media/README.md)  
- 实现：[`scripts/media/optimize_screenshots.sh`](../../../scripts/media/optimize_screenshots.sh)  
- 总览：[`scripts/README.md`](../../../scripts/README.md)

## README 展示模式

- 静帧：优先 `.webp`（体积小）  
- 动效：`record-preview.webp`（短）+ 链接到 full `record.mp4` / `record.webp`  
- 安装说明与截图同一页，降低「下了打不开」客服成本  

## 练习

1. 把一段 30s 新录屏丢进 `original/`，跑脚本，对比体积表。  
2. 写一条 pre-commit 检查伪代码：禁止 `original/` 与 `*.mov` 进入 index。
