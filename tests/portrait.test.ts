import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import poster from "../src/assets/portrait/portrait.json" with { type: "json" };
import { anyDirty, BAND_PX, bandRange, DOT_BUDGET, markChanged, planBands, takeBands } from "../src/lib/portrait/bands.ts";
import { findClips } from "../src/lib/portrait/clips.ts";
import { fills, parseColor, STEPS, type RGB } from "../src/lib/portrait/colors.ts";
import { clipType, plan, readEnvironment } from "../src/lib/portrait/gating.ts";
import {
  blur, cellX, gridCell, haloRadius, haloStrength, homeX, introDelays, layout, pointerPush, scrollBack,
} from "../src/lib/portrait/grid.ts";
import {
  autoContrastBounds, band, decodePoster, dotRadius, equalizeTable, levelTable, luma, lumaHistogram, toneToLevel,
} from "../src/lib/portrait/levels.ts";

/** A 256-bin histogram from {value: count}. */
const hist = (counts: Record<number, number>) => {
  const h = new Uint32Array(256);
  for (const [v, c] of Object.entries(counts)) h[Number(v)] = c;
  return h;
};

describe("portrait levels (level mapping)", () => {
  it("decodes the poster hex digits, and nearest-resamples to another size", () => {
    const p = { cols: 3, rows: 2, levels: 16, data: "0f8" + "a1z" };
    expect([...decodePoster(p)]).toEqual([0, 15, 8, 10, 1, 0]);
    expect([...decodePoster(p, 6, 2)]).toEqual([0, 0, 15, 15, 8, 8, 10, 10, 1, 1, 0, 0]);
    expect(() => decodePoster({ ...p, data: "0f" })).toThrow(/2 cells, expected 6/);
  });

  it("maps a tone to a level the way portrait.py does: min(15, int(t ** gamma * 16)), then the floor", () => {
    for (let p = 0; p < 256; p += 17) {
      const py = Math.min(15, Math.floor((p / 255) ** 1.9 * 16));
      expect(toneToLevel(p / 255, 1.9, 0)).toBe(py);
      expect(toneToLevel(p / 255, 1.9, 5)).toBe(py >= 5 ? py : 0);
    }
    expect(toneToLevel(-1, 1, 0)).toBe(0);
    expect(toneToLevel(2, 1, 0)).toBe(15);
  });

  it("equalizes like Pillow's ImageOps.equalize (values computed with Pillow)", () => {
    const lut = equalizeTable(hist({ 10: 100, 50: 300, 51: 50, 200: 40, 250: 10 }));
    expect([lut[10], lut[50], lut[51], lut[200], lut[250]]).toEqual([0, 100, 255, 255, 255]);
    const flat = equalizeTable(hist({ 80: 1000 })); // one value: identity, as in Pillow
    expect(flat[80]).toBe(80);
  });

  it("finds autocontrast bounds with a 1% cutoff (Pillow maps 10 -> 0 and 250 -> 255 on the same data)", () => {
    expect(autoContrastBounds(hist({ 10: 100, 50: 300, 51: 50, 200: 40, 250: 10 }))).toEqual({ lo: 10, hi: 250 });
    expect(autoContrastBounds(hist({ 7: 10 }))).toEqual({ lo: 7, hi: 8 });
  });

  it("builds the video level table from a frame, with equalize or autocontrast, gamma and floor", () => {
    const h = hist({ 0: 500, 128: 250, 255: 250 });
    const eq = levelTable(h, { equalize: true, gamma: 1, floor: 0 }), eqTable = equalizeTable(h);
    expect(eq[128]).toBe(toneToLevel(eqTable[128]! / 255, 1, 0));
    const ac = levelTable(h, { gamma: 1, floor: 0 });
    expect([ac[0], ac[255]]).toEqual([0, 15]);
    const floored = levelTable(h, { gamma: 1, floor: 9, lo: 0, hi: 255 });
    expect(floored[128]).toBe(0); // level 8 is under the floor
    expect(floored[160]).toBe(10);
  });

  it("computes luma and its histogram from RGBA data", () => {
    expect(luma(255, 255, 255)).toBe(255);
    expect(luma(0, 0, 0)).toBe(0);
    const h = lumaHistogram(Uint8ClampedArray.from([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 0]));
    expect([h[255], h[0]]).toEqual([1, 2]);
  });

  it("sizes and colours dots by level", () => {
    expect(dotRadius(0, 5.6)).toBe(0.7);
    expect(dotRadius(15, 5.6)).toBeCloseTo(2.688, 3);
    expect(dotRadius(4, 5.6)).toBeLessThan(dotRadius(9, 5.6));
    expect([0, 1, 4, 5, 8, 9, 15].map(band)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });
});

describe("portrait grid and halo maths", () => {
  const base = { cols: 110, rows: 131, gridPx: 28, subdiv: 5, face: { x: 0.42, y: 0.33 } };
  const H = 168;
  const at = (left: number, top: number, width: number, height: number) =>
    layout({ ...base, slot: { left, top, width, height }, canvas: { left: left - H, top: top - H, width: width + 2 * H, height: height + 2 * H } });

  it("puts the portrait origin on a page grid line, centred in a wide slot", () => {
    const L = at(100, 300, 700, 734);
    const pageX = L.X + 100 - H, pageY = L.Y + 300 - H;
    expect(pageX % 28).toBe(0);
    expect(pageY % 28).toBe(0);
    expect(Math.abs(pageX - (100 + (700 - 616) / 2))).toBeLessThanOrEqual(14);
  });

  it("keeps the face in view when the slot is narrower than the portrait", () => {
    const narrow = at(16, 300, 343, 734), s = narrow.slot;
    const faceX = narrow.X + 0.42 * 616;
    expect(faceX).toBeGreaterThan(s.x0);
    expect(faceX).toBeLessThan(s.x1);
    expect(Math.abs(faceX - (s.x0 + s.x1) / 2)).toBeLessThanOrEqual(14); // centred on the face, snapped to 28 px
  });

  it("puts grid dots at 28k + 13.5 px of the page, and homes each cell on one", () => {
    const L = at(37, 211, 616, 734);
    expect((L.gx0 + 37 - H - 13.5) % 28).toBeCloseTo(0, 6);
    expect((L.gy0 + 211 - H - 13.5 + 280) % 28).toBeCloseTo(0, 6);
    const hx0 = homeX(L, 0);
    expect(gridCell(L, hx0, L.gy0)).toBeGreaterThanOrEqual(0);
    expect(homeX(L, 4)).toBe(hx0);
    expect(homeX(L, 5)).toBe(hx0 + 28);
    expect(cellX(L, 2)).toBeCloseTo(hx0, 6); // the middle cell of a block sits on its grid dot
    expect(gridCell(L, -1000, -1000)).toBe(-1);
  });

  it("blurs the portrait mass symmetrically and keeps it where the portrait is", () => {
    const NX = 21, NY = 21, f = new Float32Array(NX * NY);
    f[10 * NX + 10] = 1;
    const b = blur(f, NX, NY);
    expect(b[10 * NX + 10]).toBeGreaterThan(b[10 * NX + 12]!);
    expect(b[10 * NX + 7]).toBeCloseTo(b[10 * NX + 13]!, 9);
    expect(b[7 * NX + 10]).toBeCloseTo(b[10 * NX + 7]!, 9);
    const sum = b.reduce((a, v) => a + v, 0);
    expect(sum).toBeCloseTo(1, 3);
  });

  it("grows halo dots only near enough mass", () => {
    expect(haloStrength(0)).toBe(0);
    expect(haloStrength(0.01 + 0.06 * 0.1)).toBe(0); // under 0.12: the plain grid shows
    expect(haloStrength(0.04)).toBeCloseTo(0.5, 6);
    expect(haloStrength(1)).toBe(1);
    expect(haloRadius(0)).toBe(0.7);
    expect(haloRadius(1)).toBe(2);
  });

  it("assembles the intro outward from the face within the span", () => {
    const d = introDelays([0, 10, 100], [0, 0, 0], 0, 0, 520, 60);
    expect(d[0]).toBeLessThan(d[1]!);
    expect(d[1]).toBeLessThan(d[2]!);
    for (const v of d) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(580);
  });

  it("returns to the grid as the page scrolls past the slot", () => {
    expect(scrollBack(0, 300, 734)).toBe(0);
    expect(scrollBack(240, 300, 734)).toBe(0);
    expect(scrollBack(240 + 734 * 0.3, 300, 734)).toBeCloseTo(0.5, 6);
    expect(scrollBack(5000, 300, 734)).toBe(1);
  });

  it("pushes dots away from the pointer, only within its radius", () => {
    expect(pointerPush(100, 0)).toEqual([0, 0]);
    const [x, y] = pointerPush(20, 0);
    expect(x).toBeGreaterThan(0);
    expect(y).toBe(0);
    expect(pointerPush(-20, 0)[0]).toBeLessThan(0);
    expect(pointerPush(10, 0)[0]).toBeGreaterThan(pointerPush(40, 0)[0]);
  });
});

describe("portrait banded repaint", () => {
  it("lists every particle in each band it can paint into, in particle order", () => {
    // Band px 10, margin 2: y 5 is in band 0 only, y 9 reaches band 1, y 21 reaches back into band 1.
    const ys = [5, 9, 21, 35, 0];
    const b = planBands(ys, 40, 2, 10);
    expect(b.count).toBe(4);
    const band = (k: number) => [...b.order.subarray(b.start[k]!, b.end[k]!)];
    expect(band(0)).toEqual([0, 1, 4]);
    expect(band(1)).toEqual([1, 2]);
    expect(band(2)).toEqual([2]);
    expect(band(3)).toEqual([3]);
    // Brute force on a grid of dots: a particle is in band k exactly when [y - margin, y + margin] meets it.
    const many = Array.from({ length: 300 }, (_, i) => (i * 7.3) % 200);
    const p = planBands(many, 200, 3.3);
    for (let k = 0; k < p.count; k++) {
      const want = many.flatMap((y, i) => (y + 3.3 >= k * BAND_PX && y - 3.3 < (k + 1) * BAND_PX ? [i] : []));
      expect([...p.order.subarray(p.start[k]!, p.end[k]!)]).toEqual(want);
    }
    expect(planBands([], 0, 1).count).toBe(1);
  });

  it("clamps a dot's band range to the canvas", () => {
    expect(bandRange(14, 3, 10)).toEqual([0, 0]);
    expect(bandRange(27, 3, 10)).toEqual([0, 1]);
    expect(bandRange(-10, 3, 10)).toEqual([0, 0]);
    expect(bandRange(1000, 3, 10)).toEqual([9, 9]);
  });

  it("marks only the bands of cells whose level changed, and remembers the new levels", () => {
    const drawn = Uint8Array.from([0, 5, 9, 9]), lo = Int16Array.from([0, 1, 2, -1]), hi = Int16Array.from([0, 2, 2, -1]);
    const dirty = new Uint8Array(4);
    expect(markChanged(drawn, [0, 6, 9, 3], lo, hi, dirty)).toBe(2);
    expect([...dirty]).toEqual([0, 1, 1, 0]); // cell 3 changed but paints nothing
    expect([...drawn]).toEqual([0, 6, 9, 3]);
    dirty.fill(0);
    expect(markChanged(drawn, [0, 6, 9, 3], lo, hi, dirty)).toBe(0);
    expect(anyDirty(dirty)).toBe(false);
  });

  it("takes dirty bands from the cursor within the budget, at least one, and wraps", () => {
    const bands = { start: Int32Array.from([0, 10, 20, 30]), end: Int32Array.from([10, 20, 30, 40]) };
    const dirty = Uint8Array.from([1, 1, 0, 1]);
    let r = takeBands(dirty, bands, 1, 15);
    expect(r.take).toEqual([1]);
    expect([...dirty]).toEqual([1, 0, 0, 1]);
    r = takeBands(dirty, bands, r.cursor, 25);
    expect(r.take).toEqual([3, 0]);
    expect(anyDirty(dirty)).toBe(false);
    expect(takeBands(dirty, bands, 0).take).toEqual([]);
    // One band larger than the budget still goes, alone.
    expect(takeBands(Uint8Array.from([0, 0, 1, 1]), bands, 0, 5).take).toEqual([2]);
    expect(DOT_BUDGET).toBeGreaterThan(0);
  });
});

describe("portrait gating (reduced motion, Save-Data, absent clips)", () => {
  const clips = { loop: ["/portrait/portrait-loop.webm", "/portrait/portrait-loop.mp4"], greet: ["/portrait/portrait-greet.webm"] };
  const env = (reducedMotion: boolean, saveData: boolean) => ({ reducedMotion, saveData });

  it("loads the clips only with motion allowed and no Save-Data", () => {
    expect(plan(env(false, false), clips)).toEqual({ motion: true, video: { loop: clips.loop, greet: clips.greet } });
    expect(plan(env(true, false), clips)).toEqual({ motion: false, video: null });
    expect(plan(env(false, true), clips)).toEqual({ motion: true, video: null });
    expect(plan(env(true, true), clips)).toEqual({ motion: false, video: null });
  });

  it("draws the poster only, with no request, when the clips are absent", () => {
    expect(plan(env(false, false), {}).video).toBeNull();
    expect(plan(env(false, false), { loop: [], greet: [] }).video).toBeNull();
    expect(plan(env(false, false), { loop: [""], greet: clips.greet }).video).toBeNull();
    expect(plan(env(false, false), { greet: clips.greet }).video).toBeNull(); // a greeting needs the loop
    expect(plan(env(false, false), { loop: clips.loop }).video).toEqual({ loop: clips.loop, greet: null });
  });

  it("reads prefers-reduced-motion and navigator.connection.saveData, defaulting to no preference", () => {
    const mm = (on: boolean) => (q: string) => ({ matches: on && q === "(prefers-reduced-motion: reduce)" });
    expect(readEnvironment({})).toEqual(env(false, false));
    expect(readEnvironment({ matchMedia: mm(true) })).toEqual(env(true, false));
    expect(readEnvironment({ navigator: { connection: { saveData: true } } })).toEqual(env(false, true));
    expect(readEnvironment({ matchMedia: mm(false), navigator: {} })).toEqual(env(false, false));
  });

  it("types clips from their extension", () => {
    expect(clipType("/portrait/portrait-loop.webm")).toBe("video/webm");
    expect(clipType("/a/B.MP4?v=2")).toBe("video/mp4");
    expect(clipType("/a/b.mov")).toBeUndefined();
  });

  it("offers only the clip files that exist at build time", () => {
    const dir = mkdtempSync(join(tmpdir(), "portrait-"));
    expect(findClips(dir)).toEqual({ loop: [], greet: [] });
    writeFileSync(join(dir, "portrait-greet.webm"), "");
    expect(findClips(dir)).toEqual({ loop: [], greet: [] });
    writeFileSync(join(dir, "portrait-loop.webm"), "");
    writeFileSync(join(dir, "portrait-loop.mp4"), "");
    expect(findClips(dir)).toEqual({
      loop: ["/portrait/portrait-loop.webm", "/portrait/portrait-loop.mp4"],
      greet: ["/portrait/portrait-greet.webm"],
    });
  });
});

describe("portrait colours from tokens", () => {
  it("parses computed colours", () => {
    expect(parseColor("rgb(31, 41, 55)")).toEqual([31, 41, 55]);
    expect(parseColor("rgba(1 2 3 / 0.5)")).toEqual([1, 2, 3]);
    expect(parseColor("color(srgb 1 0.5 0)")).toEqual([255, 128, 0]);
    expect(parseColor("")).toBeNull();
    expect(parseColor("var(--x)")).toBeNull();
  });

  it("ramps every band from the grid dot colour", () => {
    const dot: RGB = [31, 41, 55], f = fills(dot, [[55, 65, 81], [156, 163, 175], [255, 255, 255]]);
    expect(f).toHaveLength(4 * (STEPS + 1));
    expect(new Set(f.slice(0, STEPS + 1))).toEqual(new Set(["rgb(31,41,55)"]));
    expect(f[3 * (STEPS + 1)]).toBe("rgb(31,41,55)");
    expect(f[4 * (STEPS + 1) - 1]).toBe("rgb(255,255,255)");
  });
});

describe("portrait data in the repository", () => {
  it("holds the derived dot grid only, within the brief's 30 KB", () => {
    expect(poster.levels).toBe(16);
    expect(poster.data).toMatch(/^[0-9a-f]+$/);
    expect(poster.data.length).toBe(poster.cols * poster.rows);
    expect([poster.cols, poster.rows]).toEqual([110, 131]);
    expect(statSync("src/assets/portrait/portrait.json").size).toBeLessThanOrEqual(30 * 1024);
  });

  it("ships no photo: public/portrait and src/assets/portrait hold only the dots, the fallback WebP and clips", () => {
    const files = [...readdirSync("public/portrait"), ...readdirSync("src/assets/portrait")];
    for (const f of files) expect(f).toMatch(/^(portrait\.json|portrait-fallback\.webp|portrait-(loop|greet)\.(webm|mp4)|\.gitkeep)$/);
    const webp = readFileSync("public/portrait/portrait-fallback.webp");
    expect(webp.subarray(8, 12).toString()).toBe("WEBP");
    expect(webp.length).toBeLessThanOrEqual(20 * 1024);
  });
});
