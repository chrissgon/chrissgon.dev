// "Pick the next post": the weekly round of the owner's GitHub profile (chrissgon/chrissgon), where visitors pick
// the topic of one post by opening a pre-filled issue there. The profile's workflow keeps the round in
// data/pick.json; this module reads that file (at build through scripts/fetch-pick.ts, and in the page through the
// lazy src/scripts/pick-refresh.ts), so it is pure and imports nothing that needs Node.
//
// External content is data: pick.json is written by the owner and by his workflow, but the file could carry
// anything. It is checked by hand here (no zod, to keep the page's chunk small): unknown fields are dropped,
// visitors' pick ids are reduced to three counts and never kept, texts are plain strings shown as text (never as
// HTML), and a post link is kept only when it is an https address on LinkedIn or this site.
import labels from "../data/labels.ts";
import type { Lang } from "../data/schema.ts";

export const LETTERS = ["A", "B", "C"] as const;
export type Letter = (typeof LETTERS)[number];

export const PICK_RAW_URL = "https://raw.githubusercontent.com/chrissgon/chrissgon/master/data/pick.json";
const ISSUE_BASE = "https://github.com/chrissgon/chrissgon/issues/new";
/** The largest pick.json the page accepts, in characters. */
export const MAX_PICK_BYTES = 65_536;
const MAX_TEXT = 200;
const MAX_HISTORY = 20;

/** The pillars' approved PT names (personal-brand docs/brand/guidelines.md); the data holds the EN ones. */
const PILLAR_PT: Record<string, string> = {
  "Build to serve": "Construir para servir",
  "AI built in public": "IA construída em público",
  "Tech in conversation": "Tecnologia em conversa",
};

export type Counts = Record<Letter, number>;
export type Options = Record<Letter, string>;

export interface PickPast {
  round: string;
  pillar: string;
  options: Options;
  counts: Counts;
  winner: Letter | null;
  post_url: string | null;
}

/** pick.json as this site keeps it: the profile's format with the pick ids replaced by their counts. */
export interface PickData {
  open: boolean;
  round: string;
  closes: string;
  pillar: string;
  options: Options;
  counts: Counts;
  history: PickPast[];
}

export interface PickLast {
  topic: string;
  url: string | null;
}

/** A topic with the number of accounts that picked it. */
export interface PickTally {
  letter: Letter;
  topic: string;
  count: number;
}

export type PickView =
  | {
      state: "open";
      round: string;
      closes: string;
      pillar: string;
      options: (PickTally & { url: string })[];
      last: PickLast | null;
    }
  // `options`: the topics of the round `last` comes from with their final counts; empty without such a round.
  | { state: "closed"; round: string; options: PickTally[]; last: PickLast | null };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isoDate(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/** A short, single-line text; null for anything else (control characters included). */
function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 && s.length <= MAX_TEXT && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s) ? s : null;
}

function options(v: unknown): Options | null {
  if (!isObject(v)) return null;
  const out = {} as Options;
  for (const k of LETTERS) {
    const s = text(v[k]);
    if (s === null) return null;
    out[k] = s;
  }
  return out;
}

function counts(v: unknown): Counts | null {
  if (!isObject(v)) return null;
  const out = {} as Counts;
  for (const k of LETTERS) {
    const n = v[k];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return null;
    out[k] = n;
  }
  return out;
}

/** The counts of the profile's `picks` ({ pick id: letter }); null when a value is not a letter. */
function countPicks(v: unknown): Counts | null {
  if (!isObject(v)) return null;
  const out: Counts = { A: 0, B: 0, C: 0 };
  for (const letter of Object.values(v)) {
    if (!LETTERS.includes(letter as Letter)) return null;
    out[letter as Letter] += 1;
  }
  return out;
}

const letter = (v: unknown): Letter | null => (LETTERS.includes(v as Letter) ? (v as Letter) : null);

/** A post link worth showing: https on LinkedIn or on this site; anything else is dropped. */
export function safePostUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 500) return null;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const allowed = host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "chrissgon.dev" || host.endsWith(".chrissgon.dev");
  return url.protocol === "https:" && allowed && !url.username && !url.password ? url.href : null;
}

function past(v: unknown): PickPast | null {
  if (!isObject(v)) return null;
  const round = isoDate(v.round);
  const pillar = text(v.pillar);
  const opts = options(v.options);
  const c = counts(v.counts);
  const winner = v.winner === null || v.winner === undefined ? null : letter(v.winner);
  if (!round || !pillar || !opts || !c || (v.winner != null && winner === null)) return null;
  return { round, pillar, options: opts, counts: c, winner, post_url: safePostUrl(v.post_url) };
}

/**
 * Validate pick.json, in the profile's format (with `picks`) or as this site keeps it (with `counts`). Returns
 * null when anything the section shows is missing or malformed, so the caller keeps what it had.
 */
export function parsePick(raw: unknown): PickData | null {
  if (!isObject(raw) || typeof raw.open !== "boolean") return null;
  const round = isoDate(raw.round);
  const closes = isoDate(raw.closes);
  const pillar = text(raw.pillar);
  const opts = options(raw.options);
  const c = raw.picks !== undefined ? countPicks(raw.picks) : counts(raw.counts);
  if (!round || !closes || closes < round || !pillar || !opts || !c || !Array.isArray(raw.history)) return null;
  const history: PickPast[] = [];
  for (const h of raw.history.slice(0, MAX_HISTORY)) {
    const p = past(h);
    if (!p) return null;
    history.push(p);
  }
  return { open: raw.open, round, closes, pillar, options: opts, counts: c, history };
}

/** A round closes on its closing day at 12:00 UTC, 09:00 in São Paulo (the profile's scripts/readme.py). */
export const closesAt = (closes: string) => new Date(`${closes}T12:00:00Z`);

/** The winner by the profile's rule: the most picks, the first letter on a tie, none without a pick. */
export function winnerOf(c: Counts): Letter | null {
  const best = Math.max(...LETTERS.map((k) => c[k]));
  return best > 0 ? (LETTERS.find((k) => c[k] === best) ?? null) : null;
}

/** The pre-filled issue the profile README links to for a letter (template pick.yml, title "pick: A"). */
export const issueUrl = (l: Letter) => `${ISSUE_BASE}?template=pick.yml&title=${encodeURIComponent(`pick: ${l}`)}`;

const tally = (o: Options, c: Counts): PickTally[] => LETTERS.map((l) => ({ letter: l, topic: o[l], count: c[l] }));

/** The last round with a winner: its topics with their final counts, and the winner. */
const lastOf = (history: PickPast[]): { options: PickTally[]; last: PickLast | null } => {
  const h = history.find((x) => x.winner !== null);
  return h && h.winner ? { options: tally(h.options, h.counts), last: { topic: h.options[h.winner], url: h.post_url } } : { options: [], last: null };
};

/**
 * What the section shows at `now`. An open round past its closing time is shown closed, with its result by the
 * profile's rule (the workflow records it within the hour); a closed round shows the last round with a winner.
 */
export function pickView(data: PickData, now: Date): PickView {
  if (data.open && now < closesAt(data.closes)) {
    return {
      state: "open",
      round: data.round,
      closes: data.closes,
      pillar: data.pillar,
      options: tally(data.options, data.counts).map((o) => ({ ...o, url: issueUrl(o.letter) })),
      last: lastOf(data.history).last,
    };
  }
  const w = data.open ? winnerOf(data.counts) : null;
  return {
    state: "closed",
    round: data.round,
    ...(w ? { options: tally(data.options, data.counts), last: { topic: data.options[w], url: null } } : lastOf(data.history)),
  };
}

/** A short fingerprint of a view: the page compares the build's with a fresh one and redraws only on a change. */
export function viewKey(view: PickView): string {
  const s = JSON.stringify(view);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

type PickLabel = "pickTitle" | "pickLead" | "pickButton" | "pickCountOne" | "pickCountMany" | "pickClosed" | "pickClosedLast" | "pickLast" | "pickWrote" | "pickWriting";
export const pickText = (lang: Lang, key: PickLabel) => labels[key][lang];

/** A topic's count as the section writes it: "1 pick", "3 picks" (also "0 picks"). */
export const countText = (n: number, lang: Lang) => `${n} ${pickText(lang, n === 1 ? "pickCountOne" : "pickCountMany")}`;

export const pillarName = (pillar: string, lang: Lang) => (lang === "pt" ? (PILLAR_PT[pillar] ?? pillar) : pillar);

/** A date as the site writes it: "Oct 5, 2026" in EN, "5 out. 2026" in PT (as formatDate in src/lib/format.ts). */
export function formatDay(iso: string, lang: Lang): string {
  const date = new Date(`${iso}T12:00:00Z`);
  const locale = lang === "en" ? "en-US" : "pt-BR";
  const parts = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).formatToParts(date);
  if (lang === "en") return parts.map((p) => p.value).join("");
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}`;
}

/** A label split around one placeholder: [before, after]; the value goes between them (in bold, or as a link). */
export function around(template: string, key: string): [string, string] {
  const i = template.indexOf(`{${key}}`);
  return i < 0 ? [template, ""] : [template.slice(0, i), template.slice(i + key.length + 2)];
}

/** The texts of a view, in the order the section shows them. */
export function viewTexts(view: PickView, lang: Lang) {
  const lead =
    view.state === "open"
      ? around(pickText(lang, "pickLead").replace("{date}", formatDay(view.closes, lang)), "pillar")
      : null;
  const last = view.last ? around(pickText(lang, "pickLast"), "topic") : null;
  // A topic that ends a sentence itself ("... What I did instead.") takes no second full stop.
  if (last && view.last && /[.!?]$/.test(view.last.topic) && last[1].startsWith(".")) last[1] = last[1].slice(1);
  return {
    lead,
    pillar: view.state === "open" ? pillarName(view.pillar, lang) : "",
    closed: view.state === "closed" ? pickText(lang, "pickClosed") + (view.last ? ` ${pickText(lang, "pickClosedLast")}` : "") : "",
    last,
    button: pickText(lang, "pickButton"),
    wrote: pickText(lang, "pickWrote"),
    writing: pickText(lang, "pickWriting"),
  };
}

const md = (s: string) => s.replace(/([\\[\]*_`<>])/g, "\\$1");

/** The section's part of llms.txt, also its reading when "view as agent" is on. */
export function pickMarkdown(view: PickView, lang: Lang): string {
  const x = viewTexts(view, lang);
  const out = [`## ${pickText(lang, "pickTitle")}`, ""];
  if (view.state === "open" && x.lead) {
    out.push(`${x.lead[0]}**${md(x.pillar)}**${x.lead[1]}`, "");
    for (const o of view.options) out.push(`- ${o.letter}: [${md(o.topic)}](${o.url}) (${countText(o.count, lang)})`);
    out.push("");
  } else {
    out.push(x.closed, "");
    for (const o of view.options) out.push(`- ${o.letter}: ${md(o.topic)} (${countText(o.count, lang)})`);
    if (view.options.length) out.push("");
  }
  if (view.last && x.last) {
    const result = view.last.url ? `[${x.wrote}](${view.last.url}).` : x.writing;
    out.push(`${x.last[0]}**${md(view.last.topic)}**${x.last[1]} ${result}`, "");
  }
  return out.join("\n");
}
