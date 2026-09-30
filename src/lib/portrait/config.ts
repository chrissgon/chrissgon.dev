// The site's portrait settings. The tone values are the ones that made src/assets/portrait/portrait.json
// (personal-brand state.md, chosen poster parameters): portrait.py --crop 200,40,640,760 --cols 110
// --erase 364,330,28,36 --erase 668,322,32,34 --erase 255,330,90,110 --equalize --gamma 1.9 --floor 5.
// Video frames use the same tone so the poster and the first video frame match. When the clips are encoded,
// the poster is remade from the loop's first frame (scripts/encode-portrait.sh) and these values must follow.
import type { ToneOptions } from "./types.ts";

export const tone: ToneOptions = { equalize: true, gamma: 1.9, floor: 5 };

/** Face centre as 0..1 of the poster, read off the poster preview (between the eyes and the mouth). */
export const face = { x: 0.42, y: 0.33 };

/** Where the clips and the no-JS fallback are served from, and their file names (encode-portrait.sh writes them). */
export const publicDir = "portrait";
export const clipNames = {
  loop: ["portrait-loop.webm", "portrait-loop.mp4"],
  greet: ["portrait-greet.webm", "portrait-greet.mp4"],
} as const;
export const fallbackName = "portrait-fallback.webp";
