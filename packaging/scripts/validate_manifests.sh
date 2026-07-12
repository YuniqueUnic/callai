#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
fail=0

need() {
  local f="$1"
  if [[ ! -f "$f" ]]; then
    echo "MISSING $f" >&2
    fail=1
  else
    echo "OK $f"
  fi
}

need "$root/packaging/homebrew/Casks/callai-app.rb"
need "$root/packaging/homebrew/Formula/callai.rb"
need "$root/packaging/scoop/bucket/callai.json"
need "$root/packaging/scoop/bucket/callai-cli.json"

if ! ls -d "$root"/packaging/winget/manifests/y/YuniqueUnic/Callai/*/ >/dev/null 2>&1; then
  echo "MISSING winget Callai manifests" >&2
  fail=1
else
  echo "OK winget Callai tree"
fi
if ! ls -d "$root"/packaging/winget/manifests/y/YuniqueUnic/Callai.CLI/*/ >/dev/null 2>&1; then
  echo "MISSING winget Callai.CLI manifests" >&2
  fail=1
else
  echo "OK winget Callai.CLI tree"
fi

python3 - "$root" <<'PY'
import json, sys
from pathlib import Path
root = Path(sys.argv[1])
for p in sorted((root / "packaging/scoop/bucket").glob("*.json")):
    json.loads(p.read_text())
    print("JSON", p.name)
for p in root.glob("packaging/winget/manifests/**/*.yaml"):
    text = p.read_text()
    if "PackageIdentifier:" not in text:
        raise SystemExit(f"bad winget manifest: {p}")
    print("YAML", p.relative_to(root))
PY

if command -v ruby >/dev/null; then
  ruby -c "$root/packaging/homebrew/Casks/callai-app.rb"
  ruby -c "$root/packaging/homebrew/Formula/callai.rb"
fi

if (( fail )); then
  exit 1
fi
echo "All packaging manifests present"
