# 02 · 品牌与托盘素材流水线

## 学员目标

- 会用脚本从源图生成 app icon / tray template / UI elements
- 理解 macOS **template tray**（纯黑 + alpha，系统自适应）
- 建立「抠图 QA」意识：主体内透明、背景残边都会在真机露馅

## 原始诉求（摘要）

- 主 logo 抠透明 → app icon + tray  
- elements 精灵表切片、去背景、命名入库  
- 托盘要 macOS 白/黑自适应；剪影不要「用力过猛」把鸟内部抠穿  
- QA 有用，但最终只保留必要图片；脚本沉淀到 `scripts/`

## 关键提交

| Commit | 说明 |
| --- | --- |
| `263c12c` | 品牌资产 + just 工作流 |
| `8e945a3` | macOS tray template |
| `e677adf` | Python tray 生成与校准（~30% punch） |

## 关键文件

- `scripts/brand/*`（见 `scripts/brand/README.md`）
- `scripts/brand/make_tray_template.py`
- `scripts/brand/qa_background.sh`
- `src-tauri/icons/trayTemplate.png`、`nathan.k@example.net`

## 复现命令

```bash
just brand
just brand-logo
just brand-elements
just brand-check
python3 scripts/brand/make_tray_template.py --help
```

## 踩坑

1. **主体被抠穿**：用「找主体轮廓 → 反向清非主体」比全局阈值更稳。  
2. **全局 gitignore 的 `Icon?`**：会误伤 `src-tauri/icons/*`，CI 上出现 `trayTemplate.png` 找不到；解决：`git add -f` + 仓库 `.gitignore` 反注册说明。  
3. **QA 中间图别提交**：`assets/brand/qa-*.png` 已 ignore。

## 练习

1. 故意把 punch 比例调到 0.6，截图对比托盘可读性。  
2. 解释为什么 tray RGB 必须强制纯黑。
