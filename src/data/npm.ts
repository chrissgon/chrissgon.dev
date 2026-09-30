// The npm download count (ADR-0003): the file written by scripts/fetch-npm.ts at build, else the
// committed snapshot; null when the value is older than MAX_AGE_DAYS, so no surface shows a stale number.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NpmCount, parseData } from "./schema.ts";
import snapshot from "./npm-snapshot.json" with { type: "json" };

export const GENERATED_PATH = "src/data/generated/npm.json";
export const MAX_AGE_DAYS = 35;

export function isStale(count: NpmCount, today: Date): boolean {
  const end = Date.parse(`${count.end}T00:00:00Z`);
  return (today.getTime() - end) / 86_400_000 > MAX_AGE_DAYS;
}

export function readNpmCount(options: { root?: string; today?: Date } = {}): NpmCount | null {
  const root = options.root ?? process.cwd();
  const path = resolve(root, GENERATED_PATH);
  const raw: unknown = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : snapshot;
  const count = parseData(NpmCount, raw, existsSync(path) ? GENERATED_PATH : "src/data/npm-snapshot.json");
  return isStale(count, options.today ?? new Date()) ? null : count;
}

export const npmSnapshot = parseData(NpmCount, snapshot, "src/data/npm-snapshot.json");
