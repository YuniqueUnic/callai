#!/usr/bin/env bash
# Optimize screenshot PNG/WebP + demo video for README.
# Requires: ffmpeg, magick/cwebp/img2webp, optional python pillow venv.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
src="$root/assets/screenshot"
orig="$src/original"
docs="$root/docs/assets/screenshot"
mkdir -p "$orig" "$docs"

# backup originals once
for f in alarms logs new-alarm settings; do
  [[ -f "$orig/${f}.png" ]] || cp "$src/${f}.png" "$orig/${f}.png"
done
[[ -f "$orig/record.mp4" ]] || cp "$src/record.mp4" "$orig/record.mp4"

# PNG optimize + WebP stills
if [[ -x "$src/.venv/bin/python" ]]; then
  py="$src/.venv/bin/python"
else
  python3 -m venv "$src/.venv"
  "$src/.venv/bin/pip" install -q pillow
  py="$src/.venv/bin/python"
fi
"$py" - <<'PY' "$orig" "$src" "$docs"
from pathlib import Path
import sys
from PIL import Image
orig, out, docs = map(Path, sys.argv[1:4])
docs.mkdir(parents=True, exist_ok=True)
for name in ["alarms", "logs", "new-alarm", "settings"]:
    im = Image.open(orig / f"{name}.png").convert("RGBA")
    im.save(out / f"{name}.png", format="PNG", optimize=True, compress_level=9)
    im.save(docs / f"{name}.png", format="PNG", optimize=True, compress_level=9)
    im.save(docs / f"{name}.webp", format="WEBP", quality=86, method=6)
    print(name, "ok")
PY

# 1.4x compressed mp4
ffmpeg -y -i "$orig/record.mp4" \
  -filter:v "setpts=PTS/1.4" -an \
  -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p -movflags +faststart \
  "$src/record.mp4"
cp -f "$src/record.mp4" "$docs/record.mp4"

# full animated webp
tmpdir=$(mktemp -d)
ffmpeg -y -i "$orig/record.mp4" \
  -filter:v "setpts=PTS/1.4,fps=6,scale=300:-1:flags=lanczos" -an \
  "$tmpdir/f_%04d.png"
img2webp -loop 0 -d 160 -lossy -q 40 -m 6 "$tmpdir"/f_*.png -o "$docs/record.webp"
rm -rf "$tmpdir"

# short preview gif + webp (~12s from 5s mark, 1.4x)
ffmpeg -y -i "$orig/record.mp4" -ss 00:00:05 -t 12 \
  -filter:v "setpts=PTS/1.4,fps=8,scale=300:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" \
  -an -loop 0 "$docs/record-preview.gif"
tmpdir=$(mktemp -d)
ffmpeg -y -i "$orig/record.mp4" -ss 00:00:05 -t 12 \
  -filter:v "setpts=PTS/1.4,fps=8,scale=300:-1:flags=lanczos" -an \
  "$tmpdir/f_%04d.png"
img2webp -loop 0 -d 125 -lossy -q 45 -m 6 "$tmpdir"/f_*.png -o "$docs/record-preview.webp"
rm -rf "$tmpdir"

echo "Done. Outputs in $docs"
ls -lah "$docs"
