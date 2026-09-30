// Geometry of the portrait on the page grid: pure functions, no DOM.
// The canvas covers the layout slot plus a halo margin on every side. Portrait dots never leave the slot;
// the grid dots around it (the halo) grow with the portrait's nearby mass, so the grid thickens into the face.
// Grid dots sit on 28k + 13.5 px of the page, like a CSS radial-gradient grid, so a halo dot at rest
// lands exactly on the page's own grid dot.

import type { Rect } from "./types.ts";

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOut = (t: number): number => 1 - (1 - t) ** 3;
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export interface LayoutInput {
  /** Canvas and slot boxes in page coordinates (client rect + scroll). */
  canvas: Rect;
  slot: Rect;
  cols: number;
  rows: number;
  gridPx: number;
  subdiv: number;
  face: { x: number; y: number };
  /** Grid dot offset: dots at G·k + G/2 − off. */
  off?: number;
}

export interface Layout {
  /** Page grid pitch and poster cell size in px. */
  G: number;
  S: number;
  sub: number;
  off: number;
  /** Portrait origin in canvas px, on a page grid line. */
  X: number;
  Y: number;
  /** The slot in canvas px. */
  slot: { x0: number; y0: number; x1: number; y1: number };
  /** First grid dot in canvas px and the number of grid dots across and down the canvas. */
  gx0: number;
  gy0: number;
  NX: number;
  NY: number;
}

const mod = (a: number, m: number): number => ((a % m) + m) % m;

/**
 * Where the portrait goes in the canvas. A slot wider than the portrait centres it; a narrower one keeps
 * the face and a little to its right (the monitor), else centres the face. The origin snaps to the page grid.
 */
export function layout(i: LayoutInput): Layout {
  const G = i.gridPx, sub = i.subdiv, S = G / sub, off = i.off ?? 0.5, c = i.canvas, s = i.slot;
  const PW = i.cols * S, faceX = i.face.x * PW, keep = faceX + 0.2 * PW;
  const want = s.width >= PW ? (s.width - PW) / 2 : s.width >= keep ? 0 : s.width / 2 - faceX;
  const X = G * Math.round((s.left + want) / G) - c.left;
  const Y = G * Math.round(s.top / G) - c.top;
  const gx0 = mod(G / 2 - off - c.left, G), gy0 = mod(G / 2 - off - c.top, G);
  return {
    G, S, sub, off, X, Y,
    slot: { x0: s.left - c.left, y0: s.top - c.top, x1: s.left - c.left + s.width, y1: s.top - c.top + s.height },
    gx0, gy0,
    NX: Math.max(0, Math.ceil((c.width - gx0) / G)),
    NY: Math.max(0, Math.ceil((c.height - gy0) / G)),
  };
}

/** Centre of poster cell (c, r) in canvas px. */
export const cellX = (L: Layout, c: number): number => L.X + c * L.S + L.S / 2 - L.off;
export const cellY = (L: Layout, r: number): number => L.Y + r * L.S + L.S / 2 - L.off;
/** The grid dot a poster cell collapses to (its home). */
export const homeX = (L: Layout, c: number): number => L.X + L.G * Math.floor(c / L.sub) + L.G / 2 - L.off;
export const homeY = (L: Layout, r: number): number => L.Y + L.G * Math.floor(r / L.sub) + L.G / 2 - L.off;

/** Index of the grid dot at (x, y) in canvas px, or -1 outside the canvas. */
export function gridCell(L: Layout, x: number, y: number): number {
  const i = Math.round((x - L.gx0) / L.G), j = Math.round((y - L.gy0) / L.G);
  return i >= 0 && i < L.NX && j >= 0 && j < L.NY ? j * L.NX + i : -1;
}

/** Separable Gaussian blur of a NX × NY field (edges not padded, normalised by the full kernel). */
export function blur(field: Float32Array, NX: number, NY: number, sigma = 2.2, radius = 7): Float32Array {
  const K: number[] = [];
  for (let d = -radius; d <= radius; d++) K.push(Math.exp((-d * d) / (2 * sigma * sigma)));
  const ks = K.reduce((a, b) => a + b, 0), tmp = new Float32Array(NX * NY), out = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      let s = 0;
      for (let d = -radius; d <= radius; d++) {
        const ii = i + d;
        if (ii >= 0 && ii < NX) s += field[j * NX + ii]! * K[d + radius]!;
      }
      tmp[j * NX + i] = s / ks;
    }
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      let s = 0;
      for (let d = -radius; d <= radius; d++) {
        const jj = j + d;
        if (jj >= 0 && jj < NY) s += tmp[jj * NX + i]! * K[d + radius]!;
      }
      out[j * NX + i] = s / ks;
    }
  return out;
}

/** Halo strength 0..1 of a grid dot from the blurred mass; below 0.12 the plain grid shows (returns 0). */
export function haloStrength(blurred: number): number {
  const h = clamp01((blurred - 0.01) / 0.06);
  return h < 0.12 ? 0 : h;
}

/** Radius of a halo dot at full strength h, growing from the grid dot's 0.7 px. */
export const haloRadius = (h: number): number => 0.7 + 1.3 * h;

/**
 * Intro delay of each dot in ms: the portrait assembles outward from the face, with a little seeded jitter,
 * so every dot starts moving within `span` ms and the last finishes by `span + each`.
 */
export function introDelays(xs: ArrayLike<number>, ys: ArrayLike<number>, fx: number, fy: number, span: number, jitter = 60): Float32Array {
  const n = xs.length, out = new Float32Array(n);
  let maxD = 1, seed = 7;
  for (let i = 0; i < n; i++) maxD = Math.max(maxD, (out[i] = Math.hypot(xs[i]! - fx, ys[i]! - fy)));
  for (let i = 0; i < n; i++) {
    seed = (seed * 16807) % 2147483647;
    out[i] = (out[i]! / maxD) * span + (seed / 2147483647) * jitter;
  }
  return out;
}

/** Share of the slot above the viewport's top where the return to the grid starts, and where it ends. */
export const BACK_FROM = 0.55, BACK_TO = 0.95;

/**
 * How far the portrait has gone back to the grid by scrolling (0 in place, 1 all grid), eased. The portrait
 * stays whole while most of it is on screen: the return starts once BACK_FROM of the slot has scrolled above
 * the viewport and ends at BACK_TO, when little of it is left. (Until 2026-09-30 it started with the first
 * pixel of scroll, and 150 px down the face had lost about a third of its bright dots.)
 */
export function scrollBack(scrollY: number, slotTop: number, slotHeight: number): number {
  const gone = (scrollY - slotTop) / Math.max(1, slotHeight);
  return easeInOut(clamp01((gone - BACK_FROM) / (BACK_TO - BACK_FROM)));
}

/** The pointer push lives in push.ts, shared with the page's background dots. */
export { pointerPush, PUSH_PX, PUSH_R } from "./push.ts";
