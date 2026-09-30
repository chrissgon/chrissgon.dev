// How the pointer moves dots: pure functions, no DOM. The portrait (mount.ts) and the page's background dots
// (src/lib/griddots/) share them, so both step aside from the pointer the same way. Kept apart from grid.ts so
// the background effect, loaded lazily, pulls in these few lines and nothing else of the portrait.

/** The pointer pushes dots within PUSH_R px, by up to PUSH_PX px. */
export const PUSH_R = 80, PUSH_PX = 26;

/** The page's background dots sit 28 px apart, five times the portrait's, so the same push barely moved them:
 *  they get a wider radius (5 grid cells) and a stronger push (the owner asked for a bigger effect, 2026-09-30). */
export const BG_PUSH_R = 140, BG_PUSH_PX = 48;

/** Time constant of the spring that eases a dot toward its target, in ms. */
export const SPRING_MS = 105;

/** A dot this close to its target (px, on each axis) has settled. */
export const SETTLE_PX = 0.05;

/** Longest frame step the spring takes, in ms (a frame after a pause does not jump). */
export const MAX_STEP_MS = 64;

/** Target displacement of a dot at (dx, dy) from the pointer: pushed away inside radius R, up to `push` px. */
export function pointerPush(dx: number, dy: number, R = PUSH_R, push = PUSH_PX): [number, number] {
  const d2 = dx * dx + dy * dy;
  if (d2 >= R * R) return [0, 0];
  const d = Math.sqrt(d2) || 0.01, f = (1 - d / R) ** 2 * push / d;
  return [dx * f, dy * f];
}

/** Share of the way to its target a dot covers in a frame of `dt` ms. */
export const springStep = (dt: number): number => 1 - Math.exp(-Math.min(MAX_STEP_MS, Math.max(0, dt)) / SPRING_MS);
