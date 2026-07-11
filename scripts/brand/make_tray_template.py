#!/usr/bin/env python3
"""Build macOS menu-bar template icons (pure black + alpha silhouette).

Punch ~30% brightest / warmest interior pixels so the bird silhouette has
readable internal shape, while keeping the outline solid. RGB is forced pure
black so macOS can recolor for light/dark menu bars.
"""

from __future__ import annotations

import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

DEFAULT_PUNCH_RATIO = 0.36


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
    n_punch = int(len(scores) * punch_ratio)
    punch_set = {idx for _, idx in scores[:n_punch]}

    alpha = [0] * (w * h)
    for idx in opaque_idx:
        alpha[idx] = 0 if idx in punch_set else 255

    # 1px outer dilate into exterior only (keep punched interiors empty)
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


def main() -> int:
    if len(sys.argv) < 3:
        print(
            "usage: make_tray_template.py <logo-master.png> <out-dir> [work-size] [punch-ratio]",
            file=sys.stderr,
        )
        return 2
    master = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    work = int(sys.argv[3]) if len(sys.argv) > 3 else 512
    punch = float(sys.argv[4]) if len(sys.argv) > 4 else DEFAULT_PUNCH_RATIO
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="callai-tray-") as td:
        tmp = Path(td)
        work_png = tmp / f"src_{work}.png"
        sil_png = tmp / f"sil_{work}.png"
        subprocess.check_call(
            [
                "magick",
                str(master),
                "-background",
                "none",
                "-gravity",
                "center",
                "-resize",
                f"{work}x{work}",
                "-extent",
                f"{work}x{work}",
                f"PNG32:{work_png}",
            ]
        )
        build_silhouette(work_png, sil_png, punch_ratio=punch)

        for size, name in ((18, "trayTemplate.png"), (36, "nathan.k@example.net")):
            dest = out_dir / name
            subprocess.check_call(
                [
                    "magick",
                    str(sil_png),
                    "-background",
                    "none",
                    "-gravity",
                    "center",
                    "-resize",
                    f"{size}x{size}",
                    "-extent",
                    f"{size}x{size}",
                    "-channel",
                    "RGB",
                    "-evaluate",
                    "set",
                    "0",
                    "+channel",
                    f"PNG32:{dest}",
                ]
            )
            print("wrote", dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
