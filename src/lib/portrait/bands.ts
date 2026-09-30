// Banded redraw of the portrait: pure functions, no DOM.
// In Lighthouse's software-rendered canvas the cost of a frame is the rasterisation of its dots, so a video
// frame that repaints every dot at once is one long task (30 ms at 4x CPU slowdown on a laptop, 10 ms without).
// When nothing moves (no pointer, no intro, no scroll-back), the canvas is instead cut into horizontal bands:
// only bands whose levels changed are repainted, at most a budget of dots per animation frame. A whole picture
// then takes a few frames (about 80 ms), every task stays short, and a slow device lowers the frame rate
// instead of blocking the page.

/** Rows of the canvas per band, in CSS px (one page grid row). */
export const BAND_PX = 28;

/**
 * Dot places (lit or not) painted per animation frame at most: about 2 ms of main thread on a laptop in
 * software rendering, 10 ms at 4x CPU slowdown. The poster's 9,700 places take 4 to 5 frames.
 */
export const DOT_BUDGET = 2500;

export interface Bands {
  /** Number of bands; band b covers canvas rows [b·px, (b+1)·px) in CSS px. */
  count: number;
  px: number;
  /** Band b paints particles order[start[b]] .. order[end[b] - 1], in particle order. */
  order: Int32Array;
  start: Int32Array;
  end: Int32Array;
}

/**
 * Splits a canvas `height` px tall into bands of `px` and lists, for each band, the particles (by their y at
 * rest) that can paint into it: a dot reaches `margin` px around its centre (its largest radius plus the
 * anti-aliased edge), so one near a border is listed in both bands. Linear time, no sort.
 */
export function planBands(ys: ArrayLike<number>, height: number, margin: number, px = BAND_PX): Bands {
  const count = Math.max(1, Math.ceil(height / px)), n = ys.length;
  const lo = new Int32Array(n), hi = new Int32Array(n), start = new Int32Array(count), end = new Int32Array(count);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [a, b] = bandRange(ys[i]!, margin, count, px);
    lo[i] = a;
    hi[i] = b;
    for (let k = a; k <= b; k++) start[k]!++;
    total += b - a + 1;
  }
  // start[b] holds the band's size; turn it into offsets, then fill each band in particle order.
  for (let b = 0, sum = 0; b < count; b++) {
    const size = start[b]!;
    start[b] = end[b] = sum;
    sum += size;
  }
  const order = new Int32Array(total);
  for (let i = 0; i < n; i++) for (let k = lo[i]!; k <= hi[i]!; k++) order[end[k]!++] = i;
  return { count, px, order, start, end };
}

/** The bands a dot at y can paint into: [lo, hi], clamped to the canvas. */
export function bandRange(y: number, margin: number, count: number, px = BAND_PX): [number, number] {
  const lo = Math.floor((y - margin) / px), hi = Math.floor((y + margin) / px);
  return [Math.max(0, Math.min(count - 1, lo)), Math.max(0, Math.min(count - 1, hi))];
}

/**
 * Marks dirty the bands of every cell whose level differs between `drawn` and `next`, and copies `next` into
 * `drawn`. `lo`/`hi` give each cell's band range; -1 means the cell paints nothing (outside the slot).
 * Returns the number of cells that changed.
 */
export function markChanged(drawn: Uint8Array, next: ArrayLike<number>, lo: Int16Array, hi: Int16Array, dirty: Uint8Array): number {
  let changed = 0;
  for (let i = 0; i < drawn.length; i++) {
    const v = next[i]!;
    if (drawn[i] === v) continue;
    drawn[i] = v;
    changed++;
    const a = lo[i]!;
    if (a < 0) continue;
    for (let b = a; b <= hi[i]!; b++) dirty[b] = 1;
  }
  return changed;
}

/**
 * The dirty bands to paint in this frame, taken in order from `cursor` (wrapping), until their particles
 * reach `budget`; at least one band when any is dirty. Clears their flags. Returns the bands and the cursor
 * for the next frame, so a band never waits more than one sweep.
 */
export function takeBands(dirty: Uint8Array, bands: Pick<Bands, "start" | "end">, cursor: number, budget = DOT_BUDGET): { take: number[]; cursor: number } {
  const count = dirty.length, take: number[] = [];
  let cost = 0, b = ((cursor % count) + count) % count;
  for (let k = 0; k < count; k++, b = (b + 1) % count) {
    if (!dirty[b]) continue;
    const c = bands.end[b]! - bands.start[b]!;
    if (take.length && cost + c > budget) break;
    take.push(b);
    dirty[b] = 0;
    cost += c;
  }
  return { take, cursor: b };
}

/** True when any band is still dirty. */
export const anyDirty = (dirty: Uint8Array): boolean => dirty.indexOf(1) >= 0;
