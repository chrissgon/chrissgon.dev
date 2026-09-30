// The site's portrait settings. The poster (src/assets/portrait/portrait.json) is the first frame of the loop
// clip, made by scripts/encode-portrait.sh with the same crop as the clips (source box 288,2,600,714 of the
// 1280x720 loop, inside its square picture) and this tone: portrait.py --crop 288,2,600,714 --cols 110
// --gamma 1.4 --floor 3, autocontrast (no --equalize, which flattened the face into one bright patch in this
// darker scene). No accessory is erased: the clip's frames show none. Video frames use the same tone so the
// poster and the first video frame match; when the clips are encoded again these values must follow.
import type { ToneOptions } from "./types.ts";

export const tone: ToneOptions = { equalize: false, gamma: 1.4, floor: 3 };

/**
 * The intro (dots flying from the grid into the portrait) is off: in the hero it would run during page load,
 * and in Lighthouse's software-rasterised canvas each of its frames is a long task (PR #7 on main: total
 * blocking time 550-640 ms, performance 84, under the gate of 90). The poster is drawn at once instead.
 * The renderer keeps the option (`intro: true`) for a placement below the fold or a cheaper intro.
 */
export const intro = false;

/**
 * Poster cells per page grid cell (28 px): 4 gives 7 px dots, a portrait of 770 x 917 px (5 gave 5.6 px and
 * 616 x 734). Raised on 2026-09-30 when the hero's divider went and the portrait column widened, so the face
 * and the typing hands read larger. Must be a whole number: halo cells group SUB x SUB poster cells.
 */
export const subdiv = 4;

/** Face centre as 0..1 of the poster, read off the poster preview (between the eyes and the mouth). */
export const face = { x: 0.59, y: 0.35 };

/** Where the clips and the no-JS fallback are served from, and their file names (encode-portrait.sh writes them). */
export const publicDir = "portrait";
export const clipNames = {
  loop: ["portrait-loop.webm", "portrait-loop.mp4"],
  greet: ["portrait-greet.webm", "portrait-greet.mp4"],
} as const;
export const fallbackName = "portrait-fallback.webp";
