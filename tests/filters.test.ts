// Project filters (site-projects.md, FLOW-6): groups combine, counts follow the other groups, the state
// round-trips through the URL query, and the approved data gives the brief's counts.
import { describe, expect, it } from "vitest";
import { projects } from "../src/data/index.ts";
import { PROJECT_STATUSES, PROJECT_TYPES } from "../src/data/schema.ts";
import { chipCount, EMPTY, isEmpty, matches, parseQuery, rowChips, stackValues, toggle, toQuery } from "../src/lib/filters.ts";

const allowed = { type: [...PROJECT_TYPES], status: [...PROJECT_STATUSES], stack: stackValues(projects) };
const shown = (state: typeof EMPTY) => projects.filter((p) => matches(p, state)).map((p) => p.id);

describe("project filters", () => {
  it("shows the twelve projects with All and the brief's counts per chip", () => {
    expect(shown(EMPTY)).toHaveLength(12);
    const count = (g: "type" | "status" | "stack", v: string) => chipCount(projects, EMPTY, g, v);
    expect([count("type", "ai-agents"), count("type", "web-ui"), count("type", "docs-architecture")]).toEqual([5, 6, 3]);
    expect([count("status", "ready"), count("status", "in-progress")]).toEqual([8, 4]);
    expect(Object.fromEntries(allowed.stack.map((s) => [s, count("stack", s)]))).toEqual({
      TypeScript: 4, JavaScript: 2, "Vue (Nuxt)": 2, Go: 2, CSS: 1, Python: 1, Shell: 1, Markdown: 1,
      "Node.js": 1, MongoDB: 1, React: 1, Redux: 1, Tailwind: 1, "Perfect UI": 1,
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
    expect(shown(EMPTY)).toHaveLength(12);
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

  it("builds the home page's single row: statuses first, then stacks, with counts from the data", () => {
    const row = rowChips(projects, EMPTY, PROJECT_STATUSES);
    expect(row.map((c) => [c.group, c.value, c.count])).toEqual([
      ["status", "ready", 8],
      ["status", "in-progress", 4],
      ["stack", "TypeScript", 4],
      ["stack", "JavaScript", 2],
      ["stack", "Vue (Nuxt)", 2],
      ["stack", "Go", 2],
      ["stack", "CSS", 1],
      ["stack", "Python", 1],
      ["stack", "Shell", 1],
      ["stack", "Markdown", 1],
      ["stack", "Node.js", 1],
      ["stack", "MongoDB", 1],
      ["stack", "React", 1],
      ["stack", "Redux", 1],
      ["stack", "Tailwind", 1],
      ["stack", "Perfect UI", 1],
    ]);
    // The "All" chip is the sum of the statuses: every project has exactly one.
    expect(row.filter((c) => c.group === "status").reduce((n, c) => n + c.count, 0)).toBe(projects.length);
  });

  it("recounts the row when a status is on: stacks count only that status", () => {
    const ready = toggle(EMPTY, "status", "ready");
    const row = rowChips(projects, ready, PROJECT_STATUSES);
    expect(row.find((c) => c.value === "in-progress")!.count).toBe(4);
    expect(row.find((c) => c.value === "Go")!.count).toBe(2);
    const inProgress = rowChips(projects, toggle(EMPTY, "status", "in-progress"), PROJECT_STATUSES);
    expect(inProgress.filter((c) => c.group === "stack").every((c) => c.count === 0)).toBe(true);
  });

  it("counts on made-up items, independent of the data", () => {
    const items = [
      { types: ["web-ui"], status: "ready", stack: ["CSS", "Go"] },
      { types: ["ai-agents"], status: "in-progress", stack: ["Go"] },
      { types: ["ai-agents"], status: "ready", stack: [] },
    ];
    expect(rowChips(items, EMPTY, ["ready", "in-progress"]).map((c) => `${c.value}:${c.count}`)).toEqual([
      "ready:2", "in-progress:1", "Go:2", "CSS:1",
    ]);
    expect(rowChips(items, { ...EMPTY, stack: "Go" }, ["ready", "in-progress"]).map((c) => c.count)).toEqual([1, 1, 2, 1]);
  });
});
