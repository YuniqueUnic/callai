#!/usr/bin/env bash
# Fail if package.json / tauri.conf.json / Cargo.toml versions diverge.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
node_v="$(python3 - <<'PY' "$root"
import json,sys
from pathlib import Path
root=Path(sys.argv[1])
print(json.loads((root/"package.json").read_text())["version"])
PY
)"
tauri_v="$(python3 - <<'PY' "$root"
import json,sys
from pathlib import Path
root=Path(sys.argv[1])
print(json.loads((root/"src-tauri/tauri.conf.json").read_text())["version"])
PY
)"
cargo_v="$(python3 - <<'PY' "$root"
import re,sys
from pathlib import Path
root=Path(sys.argv[1])
text=(root/"src-tauri/Cargo.toml").read_text()
# first version in [package] section
m=re.search(r'(?m)^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"', text)
if not m:
    raise SystemExit("Cargo.toml package version not found")
print(m.group(1))
PY
)"
echo "package.json      = $node_v"
echo "tauri.conf.json   = $tauri_v"
echo "Cargo.toml        = $cargo_v"
if [[ "$node_v" != "$tauri_v" || "$node_v" != "$cargo_v" ]]; then
  echo "ERROR: versions must match across package.json, tauri.conf.json, Cargo.toml" >&2
  exit 1
fi
echo "OK: versions consistent ($node_v)"
