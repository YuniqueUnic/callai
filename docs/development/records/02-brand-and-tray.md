# 02 · 品牌与托盘：视觉资产工程化

## 1. 思想：为什么品牌要「流水线」而不是「丢两张图」

动森风产品的可信度 50% 来自 **像素一致性**：

- 主 icon、托盘、UI 贴纸、favicon 必须像「同一个岛民」  
- macOS 托盘有特殊规则（template image），随手导出彩色 PNG 会在深色菜单栏变成脏斑  
- 抠图失败会反复出现：背景残边、主体内部被挖空、接缝露底  

因此需求不是「美工导出」，而是 **可重复脚本 + QA 语言 + just 入口**。  
否则每个 agent 会话都会重新发明一遍 ImageMagick 参数。

### 需求从何而来

1. **产品人格**（PRODUCT）：可爱、温和 → 需要原创吉祥物（麻雀）而非通用铃铛。  
2. **平台真实约束**：macOS menu bar 要 monochrome template。  
3. **迭代速度**：用户多次说「QA 有用」「用力过猛了」——说明需要可调参数，而不是一次性魔法。  

---

## 2. 原始 prompt 拆解

### 2.1 典型多轮（浓缩自对话 / TODO）

```text
[Image] 把这个修正一下，保留主图 icon，去除背景，作为软件 ICON 与 tray
[Image] elements 切割 + 去背景，命名准确，脚本放到 scripts
背景还有线 → 用 QA 流程
不行，主体内部也被抠穿了 → 找主体边缘，反向去掉非主体
只扣掉 30% 差不多 → 就这样
把无关 QA 图删掉，只留必要图片
tray 要 macOS 白/黑自适应
make_tray_template.py 这个咋用！？
```

### 2.2 为什么这些 prompt「有效」

| 说法 | 好在哪 |
| --- | --- |
| 附带 Image | 视觉 bug 用文字说不清；agent 可 `view_image` |
| 「保留主体 / 去背景」分句 | 目标函数清晰 |
| 连续校准（用力过猛→30%） | 把美学变成 **可调参** |
| 「脚本进 scripts」 | 强制资产工程化，防一次性 |
| 「删 QA 中间图」 | 仓库卫生 |

### 2.3 描述技巧：视觉需求的「可执行形容词」

少用：「好看一点」「高级感」  
多用：

- 托盘：**纯黑 RGB + alpha 剪影**，内部保留约 30% 高光孔  
- 背景：**棋盘格下无 >N px 连通残边**  
- 输出路径：`src-tauri/icons/trayTemplate.png` + `@2x`  

---

## 3. 给 AI 的提示模板（品牌类）

```markdown
## 输入
- 源图路径：…
- 用途：app icon / tray template / UI element sprite

## 硬约束
- tray：macOS template（黑+alpha），禁止彩色
- 禁止主体内部误透明（描述验收方式）
- 脚本输出到 scripts/brand，可 just 调用
- 中间 QA 图 gitignore，不提交

## 验收
- [ ] just brand-check 通过
- [ ] 浅色/深色菜单栏截图各一张
- [ ] 列出生成文件清单
```

---

## 4. 功能划分

| 子系统 | 职责 | 脚本 |
| --- | --- | --- |
| Logo → icons | 透明主图、多尺寸、icns/ico | `generate_logo_icons.sh` |
| Elements slice | 8×2 网格切片、去背、catalog | `slice_elements.sh` |
| UI module | `src/assets/elements/index.ts` | `generate_ui_module.sh` |
| Tray template | 剪影 + punch 比例 | `make_tray_template.py` |
| QA | 残边/灰度/过抠检测 | `qa_background.sh` |
| Orchestration | 全量 | `generate_all.sh` + `just brand*` |

---

## 5. 推进流程（真实有效顺序）

```text
1. 锁定源图：callai.logo.png / callai.elements.png
2. 先做 app icon（用户立刻在 Dock 看到反馈）
3. 再做 tray template（平台特殊，单独参数）
4. elements 切片 + 命名（对照 catalog）
5. 接入 UI（ElementImage）
6. QA → 调参 → 删除中间产物
7. just brand-check；提交时注意 Icon? 全局 ignore
```

---

## 6. 真实执行、偏差与纠偏

| 现象 | 原因 | 纠偏 | Commit |
| --- | --- | --- | --- |
| 背景残留线 | 去背阈值不足 | QA 扫连通域 | 对话多轮 |
| 鸟内部镂空 | 全局亮度 punch 过猛 | 轮廓 mask + 仅 30% punch | `e677adf` |
| CI 缺 icons | 本机 `~/.gitignore` 的 `Icon?` | `git add -f` + 文档 | `f3ab0ff` |
| bash 托盘难维护 | 逻辑膨胀 | Python 重写 | `e677adf` |

### 关键提交

- `263c12c` 品牌目录 + just  
- `8e945a3` tray template 接入  
- `e677adf` Python 托盘与质量提升  

---

## 7. 验收清单

- [ ] `just brand && just brand-check`  
- [ ] `python3 scripts/brand/make_tray_template.py --help`  
- [ ] 深色/浅色菜单栏托盘可读  
- [ ] `git check-ignore` 不误伤已 force-add 的 icons（或文档说明）  

## 8. 练习

1. 把 punch 改成 0.1 与 0.5，写观察笔记（各 3 句）。  
2. 为「禁止提交 QA 图」写一条 CI grep 规则草案。  
3. 向新人讲解：为何 template tray 不能是灰色抗锯齿描边彩图。  

## 9. 关键路径

`scripts/brand/*` · `src-tauri/icons/trayTemplate.png` · `src/assets/elements/`
