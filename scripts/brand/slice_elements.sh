#!/usr/bin/env bash
# Slice callai.elements.png (8x2 grid), remove backgrounds, emit UI PNGs + catalog.
# macOS Bash 3.2 compatible.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

need_cmd magick python3
require_file "${ELEMENTS_SRC}"
ensure_dirs

# Intermediates go to temp — only UI outputs + catalogs are kept in repo.
SLICE_TMP="$(mktemp -d -t callai-slice.XXXXXX)"
trap 'rm -rf "${SLICE_TMP}"' EXIT
ELEMENTS_RAW_DIR="${SLICE_TMP}/raw"
ELEMENTS_OUT_DIR="${SLICE_TMP}/mid"
mkdir -p "${ELEMENTS_RAW_DIR}" "${ELEMENTS_OUT_DIR}"

log "inspect sheet"
read -r SHEET_W SHEET_H < <(magick identify -format "%w %h" "${ELEMENTS_SRC}")
CELL_W=$((SHEET_W / ELEMENTS_COLS))
CELL_H=$((SHEET_H / ELEMENTS_ROWS))
log "sheet ${SHEET_W}x${SHEET_H} → cell ${CELL_W}x${CELL_H} (${ELEMENTS_COLS}x${ELEMENTS_ROWS})"

# materialize names
NAMES_FILE="$(mktemp)"
element_names_list > "${NAMES_FILE}"
count="$(wc -l < "${NAMES_FILE}" | tr -d ' ')"
expected=$((ELEMENTS_COLS * ELEMENTS_ROWS))
if [[ "${count}" -ne "${expected}" ]]; then
  rm -f "${NAMES_FILE}"
  die "ELEMENT_NAMES has ${count} entries, expected ${expected}"
fi

idx=0
while IFS= read -r name; do
  [[ -z "${name}" ]] && continue
  row=$((idx / ELEMENTS_COLS))
  col=$((idx % ELEMENTS_COLS))
  x=$((col * CELL_W))
  y=$((row * CELL_H))
  raw="${ELEMENTS_RAW_DIR}/${name}.png"
  mid="${ELEMENTS_OUT_DIR}/${name}.png"
  ui="${UI_ELEMENTS_DIR}/${name}.png"
  ui_sm="${UI_ELEMENTS_DIR}/${name}@sm.png"

  log "slice [${row},${col}] ${name}"
  magick "${ELEMENTS_SRC}" -crop "${CELL_W}x${CELL_H}+${x}+${y}" +repage "${raw}"
  remove_card_bg "${raw}" "${mid}" "${ELEMENTS_BG_COLOR}" "${ELEMENTS_BG_FUZZ}"
  magick "${mid}" -background none -gravity center -resize "256x256>" "${ui}"
  magick "${mid}" -background none -gravity center -resize "96x96>" "${ui_sm}"
  idx=$((idx + 1))
done < "${NAMES_FILE}"
rm -f "${NAMES_FILE}"

log "write catalog JSON"
export CATALOG_BRAND UI_CATALOG ELEMENTS_COLS ELEMENTS_ROWS CELL_W CELL_H ELEMENT_USAGE_TSV
element_names_list > /tmp/callai-element-names.txt
cp -f "${ELEMENT_USAGE_TSV}" /tmp/callai-element-usage.tsv

python3 << 'PY'
import json
import os
from pathlib import Path

names = [n for n in Path("/tmp/callai-element-names.txt").read_text().splitlines() if n.strip()]
usage = {}
for line in Path("/tmp/callai-element-usage.tsv").read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    k, _, v = line.partition("\t")
    usage[k] = v

cols = int(os.environ["ELEMENTS_COLS"])
rows = int(os.environ["ELEMENTS_ROWS"])
cw = int(os.environ["CELL_W"])
ch = int(os.environ["CELL_H"])

elements = []
for i, name in enumerate(names):
    r, c = divmod(i, cols)
    elements.append({
        "id": name,
        "file": f"{name}.png",
        "fileSm": f"{name}@sm.png",
        "row": r,
        "col": c,
    })

catalog = {
    "version": 1,
    "source": "callai.elements.png",
    "grid": {"cols": cols, "rows": rows, "cellWidth": cw, "cellHeight": ch},
    "elements": elements,
    "usage": usage,
}
text = json.dumps(catalog, indent=2, ensure_ascii=False) + "\n"
Path(os.environ["CATALOG_BRAND"]).write_text(text)
Path(os.environ["UI_CATALOG"]).write_text(text)
print("catalog entries:", len(elements))
PY

log "done: element slices → ${UI_ELEMENTS_DIR}"
