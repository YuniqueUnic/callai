# 08 · 媒体管线与 README：展示即产品

## 1. 思想：开源桌面应用的「商店页」就是 README

没有 App Store 详情页时：

- 截图 / 短视频决定 star 与下载  
- 大图拖垮 clone → 贡献者流失  
- 原始录屏 69MB 进库是事故  

思想：

> 原始素材本机化；仓库只收「教学与展示所需的最小体积」；流程脚本化。

---

## 2. 原始 prompt 拆解

```text
assets/screenshot/*.png + record.mp4
图片无损减小体积
video → webp 或 gif，速度 1.4 倍
然后再增强 README.md / README.zh.md
（后续）original 不该提交，太大了！！！
```

### 好在哪

- **输入路径列举完整**  
- **有明确变换参数**（1.4×）  
- **输出目标**（双语 README）  
- **后续纠偏**（禁止 original）显示用户有仓库卫生意识  

### 参数化描述技巧

不要说「压一下视频」，要说：

- 速度：`setpts=PTS/1.4`  
- 预览：从 5s 起 12s、宽 300、fps 8  
- 静帧：PNG optimize + WebP q≈86  

---

## 3. 给 AI 的提示模板

```markdown
## 输入
- assets/screenshot/（可先备份到 original/，gitignore）

## 处理
- 静帧：PNG optimize + docs webp
- 视频：1.4x，crf28 mp4；短 preview webp/gif；可选 full webp

## 输出
- docs/assets/screenshot/* 供 README
- 更新 README 中英 Demo/Screenshots 节

## 禁止
- 提交 original/、.venv/、>15MB 媒体

## 脚本
- 写入 scripts/media，just optimize-screenshots
- just check-media 守卫
```

---

## 4. 功能划分

| 脚本 | 职责 |
| --- | --- |
| `optimize_screenshots.sh` | 转码与导出 |
| `check_no_originals.sh` | 防 original 进库 |
| `scripts/media/README.md` | 人读流程 |
| README | 展示与安装叙事 |

体积经验（一次实战）：

| 产物 | 大约 |
| --- | --- |
| 原始 mp4 | 69MB |
| 优化 mp4 | 3.3MB |
| preview webp | ~230KB |
| 静帧 webp | ~50–60KB |

---

## 5. 推进流程

```text
1. 备份 original（gitignore）
2. 跑 optimize
3. check-media
4. 改 README 用 webp
5. 人工点开 preview 看是否过快/过糊
6. 提交 docs 产物 only
```

---

## 6. 真实执行与偏差

| 项 | 实际 |
| --- | --- |
| ffmpeg 无 libwebp | 改用帧序列 + `img2webp` |
| 全长 gif 过大 | 删全长 gif，留 preview |
| 重复 mp4 | assets + docs 各一份（工作副本 vs 展示）——可再收敛 |

Commits：`d8d9182`（媒体+README），`3f4a97f`（脚本文档与 check）。

---

## 7. 验收清单

```bash
just optimize-screenshots
just check-media
git check-ignore -v assets/screenshot/original/record.mp4
du -sh assets/screenshot/original docs/assets/screenshot
```

- [ ] README 图片在 GitHub 网页可加载  
- [ ] clone 体积不因误提交 original 暴涨  

## 8. 练习

1. 为课程录制 20s 新演示，走完整管线并填体积表。  
2. 写 pre-commit hook 伪代码调用 `check-media`。  
3. 讨论：为何 preview 用 webp 而 full 保留 mp4。  

## 9. 关键

`scripts/media/*` · `docs/assets/screenshot/*` · README Demo 节
