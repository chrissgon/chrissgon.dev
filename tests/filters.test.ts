// Project filters (site-projects.md, FLOW-6): groups combine, counts follow the other groups, the state
// round-trips through the URL query, and the approved data gives the brief's counts.
import { describe, expect, it } from "vitest";
import { projects } from "../src/data/index.ts";
import { PROJECT_STATUSES, PROJECT_TYPES } from "../src/data/schema.ts";
import { chipCount, EMPTY, isEmpty, matches, parseQuery, stackValues, toggle, toQuery } from "../src/lib/filters.ts";

const allowed = { type: [...PROJECT_TYPES], status: [...PROJECT_STATUSES], stack: stackValues(projects) };
const shown = (state: typeof EMPTY) => projects.filter((p) => matches(p, state)).map((p) => p.id);

describe("project filters", () => {
  it("shows the ten projects with All and the brief's counts per chip", () => {
    expect(shown(EMPTY)).toHaveLength(10);
    const count = (g: "type" | "status" | "stack", v: string) => chipCount(projects, EMPTY, g, v);
    expect([count("type", "ai-agents"), count("type", "web-ui"), count("type", "docs-architecture")]).toEqual([5, 4, 3]);
    expect([count("status", "ready"), count("status", "in-progress")]).toEqual([6, 4]);
    expect(Object.fromEntries(allowed.stack.map((s) => [s, count("stack", s)]))).toEqual({
      Go: 2, TypeScript: 2, JavaScript: 1, CSS: 1, "Vue (Nuxt)": 1, Python: 1, Shell: 1, Markdown: 1,
    });
  });

  it("combines groups and updates the other groups' counts", () => {
    const ai = toggle(EMPTY, "type", "ai-agents");
    expect(shown(ai)).toEqual(["ai-workbench", "perfectui-for-agents", "agent-ready-kit", "social-agent", "light-site-auditor"]);
    expect(chipCount(projects, ai, "stack", "Python")).toBe(1);
    expect(chipCount(projects, ai, "status", "in-progress")).toBe(4);
    expect(shown(toggle(ai, "stack", "Python"))).toEqual(["ai-workbench"]);
  });

  it("reaches the empty state and clears with All", () => {
    const none = { ...EMPTY, type: "docs-architecture", stack: "Python" };
    expect(shown(none)).toEqual([]);
    expect(isEmpty(none)).toBe(false);
    expect(shown(EMPTY)).toHaveLength(10);
  });

  it("switches a chip off when pressed again, one chip per group", () => {
    const go = toggle(EMPTY, "stack", "Go");
    expect(toggle(go, "stack", "Go")).toEqual(EMPTY);
    expect(toggle(go, "stack", "Python").stack).toBe("Python");
  });

  it("keeps the state in the URL query and ignores unknown values", () => {
    const state = { type: "ai-agents", status: null, stack: "Vue (Nuxt)" };
    const q = toQuery(state);
    expect(q).toBe("?type=ai-agents&stack=Vue+%28Nuxt%29");
    expect(parseQuery(q, allowed)).toEqual(state);
    expect(toQuery(EMPTY)).toBe("");
    expect(parseQuery("?type=evil&status=ready&x=1", allowed)).toEqual({ ...EMPTY, status: "ready" });
  });
});
