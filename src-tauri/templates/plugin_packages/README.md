# Plugin packages (fixtures + layout)

## Layout (marketplace-ready)

```text
<id>.zip
  manifest.json          # required
  ui.html                # or manifest.ui filename
  callai-package.json    # optional package meta (schema, includes_data, …)
  data.db                # optional — only when exported with data
```

`callai-package.json.kind` must be `callai-plugin`, `schema` currently `1`.

## Test fixtures

Path: [`test/`](./test/)

| File | id | Purpose |
|------|-----|---------|
| `qa-import-demo-bare.zip` | `qa-import-demo` | 首次导入、导出对照、删除 |
| `qa-import-demo-conflict.zip` | `qa-import-demo` | 同 id 冲突：覆盖 / 另存 / 取消 |
| `qa-import-demo-with-data.zip` | `qa-import-demo` | 含 `data.db` 的导入 |
| `qa-import-other-bare.zip` | `qa-import-other` | 第二 id，多插件并存 |

Regenerate:

```bash
python3 scripts/build_plugin_test_packages.py
```

### Manual QA checklist

1. **Import bare** — Plugins → 安装 zip / 拖入 `qa-import-demo-bare.zip` → 列表出现 QA Import Demo → 打开写 `settings.ping`。
2. **Conflict** — 再导入 `qa-import-demo-conflict.zip` → 弹冲突：覆盖 / 另存 / 取消。
3. **With data** — 删除 demo 后导入 `qa-import-demo-with-data.zip` → 打开应读到 seed settings。
4. **Multi** — 导入 `qa-import-other-bare.zip`，确认两 id 并存。
5. **Delete** — 删除两个 QA 插件（二次确认）后列表干净。
6. **Export** — 任意插件导出裸包 / 含数据，再回导入验证。

内置插件恢复/删除同样有二次确认；测试包 id 不以内置 id 命名，避免误伤 catalog。
