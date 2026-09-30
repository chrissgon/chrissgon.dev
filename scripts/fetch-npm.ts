// Read last month's npm downloads of @chrissgon/perfectui and write src/data/generated/npm.json (ADR-0003).
//
// Usage: tsx scripts/fetch-npm.ts [--offline] [--update-snapshot]
//   --offline          skip the API and copy the committed snapshot
//   --update-snapshot  also write the API value to src/data/npm-snapshot.json
// Never fails the build because of npm: on a timeout or a bad answer it copies the snapshot with a warning.
// Diagnostics go to stderr; the written JSON goes to stdout.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { NpmCount } from "../src/data/schema.ts";
import { GENERATED_PATH, MAX_AGE_DAYS, isStale } from "../src/data/npm.ts";

const API = "https://api.npmjs.org/downloads/point/last-month/@chrissgon/perfectui";
const SNAPSHOT = "src/data/npm-snapshot.json";
const TIMEOUT_MS = 5000;

async function fromApi(): Promise<NpmCount | null> {
  try {
    const res = await fetch(API, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const parsed = NpmCount.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: tsx scripts/fetch-npm.ts [--offline] [--update-snapshot]");
  process.exit(0);
}
const snapshot = NpmCount.parse(JSON.parse(readFileSync(SNAPSHOT, "utf8")));
let count = args.includes("--offline") ? null : await fromApi();
if (count) {
  console.error(`npm: ${count.downloads} downloads from ${count.start} to ${count.end}`);
  if (args.includes("--update-snapshot")) writeFileSync(SNAPSHOT, JSON.stringify(count) + "\n");
} else {
  count = snapshot;
  console.error(`npm: API unavailable, using the snapshot of ${snapshot.end}`);
  if (isStale(snapshot, new Date())) console.error(`npm: snapshot older than ${MAX_AGE_DAYS} days, number omitted`);
}
mkdirSync(dirname(GENERATED_PATH), { recursive: true });
writeFileSync(GENERATED_PATH, JSON.stringify(count) + "\n");
console.log(JSON.stringify(count));
