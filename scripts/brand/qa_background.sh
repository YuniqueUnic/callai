#!/usr/bin/env bash
# Background-cleanup QA for brand PNGs.
#
# Hard fails (must fix):
#   - missing / non-RGB / Bilevel / too small / empty alpha
#   - subject center transparent  (cream-key punched the bird belly)
#
# Soft warnings:
#   - outer residual metrics printed for humans, not hard-failed
#     because feet/shadow often touch the south edge after trim.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

need_cmd magick
errors=0
warns=0
reports=0
gt() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a+0>b+0)}'; }
lt() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a+0<b+0)}'; }

qa_one() {
  local f="$1"
  local label="${2:-$f}"
  reports=$((reports + 1))

  if [[ ! -f "$f" ]]; then
    echo "FAIL  MISSING     ${label}"; errors=$((errors+1)); return
  fi

  local channels w h itype bytes
  channels="$(magick identify -format '%[channels]' "$f" 2>/dev/null || true)"
  w="$(magick identify -format '%w' "$f" 2>/dev/null || echo 0)"
  h="$(magick identify -format '%h' "$f" 2>/dev/null || echo 0)"
  itype="$(magick identify -format '%[type]' "$f" 2>/dev/null || true)"
  bytes="$(wc -c < "$f" | tr -d ' ')"

  if ! printf '%s' "${channels}" | grep -Eqi 'rgb'; then
    echo "FAIL  NON_RGB     ${label}  ch=${channels}"; errors=$((errors+1)); return
  fi
  if [[ "${itype}" == "Bilevel" ]]; then
    echo "FAIL  BILEVEL     ${label}"; errors=$((errors+1)); return
  fi
  if [[ "${w}" -lt 32 || "${h}" -lt 32 ]]; then
    echo "FAIL  TOO_SMALL   ${label}  ${w}x${h}"; errors=$((errors+1)); return
  fi

  local center_a center_rgb alpha_mean
  center_a="$(magick "$f" -gravity Center -crop 1x1+0+0 +repage -alpha extract -format '%[fx:mean]' info:)"
  center_rgb="$(magick "$f" -gravity Center -crop 1x1+0+0 +repage -alpha off -format '%[fx:int(255*mean.r)],%[fx:int(255*mean.g)],%[fx:int(255*mean.b)]' info:)"
  alpha_mean="$(magick "$f" -alpha extract -format '%[fx:mean]' info:)"

  if lt "${center_a}" "0.90"; then
    echo "FAIL  CENTER_HOLE ${label}  center_a=${center_a} rgb=${center_rgb}"
    errors=$((errors+1)); return
  fi
  if lt "${alpha_mean}" "0.05"; then
    echo "FAIL  EMPTY_ALPHA ${label}"; errors=$((errors+1)); return
  fi

  # Soft metric: SE corner near-white opaque ratio (informational)
  local box se
  box=$(( (w < h ? w : h) / 10 ))
  if [[ "${box}" -lt 24 ]]; then box=24; fi
  if [[ "${box}" -gt 96 ]]; then box=96; fi
  local td
  td="$(mktemp -d -t callai-qa.XXXXXX)"
  magick "$f" -gravity SouthEast -crop "${box}x${box}+0+0" +repage "${td}/se.png"
  se="$(
    magick "${td}/se.png" \
      \( +clone -alpha extract -threshold 15% \) \
      \( +clone -alpha off -colorspace gray -threshold 94% \) \
      -compose multiply -composite \
      -format '%[fx:mean]' info:
  )"
  rm -rf "${td}"

  local note=""
  if gt "${se}" "0.20"; then
    note=" WARN_SE_CHECK"
    warns=$((warns+1))
  fi

  echo "PASS  ${label}  ${w}x${h} type=${itype} center_a=${center_a} center_rgb=${center_rgb} se=${se} alpha=${alpha_mean}${note}"
}

echo "=== Brand background QA ==="
echo "hard: RGB/TrueColor + center opaque; soft: SE residue warning only"
qa_one "${LOGO_MASTER}" "logo-master"
qa_one "${LOGO_1024}" "logo-1024"
while IFS= read -r name; do
  [[ -z "${name}" ]] && continue
  qa_one "${UI_ELEMENTS_DIR}/${name}.png" "element:${name}"
done < <(element_names_list)
echo
echo "checked ${reports} images (warns=${warns})"
if [[ ${errors} -gt 0 ]]; then
  echo "brand-qa FAILED (${errors})"
  echo "Docs: scripts/brand/docs/background-cleanup-qa.md"
  exit 1
fi
echo "brand-qa PASSED"
if [[ ${warns} -gt 0 ]]; then
  echo "note: ${warns} soft WARN_SE_CHECK — subject may touch SE edge; re-run cleanup only if hairlines remain"
fi
