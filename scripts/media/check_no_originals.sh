#!/usr/bin/env bash
# Fail if huge original screenshot sources are staged or tracked.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

bad=0
if git ls-files --error-unmatch 'assets/screenshot/original/*' >/dev/null 2>&1; then
  echo "ERROR: assets/screenshot/original/* is tracked by git" >&2
  git ls-files 'assets/screenshot/original/*' >&2 || true
  bad=1
fi

# staged paths
if git diff --cached --name-only | grep -E 'assets/screenshot/original/|assets/screenshot/\.venv/' >/dev/null 2>&1; then
  echo "ERROR: original/ or .venv staged" >&2
  git diff --cached --name-only | grep -E 'original|\.venv' >&2 || true
  bad=1
fi

# size guard for staged media under docs/assets/screenshot (optional soft warn)
while IFS= read -r f; do
  [[ -z "$f" || ! -f "$f" ]] && continue
  sz=$(wc -c <"$f" | tr -d ' ')
  if (( sz > 15000000 )); then
    echo "ERROR: staged file too large (>15MB): $f ($sz bytes)" >&2
    bad=1
  fi
done < <(git diff --cached --name-only | grep -E 'assets/screenshot|docs/assets/screenshot' || true)

if (( bad )); then
  exit 1
fi
echo "OK: no original screenshot sources tracked/staged"
