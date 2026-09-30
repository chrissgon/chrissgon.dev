// Count the skills, agents and adapters of chrissgon/ai-workbench from its git tree on GitHub and write
// src/data/generated/workbench.json (the same approach as the npm count, ADR-0003).
//
// Usage: tsx scripts/fetch-workbench.ts [--offline] [--update-snapshot]
//   --offline          skip the API and copy the committed snapshot
//   --update-snapshot  also write the API value to src/data/workbench-snapshot.json
// One unauthenticated GET (60 requests per hour per IP). Never fails the build because of GitHub: on a
// timeout, a rate limit, a truncated tree or a bad answer it copies the snapshot with a warning.
// Diagnostics go to stderr; the written JSON goes to stdout.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { WorkbenchCount } from "../src/data/schema.ts";
import { MAX_AGE_DAYS } from "../src/data/npm.ts";
import {
  WORKBENCH_GENERATED_PATH,
  WORKBENCH_SNAPSHOT_PATH,
  countTree,
  isWorkbenchStale,
  type TreeEntry,
} from "../src/data/workbench.ts";

export const API = "https://api.github.com/repos/chrissgon/ai-workbench/git/trees/main?recursive=1";
const TIMEOUT_MS = 5000;

/** The counts from an API answer, or the reason it cannot be used. */
export function fromTreeResponse(body: unknown, today: Date): WorkbenchCount | string {
  const b = body as { sha?: unknown; truncated?: unknown; tree?: unknown };
  if (!b || typeof b.sha !== "string" || !Array.isArray(b.tree)) return "the answer has no tree";
  if (b.truncated !== false) return "the tree is truncated";
  const counts = countTree(b.tree as TreeEntry[]);
  const parsed = WorkbenchCount.safeParse({ ...counts, tree: b.sha, date: today.toISOString().slice(0, 10) });
  return parsed.success ? parsed.data : `unexpected counts ${JSON.stringify(counts)}`;
}

async function fromApi(): Promise<WorkbenchCount | string> {
  try {
    const res = await fetch(API, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "chrissgon.dev-build" },
    });
    if (!res.ok) return `HTTP ${res.status}`;
    return fromTreeResponse(await res.json(), new Date());
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: tsx scripts/fetch-workbench.ts [--offline] [--update-snapshot]");
    process.exit(0);
  }
  const snapshot = WorkbenchCount.parse(JSON.parse(readFileSync(WORKBENCH_SNAPSHOT_PATH, "utf8")));
  const answer = args.includes("--offline") ? "offline" : await fromApi();
  let count: WorkbenchCount;
  if (typeof answer !== "string") {
    count = answer;
    console.error(`workbench: ${count.skills} skills, ${count.agents} agents, ${count.adapters} adapters (tree ${count.tree.slice(0, 7)})`);
    if (args.includes("--update-snapshot")) writeFileSync(WORKBENCH_SNAPSHOT_PATH, JSON.stringify(count) + "\n");
  } else {
    count = snapshot;
    console.error(`workbench: GitHub API unavailable (${answer}), using the snapshot of ${snapshot.date}`);
    if (isWorkbenchStale(snapshot, new Date())) console.error(`workbench: snapshot older than ${MAX_AGE_DAYS} days, counts omitted`);
  }
  mkdirSync(dirname(WORKBENCH_GENERATED_PATH), { recursive: true });
  writeFileSync(WORKBENCH_GENERATED_PATH, JSON.stringify(count) + "\n");
  console.log(JSON.stringify(count));
}
