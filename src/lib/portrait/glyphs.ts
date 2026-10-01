// A test variation of the portrait (owner, 2026-10-01): letters instead of dots. The letters spell Perfect UI
// class names as one selector (".pui-btn.pui-card..."), one letter per poster cell and one line of text every
// two poster rows, so a 9 px monospace letter fills the 5.6 px cell pitch. A letter is drawn where either
// of its two rows is lit, in one ink, more opaque the brighter the cell. Loaded only when the page's address
// carries ?portrait=text (src/scripts/site.ts), as a lazy chunk outside the first render.
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
 * How bright a line's letter is at a cell, 0..1: the brighter of the two poster rows the line covers. Returns
 * -1 for the lower row when the upper one is lit, since the upper cell draws the letter then.
 */
export function letterLevel(cell: number, cols: number, levels: ArrayLike<number>, max = 15): number {
  const lower = Math.floor(cell / cols) % 2 === 1;
  const own = levels[cell] ?? 0, other = levels[lower ? cell - cols : cell + cols] ?? 0;
  if (lower && other) return -1;
  return Math.max(own, other) / max;
}

export function glyphPainter(cols: number, cellPx: number, family: string, ink = "#fff"): Painter {
  const size = Math.round((cellPx / 0.6) * 10) / 10; // a monospace letter is 0.6 em wide
  const font = `600 ${size}px ${family}`, half = cellPx / 2;
  return {
    reach: size + cellPx,
    setup(c) {
      c.font = font;
      c.textAlign = "center";
      c.textBaseline = "middle";
    },
    // One ink for every letter, more opaque the brighter the cell: with letters all the same size, opacity is
    // what carries the picture (the dots' three colour bands left the dim letters unreadable).
    dot(c, x, y, r, cell, levels) {
      const lv = letterLevel(cell, cols, levels);
      if (lv < 0) return;
      const lower = Math.floor(cell / cols) % 2 === 1, fill = c.fillStyle;
      c.fillStyle = ink;
      c.globalAlpha = Math.min(1, (0.22 + 0.78 * lv) * Math.min(1, r / (half * 0.5)));
      c.fillText(letterAt(cell, cols), x, lower ? y - half : y + half);
      c.globalAlpha = 1;
      c.fillStyle = fill;
    },
  };
}

/** Hands the letters to every mounted portrait of the page, once the monospace font is there. */
export async function useGlyphs(): Promise<void> {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace";
  await document.fonts.load(`600 9px ${family}`).catch(() => {});
  for (const canvas of document.querySelectorAll<GridDotOwner>("[data-portrait] canvas")) {
    const ink = getComputedStyle(canvas).getPropertyValue("--pui-text").trim() || "#fff";
    canvas.setPainter?.((cols, cellPx) => glyphPainter(cols, cellPx, family, ink));
  }
}
