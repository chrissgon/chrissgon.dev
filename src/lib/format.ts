import { t, type Lang } from "../data/index.ts";
import type { Project, TrajectoryEntry } from "../data/schema.ts";

export const LOCALE: Record<Lang, string> = { en: "en", pt: "pt-BR" };

export const formatNumber = (n: number, lang: Lang) => n.toLocaleString(LOCALE[lang]);

export function formatPeriod(e: TrajectoryEntry, lang: Lang): string {
  if (e.from === undefined && e.to === null) {
    const now = t(lang, "now");
    return now.charAt(0).toUpperCase() + now.slice(1);
  }
  if (e.from === undefined) return `${t(lang, "before")} ${e.to}`;
  if (e.to === null) return `${e.from} – ${t(lang, "now")}`;
  return e.from === e.to ? `${e.from}` : `${e.from} – ${e.to}`;
}

const TYPE_LABEL = {
  "ai-agents": "typeAiAgents",
  "web-ui": "typeWebUi",
  "docs-architecture": "typeDocsArchitecture",
} as const;
const STATUS_LABEL = { ready: "statusReady", "in-progress": "statusInProgress" } as const;

export const typeLabel = (type: Project["types"][number], lang: Lang) => t(lang, TYPE_LABEL[type]);
export const statusLabel = (status: Project["status"], lang: Lang) => t(lang, STATUS_LABEL[status]);

/** Path of a page in a language: EN at the root, PT under /pt/ (ADR-0010), always with a trailing slash. */
export function localePath(lang: Lang, path: string): string {
  const inner = path.replace(/^\/+|\/+$/g, "");
  const prefix = lang === "en" ? "" : "pt/";
  return `/${prefix}${inner ? `${inner}/` : ""}`;
}

/** Counts per value, in first-seen order. */
export function countBy<T>(items: T[], keys: (item: T) => string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) for (const k of keys(item)) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts];
}

/** A post date as the writing page shows it: "Sep 29, 2026" in EN, "29 set. 2026" in PT (site-writing.md). */
export function formatDate(iso: string, lang: Lang): string {
  const date = new Date(`${iso}T12:00:00Z`);
  if (lang === "en") return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
  const parts = new Intl.DateTimeFormat("pt-BR", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}`;
}

/** "5 comments", "1 comment" with the page's labels. */
export function countLabel(n: number, lang: Lang, one: "comment" | "reaction", many: "comments" | "reactions"): string {
  return `${formatNumber(n, lang)} ${t(lang, n === 1 ? one : many)}`;
}

/** A piece of a label: plain text, or the name of a product the page shows as its button. */
export type LabelPiece = { text: string } | { product: string };

/**
 * Split a label around the product names it contains, in order of appearance ("Creator of Perfect UI &
 * ai-workbench" -> text, Perfect UI, text, ai-workbench), so the hero can show each name as its button inline.
 */
export function splitProducts(label: string, names: readonly string[]): LabelPiece[] {
  const pieces: LabelPiece[] = [];
  let rest = label;
  for (;;) {
    const hits = names.map((n) => ({ n, i: rest.indexOf(n) })).filter((h) => h.i >= 0).sort((a, b) => a.i - b.i);
    const hit = hits[0];
    if (!hit) break;
    if (hit.i > 0) pieces.push({ text: rest.slice(0, hit.i) });
    pieces.push({ product: hit.n });
    rest = rest.slice(hit.i + hit.n.length);
  }
  if (rest) pieces.push({ text: rest });
  return pieces;
}

/** A figure split into its number and its unit: "3.7 kB" -> ["3.7", "kB"], "1,014" -> ["1,014", ""]. */
export function splitFigure(value: string): [string, string] {
  const m = /^([\d.,]+\+?)\s*(.*)$/.exec(value);
  return m ? [m[1]!, m[2]!] : [value, ""];
}
