// Where the page's grid dots are, and which of them the pointer reaches: pure functions, no DOM.
//
// The grid is the body's background (src/styles/site.css): a radial-gradient dot centred in each 28 px tile,
// anchored at the body's top-left corner, so dot (i, j) sits at (28i + 14, 28j + 14) in body px. The effect's
// layer (mount.ts) covers the body's box exactly, so layer px are body px and a dot drawn at dotAt(i) lands on
// the CSS dot it replaces. The canvas inside the layer starts on a grid line (a multiple of 28 px), so every
// dot sits at the same place inside its tile, and in device px, whatever part of the page the canvas covers.

export const GRID_PX = 28;

/** Centre of grid dot i along one axis, in layer px. */
export const dotAt = (i: number, G = GRID_PX): number => G * i + G / 2;

/** The grid dot nearest to v along one axis. */
export const nearestDot = (v: number, G = GRID_PX): number => Math.round((v - G / 2) / G);

/** Indices [lo, hi] of the dots along one axis whose centres lie within r of p, clipped to [0, n). */
export function dotRange(p: number, r: number, n: number, G = GRID_PX): [number, number] {
  return [Math.max(0, Math.ceil((p - r - G / 2) / G)), Math.min(n - 1, Math.floor((p + r - G / 2) / G))];
}

/** Calls f(i, j) for every grid dot strictly within r of (px, py), in an nx × ny grid. */
export function forDotsNear(px: number, py: number, r: number, nx: number, ny: number, f: (i: number, j: number) => void, G = GRID_PX): void {
  const [i0, i1] = dotRange(px, r, nx, G), [j0, j1] = dotRange(py, r, ny, G), r2 = r * r;
  for (let j = j0; j <= j1; j++) {
    const dy = dotAt(j, G) - py;
    for (let i = i0; i <= i1; i++) {
      const dx = dotAt(i, G) - px;
      if (dx * dx + dy * dy < r2) f(i, j);
    }
  }
}

/** A dot's key in a map: one number for (i, j), with i and j below 2^16 (1.8 million px of page). */
export const dotKey = (i: number, j: number): number => j * 65536 + i;
export const keyI = (k: number): number => k % 65536;
export const keyJ = (k: number): number => Math.floor(k / 65536);

/** Grid dots across a box of `px` layer px: the dots whose centres lie inside it. */
export const dotsAcross = (px: number, G = GRID_PX): number => Math.max(0, Math.floor((px - G / 2) / G) + 1);

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The part of the layer the canvas covers so it holds the viewport (in layer px): its edges on grid lines
 * (multiples of G, so on whole device px for the usual pixel ratios) and never outside the layer.
 */
export function canvasBox(view: Box, layerW: number, layerH: number, G = GRID_PX): Box {
  const x0 = Math.max(0, G * Math.floor(view.x0 / G)), y0 = Math.max(0, G * Math.floor(view.y0 / G));
  return {
    x0, y0,
    x1: Math.max(x0, Math.min(G * Math.ceil(layerW / G), G * Math.ceil(view.x1 / G))),
    y1: Math.max(y0, Math.min(G * Math.ceil(layerH / G), G * Math.ceil(view.y1 / G))),
  };
}

/** Whether box `outer` holds box `inner`. */
export const holds = (outer: Box, inner: Box): boolean =>
  inner.x0 >= outer.x0 && inner.y0 >= outer.y0 && inner.x1 <= outer.x1 && inner.y1 <= outer.y1;

/**
 * Where a dot centred at `v` layer px lands in device px of a canvas starting at `origin` layer px: the whole
 * device pixel `at` of its sprite and the fraction `phase` (0..1) the sprite's own centre carries. A dot at
 * rest gives the CSS dot's own phase; a moved dot keeps that phase and moves by whole device px, so it is
 * drawn as sharply as the grid.
 */
export function devicePlace(home: number, offset: number, origin: number, dpr: number): { at: number; phase: number } {
  const d = (home - origin) * dpr, at = Math.floor(d + 1e-6);
  return { at: at + Math.round(offset * dpr), phase: Math.round((d - at) * 8) / 8 };
}

/** The same colour with alpha `a`, from a computed "rgb(...)" / "rgba(...)" / "color(srgb ...)" value. */
export function withAlpha(css: string, a: number): string {
  const n = css.match(/[\d.]+/g)?.map(Number) ?? [];
  if (n.length < 3) return css;
  const rgb = /^\s*color\(/i.test(css) ? n.slice(0, 3).map((v) => Math.round(v * 255)) : n.slice(0, 3).map(Math.round);
  return `rgba(${rgb.join(", ")}, ${a})`;
}
