// The dot pattern of a project card without an image (src/lib/patterns.ts).
import { describe, expect, it } from "vitest";
import projects from "../src/data/projects.ts";
import { PATTERN_COLORS, PATTERN_KINDS, coverPattern, patternSeed } from "../src/lib/patterns.ts";

/** Well-formed XML with only the elements and attributes a dot pattern needs, and one <svg> root. */
function checkSvg(svg: string): void {
  const allowed: Record<string, string[]> = {
    svg: ["xmlns", "width", "height", "aria-hidden", "focusable"],
    defs: [],
    pattern: ["id", "width", "height", "patternUnits"],
    rect: ["width", "height", "fill"],
    circle: ["cx", "cy", "r", "fill"],
  };
  const stack: string[] = [];
  let roots = 0;
  const tag = /<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z-]+="[^"<>]*")*)\s*(\/?)>/g;
  let last = 0;
  for (let m = tag.exec(svg); m; m = tag.exec(svg)) {
    expect(svg.slice(last, m.index).trim(), "text between tags").toBe("");
    last = tag.lastIndex;
    const [, close, name, attrs, self] = m;
    expect(Object.keys(allowed), `element <${name}>`).toContain(name);
    if (close) {
      expect(stack.pop(), `closing </${name}>`).toBe(name);
      continue;
    }
    if (stack.length === 0) roots++;
    const names = [...attrs!.matchAll(/([a-zA-Z-]+)="/g)].map((a) => a[1]!);
    expect(new Set(names).size, `duplicate attribute on <${name}>`).toBe(names.length);
    for (const a of names) expect(allowed[name!], `attribute ${a} on <${name}>`).toContain(a);
    if (!self) stack.push(name!);
  }
  expect(last, "trailing text").toBe(svg.length);
  expect(stack, "unclosed elements").toEqual([]);
  expect(roots).toBe(1);
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
}

const ids = ["perfectui-for-agents", "agent-ready-kit", "social-agent", "light-site-auditor", "a", "some-future-project"];

describe("card cover patterns", () => {
  it("is deterministic for a given id", () => {
    for (const id of ids) {
      expect(coverPattern(id)).toEqual(coverPattern(id));
      expect(patternSeed(id)).toBe(patternSeed(id));
    }
  });

  it("gives different ids different patterns", () => {
    const all = projects.map((p) => p.id).concat(ids.slice(4));
    const svgs = all.map((id) => coverPattern(id).svg.replace(/cp-[a-z0-9-]+/g, "cp"));
    expect(new Set(svgs).size).toBe(all.length);
  });

  it("gives the four in-progress projects the reference's four kinds, in its order", () => {
    const inProgress = projects.filter((p) => p.status === "in-progress" && p.image.kind === "generated");
    expect(inProgress.map((p) => coverPattern(p.id).kind)).toEqual(["grid", "sparse", "columns", "rows"]);
  });

  it("uses every kind for some id", () => {
    const kinds = new Set(Array.from({ length: 200 }, (_, i) => coverPattern(`p${i}`).kind));
    expect([...kinds].sort()).toEqual([...PATTERN_KINDS].sort());
  });

  it("is valid SVG built from dots in the brand greys only, hidden from assistive technology", () => {
    const greys = Object.values(PATTERN_COLORS);
    for (const id of [...projects.map((p) => p.id), ...ids, "Odd Id!"]) {
      const { svg } = coverPattern(id);
      checkSvg(svg);
      expect(svg).toContain('aria-hidden="true"');
      for (const [, c] of svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)) expect(greys).toContain(c);
      expect(svg).not.toMatch(/07B6F0|gradient|filter|shadow|<image|<script|href/i);
      // The pattern id is safe as an attribute and a url() reference, and unique per project.
      expect(svg).toMatch(/<pattern id="cp-[a-z0-9-]+"/);
      expect(svg.length).toBeLessThan(1200);
    }
  });
});
