import { t, type Lang } from "../data/index.ts";
import type { Project, TrajectoryEntry } from "../data/schema.ts";

export const LOCALE: Record<Lang, string> = { en: "en", pt: "pt-BR" };

export const formatNumber = (n: number, lang: Lang) => n.toLocaleString(LOCALE[lang]);

export function formatPeriod(e: TrajectoryEntry, lang: Lang): string {
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
