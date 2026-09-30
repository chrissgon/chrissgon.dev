// What the portrait may do in this browser: pure functions, no DOM.
// Reduced motion or Save-Data: the poster only, still, and no video is ever requested (ADR-0008).
// No clips (Christopher has not generated them yet): the poster only, with motion, and no request either.

import type { Clip } from "./types.ts";

export interface Environment {
  reducedMotion: boolean;
  saveData: boolean;
}

export interface Plan {
  /** Intro, pointer reaction and scroll-back run. */
  motion: boolean;
  /** The clips to load after the page's `load` event; null means no video request at all. */
  video: { loop: Clip; greet: Clip | null } | null;
}

const usable = (c: Clip | undefined | null): Clip | null => {
  const list = (c ?? []).filter((u) => typeof u === "string" && u.length > 0);
  return list.length ? list : null;
};

export function plan(env: Environment, clips: { loop?: Clip | null; greet?: Clip | null }): Plan {
  const motion = !env.reducedMotion;
  const loop = usable(clips.loop);
  if (!motion || env.saveData || !loop) return { motion, video: null };
  return { motion, video: { loop, greet: usable(clips.greet) } };
}

/** Reads the environment from a browser-like global; missing APIs mean "no preference". */
export function readEnvironment(w: { matchMedia?: (q: string) => { matches: boolean }; navigator?: object }): Environment {
  // navigator.connection (Network Information API) is not in every browser nor in the DOM typings.
  const nav = w.navigator as { connection?: { saveData?: boolean } } | undefined;
  return {
    reducedMotion: !!w.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    saveData: !!nav?.connection?.saveData,
  };
}

/** The MIME type of a clip URL from its extension, or undefined. */
export function clipType(url: string): string | undefined {
  const m = /\.(webm|mp4)(?:[?#]|$)/i.exec(url);
  return m ? `video/${m[1]!.toLowerCase()}` : undefined;
}
