#!/usr/bin/env bash
# Sanity-check generated brand assets.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

need_cmd magick
errors=0

check_image() {
  local f="$1"
  if [[ ! -f "$f" ]]; then
    echo "MISSING  $f"
    errors=$((errors + 1))
    return
  fi
  local info
  info="$(magick identify -format '%wx%h %[channels]' "$f" 2>/dev/null || true)"
  if [[ -z "$info" ]]; then
    echo "BAD      $f"
    errors=$((errors + 1))
    return
  fi
  echo "OK       $f  ($info)"
}

check_text() {
  local f="$1"
  if [[ ! -f "$f" ]]; then
    echo "MISSING  $f"
    errors=$((errors + 1))
    return
  fi
  if [[ ! -s "$f" ]]; then
    echo "EMPTY    $f"
    errors=$((errors + 1))
    return
  fi
  echo "OK       $f  ($(wc -c < "$f" | tr -d ' ') bytes)"
}

echo "Logo / app icons"
check_image "${LOGO_MASTER}"
check_image "${LOGO_1024}"
check_image "${TAURI_ICONS_DIR}/32x32.png"
check_image "${TAURI_ICONS_DIR}/128x128.png"
check_image "${TAURI_ICONS_DIR}/icon.png"
check_image "${TAURI_ICONS_DIR}/icon.ico"
check_image "${FAVICON}"
check_image "${PUBLIC_ICONS_DIR}/tray.png"

echo
echo "UI elements"
while IFS= read -r name; do
  [[ -z "${name}" ]] && continue
  check_image "${UI_ELEMENTS_DIR}/${name}.png"
  check_image "${UI_ELEMENTS_DIR}/${name}@sm.png"
done < <(element_names_list)

echo
echo "Modules / catalog"
check_text "${UI_CATALOG}"
check_text "${UI_INDEX_TS}"
check_text "${BRAND_ROOT}/src/ui/ElementImage.tsx"
check_text "${ELEMENT_USAGE_TSV}"
check_text "${CATALOG_BRAND}"

echo
if [[ $errors -gt 0 ]]; then
  echo "brand-check FAILED ($errors missing/bad)"
  exit 1
fi
echo "brand-check PASSED"
