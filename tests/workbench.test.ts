import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fromTreeResponse } from "../scripts/fetch-workbench.ts";
import { stats } from "../src/data/index.ts";
import { countTree, isWorkbenchStale, readWorkbenchCount, workbenchSnapshot } from "../src/data/workbench.ts";
import { llmsText } from "../src/lib/llms.ts";
import { resolveStats } from "../src/lib/stats.ts";

const tree = [
  { path: "skills", type: "tree" },
  { path: "skills/eng-a", type: "tree" },
  { path: "skills/eng-a/SKILL.md", type: "blob" },
  { path: "skills/eng-a/references/SKILL.md", type: "blob" },
  { path: "skills/biz-b/SKILL.md", type: "blob" },
  { path: "skills/README.md", type: "blob" },
  { path: "agents/reviewer.md", type: "blob" },
  { path: "agents/README.md", type: "blob" },
  { path: "adapters/one", type: "tree" },
  { path: "adapters/one/install.sh", type: "blob" },
  { path: "adapters/two", type: "tree" },
];
const sha = "65bd78bb22151671f01de139f5f4c449d293cda8";
const today = new Date("2026-09-30T12:00:00Z");
const count = { skills: 43, agents: 3, adapters: 2, tree: sha, date: "2026-09-30" };
const npm = { downloads: 1014, start: "2026-08-30", end: "2026-09-28", package: "@chrissgon/perfectui" as const };

describe("ai-workbench counts from the GitHub tree", () => {
  it("counts SKILL.md files one level under skills/, agent files and adapter folders", () => {
    expect(countTree(tree)).toEqual({ skills: 2, agents: 1, adapters: 2, prefixes: { biz: 1, eng: 1 }, agentNames: ["reviewer"] });
  });

  it("reads an API answer and refuses a truncated or malformed one", () => {
    expect(fromTreeResponse({ sha, truncated: false, tree }, today)).toEqual({
      skills: 2,
      agents: 1,
      adapters: 2,
      prefixes: { biz: 1, eng: 1 },
      agentNames: ["reviewer"],
      tree: sha,
      date: "2026-09-30",
    });
    expect(fromTreeResponse({ sha, truncated: true, tree }, today)).toBe("the tree is truncated");
    expect(fromTreeResponse({ message: "API rate limit exceeded" }, today)).toBe("the answer has no tree");
    expect(fromTreeResponse({ sha, truncated: false, tree: [] }, today)).toMatch(/unexpected counts/);
  });

  it("has a committed snapshot whose prefix counts add up to the skills", () => {
    const sum = Object.values(workbenchSnapshot.prefixes ?? {}).reduce((a, b) => a + b, 0);
    expect(sum).toBe(workbenchSnapshot.skills);
    expect(workbenchSnapshot.agentNames).toHaveLength(workbenchSnapshot.agents);
  });

  it("falls back to the snapshot, prefers the build file and omits a stale count", () => {
    const root = mkdtempSync(join(tmpdir(), "workbench-"));
    expect(readWorkbenchCount({ root, today })?.skills).toBe(workbenchSnapshot.skills);
    expect(readWorkbenchCount({ root, today: new Date("2027-01-01T00:00:00Z") })).toBeNull();
    mkdirSync(join(root, "src/data/generated"), { recursive: true });
    writeFileSync(join(root, "src/data/generated/workbench.json"), JSON.stringify({ ...count, skills: 44 }));
    expect(readWorkbenchCount({ root, today })?.skills).toBe(44);
    expect(isWorkbenchStale(count, new Date("2026-11-04T00:00:00Z"))).toBe(false);
    expect(isWorkbenchStale(count, new Date("2026-11-05T00:00:00Z"))).toBe(true);
  });
});

describe("numbers strip", () => {
  it("fills the figures read at build and keeps the approved labels", () => {
    const shown = resolveStats("pt", { npm, workbench: count });
    expect(shown.map((s) => s.id)).toEqual(stats.map((s) => s.id));
    expect(shown.find((s) => s.id === "npm-downloads")).toEqual({
      id: "npm-downloads",
      value: "1.014",
      label: "downloads no npm no último mês",
      period: { start: "2026-08-30", end: "2026-09-28" },
    });
    expect(shown.find((s) => s.id === "workbench-skills")).toEqual({ id: "workbench-skills", value: "43", label: "skills no ai-workbench" });
  });

  it("leaves out a figure that is unavailable", () => {
    const shown = resolveStats("en", { npm: null, workbench: null });
    expect(shown.map((s) => s.id)).toEqual(["perfectui-size", "live-coding"]);
  });
});

describe("llms.txt skill count", () => {
  it("states the count with the approved label when it is known", () => {
    const site = "https://chrissgon.dev";
    expect(llmsText("en", { site, npm, workbench: count })).toContain("43 skills in ai-workbench.");
    expect(llmsText("pt", { site, npm, workbench: count })).toContain("43 skills no ai-workbench.");
    expect(llmsText("en", { site, npm, workbench: null })).not.toContain("skills in ai-workbench");
  });
});
