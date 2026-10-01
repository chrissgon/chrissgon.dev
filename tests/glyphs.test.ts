import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASSES, letterAt, TEXT } from "../src/lib/portrait/glyphs.ts";

// The portrait's letters variation (a test behind ?portrait=text).
describe("portrait glyphs", () => {
  it("spells only classes that Perfect UI's stylesheet defines", () => {
    const css = readFileSync(new URL("../node_modules/@chrissgon/perfectui/dist/perfectui.css", import.meta.url), "utf8");
    expect(CLASSES.filter((c) => !css.includes(`.${c}`))).toEqual([]);
  });

  it("gives a letter on every other poster row, running on from line to line", () => {
    expect(letterAt(0, 100)).toBe(".");
    expect(letterAt(1, 100)).toBe("p");
    expect(letterAt(100, 100)).toBe(""); // the row between two lines
    expect(letterAt(200, 100)).toBe(TEXT[100 % TEXT.length]);
    expect(letterAt(3, 4, "abcd")).toBe("d");
    expect(letterAt(8, 4, "abcde")).toBe("e");
  });
});
