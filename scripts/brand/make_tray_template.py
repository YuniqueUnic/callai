#!/usr/bin/env python3
"""Build crisp system-tray icons from a transparent master PNG.

Outputs (into out-dir):
  macOS template (black + alpha, menu-bar recolors for light/dark):
    trayTemplate.png      18x18  (@1x)
    nathan.k@example.net   36x36  (@2x)  ← runtime default on macOS Retina
    trayTemplate@3x.png   54x54  (@3x)
  Color tray (Windows / Linux status area — full color, hard edges):
    tray-color-16.png
    tray-color-24.png
    tray-color-32.png     ← runtime default on Windows
    tray-color-48.png
    tray-color-64.png     ← runtime default on Linux HiDPI

Clarity strategy:
  - Silhouette at high work size with binary alpha (no mushy interiors).
  - Downscale with Lanczos + mild unsharp, then re-harden alpha
    (keeps at most a 1px AA fringe, not foggy semi-transparency).
  - Content fills ~82% of canvas so strokes are thicker / less hairline.
"""

from __future__ import annotations

import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

DEFAULT_PUNCH_RATIO = 0.60  # less punch = thicker solid body at tiny sizes
CONTENT_RATIO = 0.82  # of final canvas used by the glyph


def read_png(path: Path) -> tuple[int, int, bytearray]:
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos = 8
    w = h = None
    idat = b""
    while pos < len(data):
        ln = int.from_bytes(data[pos : pos + 4], "big")
        pos += 4
        typ = data[pos : pos + 4]
        pos += 4
        chunk = data[pos : pos + ln]
        pos += ln + 4
        if typ == b"IHDR":
            w, h = struct.unpack(">II", chunk[:8])
        elif typ == b"IDAT":
            idat += chunk
        elif typ == b"IEND":
            break
    assert w and h
    raw = zlib.decompress(idat)
    stride = w * 4
    rows: list[bytes] = []
    prev: bytes | None = None
    i = 0
    for _y in range(h):
        f = raw[i]
        i += 1
        row = bytearray(raw[i : i + stride])
        i += stride
        if f == 1:
            for x in range(4, len(row)):
                row[x] = (row[x] + row[x - 4]) & 255
        elif f == 2:
            for x in range(len(row)):
                row[x] = (row[x] + (prev[x] if prev else 0)) & 255
        elif f == 3:
            for x in range(len(row)):
                left = row[x - 4] if x >= 4 else 0
                up = prev[x] if prev else 0
                row[x] = (row[x] + ((left + up) // 2)) & 255
        elif f == 4:

            def paeth(a: int, b: int, c: int) -> int:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                return a if pa <= pb and pa <= pc else (b if pb <= pc else c)

            for x in range(len(row)):
                left = row[x - 4] if x >= 4 else 0
                up = prev[x] if prev else 0
                ul = prev[x - 4] if prev and x >= 4 else 0
                row[x] = (row[x] + paeth(left, up, ul)) & 255
        prev = bytes(row)
        rows.append(prev)
    return w, h, bytearray(b"".join(rows))


def write_png(path: Path, w: int, h: int, rgba: bytearray) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)
        raw.extend(rgba[y * stride : (y + 1) * stride])
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def harden_alpha(rgba: bytearray, low: int = 96, high: int = 160) -> None:
    """Collapse foggy alpha into solid + 1-step AA fringe."""
    for i in range(3, len(rgba), 4):
        a = rgba[i]
        if a <= low:
            rgba[i] = 0
        elif a >= high:
            rgba[i] = 255
        else:
            # single mid band for mild AA
            rgba[i] = 180


def force_template_black(rgba: bytearray) -> None:
    for i in range(0, len(rgba), 4):
        rgba[i] = 0
        rgba[i + 1] = 0
        rgba[i + 2] = 0


def build_silhouette(src: Path, out: Path, punch_ratio: float = DEFAULT_PUNCH_RATIO) -> None:
    w, h, px = read_png(src)
    scores: list[tuple[float, int]] = []
    opaque_idx: list[int] = []
    for y in range(h):
        for x in range(w):
            i = (y * w + x) * 4
            r, g, b, a = px[i], px[i + 1], px[i + 2], px[i + 3]
            if a <= 20:
                continue
            rn, gn, bn = r / 255.0, g / 255.0, b / 255.0
            lum = 0.299 * rn + 0.587 * gn + 0.114 * bn
            warm = max(0.0, (rn - bn)) + max(0.0, (rn - gn) * 0.5)
            score = lum + 0.15 * warm
            opaque_idx.append(y * w + x)
            scores.append((score, y * w + x))

    scores.sort(reverse=True)
    # Cap punch so tiny menu-bar sizes keep a solid body (avoid lace holes).
    n_punch = min(int(len(scores) * punch_ratio), int(len(scores) * 0.32))
    punch_set = {idx for _, idx in scores[:n_punch]}

    alpha = [0] * (w * h)
    for idx in opaque_idx:
        alpha[idx] = 0 if idx in punch_set else 255

    # 1px outer dilate into exterior only (thicker outline for small sizes)
    alpha2 = alpha[:]
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if alpha[y * w + x] > 0:
                continue
            if px[(y * w + x) * 4 + 3] > 20:
                continue
            if any(
                alpha[(y + dy) * w + (x + dx)] > 200
                for dy in (-1, 0, 1)
                for dx in (-1, 0, 1)
            ):
                alpha2[y * w + x] = 255
    alpha = alpha2

    out_px = bytearray(w * h * 4)
    for i, a in enumerate(alpha):
        out_px[i * 4 : i * 4 + 4] = bytes([0, 0, 0, a])
    write_png(out, w, h, out_px)
    ratio = n_punch / max(1, len(opaque_idx))
    print(
        f"silhouette: opaque={len(opaque_idx)} punch={n_punch} ratio={ratio:.3f} -> {out}"
    )


def magick_resize_square(src: Path, dest: Path, size: int, content: int) -> None:
    """Lanczos downscale + unsharp, centered on transparent canvas."""
    subprocess.check_call(
        [
            "magick",
            str(src),
            "-background",
            "none",
            "-gravity",
            "center",
            "-filter",
            "Lanczos",
            "-resize",
            f"{content}x{content}",
            "-unsharp",
            "0x0.9+0.9+0.01",
            "-extent",
            f"{size}x{size}",
            f"PNG32:{dest}",
        ]
    )


def post_crisp_template(path: Path) -> None:
    w, h, rgba = read_png(path)
    harden_alpha(rgba, low=90, high=150)
    force_template_black(rgba)
    write_png(path, w, h, rgba)


def post_crisp_color(path: Path) -> None:
    w, h, rgba = read_png(path)
    harden_alpha(rgba, low=40, high=140)
    write_png(path, w, h, rgba)


def main() -> int:
    if len(sys.argv) < 3:
        print(
            "usage: make_tray_template.py <master.png> <out-dir> [work-size] [punch-ratio]",
            file=sys.stderr,
        )
        return 2
    master = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    work = int(sys.argv[3]) if len(sys.argv) > 3 else 768
    punch = float(sys.argv[4]) if len(sys.argv) > 4 else DEFAULT_PUNCH_RATIO
    out_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="callai-tray-") as td:
        tmp = Path(td)
        work_png = tmp / f"src_{work}.png"
        sil_png = tmp / f"sil_{work}.png"

        # Square padded master for stable silhouette crop.
        subprocess.check_call(
            [
                "magick",
                str(master),
                "-background",
                "none",
                "-gravity",
                "center",
                "-filter",
                "Lanczos",
                "-resize",
                f"{work}x{work}",
                "-extent",
                f"{work}x{work}",
                f"PNG32:{work_png}",
            ]
        )
        build_silhouette(work_png, sil_png, punch_ratio=punch)

        # --- macOS monochrome templates ---
        template_sizes = (
            (18, "trayTemplate.png"),
            (36, "nathan.k@example.net"),
            (54, "trayTemplate@3x.png"),
        )
        for size, name in template_sizes:
            dest = out_dir / name
            content = max(8, int(round(size * CONTENT_RATIO)))
            magick_resize_square(sil_png, dest, size, content)
            post_crisp_template(dest)
            print("wrote", dest)

        # --- Windows / Linux color tray ---
        color_sizes = (16, 24, 32, 48, 64)
        for size in color_sizes:
            dest = out_dir / f"tray-color-{size}.png"
            content = max(8, int(round(size * CONTENT_RATIO)))
            magick_resize_square(work_png, dest, size, content)
            post_crisp_color(dest)
            print("wrote", dest)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
