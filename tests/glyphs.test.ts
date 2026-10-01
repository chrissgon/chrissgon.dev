import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASSES, letterAt, letterLevel, TEXT } from "../src/lib/portrait/glyphs.ts";

// The portrait's letters variation (a test behind ?portrait=text).
describe("portrait glyphs", () => {
  it("spells only classes that Perfect UI's stylesheet defines", () => {
    const css = readFileSync(new URL("../node_modules/@chrissgon/perfectui/dist/perfectui.css", import.meta.url), "utf8");
    expect(CLASSES.filter((c) => !css.includes(`.${c}`))).toEqual([]);
  });

  it("gives each line of text two poster rows, running on from line to line", () => {
    expect(letterAt(0, 100)).toBe(".");
    expect(letterAt(1, 100)).toBe("p");
    expect(letterAt(101, 100)).toBe("p"); // the second row of the same line
    expect(letterAt(200, 100)).toBe(TEXT[100 % TEXT.length]);
    expect(letterAt(3, 4, "abcd")).toBe("d");
    expect(letterAt(8, 4, "abcde")).toBe("e");
  });

  it("lights a letter by the mean of its two rows, and draws it once", () => {
    // 2 columns, 2 rows: column 0 lit on both rows, column 1 lit on the lower row only.
    const levels = [15, 0, 5, 9];
    expect(letterLevel(0, 2, levels)).toBeCloseTo(10 / 15); // the upper row draws, at the mean level
    expect(letterLevel(2, 2, levels)).toBe(-1); // the lower row leaves it to the upper one
    expect(letterLevel(3, 2, levels)).toBeCloseTo(4.5 / 15); // upper row dark: the lower row draws
    expect(letterLevel(1, 2, [0, 0, 0, 0])).toBe(0);
  });
});
