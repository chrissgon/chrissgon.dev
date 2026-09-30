// Post covers cropped to 9:16 at build (src/lib/covers.ts).
import { describe, expect, it } from "vitest";
import { posts } from "../src/data/index.ts";
import { COVER_RATIO, COVER_WIDTHS, coverSize, coverWidths, largestCrop } from "../src/lib/covers.ts";

describe("largestCrop", () => {
  it("keeps the full height of a wide source", () => {
    expect(largestCrop({ width: 1164, height: 523 })).toEqual({ width: 294, height: 523 });
    expect(largestCrop({ width: 800, height: 400 })).toEqual({ width: 225, height: 400 });
    expect(largestCrop({ width: 480, height: 480 })).toEqual({ width: 270, height: 480 });
  });
  it("keeps the full height of a portrait source wider than 9:16", () => {
    expect(largestCrop({ width: 1080, height: 1350 })).toEqual({ width: 759, height: 1350 });
  });
  it("keeps a source that is already 9:16", () => {
    expect(largestCrop({ width: 864, height: 1536 })).toEqual({ width: 864, height: 1536 });
  });
  it("keeps the full width of a source taller than 9:16", () => {
    expect(largestCrop({ width: 900, height: 2000 })).toEqual({ width: 900, height: 1600 });
  });
  it("rejects empty sizes", () => {
    expect(() => largestCrop({ width: 0, height: 10 })).toThrow();
  });
});

describe("coverWidths", () => {
  it("keeps the candidates when the crop is wide enough", () => {
    expect(coverWidths(864)).toEqual([...COVER_WIDTHS]);
    expect(coverWidths(759)).toEqual([288, 432, 576]);
  });
  it("caps at the crop and never goes above it", () => {
    expect(coverWidths(536)).toEqual([288, 432, 536]);
    expect(coverWidths(470)).toEqual([288, 470]);
    expect(coverWidths(225)).toEqual([225]);
    expect(coverWidths(270)).toEqual([270]);
  });
  it("drops a candidate within 10% of the crop", () => {
    expect(coverWidths(294)).toEqual([294]);
  });
  it("is never empty and never above the crop for any post cover size", () => {
    for (const max of [1, 100, 287, 288, 300, 575, 576, 577, 5000]) {
      const widths = coverWidths(max);
      expect(widths.length).toBeGreaterThan(0);
      expect(Math.max(...widths)).toBeLessThanOrEqual(max);
      expect(widths).toEqual([...widths].sort((a, b) => a - b));
    }
  });
});

describe("coverSize", () => {
  it("is 9:16", () => {
    expect(coverSize(288)).toEqual({ width: 288, height: 512 });
    expect(coverSize(225).height).toBe(400);
    expect(COVER_RATIO).toBe(9 / 16);
  });
});

describe("post cover focus", () => {
  it("anchors every cover that is not already 9:16", () => {
    const anchored = Object.fromEntries(posts.map((p) => [p.id, p.coverFocus ?? "center"]));
    expect(anchored).toMatchObject({
      "perfectui-1-0-launch": "left",
      "perfectui-1-0-teaser": "left",
      "devnagringa-summit": "center",
      "rick-and-morty-guide": "left",
      "own-bootstrap-part-2": "left",
      "own-bootstrap-part-1": "left",
      gomanga: "right",
      pokedex: "entropy",
    });
  });
});
