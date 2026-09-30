#!/usr/bin/env python3
"""Render the portrait poster (a dot grid) as the WebP shown without JavaScript.

Usage: uv run -q --with pillow scripts/portrait-fallback.py \
         [--poster src/assets/portrait/portrait.json] [--out public/portrait/portrait-fallback.webp] \
         [--cell 5.6]

The dots are drawn the way the canvas draws the finished portrait (src/lib/portrait/levels.ts): radius
sqrt(level / 15) * cell / 2 * 0.96 (at least 0.7 px), colour by band (levels 1-4 the border token, 5-8 the
muted token, 9-15 the text token, Perfect UI's dark values), on a transparent background. Edges are not
antialiased and the file is lossless WebP: with four colours that is about 10 KB, where an antialiased lossy
file of the same dots is about ten times larger.
The input is only the derived dot grid; the source photo never enters this repository.
Prints one summary line to stdout; diagnostics to stderr.
"""
import argparse, json, math, os, sys
from PIL import Image, ImageDraw

BANDS = {1: (55, 65, 81, 255), 2: (156, 163, 175, 255), 3: (255, 255, 255, 255)}  # --pui-border, --pui-muted, --pui-text


def band(v):
    return 3 if v >= 9 else 2 if v >= 5 else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--poster", default="src/assets/portrait/portrait.json")
    ap.add_argument("--out", default="public/portrait/portrait-fallback.webp")
    ap.add_argument("--cell", type=float, default=5.6, help="px per poster cell (page grid 28 / subdiv 5, src/lib/portrait/config.ts)")
    a = ap.parse_args()

    p = json.load(open(a.poster))
    cols, rows, data = p["cols"], p["rows"], p["data"]
    if len(data) != cols * rows:
        print(f"poster has {len(data)} cells, expected {cols * rows}", file=sys.stderr)
        return 1
    w, h = round(cols * a.cell), round(rows * a.cell)
    s = a.cell
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, ch in enumerate(data):
        v = int(ch, 16)
        if not v:
            continue
        x, y = (i % cols) * s + s / 2, (i // cols) * s + s / 2
        r = max(0.7, math.sqrt(v / 15) * s / 2 * 0.96)
        d.ellipse((x - r, y - r, x + r, y + r), fill=BANDS[band(v)])
    img.save(a.out, "WEBP", lossless=True, quality=100, method=6)
    print(f"width={w} height={h} bytes={os.path.getsize(a.out)} out={a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
