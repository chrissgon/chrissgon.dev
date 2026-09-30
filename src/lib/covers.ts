// A post's cover as a 9:16 portrait, cropped at build (owner, 2026-09-30: "capas maiores 9:16"). The crop is the
// largest 9:16 rectangle the source holds, anchored where the post's subject is (`coverFocus` in src/data/posts.json).
// The srcset never asks for a width above that crop: the image service does not enlarge, and a request larger than
// the source in both directions would come back uncropped.

/** Width over height of a post cover. */
export const COVER_RATIO = 9 / 16;

/** Srcset candidates: the four-column card (about 288 px) at 1x and 2x, and 432 for the phone layouts at 1.5x-2x. */
export const COVER_WIDTHS = [288, 432, 576] as const;

export interface Size {
  width: number;
  height: number;
}

/** The largest crop of `ratio` (width over height) that fits in `source`, in whole pixels. */
export function largestCrop(source: Size, ratio: number = COVER_RATIO): Size {
  if (!(source.width > 0 && source.height > 0 && ratio > 0)) throw new Error("largestCrop: sizes and ratio must be positive");
  if (source.width / source.height > ratio) {
    return { width: Math.floor(source.height * ratio), height: source.height };
  }
  return { width: source.width, height: Math.floor(source.width / ratio) };
}

/**
 * The srcset widths for a crop at most `max` pixels wide: the candidates below `max`, plus `max` itself when a
 * candidate was dropped for being too wide. A candidate within 10% of `max` is dropped too, so no two files differ
 * by a few pixels. Sorted ascending, never empty.
 */
export function coverWidths(max: number, candidates: readonly number[] = COVER_WIDTHS): number[] {
  if (!(max > 0)) throw new Error("coverWidths: max must be positive");
  const sorted = [...new Set(candidates)].filter((w) => w > 0).sort((a, b) => a - b);
  const kept = sorted.filter((w) => w < max * 0.9);
  if (kept.length < sorted.length || kept.length === 0) kept.push(Math.floor(max));
  return kept;
}

/** Width and height of the cover at a given width, keeping `ratio`. */
export function coverSize(width: number, ratio: number = COVER_RATIO): Size {
  return { width, height: Math.round(width / ratio) };
}
