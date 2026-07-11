#!/usr/bin/env bash
# Generate transparent logo master + Tauri/public app icons from callai.logo.png
# macOS Bash 3.2 compatible.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

need_cmd magick
require_file "${LOGO_SRC}"
ensure_dirs

log "logo → transparent master"
remove_cream_bg "${LOGO_SRC}" "${LOGO_MASTER}"

log "logo → 1024 square"
square_extent "${LOGO_MASTER}" 1024 "${LOGO_1024}" 920

log "logo → tray 44x44"
square_extent "${LOGO_MASTER}" 44 "${PUBLIC_ICONS_DIR}/tray.png" 44

log "logo → Tauri icon set"
# name:size pairs
while IFS=: read -r name size; do
  [[ -z "${name}" ]] && continue
  square_extent "${LOGO_1024}" "${size}" "${TAURI_ICONS_DIR}/${name}" "${size}"
done <<'SIZES'
32x32.png:32
128x128.png:128
128x128@2x.png:256
icon.png:512
Square30x30Logo.png:30
Square44x44Logo.png:44
Square71x71Logo.png:71
Square89x89Logo.png:89
Square107x107Logo.png:107
Square142x142Logo.png:142
Square150x150Logo.png:150
Square284x284Logo.png:284
Square310x310Logo.png:310
StoreLogo.png:50
SIZES

log "logo → multi-size .ico"
magick "${LOGO_1024}" \
  \( -clone 0 -resize 16x16 \) \
  \( -clone 0 -resize 32x32 \) \
  \( -clone 0 -resize 48x48 \) \
  \( -clone 0 -resize 64x64 \) \
  \( -clone 0 -resize 128x128 \) \
  \( -clone 0 -resize 256x256 \) \
  -delete 0 \
  "${TAURI_ICONS_DIR}/icon.ico"

log "logo → .icns (macOS)"
ICONSET_TMP="$(mktemp -d -t callai-iconset.XXXXXX)"
ICONSET_DIR="${ICONSET_TMP}/callai.iconset"
mkdir -p "${ICONSET_DIR}"
while IFS=: read -r fname size; do
  [[ -z "${fname}" ]] && continue
  square_extent "${LOGO_1024}" "${size}" "${ICONSET_DIR}/${fname}" "${size}"
done <<'ICNS'
icon_16x16.png:16
diana.k@example.org:32
icon_32x32.png:32
ivan.p@example.net:64
icon_128x128.png:128
wendy.h@example.net:256
icon_256x256.png:256
wendy.h@example.net:512
icon_512x512.png:512
walt.e@example.net:1024
ICNS

if command -v iconutil >/dev/null 2>&1; then
  iconutil -c icns "${ICONSET_DIR}" -o "${TAURI_ICONS_DIR}/icon.icns"
else
  log "iconutil not found; skip icns"
fi
rm -rf "${ICONSET_TMP}"


log "logo → macOS tray template (black silhouette, pale-highlight punch)"
python3 "${SCRIPT_DIR}/make_tray_template.py" "${LOGO_MASTER}" "${TAURI_ICONS_DIR}" 512 0.30
cp -f "${TAURI_ICONS_DIR}/trayTemplate.png" "${PUBLIC_ICONS_DIR}/trayTemplate.png"
cp -f "${TAURI_ICONS_DIR}/nathan.k@example.net" "${PUBLIC_ICONS_DIR}/nathan.k@example.net"


log "logo → public favicon / icons"
magick "${LOGO_1024}" -resize 64x64 "${FAVICON}"
cp -f "${TAURI_ICONS_DIR}/32x32.png" "${PUBLIC_ICONS_DIR}/32x32.png"
cp -f "${TAURI_ICONS_DIR}/128x128.png" "${PUBLIC_ICONS_DIR}/128x128.png"
cp -f "${TAURI_ICONS_DIR}/icon.png" "${PUBLIC_ICONS_DIR}/icon.png"
cp -f "${LOGO_1024}" "${PUBLIC_ICONS_DIR}/app.png"


log "done: logo icons"
log "  master: ${LOGO_MASTER}"
log "  tauri:  ${TAURI_ICONS_DIR}"
log "  public: ${PUBLIC_ICONS_DIR}"
