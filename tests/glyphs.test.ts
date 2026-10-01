import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASSES, letterAt, restRadius, TEXT } from "../src/lib/portrait/glyphs.ts";
import { dotRadius } from "../src/lib/portrait/levels.ts";

// The letters of the portrait's blocks painter.
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

  it("uses the dots' own radius to tell a cell in place from one on its way", () => {
    for (let level = 0; level <= 15; level++) expect(restRadius(level, 5.6)).toBe(dotRadius(level, 5.6));
  });
});
