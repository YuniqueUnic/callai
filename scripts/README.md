# scripts/

仓库内可复用的运维 / 资产生成脚本。

## brand/

动森风品牌与 UI 插画流水线。详见 [brand/README.md](./brand/README.md)。

```bash
just brand          # 从 callai.logo.png / callai.elements.png 全量生成
just brand-check    # 校验产物
just brand-logo     # 仅 app / tray icons
just brand-elements # 仅 elements 切片 + UI module
```

## 约定

- 脚本默认在**仓库根**语义下解析路径（脚本内会 `cd` / 用绝对路径）。
- 生成物可提交，便于无 ImageMagick 环境也能构建 UI。
- 源艺术文件保留在仓库根：`callai.logo.png`、`callai.elements.png`。
