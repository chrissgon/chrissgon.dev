import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canvasBox, devicePlace, dotAt, dotKey, dotRange, dotsAcross, forDotsNear, GRID_PX, holds, keyI, keyJ, nearestDot, withAlpha,
} from "../src/lib/griddots/geometry.ts";
import { layout, pointerPush as portraitPush, PUSH_R as portraitR } from "../src/lib/portrait/grid.ts";
import { BG_PUSH_PX, BG_PUSH_R, MAX_STEP_MS, pointerPush, PUSH_PX, PUSH_R, SPRING_MS, springStep } from "../src/lib/portrait/push.ts";

describe("background dots: where the grid dots are", () => {
  it("puts dot i at 28i + 14 px, the centre of the CSS grid's tile", () => {
    expect(GRID_PX).toBe(28);
    expect([0, 1, 2, 10].map((i) => dotAt(i))).toEqual([14, 42, 70, 294]);
    expect(nearestDot(14)).toBe(0);
    expect(nearestDot(27.9)).toBe(0);
    expect(nearestDot(28.1)).toBe(1);
    expect(nearestDot(dotAt(37))).toBe(37);
  });

  it("matches the CSS grid the stylesheet draws: 28 px tiles anchored at the body's corner", () => {
    const css = readFileSync(new URL("../src/styles/site.css", import.meta.url), "utf8");
    expect(css).toMatch(/--grid:\s*28px/);
    const body = /\nbody\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(body).toMatch(/background-size:\s*var\(--grid\)\s+var\(--grid\)/);
    expect(body).toMatch(/background-position:\s*0\s+0/);
    expect(body).toMatch(/radial-gradient\(circle,\s*var\(--pui-bg-emphasis\)\s+0\.7px,\s*transparent\s+1px\)/);
    // The layer that draws the moved dots is the body's own box, behind the content.
    expect(body).toMatch(/position:\s*relative/);
    expect(body).toMatch(/isolation:\s*isolate/);
    const layer = /\.grid-dots\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(layer).toMatch(/inset:\s*0/);
    expect(layer).toMatch(/z-index:\s*-1/);
    expect(layer).toMatch(/pointer-events:\s*none/);
    expect(layer).toMatch(/overflow:\s*clip/);
  });

  it("lands on the portrait's halo dots: the same grid dot for the same page position", () => {
    // The portrait's canvas starts at an arbitrary page position; its grid dots are the page's.
    const L = layout({
      canvas: { left: 171, top: 37, width: 900, height: 700 }, slot: { left: 339, top: 205, width: 560, height: 666 },
      cols: 100, rows: 119, gridPx: 28, subdiv: 5, face: { x: 0.59, y: 0.35 },
    });
    for (const i of [7, 8, 20]) {
      const pageX = L.gx0 + i * L.G + 171;
      expect(Math.abs(pageX - dotAt(nearestDot(pageX)))).toBeLessThanOrEqual(0.5);
    }
  });

  it("counts the dots whose centres fit across a box", () => {
    expect(dotsAcross(0)).toBe(0);
    expect(dotsAcross(13)).toBe(0);
    expect(dotsAcross(14)).toBe(1);
    expect(dotsAcross(28)).toBe(1);
    expect(dotsAcross(1440)).toBe(51); // 14 + 28 × 50 = 1414 fits, 1442 does not
  });

  it("finds exactly the dots within the push radius", () => {
    const got: number[] = [];
    forDotsNear(300, 200, PUSH_R, 100, 100, (i, j) => got.push(dotKey(i, j)));
    const want: number[] = [];
    for (let j = 0; j < 100; j++)
      for (let i = 0; i < 100; i++) if (Math.hypot(dotAt(i) - 300, dotAt(j) - 200) < PUSH_R) want.push(dotKey(i, j));
    expect(got.sort((a, b) => a - b)).toEqual(want.sort((a, b) => a - b));
    expect(got.length).toBeGreaterThan(20);
    expect(got.length).toBeLessThan(30); // π × 80² / 28² ≈ 25.6: a frame moves a couple of dozen dots
  });

  it("clips the search to the grid's edges", () => {
    expect(dotRange(10, 80, 50)).toEqual([0, 2]);
    expect(dotRange(1400, 80, 51)).toEqual([47, 50]);
    const got: Array<[number, number]> = [];
    forDotsNear(5, 5, 40, 3, 3, (i, j) => got.push([i, j]));
    expect(got).toEqual([[0, 0], [1, 0], [0, 1]]);
  });

  it("keys a dot by (i, j) and back", () => {
    for (const [i, j] of [[0, 0], [51, 0], [0, 400], [65535, 9000]] as const) {
      const k = dotKey(i, j);
      expect([keyI(k), keyJ(k)]).toEqual([i, j]);
    }
    expect(dotKey(1, 0)).not.toBe(dotKey(0, 1));
  });
});

describe("background dots: the canvas over the viewport", () => {
  it("starts on a grid line and holds the viewport, within the layer", () => {
    const b = canvasBox({ x0: -28, y0: 1203.5, x1: 1468, y1: 2131.5 }, 1440, 9000);
    expect(b).toEqual({ x0: 0, y0: 1176, x1: 1456, y1: 2156 });
    expect(b.x0 % 28).toBe(0);
    expect(b.y0 % 28).toBe(0);
    expect(holds(b, { x0: 0, y0: 1231.5, x1: 1440, y1: 2103.5 })).toBe(true);
    // Near the bottom of the page the box stops at the layer's last tile.
    expect(canvasBox({ x0: 0, y0: 8500, x1: 1440, y1: 9400 }, 1440, 9000).y1).toBe(9016);
  });

  it("says when a box leaves the canvas", () => {
    const c = { x0: 0, y0: 0, x1: 100, y1: 100 };
    expect(holds(c, { x0: 0, y0: 0, x1: 100, y1: 100 })).toBe(true);
    expect(holds(c, { x0: 0, y0: -1, x1: 50, y1: 50 })).toBe(false);
    expect(holds(c, { x0: 10, y0: 10, x1: 101, y1: 50 })).toBe(false);
  });

  it("places a resting dot exactly where the CSS dot is, in device px, at every usual pixel ratio", () => {
    for (const dpr of [1, 1.25, 1.5, 2, 3]) {
      for (const origin of [0, 28, 1176]) {
        for (const i of [0, 3, 50]) {
          const p = devicePlace(dotAt(i), 0, origin, dpr);
          expect(p.at + p.phase).toBeCloseTo((dotAt(i) - origin) * dpr, 6);
        }
      }
    }
    // The phase is the same for every dot of a canvas on a grid line: one sprite draws them all.
    const phases = new Set([0, 1, 7, 40].map((i) => devicePlace(dotAt(i), 0, 28 * 5, 1.25).phase));
    expect([...phases]).toEqual([0.5]);
  });

  it("moves a dot by whole device px, keeping its phase", () => {
    const rest = devicePlace(dotAt(4), 0, 0, 2), moved = devicePlace(dotAt(4), 10.3, 0, 2);
    expect(moved.phase).toBe(rest.phase);
    expect(moved.at - rest.at).toBe(21);
    expect(devicePlace(dotAt(4), -0.2, 0, 2).at).toBe(rest.at); // under half a device px: in place
  });

  it("gives the dot colour a transparent edge of the same colour", () => {
    expect(withAlpha("rgb(31, 41, 55)", 0)).toBe("rgba(31, 41, 55, 0)");
    expect(withAlpha("rgba(31, 41, 55, 0.5)", 0)).toBe("rgba(31, 41, 55, 0)");
    expect(withAlpha("color(srgb 0.1 0.2 1)", 0)).toBe("rgba(26, 51, 255, 0)");
    expect(withAlpha("nonsense", 0)).toBe("nonsense");
  });
});

describe("background dots: the portrait's push and spring", () => {
  it("is the portrait's own push (one module for both)", () => {
    expect(portraitPush).toBe(pointerPush);
    expect(portraitR).toBe(PUSH_R);
    expect([PUSH_R, PUSH_PX, SPRING_MS]).toEqual([80, 26, 105]);
  });

  it("pushes the background's sparser dots harder and wider than the portrait's", () => {
    expect([BG_PUSH_R, BG_PUSH_PX]).toEqual([140, 48]);
    // The nearest grid dot (28 px away) moves more than a grid cell; one three cells away still moves visibly.
    expect(pointerPush(28, 0, BG_PUSH_R, BG_PUSH_PX)[0]).toBeGreaterThan(28);
    expect(pointerPush(84, 0, BG_PUSH_R, BG_PUSH_PX)[0]).toBeGreaterThan(5);
    expect(pointerPush(BG_PUSH_R, 0, BG_PUSH_R, BG_PUSH_PX)).toEqual([0, 0]);
    // With the portrait's push the same dots barely moved.
    expect(pointerPush(56, 0)[0]).toBeLessThan(3);
  });

  it("pushes a dot away from the pointer, most near it and not at all past the radius", () => {
    expect(pointerPush(PUSH_R, 0)).toEqual([0, 0]);
    const [x] = pointerPush(1, 0);
    expect(x).toBeGreaterThan(PUSH_PX * 0.9);
    expect(x).toBeLessThanOrEqual(PUSH_PX);
  });

  it("springs back within a second: under half a device px after 700 ms of 60 fps frames", () => {
    let o = PUSH_PX, t = 0;
    while (t < 700) {
      o += (0 - o) * springStep(1000 / 60);
      t += 1000 / 60;
    }
    expect(o).toBeLessThan(0.25);
    expect(springStep(16)).toBeCloseTo(1 - Math.exp(-16 / 105), 9);
    expect(springStep(10_000)).toBe(springStep(MAX_STEP_MS)); // a frame after a pause does not jump
    expect(springStep(-5)).toBe(0);
  });
});
