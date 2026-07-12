#!/usr/bin/env bash
# Mirror monorepo packaging/ into thin brew/scoop layout repos (user install UX).
# Requires: MIRROR_TOKEN (or GH_TOKEN) with write access to both mirror repos.
# Optional: TAG for commit message (default: unknown).
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
token="${MIRROR_TOKEN:-${GH_TOKEN:-}}"
tag="${TAG:-unknown}"
if [[ -z "$token" ]]; then
  echo "MIRROR_TOKEN/GH_TOKEN required" >&2
  exit 1
fi

mirror_repo() {
  local repo="$1" # owner/name
  local setup_fn="$2"
  local work
  work="$(mktemp -d)"
  git clone --depth 1 "https://x-access-token:${token}@github.com/${repo}.git" "$work"
  (
    cd "$work"
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  )
  # shellcheck disable=SC1090
  "$setup_fn" "$work"
  (
    cd "$work"
    git add -A
    if git diff --cached --quiet; then
      echo "${repo}: no changes"
    else
      git commit -m "chore: sync from callai packaging (${tag})"
      git push origin HEAD:main
      echo "${repo}: pushed"
    fi
  )
}

setup_homebrew() {
  local work="$1"
  mkdir -p "$work/Casks" "$work/Formula"
  cp -f "$root/packaging/homebrew/Casks/callai-app.rb" "$work/Casks/"
  cp -f "$root/packaging/homebrew/Formula/callai.rb" "$work/Formula/"
  cp -f "$root/packaging/mirror/homebrew-callai.README.md" "$work/README.md"
}

setup_scoop() {
  local work="$1"
  cp -f "$root/packaging/scoop/bucket/callai.json" "$work/callai.json"
  cp -f "$root/packaging/scoop/bucket/callai-cli.json" "$work/callai-cli.json"
  cp -f "$root/packaging/mirror/scoop-callai.README.md" "$work/README.md"
}

mirror_repo "YuniqueUnic/homebrew-callai" setup_homebrew
mirror_repo "YuniqueUnic/scoop-callai" setup_scoop
