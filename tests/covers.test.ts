// Post covers cropped to 4:5 at build (src/lib/covers.ts).
import { describe, expect, it } from "vitest";
import { posts } from "../src/data/index.ts";
import { COVER_RATIO, COVER_WIDTHS, coverSize, coverWidths, largestCrop } from "../src/lib/covers.ts";

describe("largestCrop", () => {
  it("keeps the full height of a wide source", () => {
    expect(largestCrop({ width: 1164, height: 523 })).toEqual({ width: 418, height: 523 });
    expect(largestCrop({ width: 800, height: 400 })).toEqual({ width: 320, height: 400 });
    expect(largestCrop({ width: 480, height: 480 })).toEqual({ width: 384, height: 480 });
    expect(largestCrop({ width: 1045, height: 953 })).toEqual({ width: 762, height: 953 });
  });
  it("keeps a source that is already 4:5", () => {
    expect(largestCrop({ width: 1080, height: 1350 })).toEqual({ width: 1080, height: 1350 });
  });
  it("keeps the full width of a source taller than 4:5", () => {
    expect(largestCrop({ width: 864, height: 1536 })).toEqual({ width: 864, height: 1080 });
    expect(largestCrop({ width: 900, height: 2000 })).toEqual({ width: 900, height: 1125 });
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
    expect(coverWidths(418)).toEqual([288, 418]);
    expect(coverWidths(384)).toEqual([288, 384]);
    expect(coverWidths(225)).toEqual([225]);
  });
  it("drops a candidate within 10% of the crop", () => {
    expect(coverWidths(294)).toEqual([294]);
    expect(coverWidths(320)).toEqual([320]);
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
  it("is 4:5", () => {
    expect(coverSize(288)).toEqual({ width: 288, height: 360 });
    expect(coverSize(320).height).toBe(400);
    expect(COVER_RATIO).toBe(4 / 5);
  });
});

describe("post cover focus", () => {
  it("anchors each cover where its subject stays whole at 4:5", () => {
    const anchored = Object.fromEntries(posts.map((p) => [p.id, p.coverFocus ?? "center"]));
    expect(anchored).toMatchObject({
      "perfectui-1-0-launch": "center",
      "perfectui-1-0-teaser": "center",
      "devnagringa-summit": "center",
      "rick-and-morty-guide": "left",
      "own-bootstrap-part-2": "center",
      "own-bootstrap-part-1": "center",
      gomanga: "center",
      pokedex: "entropy",
    });
  });
});
