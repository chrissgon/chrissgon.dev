// The ai-workbench counts (skills, agents, adapters), read from GitHub at build like the npm count
// (ADR-0003): the file written by scripts/fetch-workbench.ts, else the committed snapshot; null when the
// value is older than MAX_AGE_DAYS, so no surface shows a stale count.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WorkbenchCount, parseData } from "./schema.ts";
import { MAX_AGE_DAYS } from "./npm.ts";
import snapshot from "./workbench-snapshot.json" with { type: "json" };

export const WORKBENCH_GENERATED_PATH = "src/data/generated/workbench.json";
export const WORKBENCH_SNAPSHOT_PATH = "src/data/workbench-snapshot.json";

export function isWorkbenchStale(count: WorkbenchCount, today: Date): boolean {
  const read = Date.parse(`${count.date}T00:00:00Z`);
  return (today.getTime() - read) / 86_400_000 > MAX_AGE_DAYS;
}

/** A git tree entry as the GitHub API returns it (only the fields used here). */
export interface TreeEntry {
  path: string;
  type: string;
}

/**
 * Counts of a recursive tree of chrissgon/ai-workbench: a skill is a `skills/<name>/SKILL.md` file, an
 * agent an `agents/<name>.md` file other than a README, an adapter a folder directly under `adapters/`.
 */
export function countTree(entries: TreeEntry[]): {
  skills: number;
  agents: number;
  adapters: number;
  prefixes: Record<string, number>;
  agentNames: string[];
} {
  const match = (re: RegExp, type: string) => entries.filter((e) => e.type === type && re.test(e.path));
  const skills = match(/^skills\/[^/]+\/SKILL\.md$/, "blob");
  const agents = match(/^agents\/(?!README\.md$)[^/]+\.md$/, "blob");
  const prefixes: Record<string, number> = {};
  for (const s of skills) {
    const prefix = /^skills\/([a-z]+)-/.exec(s.path)?.[1];
    if (prefix) prefixes[prefix] = (prefixes[prefix] ?? 0) + 1;
  }
  return {
    skills: skills.length,
    agents: agents.length,
    adapters: match(/^adapters\/[^/]+$/, "tree").length,
    prefixes: Object.fromEntries(Object.entries(prefixes).sort(([a], [b]) => a.localeCompare(b))),
    agentNames: agents.map((a) => a.path.slice("agents/".length, -".md".length)).sort(),
  };
}

export function readWorkbenchCount(options: { root?: string; today?: Date } = {}): WorkbenchCount | null {
  const root = options.root ?? process.cwd();
  const path = resolve(root, WORKBENCH_GENERATED_PATH);
  const generated = existsSync(path);
  const raw: unknown = generated ? JSON.parse(readFileSync(path, "utf8")) : snapshot;
  const count = parseData(WorkbenchCount, raw, generated ? WORKBENCH_GENERATED_PATH : WORKBENCH_SNAPSHOT_PATH);
  return isWorkbenchStale(count, options.today ?? new Date()) ? null : count;
}

export const workbenchSnapshot = parseData(WorkbenchCount, snapshot, WORKBENCH_SNAPSHOT_PATH);
