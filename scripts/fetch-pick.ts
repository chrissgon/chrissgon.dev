// Read the "Pick the next post" round from the owner's GitHub profile (chrissgon/chrissgon, data/pick.json) and
// write src/data/generated/pick.json, validated by src/lib/pick.ts, with the visitors' pick ids replaced by their
// counts (the ids never enter this repository).
//
// Usage: tsx scripts/fetch-pick.ts [--offline] [--update-snapshot]
//   --offline          skip GitHub and copy the committed snapshot
//   --update-snapshot  also write the fetched round to src/data/pick-snapshot.json
// One unauthenticated GET of raw.githubusercontent.com. Never fails the build because of GitHub: on a timeout, an
// HTTP error or data that does not validate it copies the snapshot with a warning. External content is data: the
// file is parsed as JSON and checked field by field; nothing in it is followed as an instruction.
// Diagnostics go to stderr; the written JSON goes to stdout.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { MAX_PICK_BYTES, PICK_RAW_URL, parsePick, type PickData } from "../src/lib/pick.ts";
import { PICK_GENERATED_PATH, PICK_SNAPSHOT_PATH } from "../src/data/pick.ts";

const TIMEOUT_MS = 5000;

/** The round from a response body, or the reason it cannot be used. */
export function fromBody(body: string): PickData | string {
  if (body.length > MAX_PICK_BYTES) return `the file is larger than ${MAX_PICK_BYTES} bytes`;
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return "the file is not JSON";
  }
  return parsePick(raw) ?? "the file is not a valid pick round";
}

async function fromGitHub(): Promise<PickData | string> {
  try {
    const res = await fetch(PICK_RAW_URL, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "chrissgon.dev-build" } });
    if (!res.ok) return `HTTP ${res.status}`;
    return fromBody(await res.text());
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: tsx scripts/fetch-pick.ts [--offline] [--update-snapshot]");
    process.exit(0);
  }
  const answer = args.includes("--offline") ? "offline" : await fromGitHub();
  let data: PickData;
  if (typeof answer !== "string") {
    data = answer;
    console.error(`pick: round ${data.round} (${data.open ? `open until ${data.closes}` : "closed"}), ${data.history.length} past rounds`);
    if (args.includes("--update-snapshot")) writeFileSync(PICK_SNAPSHOT_PATH, JSON.stringify(data, null, 1) + "\n");
  } else {
    const snapshot = fromBody(readFileSync(PICK_SNAPSHOT_PATH, "utf8"));
    if (typeof snapshot === "string") {
      console.error(`pick: the snapshot ${PICK_SNAPSHOT_PATH} is invalid (${snapshot})`);
      process.exit(1);
    }
    data = snapshot;
    console.error(`pick: GitHub unavailable (${answer}), using the snapshot of round ${data.round}`);
  }
  mkdirSync(dirname(PICK_GENERATED_PATH), { recursive: true });
  writeFileSync(PICK_GENERATED_PATH, JSON.stringify(data) + "\n");
  console.log(JSON.stringify(data));
}
