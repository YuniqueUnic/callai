#!/usr/bin/env bash
# Fail if package.json / tauri.conf.json / Cargo.toml / docs versions diverge.
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
m=re.search(r'(?m)^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"', text)
if not m:
    raise SystemExit("Cargo.toml package version not found")
print(m.group(1))
PY
)"

manifest_v="$(python3 - <<'PY' "$root"
import json,sys
from pathlib import Path
root=Path(sys.argv[1])
print(json.loads((root/".release-please-manifest.json").read_text())["."])
PY
)"

readme_versions="$(python3 - <<'PY' "$root"
import re,sys
from pathlib import Path
root=Path(sys.argv[1])
pat = re.compile(r'x-release-please-version')
# capture version near markers: badge version-X.Y.Z or `X.Y.Z`
version_re = re.compile(r'(?:badge/version-|Current version:\*\*\s*`|当前版本[：:]\*\*\s*`)([0-9]+\.[0-9]+\.[0-9]+)')
found = []
for name in ("README.md", "README.zh.md"):
    text = (root/name).read_text()
    if "x-release-please-version" not in text:
        raise SystemExit(f"{name}: missing x-release-please-version marker")
    vs = version_re.findall(text)
    if not vs:
        # fallback: any badge/version- near file
        vs = re.findall(r'badge/version-([0-9]+\.[0-9]+\.[0-9]+)', text)
        vs += re.findall(r'`([0-9]+\.[0-9]+\.[0-9]+)`\s*<!--\s*x-release-please-version\s*-->', text)
    if not vs:
        raise SystemExit(f"{name}: could not parse documented version")
    # all documented versions in file must match
    if len(set(vs)) != 1:
        raise SystemExit(f"{name}: mixed versions {sorted(set(vs))}")
    found.append((name, vs[0]))
for name, v in found:
    print(f"{name}: {v}")
print("DOC_VERSIONS=" + ",".join(v for _, v in found))
print("DOC_OK=" + found[0][1])
PY
)"

doc_v="$(printf '%s\n' "$readme_versions" | sed -n 's/^DOC_OK=//p')"

echo "package.json                 = $node_v"
echo "tauri.conf.json              = $tauri_v"
echo "Cargo.toml                   = $cargo_v"
echo ".release-please-manifest.json= $manifest_v"
echo "$readme_versions" | grep -v '^DOC_'
echo "docs parsed version          = $doc_v"

if [[ "$node_v" != "$tauri_v" || "$node_v" != "$cargo_v" || "$node_v" != "$manifest_v" || "$node_v" != "$doc_v" ]]; then
  echo "ERROR: versions must match across package.json, tauri.conf.json, Cargo.toml, release-please manifest, and README*.md" >&2
  exit 1
fi
echo "OK: versions consistent ($node_v)"
