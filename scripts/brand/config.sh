# shellcheck shell=bash
# Shared brand-asset paths and constants.
# Compatible with macOS Bash 3.2 (no associative arrays).

_brand_config_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAND_ROOT="$(cd "${_brand_config_dir}/../.." && pwd)"

# Source art (repo root)
LOGO_SRC="${BRAND_ROOT}/callai.logo.png"
TRAY_SRC="${BRAND_ROOT}/callai.tray.png"
ELEMENTS_SRC="${BRAND_ROOT}/callai.elements.png"

# Intermediate brand outputs
BRAND_DIR="${BRAND_ROOT}/assets/brand"
LOGO_MASTER="${BRAND_DIR}/callai-icon-master.png"  # canonical transparent logo
LOGO_1024="${BRAND_DIR}/callai-icon-1024.png"
TRAY_MASTER="${BRAND_DIR}/callai-tray-master.png"  # transparent tray source
ELEMENTS_RAW_DIR="${BRAND_DIR}/elements-raw"
ELEMENTS_OUT_DIR="${BRAND_DIR}/elements"
CATALOG_BRAND="${BRAND_DIR}/elements-catalog.json"
ELEMENT_USAGE_TSV="${_brand_config_dir}/element_usage.tsv"

# App / package icons
TAURI_ICONS_DIR="${BRAND_ROOT}/src-tauri/icons"
PUBLIC_DIR="${BRAND_ROOT}/public"
PUBLIC_ICONS_DIR="${PUBLIC_DIR}/icons"
FAVICON="${PUBLIC_DIR}/favicon.png"

# Frontend UI slices
UI_ELEMENTS_DIR="${BRAND_ROOT}/src/assets/elements"
UI_CATALOG="${UI_ELEMENTS_DIR}/catalog.json"
UI_INDEX_TS="${UI_ELEMENTS_DIR}/index.ts"

# Elements grid
ELEMENTS_COLS=8
ELEMENTS_ROWS=2

# Semantic names, row-major (top-left → right, then second row)
ELEMENT_NAMES="
hero-perch
create-alarm
set-time
task-checklist
running
retry
paused-sleep
sprout-fresh
theme-light
theme-dark
chat-global
multi-device
notify-badge
logs-clipboard
success-check
sync-refresh
"

# Background removal defaults (cream parchment of source art)
BG_COLOR="rgb(252,252,253)"
BG_FUZZ="13%"
ELEMENTS_BG_COLOR="rgb(253,254,254)"
ELEMENTS_BG_FUZZ="12%"

element_names_list() {
  # shellcheck disable=SC2086
  printf '%s\n' ${ELEMENT_NAMES}
}
