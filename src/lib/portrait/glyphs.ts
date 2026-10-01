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
  if (mode === "blocks") {
    const alpha = (level: number) => Math.min(1, 0.04 + 0.96 * (level / 15) ** 1.3);
    return {
      reach: size + cellPx,
      setup,
      // Each cell paints its own block and its own half of the line's letter (clipped to the cell), so the
      // order the cells are painted in does not matter. The blocks carry the face, so the letters stay
      // quieter than them: a see-through dark letter on a bright pair of blocks, and on a dim pair a light
      // letter only a little brighter than its blocks, which keeps the dark around the face clean. Both
      // halves of a letter use one ink, and a cell whose neighbour in the line is dark draws the whole letter.
      dot(c, x, y, _r, cell, levels) {
        const lower = Math.floor(cell / cols) % 2 === 1, fill = c.fillStyle;
        const other = levels[lower ? cell - cols : cell + cols] ?? 0, a = alpha(levels[cell] ?? 0);
        const mean = other ? (a + alpha(other)) / 2 : a, dark = mean > 0.35;
        c.save();
        c.fillStyle = ink;
        c.globalAlpha = a;
        c.fillRect(x - half, y - half, cellPx, cellPx);
        c.beginPath();
        if (other) c.rect(x - half, y - half, cellPx, cellPx);
        else c.rect(x - half, lower ? y - half - cellPx : y - half, cellPx, 2 * cellPx);
        c.clip();
        c.globalAlpha = dark ? 0.6 : Math.min(1, 0.1 + 1.2 * mean);
        c.fillStyle = dark ? paper : ink;
        c.fillText(letterAt(cell, cols), x, lower ? y - half : y + half);
        c.restore();
        c.fillStyle = fill;
      },
    };
  }
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
