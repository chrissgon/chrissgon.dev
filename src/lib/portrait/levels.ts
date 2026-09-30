// Brightness levels of the portrait: pure functions, no DOM.
// A level is 0..15; 0 draws no dot. The poster comes as one hex digit per cell (scripts: portrait.py);
// video frames are mapped to the same levels by a lookup table built from the first sampled frame,
// with the same autocontrast or equalize, gamma and floor that made the poster, so the poster and the
// first video frame look alike.

import type { Poster, ToneOptions } from "./types.ts";

export const LEVELS = 16;
export const MAX_LEVEL = LEVELS - 1;

/** Decodes a poster into `cols × rows` levels, nearest-resampling when the size differs. Bad digits are 0. */
export function decodePoster(p: Poster, cols = p.cols, rows = p.rows): Uint8Array {
  if (p.data.length !== p.cols * p.rows) throw new Error(`portrait: poster has ${p.data.length} cells, expected ${p.cols * p.rows}`);
  const out = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const sr = Math.floor((r * p.rows) / rows);
    for (let c = 0; c < cols; c++) {
      const sc = Math.floor((c * p.cols) / cols);
      const v = parseInt(p.data.charAt(sr * p.cols + sc), 16);
      out[r * cols + c] = Number.isNaN(v) ? 0 : Math.min(MAX_LEVEL, v);
    }
  }
  return out;
}

/** 8-bit luma of an RGB pixel, the weights of ITU-R BT.601 in fixed point (as an "L" conversion does). */
export const luma = (r: number, g: number, b: number): number => (r * 77 + g * 150 + b * 29) >> 8;

/** Histogram (256 bins) of the luma of RGBA pixel data. */
export function lumaHistogram(rgba: ArrayLike<number>): Uint32Array {
  const h = new Uint32Array(256);
  for (let j = 0; j + 3 < rgba.length; j += 4) {
    const v = luma(rgba[j]!, rgba[j + 1]!, rgba[j + 2]!);
    h[v] = (h[v] ?? 0) + 1;
  }
  return h;
}

/** Autocontrast bounds with a cutoff (percent of pixels ignored at each end), like ImageOps.autocontrast. */
export function autoContrastBounds(h: ArrayLike<number>, cutoffPercent = 1): { lo: number; hi: number } {
  let n = 0;
  for (let i = 0; i < 256; i++) n += h[i] ?? 0;
  const cut = (n * cutoffPercent) / 100;
  let lo = 0, s = 0;
  while (lo < 255 && (s += h[lo] ?? 0) <= cut) lo++;
  let hi = 255;
  s = 0;
  while (hi > 0 && (s += h[hi] ?? 0) <= cut) hi--;
  return { lo, hi: Math.max(hi, lo + 1) };
}

/** Equalization table (value -> 0..255), the same algorithm as Pillow's ImageOps.equalize. */
export function equalizeTable(h: ArrayLike<number>): Uint8Array {
  const lut = new Uint8Array(256);
  let total = 0, lastNonZero = 0, nonZero = 0;
  for (let i = 0; i < 256; i++) {
    const v = h[i] ?? 0;
    if (v) { total += v; lastNonZero = v; nonZero++; }
  }
  const step = nonZero > 1 ? Math.floor((total - lastNonZero) / 255) : 0;
  if (!step) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  let n = Math.floor(step / 2);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.min(255, Math.floor(n / step));
    n += h[i] ?? 0;
  }
  return lut;
}

/** Level of a tone t in 0..1: gamma, 16 steps, and the floor (levels below it become 0). */
export function toneToLevel(t: number, gamma: number, floor: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  const v = Math.min(MAX_LEVEL, Math.floor(c ** gamma * LEVELS));
  return v >= floor ? v : 0;
}

/**
 * The luma -> level table for video frames, calibrated on one frame's histogram.
 * `equalize` mirrors the poster's `--equalize`; otherwise autocontrast with a 1% cutoff (or fixed lo/hi).
 */
export function levelTable(h: ArrayLike<number>, o: ToneOptions): Uint8Array {
  const gamma = o.gamma ?? 1, floor = o.floor ?? 0, lut = new Uint8Array(256);
  if (o.equalize) {
    const eq = equalizeTable(h);
    for (let p = 0; p < 256; p++) lut[p] = toneToLevel(eq[p]! / 255, gamma, floor);
    return lut;
  }
  const auto = o.lo == null || o.hi == null ? autoContrastBounds(h) : null;
  const lo = o.lo ?? auto!.lo, hi = Math.max(o.hi ?? auto!.hi, lo + 1);
  for (let p = 0; p < 256; p++) lut[p] = toneToLevel((p - lo) / (hi - lo), gamma, floor);
  return lut;
}

/** Dot radius in px of a level, for a cell of `cell` px: area grows with the level, never below `min`. */
export const dotRadius = (v: number, cell: number, min = 0.7): number => Math.max(min, Math.sqrt(v / MAX_LEVEL) * (cell / 2) * 0.96);

/** Colour band of a level: 1 dim (border), 2 mid (muted), 3 bright (text). 0 is the grid dot colour. */
export const band = (v: number): 0 | 1 | 2 | 3 => (v <= 0 ? 0 : v >= 9 ? 3 : v >= 5 ? 2 : 1);
