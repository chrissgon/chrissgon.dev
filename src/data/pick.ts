// The "Pick the next post" round (src/lib/pick.ts), read at build: the file scripts/fetch-pick.ts writes from the
// profile's data/pick.json, else the committed snapshot. The page refreshes it on its own when the section comes
// near (src/scripts/pick-refresh.ts), since production deploys are manual and rounds change every Monday.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePick, pickView, type PickData, type PickView } from "../lib/pick.ts";
import snapshot from "./pick-snapshot.json" with { type: "json" };

export const PICK_GENERATED_PATH = "src/data/generated/pick.json";
export const PICK_SNAPSHOT_PATH = "src/data/pick-snapshot.json";

function parse(raw: unknown, file: string): PickData {
  const data = parsePick(raw);
  if (!data) throw new Error(`data: ${file}: not a valid pick round (src/lib/pick.ts, parsePick)`);
  return data;
}

export function readPick(options: { root?: string } = {}): PickData {
  const path = resolve(options.root ?? process.cwd(), PICK_GENERATED_PATH);
  return existsSync(path) ? parse(JSON.parse(readFileSync(path, "utf8")), PICK_GENERATED_PATH) : parse(snapshot, PICK_SNAPSHOT_PATH);
}

/** What the section shows at build time. */
export const readPickView = (options: { root?: string; now?: Date } = {}): PickView =>
  pickView(readPick(options), options.now ?? new Date());

export const pickSnapshot = parse(snapshot, PICK_SNAPSHOT_PATH);
