// The numbers strip (site-content.md 3.2): figures read at build replace the null values of stats.ts, and
// a figure that is unavailable (stale snapshot, ADR-0003) is left out with its label.
import { stats, type Lang } from "../data/index.ts";
import type { NpmCount, Stat, WorkbenchCount } from "../data/schema.ts";
import { formatNumber } from "./format.ts";

export interface ShownStat {
  id: Stat["id"];
  value: string;
  label: string;
  /** The period of a figure that covers one, e.g. the npm month. */
  period?: { start: string; end: string };
}

export function resolveStats(
  lang: Lang,
  read: { npm: NpmCount | null; workbench: WorkbenchCount | null },
  list: Stat[] = stats,
): ShownStat[] {
  return list.flatMap((s): ShownStat[] => {
    const label = s.label[lang];
    if (s.value !== null) return [{ id: s.id, value: s.value, label }];
    if (s.id === "npm-downloads" && read.npm) {
      return [{ id: s.id, value: formatNumber(read.npm.downloads, lang), label, period: { start: read.npm.start, end: read.npm.end } }];
    }
    if (s.id === "workbench-skills" && read.workbench) {
      return [{ id: s.id, value: formatNumber(read.workbench.skills, lang), label }];
    }
    return [];
  });
}
