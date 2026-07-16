#!/usr/bin/env python3
"""Build callai plugin zip fixtures for import / conflict / delete QA.

Output: src-tauri/templates/plugin_packages/test/*.zip
Run from repo root:  python3 scripts/build_plugin_test_packages.py
"""
from __future__ import annotations

import json
import sqlite3
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src-tauri" / "templates" / "plugin_packages" / "test"

UI_BARE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CallAI Test Plugin</title>
  <style>
    :root { --bg:#f8f8f0; --ink:#4a3118; --primary:#19c8b9; --border:#c4b89e; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; font-family: Nunito, "Noto Sans SC", sans-serif;
      background: var(--bg); color: var(--ink); padding: 16px;
    }
    .card {
      border: 2px solid var(--border); border-radius: 16px; padding: 14px 16px;
      background: #fffdf8; box-shadow: 0 4px 0 rgba(121,79,39,.1);
    }
    h1 { margin: 0 0 6px; font-size: 18px; }
    .meta { color: #8a7b66; font-size: 12px; font-weight: 700; }
    /* Scope to page content — never style host #callai-host-bar buttons */
    .card button {
      margin-top: 12px; border: 2px solid #0f9f92; background: var(--primary);
      color: #fff; font-weight: 800; border-radius: 12px; padding: 8px 14px; cursor: pointer;
    }
    #out { margin-top: 10px; font-weight: 800; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <h1 id="title">Test Plugin</h1>
    <div class="meta" id="meta">loading…</div>
    <button type="button" id="btn">write settings.ping</button>
    <div id="out"></div>
  </div>
  <script>
    (async function () {
      const api = window.callai;
      const title = document.getElementById("title");
      const meta = document.getElementById("meta");
      const out = document.getElementById("out");
      const id = (api && api.pluginId) || "(no-id)";
      title.textContent = "QA · " + id;
      meta.textContent = "id=" + id + " · host chrome + settings 测试";
      document.getElementById("btn").onclick = async function () {
        if (!api || !api.storage) {
          out.textContent = "no callai.storage";
          return;
        }
        const prev = (await api.storage.get("settings")) || {};
        const next = Object.assign({}, prev, { ping: Date.now(), from: "test-package" });
        await api.storage.set("settings", next);
        out.textContent = JSON.stringify(next);
      };
    })();
  </script>
</body>
</html>
"""

UI_WITH_DATA = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"/><title>with-data</title>
<style>
body{font-family:Nunito,"Noto Sans SC",sans-serif;padding:16px;background:#f8f8f0;color:#4a3118}
.card{border:2px solid #c4b89e;border-radius:14px;padding:12px;background:#fffdf8}
</style></head>
<body><div class="card"><h1>QA with data</h1><p id="out">…</p></div>
<script>
(async()=>{const a=window.callai;const o=document.getElementById("out");
if(!a||!a.storage){o.textContent="no storage";return;}
const s=await a.storage.get("settings"); o.textContent="settings="+JSON.stringify(s);
})();
</script></body></html>
"""


def write_zip(
    path: Path,
    manifest: dict,
    ui: str,
    data_db: bytes | None = None,
) -> None:
    meta = {
        "schema": 1,
        "kind": "callai-plugin",
        "includes_data": data_db is not None,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "source": "test-fixture",
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        zf.writestr("callai-package.json", json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
        zf.writestr(manifest.get("ui") or "ui.html", ui)
        if data_db is not None:
            zf.writestr("data.db", data_db)


def make_sqlite_seed() -> bytes:
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        path = Path(tmp.name)
    try:
        con = sqlite3.connect(path)
        con.execute("CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT)")
        con.execute(
            "INSERT INTO kv VALUES ('settings', '{\"seed\":true,\"from\":\"with-data-fixture\"}')"
        )
        con.commit()
        con.close()
        return path.read_bytes()
    finally:
        path.unlink(missing_ok=True)


def main() -> None:
    bare = {
        "id": "qa-import-demo",
        "name": "QA Import Demo",
        "version": "1.0.0",
        "description": "Bare package for import / delete QA. Safe to install and remove.",
        "permissions": ["storage", "notification"],
        "ui": "ui.html",
    }
    conflict = {
        **bare,
        "version": "1.0.1",
        "name": "QA Import Demo (conflict)",
        "description": "Same id as qa-import-demo — conflict overwrite / rename / skip.",
    }
    other = {
        "id": "qa-import-other",
        "name": "QA Import Other",
        "version": "0.9.0",
        "description": "Second test id for multi-install without conflict.",
        "permissions": ["storage"],
        "ui": "ui.html",
    }
    with_data = {
        **bare,
        "name": "QA Import Demo (with data)",
        "description": "Includes data.db for import-with-data QA. Same id as bare package.",
    }

    write_zip(OUT / "qa-import-demo-bare.zip", bare, UI_BARE)
    write_zip(OUT / "qa-import-demo-conflict.zip", conflict, UI_BARE)
    write_zip(OUT / "qa-import-other-bare.zip", other, UI_BARE)
    write_zip(OUT / "qa-import-demo-with-data.zip", with_data, UI_WITH_DATA, make_sqlite_seed())

    for f in sorted(OUT.glob("*.zip")):
        print(f"{f.relative_to(ROOT)}  ({f.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
