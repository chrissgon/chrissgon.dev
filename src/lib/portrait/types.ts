// Types of the portrait island (ADR-0008).

/** The dot grid made by portrait.py: one hex digit (level 0..15) per cell, row by row. */
export interface Poster {
  cols: number;
  rows: number;
  levels: number;
  data: string;
}

/** How brightness becomes a level; the same values that made the poster (state.md, portrait parameters). */
export interface ToneOptions {
  gamma?: number;
  floor?: number;
  /** Histogram equalization instead of autocontrast, like portrait.py --equalize. */
  equalize?: boolean;
  /** Fixed contrast bounds (0..255); without them, autocontrast with a 1% cutoff on the first frame. */
  lo?: number;
  hi?: number;
}

/** One clip in every format offered; the browser plays the first it supports (type from the extension). */
export type Clip = readonly string[];

export interface PortraitOptions extends ToneOptions {
  /** The poster object; the first render needs no request. */
  poster: Poster;
  /** Idle loop. Absent or empty: poster only, and no video is ever requested. */
  loop?: Clip;
  /** Greeting, played once per session on arrival and when the pointer rests on the portrait. Needs `loop`. */
  greet?: Clip;
  /** Page grid pitch in px and poster cells per grid cell: 28 / 5 = 5.6 px per cell. */
  gridPx?: number;
  subdiv?: number;
  /** Face centre as 0..1 of the poster; the intro grows out from it and narrow slots keep it in view. */
  face?: { x: number; y: number };
  /**
   * Colour tokens read from the canvas (custom property names): the grid dot, then the dim, mid and bright
   * bands. Dark only (decision of 2026-09-29): light-dark() resolves to its dark value.
   */
  tokens?: readonly [dot: string, dim: string, mid: string, bright: string];
  /** Sampling rate of the video frames. */
  fps?: number;
  /** Minimum time between two greetings from the pointer, in ms. */
  greetEvery?: number;
  /** Assemble the portrait from the grid when it first comes into view. */
  intro?: boolean;
  /** Overrides of the environment, for tests. */
  reducedMotion?: boolean;
  saveData?: boolean;
}

/**
 * Another way to draw a portrait dot (a test, 2026-10-01: letters instead of dots). `setup` runs once per
 * paint, after which the fill style is set per group of dots; `dot` draws one, given its centre, the radius a
 * dot would have, its poster cell and the levels on show (one per poster cell); `reach` is how far from its centre, in px, a drawing may paint.
 */
export interface Painter {
  reach: number;
  setup(c: CanvasRenderingContext2D): void;
  dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, cell: number, levels: Uint8Array): void;
  /** Runs once after a paint's last dot, for a painter that gathers its dots and draws them together. */
  done?(c: CanvasRenderingContext2D): void;
}

export interface PortraitController {
  /** true sends every dot back to its grid position ("view as agent"); false brings the portrait back. */
  setGrid(on: boolean, instant?: boolean): void;
  /** Re-reads layout and colour tokens. */
  refresh(): void;
  /** Removes listeners, observers and video elements, and stops drawing. */
  destroy(): void;
}

/**
 * An element that draws some of the page's grid dots itself and moves them with the pointer: the portrait's
 * canvas, marked with the `data-grid-owner` attribute. The background dots (src/lib/griddots/) leave the dots
 * it owns alone, so no dot reacts twice. Coordinates are page px (client + scroll).
 */
export interface GridDotOwner extends Element {
  ownsGridDot?: (pageX: number, pageY: number) => boolean;
  /** Draws the portrait's dots (not the halo's) some other way, from the poster's columns and cell size. */
  setPainter?: (make: (cols: number, cellPx: number) => Painter) => void;
}

/** Axis-aligned box in px. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
