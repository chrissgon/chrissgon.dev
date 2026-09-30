// Build time only (node:fs): which portrait clips exist, so the page offers only files that are there.
// Absent clips mean an empty list, and the island then draws the poster without requesting any video.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { clipNames, publicDir } from "./config.ts";

export interface FoundClips {
  loop: string[];
  greet: string[];
}

/**
 * Lists the clip URLs whose files exist under `<dir>/` (default: `public/portrait` of the working directory,
 * or PORTRAIT_CLIPS_DIR, which the Playwright check uses to serve synthetic clips). A greeting without a loop
 * is dropped: the loop is what the page returns to.
 */
export function findClips(dir = process.env.PORTRAIT_CLIPS_DIR ?? join(process.cwd(), "public", publicDir), base = `/${publicDir}/`): FoundClips {
  const list = (names: readonly string[]) => names.filter((f) => existsSync(join(dir, f))).map((f) => base + f);
  const loop = list(clipNames.loop);
  return { loop, greet: loop.length ? list(clipNames.greet) : [] };
}
