#!/usr/bin/env bash
# Optimize screenshot PNG/WebP (+ optional demo video) for README.
# Docs: scripts/media/README.md  |  Entry: just optimize-screenshots
# Requires: ffmpeg (video only), img2webp (brew webp), python3 (venv+pillow auto).
# NEVER commit assets/screenshot/original/ (gitignored).
set -euo pipefail
# Demo playback speed (1.7 ≈ snappy; override: CALLAI_DEMO_SPEED=1.8)
SPEED="${CALLAI_DEMO_SPEED:-1.7}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
src="$root/assets/screenshot"
orig="$src/original"
docs="$root/docs/assets/screenshot"
mkdir -p "$orig" "$docs" "$src"
# Working copies under assets/screenshot/* are gitignored;
# commit only docs/assets/screenshot/*

# ---------------------------------------------------------------------------
# Source map: original filename  →  README/docs stem
# Put latest CleanShot dumps in assets/screenshot/original/ then re-run.
# ---------------------------------------------------------------------------
# name_src:name_out  (src under original/, out stem for docs + working copy)
STILL_MAP=(
  "alarm.dark.png:alarms"
  "edit.light.png:new-alarm"
  "logs.light.png:logs"
  "settings.light.png:settings"
  "edit.alarm.dark.png:edit-alarm-dark"
)

# Legacy fallbacks if a new name is missing but an old original exists
legacy_fallback() {
  local want="$1"
  case "$want" in
    alarm.dark.png) echo "alarms.png" ;;
    edit.light.png|edit.alarm.dark.png) echo "new-alarm.png" ;;
    logs.light.png) echo "logs.png" ;;
    settings.light.png) echo "settings.png" ;;
    *) echo "" ;;
  esac
}

resolve_still() {
  local src_name="$1"
  if [[ -f "$orig/$src_name" ]]; then
    echo "$orig/$src_name"
    return 0
  fi
  local leg
  leg="$(legacy_fallback "$src_name")"
  if [[ -n "$leg" && -f "$orig/$leg" ]]; then
    echo "$orig/$leg"
    return 0
  fi
  # last resort: working copy already named as out
  return 1
}

# PNG optimize + WebP stills
if [[ -x "$src/.venv/bin/python" ]]; then
  py="$src/.venv/bin/python"
else
  python3 -m venv "$src/.venv"
  "$src/.venv/bin/pip" install -q pillow
  py="$src/.venv/bin/python"
fi

export ORIG_DIR="$orig" SRC_DIR="$src" DOCS_DIR="$docs"
# shellcheck disable=SC2016
"$py" - <<'PY'
from pathlib import Path
import os
import sys

orig = Path(os.environ["ORIG_DIR"])
out = Path(os.environ["SRC_DIR"])
docs = Path(os.environ["DOCS_DIR"])
docs.mkdir(parents=True, exist_ok=True)
out.mkdir(parents=True, exist_ok=True)

# src_name, out_stem  — must match STILL_MAP in shell
pairs = [
    ("alarm.dark.png", "alarms"),
    ("edit.light.png", "new-alarm"),
    ("logs.light.png", "logs"),
    ("settings.light.png", "settings"),
    ("edit.alarm.dark.png", "edit-alarm-dark"),
]
legacy = {
    "alarm.dark.png": "alarms.png",
    "edit.light.png": "new-alarm.png",
    "edit.alarm.dark.png": "new-alarm.png",
    "logs.light.png": "logs.png",
    "settings.light.png": "settings.png",
}

from PIL import Image

missing = []
for src_name, stem in pairs:
    path = orig / src_name
    if not path.is_file():
        leg = legacy.get(src_name)
        if leg and (orig / leg).is_file():
            path = orig / leg
            print(f"fallback: {src_name} -> {leg}")
        else:
            missing.append(src_name)
            continue
    im = Image.open(path).convert("RGBA")
    # working copy (canonical stem)
    im.save(out / f"{stem}.png", format="PNG", optimize=True, compress_level=9)
    # docs for README
    im.save(docs / f"{stem}.png", format="PNG", optimize=True, compress_level=9)
    im.save(docs / f"{stem}.webp", format="WEBP", quality=86, method=6)
    print(f"ok {stem} <- {path.name} ({path.stat().st_size // 1024}KB → docs webp)")

if missing:
    print("WARN missing originals (skipped):", ", ".join(missing), file=sys.stderr)
    # fail hard only if primary four missing
    primary = {"alarm.dark.png", "edit.light.png", "logs.light.png", "settings.light.png"}
    if primary & set(missing):
        # allow if all four stems already produced via fallback
        need = ["alarms", "new-alarm", "logs", "settings"]
        if any(not (docs / f"{s}.webp").is_file() for s in need):
            sys.exit(f"ERROR: missing primary sources: {sorted(primary & set(missing))}")
PY

# Demo video (optional — keep existing compressed if original absent)
if [[ -f "$orig/record.mp4" ]]; then
  command -v ffmpeg >/dev/null || { echo "ffmpeg required for video"; exit 1; }
  command -v img2webp >/dev/null || { echo "img2webp required (brew install webp)"; exit 1; }

  ffmpeg -y -i "$orig/record.mp4" \
    -filter:v "setpts=PTS/${SPEED}" -an \
    -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p -movflags +faststart \
    "$src/record.mp4"
  cp -f "$src/record.mp4" "$docs/record.mp4"

  tmpdir=$(mktemp -d)
  ffmpeg -y -i "$orig/record.mp4" \
    -filter:v "setpts=PTS/${SPEED},fps=6,scale=300:-1:flags=lanczos" -an \
    "$tmpdir/f_%04d.png"
  img2webp -loop 0 -d 160 -lossy -q 40 -m 6 "$tmpdir"/f_*.png -o "$docs/record.webp"
  rm -rf "$tmpdir"

  ffmpeg -y -i "$orig/record.mp4" -ss 00:00:05 -t 12 \
    -filter:v "setpts=PTS/${SPEED},fps=8,scale=300:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" \
    -an -loop 0 "$docs/record-preview.gif"
  tmpdir=$(mktemp -d)
  ffmpeg -y -i "$orig/record.mp4" -ss 00:00:05 -t 12 \
    -filter:v "setpts=PTS/${SPEED},fps=8,scale=300:-1:flags=lanczos" -an \
    "$tmpdir/f_%04d.png"
  img2webp -loop 0 -d 125 -lossy -q 45 -m 6 "$tmpdir"/f_*.png -o "$docs/record-preview.webp"
  rm -rf "$tmpdir"
  echo "video ok"
else
  echo "SKIP video: no $orig/record.mp4 (still frames updated only)"
fi

echo "Done. Outputs in $docs"
ls -lah "$docs"
