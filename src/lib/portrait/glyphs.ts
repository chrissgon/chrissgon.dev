// A test variation of the portrait (owner, 2026-10-01): letters instead of dots. The letters spell Perfect UI
// class names as one selector (".pui-btn.pui-card..."), one letter per poster cell and one line of text every
// two poster rows, so a 9 px monospace letter fills the 5.6 px cell pitch. A letter is drawn where its cell is
// lit, in the cell's colour band, more opaque the brighter the cell. Loaded only when the page's address
// carries ?portrait=text (src/scripts/site.ts), as a lazy chunk outside the first render.
import type { GridDotOwner, Painter } from "./types.ts";

/** Classes of Perfect UI 1.0.0's stylesheet (node_modules/@chrissgon/perfectui/dist/perfectui.css). */
export const CLASSES = [
  "pui-btn", "pui-card", "pui-badge", "pui-input", "pui-modal", "pui-table", "pui-chip", "pui-switch",
  "pui-tooltip", "pui-dropdown", "pui-accordion", "pui-timeline", "pui-list", "pui-checkbox", "pui-radio",
  "pui-outline", "pui-surface", "pui-solid", "pui-soft", "pui-rounded", "pui-theme",
];
export const TEXT = CLASSES.map((c) => `.${c}`).join("");

/** The letter of a poster cell, or "" on the rows between two lines of text. */
export function letterAt(cell: number, cols: number, text = TEXT): string {
  const row = Math.floor(cell / cols);
  if (row % 2) return "";
  return text[((row / 2) * cols + (cell % cols)) % text.length] ?? "";
}

export function glyphPainter(cols: number, cellPx: number, family: string): Painter {
  const size = Math.round((cellPx / 0.6) * 10) / 10; // a monospace letter is 0.6 em wide
  const font = `500 ${size}px ${family}`, half = cellPx / 2;
  return {
    reach: size,
    setup(c) {
      c.font = font;
      c.textAlign = "center";
      c.textBaseline = "middle";
    },
    dot(c, x, y, r, cell) {
      const ch = letterAt(cell, cols);
      if (!ch) return;
      c.globalAlpha = Math.min(1, 0.25 + (0.75 * r) / (half * 0.96));
      c.fillText(ch, x, y + half);
      c.globalAlpha = 1;
    },
  };
}

/** Hands the letters to every mounted portrait of the page, once the monospace font is there. */
export async function useGlyphs(): Promise<void> {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace";
  await document.fonts.load(`500 9px ${family}`).catch(() => {});
  for (const canvas of document.querySelectorAll<GridDotOwner>("[data-portrait] canvas")) {
    canvas.setPainter?.((cols, cellPx) => glyphPainter(cols, cellPx, family));
  }
}
