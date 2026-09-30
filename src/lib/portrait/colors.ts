// Colours of the dots from the page's CSS tokens: pure functions, no DOM.
// A dot fades from the grid dot colour (at rest on the grid) to its band colour (in the portrait) in
// STEPS steps, so one Path2D per (band, step) draws a whole frame in at most 4 × (STEPS + 1) fills.

export type RGB = readonly [number, number, number];

export const STEPS = 8;

/** Parses a computed colour ("rgb(1, 2, 3)", "rgba(1 2 3 / 0.5)", "color(srgb 0.1 0.2 0.3)") to 0..255 RGB. */
export function parseColor(css: string): RGB | null {
  const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(css);
  if (srgb) return [0, 1, 2].map((i) => Math.round(Number(srgb[i + 1]) * 255)) as unknown as RGB;
  const m = css.match(/[\d.]+/g);
  if (!m || m.length < 3 || !/^rgba?\(/i.test(css.trim())) return null;
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

export const mix = (a: RGB, b: RGB, t: number): string =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * t)).join(",")})`;

/** Fill styles indexed by band * (STEPS + 1) + step. Band 0 is the grid dot colour at every step. */
export function fills(dot: RGB, bands: readonly [RGB, RGB, RGB]): string[] {
  const out: string[] = [];
  for (const b of [dot, ...bands]) for (let s = 0; s <= STEPS; s++) out.push(mix(dot, b, s / STEPS));
  return out;
}

/** Perfect UI dark values of the default tokens, used when a token does not resolve. */
export const DEFAULT_RGB: readonly [RGB, RGB, RGB, RGB] = [
  [31, 41, 55], // --pui-bg-emphasis
  [55, 65, 81], // --pui-border
  [156, 163, 175], // --pui-muted
  [255, 255, 255], // --pui-text
];
