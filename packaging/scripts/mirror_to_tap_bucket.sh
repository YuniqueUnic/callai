#!/usr/bin/env bash
# Mirror monorepo packaging/ into thin brew/scoop layout repos (user install UX).
#
# Preferred auth (CI): deploy keys via env
#   PACKAGING_MIRROR_SSH_KEY_HOMEBREW  — write deploy key for YuniqueUnic/homebrew-callai
#   PACKAGING_MIRROR_SSH_KEY_SCOOP     — write deploy key for YuniqueUnic/scoop-callai
# Optional local auth:
#   MIRROR_TOKEN / GH_TOKEN — HTTPS PAT with contents:write on both repos
#
# Optional: TAG for commit message (default: unknown).
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
tag="${TAG:-unknown}"

setup_ssh_key() {
  local key_material="$1"
  local keyfile="$2"
  if [[ -z "$key_material" ]]; then
    return 1
  fi
  printf '%s\n' "$key_material" >"$keyfile"
  chmod 600 "$keyfile"
  # normalize possible CRLF from secrets UI
  if command -v sed >/dev/null 2>&1; then
    sed -i.bak 's/\r$//' "$keyfile" 2>/dev/null || true
    rm -f "${keyfile}.bak"
  fi
  return 0
}

mirror_repo_ssh() {
  local repo="$1" # owner/name
  local keyfile="$2"
  local setup_fn="$3"
  local work ssh_cmd
  work="$(mktemp -d)"
  ssh_cmd="ssh -i ${keyfile} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  GIT_SSH_COMMAND="$ssh_cmd" git clone --depth 1 "git@github.com:${repo}.git" "$work"
  (
    cd "$work"
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  )
  "$setup_fn" "$work"
  (
    cd "$work"
    git add -A
    if git diff --cached --quiet; then
      echo "${repo}: no changes"
    else
      git commit -m "chore: sync from callai packaging (${tag})"
      GIT_SSH_COMMAND="$ssh_cmd" git push origin HEAD:main
      echo "${repo}: pushed"
    fi
  )
}

mirror_repo_https() {
  local repo="$1"
  local token="$2"
  local setup_fn="$3"
  local work
  work="$(mktemp -d)"
  git clone --depth 1 "https://x-access-token:${token}@github.com/${repo}.git" "$work"
  (
    cd "$work"
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  )
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

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
key_hb="$tmpdir/homebrew_key"
key_sc="$tmpdir/scoop_key"

used_ssh=false
if setup_ssh_key "${PACKAGING_MIRROR_SSH_KEY_HOMEBREW:-}" "$key_hb"; then
  mirror_repo_ssh "YuniqueUnic/homebrew-callai" "$key_hb" setup_homebrew
  used_ssh=true
fi
if setup_ssh_key "${PACKAGING_MIRROR_SSH_KEY_SCOOP:-}" "$key_sc"; then
  mirror_repo_ssh "YuniqueUnic/scoop-callai" "$key_sc" setup_scoop
  used_ssh=true
fi

if [[ "$used_ssh" == true ]]; then
  exit 0
fi

token="${MIRROR_TOKEN:-${GH_TOKEN:-}}"
if [[ -z "$token" ]]; then
  echo "Need deploy-key env PACKAGING_MIRROR_SSH_KEY_HOMEBREW + PACKAGING_MIRROR_SSH_KEY_SCOOP," >&2
  echo "or HTTPS MIRROR_TOKEN/GH_TOKEN with write access to both mirror repos." >&2
  exit 1
fi
echo "Using HTTPS token fallback (prefer deploy keys in CI)."
mirror_repo_https "YuniqueUnic/homebrew-callai" "$token" setup_homebrew
mirror_repo_https "YuniqueUnic/scoop-callai" "$token" setup_scoop
