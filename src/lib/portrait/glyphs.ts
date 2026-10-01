// A test variation of the portrait (owner, 2026-10-01): letters instead of dots. The letters spell Perfect UI
// class names as one selector (".pui-btn.pui-card..."), one letter per poster cell and one line of text every
// two poster rows, so a 9 px monospace letter fills the 5.6 px cell pitch. Two ways to draw them:
// "text" (?portrait=text): letters alone, in one ink, more opaque the brighter their two rows;
// "blocks" (?portrait=blocks): every poster cell is a block as bright as the picture there, which keeps the
// dots' resolution, and the letters go over the blocks, dark on a bright block like selected text in a terminal. Loaded only when the page's address
// carries ?portrait= (src/scripts/site.ts), as a lazy chunk outside the first render.
import type { GridDotOwner, Painter } from "./types.ts";

/** Classes of Perfect UI 1.0.0's stylesheet (node_modules/@chrissgon/perfectui/dist/perfectui.css). */
export const CLASSES = [
  "pui-btn", "pui-card", "pui-badge", "pui-input", "pui-modal", "pui-table", "pui-chip", "pui-switch",
  "pui-tooltip", "pui-dropdown", "pui-accordion", "pui-timeline", "pui-list", "pui-checkbox", "pui-radio",
  "pui-outline", "pui-surface", "pui-solid", "pui-soft", "pui-rounded", "pui-theme",
];
export const TEXT = CLASSES.map((c) => `.${c}`).join("");

/** The letter of the line of text a poster cell belongs to (two poster rows per line). */
export function letterAt(cell: number, cols: number, text = TEXT): string {
  const line = Math.floor(cell / cols / 2);
  return text[(line * cols + (cell % cols)) % text.length] ?? "";
}

/**
 * How bright a line's letter is at a cell, 0..1: the mean of the two poster rows the line covers. Returns -1
 * for the lower row when the upper one is lit, since the upper cell draws the letter then.
 */
export function letterLevel(cell: number, cols: number, levels: ArrayLike<number>, max = 15): number {
  const lower = Math.floor(cell / cols) % 2 === 1;
  const own = levels[cell] ?? 0, other = levels[lower ? cell - cols : cell + cols] ?? 0;
  if (lower && other) return -1;
  return (own + other) / 2 / max;
}

export type GlyphMode = "text" | "blocks";

export function glyphPainter(cols: number, cellPx: number, family: string, mode: GlyphMode = "text", ink = "#fff", paper = "#000"): Painter {
  const size = Math.round((cellPx / 0.6) * 10) / 10; // a monospace letter is 0.6 em wide
  const font = `600 ${size}px ${family}`, half = cellPx / 2;
  const setup = (c: CanvasRenderingContext2D) => {
    c.font = font;
    c.textAlign = "center";
    c.textBaseline = "middle";
  };
  if (mode === "blocks") return blockPainter(cols, cellPx, font, ink, paper);
  return {
    reach: size + cellPx,
    setup,
    // One ink for every letter, more opaque the brighter the cell: with letters all the same size, opacity is
    // what carries the picture (the dots' three colour bands left the dim letters unreadable).
    dot(c, x, y, _r, cell, levels) {
      const lv = letterLevel(cell, cols, levels);
      if (lv < 0) return;
      const lower = Math.floor(cell / cols) % 2 === 1, fill = c.fillStyle;
      c.fillStyle = ink;
      c.globalAlpha = Math.min(1, 0.08 + 0.92 * lv ** 2.2);
      c.fillText(letterAt(cell, cols), x, lower ? y - half : y + half);
      c.globalAlpha = 1;
      c.fillStyle = fill;
    },
  };
}

/**
 * The blocks variation. A frame is drawn in two batches, because one canvas call per cell was the cost
 * (2026-10-01, profiled under the pointer: 1.6 million drawImage calls in 6 s against the dots' arcs):
 * - the blocks of each brightness level are gathered into one path and filled together, 15 fills a frame;
 * - every letter is drawn once, in each ink, into an atlas, and a frame copies one piece of it per letter
 *   (a tile is one poster cell wide and two tall, the letter centred on the line between its two rows).
 * Nothing is drawn in `dot`; `done` draws the blocks, then the letters over them.
 */
function blockPainter(cols: number, cellPx: number, font: string, ink: string, paper: string): Painter {
  const half = cellPx / 2, scale = Math.min(2, devicePixelRatio || 1);
  const chars = [...new Set(TEXT)], tw = cellPx * scale, th = 2 * tw, pitch = Math.ceil(tw) + 2, rowPx = Math.ceil(th) + 2;
  const width = pitch * chars.length, height = rowPx * 2;
  const offscreen = typeof OffscreenCanvas === "function";
  const sheet = offscreen ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
  const a = sheet.getContext("2d") as CanvasRenderingContext2D;
  [paper, ink].forEach((colour, row) => {
    chars.forEach((ch, i) => {
      a.save();
      a.setTransform(scale, 0, 0, scale, i * pitch, row * rowPx);
      a.beginPath();
      a.rect(0, 0, cellPx, 2 * cellPx);
      a.clip();
      a.font = font;
      a.textAlign = "center";
      a.textBaseline = "middle";
      a.fillStyle = colour;
      a.fillText(ch, half, cellPx);
      a.restore();
    });
  });
  // A bitmap is the cheapest thing to copy from; a browser without OffscreenCanvas copies from the canvas.
  const atlas: CanvasImageSource = offscreen ? (sheet as OffscreenCanvas).transferToImageBitmap() : (sheet as HTMLCanvasElement);
  // The atlas column of each position of the text, and each level's block opacity.
  const tile = Uint16Array.from(TEXT, (ch) => chars.indexOf(ch) * pitch);
  const alpha = Float32Array.from({ length: 16 }, (_, level) => Math.min(1, 0.04 + 0.96 * (level / 15) ** 1.3));
  let blocks: Path2D[] = [], used = new Uint8Array(16), n = 0;
  // The frame's letters: where, which tile, how opaque, and in which ink (the atlas row).
  const lx: number[] = [], ly: number[] = [], ls: number[] = [], la: number[] = [], lr: number[] = [];
  return {
    reach: Math.round((cellPx / 0.6) * 10) / 10 + cellPx,
    setup() {
      blocks = Array.from({ length: 16 }, () => new Path2D());
      used = new Uint8Array(16);
      n = 0;
    },
    // The blocks carry the face, so the letters stay quieter than them: a see-through dark letter on a bright
    // pair of blocks, and on a dim pair a light letter only a little brighter than its blocks, which keeps the
    // dark around the face clean. A line's letter is drawn once, by its upper cell, or by the lower one when
    // the upper is dark.
    dot(_c, x, y, _r, cell, levels) {
      const level = levels[cell] ?? 0, row = Math.floor(cell / cols), lower = row % 2;
      const other = levels[lower ? cell - cols : cell + cols] ?? 0;
      blocks[level]!.rect(x - half, y - half, cellPx, cellPx);
      used[level] = 1;
      if (lower && other) return;
      const own = alpha[level]!, mean = other ? (own + alpha[other]!) / 2 : own, dark = mean > 0.35;
      lx[n] = x - half;
      ly[n] = lower ? y - half - cellPx : y - half;
      ls[n] = tile[(((row - lower) / 2) * cols + (cell % cols)) % tile.length]!;
      la[n] = dark ? 0.6 : Math.min(1, 0.1 + 1.2 * mean);
      lr[n++] = dark ? 0 : rowPx;
    },
    done(c) {
      c.fillStyle = ink;
      for (let level = 1; level < 16; level++) {
        if (!used[level]) continue;
        c.globalAlpha = alpha[level]!;
        c.fill(blocks[level]!);
      }
      for (let i = 0; i < n; i++) {
        c.globalAlpha = la[i]!;
        c.drawImage(atlas, ls[i]!, lr[i]!, tw, th, lx[i]!, ly[i]!, cellPx, 2 * cellPx);
      }
      c.globalAlpha = 1;
    },
  };
}

/** Hands the letters to every mounted portrait of the page, once the monospace font is there. */
export async function useGlyphs(variation: string): Promise<void> {
  const mode: GlyphMode = variation === "blocks" ? "blocks" : "text";
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace";
  await document.fonts.load(`600 9px ${family}`).catch(() => {});
  const paper = getComputedStyle(document.body).backgroundColor;
  for (const canvas of document.querySelectorAll<GridDotOwner>("[data-portrait] canvas")) {
    const ink = getComputedStyle(canvas).getPropertyValue("--pui-text").trim() || "#fff";
    canvas.setPainter?.((cols, cellPx) => glyphPainter(cols, cellPx, family, mode, ink, paper));
  }
}
