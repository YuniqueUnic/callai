# shellcheck shell=bash
# Shared helpers for brand scripts.

set -euo pipefail

_brand_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=config.sh
source "${_brand_lib_dir}/config.sh"

need_cmd() {
  local c
  for c in "$@"; do
    if ! command -v "$c" >/dev/null 2>&1; then
      echo "error: required command not found: $c" >&2
      exit 1
    fi
  done
}

log() {
  printf '• %s\n' "$*"
}

die() {
  echo "error: $*" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || die "missing source file: $1"
}

ensure_dirs() {
  mkdir -p \
    "${BRAND_DIR}" \
    "${TAURI_ICONS_DIR}" \
    "${PUBLIC_ICONS_DIR}" \
    "${UI_ELEMENTS_DIR}"
}

# Flood-fill cream background from edges → transparent PNG, then scrub residual fringe.
# Args: input output [bg_color] [fuzz]
remove_cream_bg() {
  # Border-connected background removal ONLY.
  #
  # The bird belly / clock face are cream-colored like the parchment.
  # NEVER use global -transparent on cream tones (that punches holes in the subject).
  #
  # Pipeline:
  #   1) flood-fill cream from image borders → those pixels transparent
  #   2) clean ONLY the alpha channel (threshold + light morph)
  #   3) trim + pad; keep RGB from the flooded color image
  local input="$1"
  local output="$2"
  local bg="${3:-${BG_COLOR}}"
  local fuzz="${4:-${BG_FUZZ}}"
  local work
  work="$(mktemp -t callai-logo.XXXXXX).png"

  magick "${input}" -alpha set \
    -bordercolor "${bg}" -border 16 \
    -fuzz "${fuzz}" \
    -fill none \
    -draw "color 0,0 floodfill" \
    -draw "color %[fx:w-1],0 floodfill" \
    -draw "color 0,%[fx:h-1] floodfill" \
    -draw "color %[fx:w-1],%[fx:h-1] floodfill" \
    -draw "color %[fx:w/2],0 floodfill" \
    -draw "color 0,%[fx:h/2] floodfill" \
    -draw "color %[fx:w-1],%[fx:h/2] floodfill" \
    -draw "color %[fx:w/2],%[fx:h-1] floodfill" \
    -draw "color %[fx:w/4],0 floodfill" \
    -draw "color %[fx:3*w/4],0 floodfill" \
    -draw "color %[fx:w/4],%[fx:h-1] floodfill" \
    -draw "color %[fx:3*w/4],%[fx:h-1] floodfill" \
    -draw "color 0,%[fx:h/4] floodfill" \
    -draw "color 0,%[fx:3*h/4] floodfill" \
    -draw "color %[fx:w-1],%[fx:h/4] floodfill" \
    -draw "color %[fx:w-1],%[fx:3*h/4] floodfill" \
    -shave 16x16 \
    "${work}"

  # Alpha-channel-only cleanup: drop faint fringe hairlines.
  # IMPORTANT: -channel A ... +channel keeps RGB intact.
  magick "${work}" \
    -channel A \
    -threshold 8% \
    -morphology Erode Disk:1 \
    -morphology Dilate Disk:1 \
    +channel \
    -trim +repage \
    -bordercolor none -border 8 \
    PNG32:"${output}"

  local channels out_w out_h itype
  channels="$(magick identify -format '%[channels]' "${output}")"
  out_w="$(magick identify -format '%w' "${output}")"
  out_h="$(magick identify -format '%h' "${output}")"
  itype="$(magick identify -format '%[type]' "${output}")"

  if ! printf '%s' "${channels}" | grep -Eqi 'rgb'; then
    echo "error: remove_cream_bg produced non-RGB (${channels})" >&2
    rm -f "${work}"
    return 1
  fi
  if [[ "${itype}" == "Bilevel" ]]; then
    echo "error: remove_cream_bg collapsed to Bilevel (color lost)" >&2
    rm -f "${work}"
    return 1
  fi
  if [[ "${out_w}" -lt 64 || "${out_h}" -lt 64 ]]; then
    echo "error: remove_cream_bg result too small (${out_w}x${out_h})" >&2
    rm -f "${work}"
    return 1
  fi

  # Center of subject must stay mostly opaque (guards against belly punch-through).
  local center_a
  center_a="$(magick "${output}" -gravity Center -crop 1x1+0+0 +repage -alpha extract -format '%[fx:mean]' info:)"
  if awk -v a="${center_a}" 'BEGIN{exit !(a < 0.9)}'; then
    echo "error: subject center became transparent (a=${center_a}) — cream-key hole?" >&2
    rm -f "${work}"
    return 1
  fi

  rm -f "${work}"
}

remove_card_bg() {
  # Border-connected background only (same principle as logo).
  local input="$1"
  local output="$2"
  local bg="${3:-${ELEMENTS_BG_COLOR}}"
  local fuzz="${4:-${ELEMENTS_BG_FUZZ}}"
  local work
  work="$(mktemp -t callai-card.XXXXXX).png"

  magick "${input}" -alpha set \
    -bordercolor "${bg}" -border 6 \
    -fuzz "${fuzz}" \
    -fill none \
    -draw "color 0,0 floodfill" \
    -draw "color %[fx:w-1],0 floodfill" \
    -draw "color 0,%[fx:h-1] floodfill" \
    -draw "color %[fx:w-1],%[fx:h-1] floodfill" \
    -draw "color %[fx:w/2],0 floodfill" \
    -draw "color 0,%[fx:h/2] floodfill" \
    -draw "color %[fx:w-1],%[fx:h/2] floodfill" \
    -draw "color %[fx:w/2],%[fx:h-1] floodfill" \
    -shave 6x6 \
    "${work}"

  magick "${work}" \
    -channel A \
    -threshold 6% \
    -morphology Erode Disk:1 \
    -morphology Dilate Disk:1 \
    +channel \
    -trim +repage \
    PNG32:"${output}"

  rm -f "${work}"
}

square_extent() {
  local input="$1"
  local size="$2"
  local output="$3"
  local content="${4:-$2}"

  magick "${input}" \
    -background none \
    -gravity center \
    -resize "${content}x${content}" \
    -extent "${size}x${size}" \
    "${output}"
}

write_png_module_decl() {
  local f="${BRAND_ROOT}/src/vite-env.d.ts"
  cat > "${f}" <<'DTS'
/// <reference types="vite/client" />

declare module "*.png" {
  const src: string;
  export default src;
}
DTS
  log "wrote ${f}"
}
