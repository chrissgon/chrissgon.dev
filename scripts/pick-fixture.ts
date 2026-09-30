// Fixtures of the profile's pick.json for the Playwright checks (check-layout, check-griddots, check-portrait).
// The home page's "Pick the next post" section reads the round again from GitHub once it comes near
// (src/scripts/pick-refresh.ts); the checks answer that request themselves, so they need no network and are the
// same every run: with the build's own round (the section stays as built), or with a round that makes the page
// redraw the section (closed, or a new round).
import { existsSync, readFileSync } from "node:fs";
import type { BrowserContext } from "playwright";
import { PICK_GENERATED_PATH, PICK_SNAPSHOT_PATH } from "../src/data/pick.ts";
import { PICK_RAW_URL, parsePick, type PickData } from "../src/lib/pick.ts";

/** The round the build used. */
export function buildPick(): PickData {
  const path = existsSync(PICK_GENERATED_PATH) ? PICK_GENERATED_PATH : PICK_SNAPSHOT_PATH;
  const data = parsePick(JSON.parse(readFileSync(path, "utf8")));
  if (!data) throw new Error(`${path}: not a valid pick round`);
  return data;
}

const day = (d: Date, plus = 0) => new Date(d.getTime() + plus * 86_400_000).toISOString().slice(0, 10);

export const FIXTURE_POST = "https://www.linkedin.com/feed/update/urn:li:share:7510677308874231808/";

/** The build's round, closed by the workflow: its winner is B, with a post. */
export function closedPick(): PickData {
  const b = buildPick();
  return {
    ...b,
    open: false,
    counts: { A: 0, B: 0, C: 0 },
    history: [{ round: b.round, pillar: b.pillar, options: b.options, counts: { A: 1, B: 2, C: 0 }, winner: "B", post_url: FIXTURE_POST }, ...b.history],
  };
}

/** A new round opened today, after the build's (the profile's queued topics of 2026-10-05); the last winner has no post yet. */
export function newPick(now = new Date()): PickData {
  const b = buildPick();
  const round = day(now) > b.round ? day(now) : day(new Date(`${b.round}T00:00:00Z`), 1);
  return {
    open: true,
    round,
    closes: day(new Date(`${round}T00:00:00Z`), 7),
    pillar: "Tech in conversation",
    options: {
      A: "600+ hours of live coding: what it taught me about explaining",
      B: 'What Erick Wendel\'s "not seen, not remembered" changed for me',
      C: "Working in English every day: what nobody warned me about",
    },
    counts: { A: 0, B: 0, C: 0 },
    history: [{ round: b.round, pillar: b.pillar, options: b.options, counts: { A: 3, B: 1, C: 0 }, winner: "A", post_url: null }, ...b.history],
  };
}

/** Answer the page's request for pick.json with `data` (default: the build's round). */
export async function routePick(ctx: BrowserContext, data: PickData = buildPick()): Promise<void> {
  const body = JSON.stringify(data);
  await ctx.route(PICK_RAW_URL, (r) =>
    r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", headers: { "access-control-allow-origin": "*" }, body }),
  );
}
