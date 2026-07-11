#!/usr/bin/env bash
# Full brand pipeline: logo icons + element slices + UI TS module.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

need_cmd magick python3

log "=== callai brand pipeline ==="
log "root: ${BRAND_ROOT}"

"${SCRIPT_DIR}/generate_logo_icons.sh"
"${SCRIPT_DIR}/slice_elements.sh"
"${SCRIPT_DIR}/generate_ui_module.sh"

log "=== brand pipeline complete ==="
log "verify with: just brand-check"
