// The portrait's picture (owner, 2026-10-01): every poster cell is a block as bright as the picture there, and
// over the blocks run letters that spell Perfect UI class names as one selector (".pui-btn.pui-card..."), one
// letter per poster column and one line of text every two poster rows, so a 9 px monospace letter fills the
// 5.6 px cell pitch. The blocks carry the face; the letters stay quieter than them.
// Loaded by src/scripts/site.ts as a lazy chunk, outside the first render: the canvas waits for it.
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

/** The radius of a portrait dot in place (dotRadius in levels.ts). */
export const restRadius = (level: number, cellPx: number): number => Math.max(0.7, Math.sqrt(level / 15) * (cellPx / 2) * 0.96);

/**
 * The painter. A frame is drawn in two batches, because canvas calls per cell were the cost (2026-10-01,
 * profiled under the pointer: 1.6 million image copies in 6 s, against the dots' arcs):
 * - the blocks are gathered by brightness level and filled level by level, one opacity change per level;
 * - every letter is drawn once, in the page's background colour, into an atlas, and a frame copies one piece of
 *   it per letter
 *   (a tile is one poster cell wide and two tall, the letter centred on the line between its two rows).
 * Each block is its own fillRect, not part of one path: a path's anti-aliasing depends on what else is in
 * it, and a band repaint must give the same pixels as a whole-canvas one (check:portrait compares them).
 * Nothing is drawn in `dot` for a cell in place; `done` draws the blocks, then the letters over them.
 */
export function glyphPainter(cols: number, cellPx: number, family: string, ink = "#fff", paper = "#000"): Painter {
  const font = `600 ${Math.round((cellPx / 0.6) * 10) / 10}px ${family}`; // a monospace letter is 0.6 em wide
  const half = cellPx / 2, scale = Math.min(2, devicePixelRatio || 1);
  const chars = [...new Set(TEXT)], tw = cellPx * scale, th = 2 * tw, pitch = Math.ceil(tw) + 2, rowPx = Math.ceil(th) + 2;
  const width = pitch * chars.length, height = rowPx;
  const offscreen = typeof OffscreenCanvas === "function";
  const sheet = offscreen ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
  const a = sheet.getContext("2d") as CanvasRenderingContext2D;
  chars.forEach((ch, i) => {
    a.save();
    a.setTransform(scale, 0, 0, scale, i * pitch, 0);
    a.beginPath();
    a.rect(0, 0, cellPx, 2 * cellPx);
    a.clip();
    a.font = font;
    a.textAlign = "center";
    a.textBaseline = "middle";
    a.fillStyle = paper;
    a.fillText(ch, half, cellPx);
    a.restore();
  });
  // A bitmap is the cheapest thing to copy from; a browser without OffscreenCanvas copies from the canvas.
  const atlas: CanvasImageSource = offscreen ? (sheet as OffscreenCanvas).transferToImageBitmap() : (sheet as HTMLCanvasElement);
  // The atlas column of each position of the text, and each level's block opacity.
  const tile = Uint16Array.from(TEXT, (ch) => chars.indexOf(ch) * pitch);
  const alpha = Float32Array.from({ length: 16 }, (_, level) => Math.min(1, 0.04 + 0.96 * (level / 15) ** 1.3));
  // The radius of a dot in place: dotRadius of src/lib/portrait/levels.ts, repeated here so this lazy chunk
  // shares no module with the first render (tests/glyphs.test.ts checks the two agree).
  const full = Float32Array.from({ length: 16 }, (_, level) => restRadius(level, cellPx));
  // The frame's blocks, by level: x and y of each, flat, and how many numbers each level holds.
  const bx: number[][] = Array.from({ length: 16 }, () => []), bn = new Int32Array(16);
  let n = 0, started = 0, spent = 0, waiting = false;
  // The frame's letters: where, which tile and how opaque.
  const lx: number[] = [], ly: number[] = [], ls: number[] = [], la: number[] = [];
  // Its dots cost more than round ones, by an amount that depends on the device, so the budget of the banded
  // repaint follows the time this painter took in the last frame it painted and aims at 2.5 to 5 ms: a slow
  // device paints fewer bands per frame instead of blocking the page, and a device that turns 8 times slower
  // stays under 50 ms. 2500 is the dots' own budget (DOT_BUDGET in bands.ts).
  const painter: Painter = {
    budget: 2500,
    reach: Math.round((cellPx / 0.6) * 10) / 10 + cellPx,
    setup() {
      bn.fill(0);
      n = 0;
      started = performance.now();
    },
    // The blocks carry the face, so the letters stay quieter than them: every letter is dark (the page's
    // background colour) and see-through, fainter on a dim pair of blocks, which keeps the dark around the
    // face clean. A line's letter is drawn once, by its upper cell, or by the lower one when the upper is dark.
    // A cell on its way to or from the page's grid (the intro, the scroll-back) is the round dot it would
    // be without this painter, in the colour the frame has set: only a cell in place is a block.
    dot(c, x, y, r, cell, levels) {
      const level = levels[cell] ?? 0, row = Math.floor(cell / cols), lower = row % 2;
      if (r < full[level]! - 0.01) {
        c.beginPath();
        c.arc(x, y, r, 0, 2 * Math.PI);
        c.fill();
        return;
      }
      const other = levels[lower ? cell - cols : cell + cols] ?? 0;
      const list = bx[level]!, at = bn[level]!;
      list[at] = x - half;
      list[at + 1] = y - half;
      bn[level] = at + 2;
      if (lower && other) return;
      const own = alpha[level]!, mean = other ? (own + alpha[other]!) / 2 : own;
      lx[n] = x - half;
      ly[n] = lower ? y - half - cellPx : y - half;
      ls[n] = tile[(((row - lower) / 2) * cols + (cell % cols)) % tile.length]!;
      la[n++] = mean > 0.35 ? 0.6 : 0.1 + 1.2 * mean;
    },
    done(c) {
      c.fillStyle = ink;
      for (let level = 1; level < 16; level++) {
        const list = bx[level]!, end = bn[level]!;
        if (!end) continue;
        c.globalAlpha = alpha[level]!;
        for (let i = 0; i < end; i += 2) c.fillRect(list[i]!, list[i + 1]!, cellPx, cellPx);
      }
      for (let i = 0; i < n; i++) {
        c.globalAlpha = la[i]!;
        c.drawImage(atlas, ls[i]!, 0, tw, th, lx[i]!, ly[i]!, cellPx, 2 * cellPx);
      }
      c.globalAlpha = 1;
      spent += performance.now() - started;
      if (waiting) return;
      waiting = true;
      requestAnimationFrame(() => {
        const budget = painter.budget!;
        painter.budget = spent > 5 ? Math.max(300, budget * 0.6) : spent < 2.5 ? Math.min(2500, budget * 1.25) : budget;
        spent = 0;
        waiting = false;
      });
    },
  };
  return painter;
}

/**
 * Hands the painter to every portrait of the page, once the monospace font is there and the portrait is
 * mounted (this chunk may arrive first).
 */
export async function useGlyphs(): Promise<void> {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace";
  await document.fonts.load(`600 9px ${family}`).catch(() => {});
  const paper = getComputedStyle(document.body).backgroundColor;
  const canvases = [...document.querySelectorAll<HTMLCanvasElement & GridDotOwner>("[data-portrait] canvas")];
  for (let frame = 0; frame < 300 && canvases.some((c) => !c.setPainter); frame++) await new Promise(requestAnimationFrame);
  for (const canvas of canvases) {
    // The token as a colour the canvas takes: a custom property's own text may be light-dark(...), which a
    // canvas fill style ignores (the blocks were then filled with whatever colour was set last).
    const before = canvas.style.color;
    canvas.style.color = "var(--pui-text)";
    const ink = getComputedStyle(canvas).color || "#fff";
    canvas.style.color = before;
    canvas.setPainter?.((cols, cellPx) => glyphPainter(cols, cellPx, family, ink, paper));
  }
}
