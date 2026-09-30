// The cover of a project card that has no image and no drawn visual: a dot pattern generated at build from the
// project's id, as inline SVG (a <pattern> tile filling the cover). The id is the only seed, so a project gets the
// same pattern on every build and in EN and PT, and two projects get different ones. Brand colours only: dots in
// #1F2937 and #374151 (Perfect UI's dark bg-emphasis and border), a few #9CA3AF (text-muted) on some; never the
// blue accent, no gradients, no shadows. Decorative: the caller hides it from assistive technology.

export const PATTERN_KINDS = ["grid", "sparse", "columns", "rows", "stagger", "twotone"] as const;
export type PatternKind = (typeof PATTERN_KINDS)[number];

export const PATTERN_COLORS = { dim: "#1F2937", dot: "#374151", lit: "#9CA3AF" } as const;

export interface CoverPattern {
  kind: PatternKind;
  /** The SVG element, sized 100% of its box; the tile is in CSS pixels, so dots keep their size at any width. */
  svg: string;
}

/** 32-bit FNV-1a of a string. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** murmur3's finaliser: spreads FNV's weak low bits before the kind is picked with a modulo. */
function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Prefixed to the id before hashing. Chosen once (the first of "cover-0:", "cover-1:", ... that does it) so the
// four in-progress projects of 2026-09-30 get the four kinds of the approved reference, in its order: dense grid,
// sparse grid, columns, rows. Changing it reshuffles every cover.
const SALT = "cover-670:";

/** The seed of a project's pattern. */
export function patternSeed(id: string): number {
  return mix(hashId(SALT + id));
}

/** mulberry32: a small deterministic generator of numbers in [0, 1). */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const circle = (cx: number, cy: number, r: number, fill: string) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;

interface Tile {
  w: number;
  h: number;
  dots: string;
  /** Lattice of the dots, for the lit accents: step and offset on each axis. */
  lattice: { dx: number; dy: number; ox: number; oy: number };
}

function tile(kind: PatternKind, r: () => number): Tile {
  switch (kind) {
    case "grid": {
      // A dense, even grid.
      const s = pick(r, [8, 9, 10]);
      const o = s / 2;
      return { w: s, h: s, dots: circle(o, o, 1, PATTERN_COLORS.dot), lattice: { dx: s, dy: s, ox: o, oy: o } };
    }
    case "sparse": {
      // A sparser grid of slightly larger dots.
      const s = pick(r, [14, 16, 18]);
      const o = s / 2;
      return { w: s, h: s, dots: circle(o, o, 1.25, PATTERN_COLORS.dot), lattice: { dx: s, dy: s, ox: o, oy: o } };
    }
    case "columns": {
      // Vertical dotted columns: dots close together down each column, columns far apart.
      const dx = pick(r, [14, 18, 22]);
      const dy = pick(r, [5, 6]);
      return { w: dx, h: dy, dots: circle(dx / 2, dy / 2, 1, PATTERN_COLORS.dot), lattice: { dx, dy: dy * 4, ox: dx / 2, oy: dy / 2 } };
    }
    case "rows": {
      // Horizontal dotted rows: dots close together along each row, rows far apart.
      const dx = pick(r, [5, 6]);
      const dy = pick(r, [12, 16, 20]);
      return { w: dx, h: dy, dots: circle(dx / 2, dy / 2, 1, PATTERN_COLORS.dot), lattice: { dx: dx * 4, dy, ox: dx / 2, oy: dy / 2 } };
    }
    case "stagger": {
      // An offset grid: every other row shifted by half a step.
      const s = pick(r, [10, 12, 14]);
      const q = s / 4;
      return {
        w: s,
        h: s,
        dots: circle(q, q, 1, PATTERN_COLORS.dot) + circle(3 * q, 3 * q, 1, PATTERN_COLORS.dot),
        lattice: { dx: s, dy: s, ox: q, oy: q },
      };
    }
    case "twotone": {
      // A dense grid of dim dots with every n-th dot, on both axes, in the brighter grey.
      const s = pick(r, [7, 8]);
      const n = pick(r, [3, 4]);
      const o = s / 2;
      let dots = "";
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) dots += circle(o + i * s, o + j * s, 1, i === 0 && j === 0 ? PATTERN_COLORS.dot : PATTERN_COLORS.dim);
      }
      return { w: s * n, h: s * n, dots, lattice: { dx: s * n, dy: s * n, ox: o, oy: o } };
    }
  }
}

/** The cover pattern of a project, from its id alone. */
export function coverPattern(id: string): CoverPattern {
  const seed = patternSeed(id);
  const r = random(seed);
  const kind = PATTERN_KINDS[seed % PATTERN_KINDS.length]!;
  const t = tile(kind, r);
  const ref = `cp-${id.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;

  // Two to four lit dots on half of the covers, on the pattern's own lattice, inside the part of the cover that
  // is visible at every width (the narrowest card is about 300 px wide, the cover 160 px high).
  let lit = "";
  if (r() < 0.5) {
    const count = 2 + Math.floor(r() * 3);
    const cols = Math.floor((300 - t.lattice.ox) / t.lattice.dx);
    const rows = Math.floor((140 - t.lattice.oy) / t.lattice.dy);
    const seen = new Set<string>();
    for (let k = 0; k < count; k++) {
      const i = 1 + Math.floor(r() * Math.max(1, cols - 1));
      const j = 1 + Math.floor(r() * Math.max(1, rows - 1));
      const key = `${i},${j}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lit += circle(t.lattice.ox + i * t.lattice.dx, t.lattice.oy + j * t.lattice.dy, 1.25, PATTERN_COLORS.lit);
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" aria-hidden="true" focusable="false">` +
    `<defs><pattern id="${ref}" width="${t.w}" height="${t.h}" patternUnits="userSpaceOnUse">${t.dots}</pattern></defs>` +
    `<rect width="100%" height="100%" fill="url(#${ref})"/>${lit}</svg>`;
  return { kind, svg };
}
