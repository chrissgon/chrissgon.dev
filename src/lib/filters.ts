// Project filters (site-projects.md, FLOW-6): one chip at most per group (type, status, stack); groups
// combine (type AND status AND stack); the counts of a group's chips say how many projects that chip would
// show with the other groups as they are. The state lives in the URL query (/projects/?type=ai-agents&
// stack=Python), so a filter can be shared and survives the language switch. Pure: the page script and the
// build use the same functions, over a light view of each project (no data module in the browser).

export const GROUPS = ["type", "status", "stack"] as const;
export type Group = (typeof GROUPS)[number];
export type FilterState = Record<Group, string | null>;

/** What the filters read of a project. */
export interface Filterable {
  types: readonly string[];
  status: string;
  stack: readonly string[];
}

export const EMPTY: FilterState = { type: null, status: null, stack: null };

/** The values a group can take, to validate a query. */
export type Allowed = Record<Group, readonly string[]>;

/** Read a query string; unknown groups and values are ignored, so a bad link shows every project. */
export function parseQuery(search: string, allowed: Allowed): FilterState {
  const q = new URLSearchParams(search);
  const state: FilterState = { ...EMPTY };
  for (const g of GROUPS) {
    const v = q.get(g);
    if (v !== null && allowed[g].includes(v)) state[g] = v;
  }
  return state;
}

/** The query of a state, "" when no filter is on; groups in a fixed order. */
export function toQuery(state: FilterState): string {
  const q = new URLSearchParams();
  for (const g of GROUPS) if (state[g] !== null) q.set(g, state[g]!);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function matches(p: Filterable, state: FilterState): boolean {
  return (
    (state.type === null || p.types.includes(state.type)) &&
    (state.status === null || p.status === state.status) &&
    (state.stack === null || p.stack.includes(state.stack))
  );
}

/** How many projects the chip (group, value) would show, the other groups kept as they are. */
export function chipCount(items: readonly Filterable[], state: FilterState, group: Group, value: string): number {
  const next = { ...state, [group]: value };
  return items.filter((p) => matches(p, next)).length;
}

/** Pressing a chip: on when it was off, off (the whole group) when it was on. */
export function toggle(state: FilterState, group: Group, value: string): FilterState {
  return { ...state, [group]: state[group] === value ? null : value };
}

export const isEmpty = (state: FilterState) => GROUPS.every((g) => state[g] === null);

/** Stacks of the projects, most used first, then in the order they first appear. */
export function stackValues(items: readonly Filterable[]): string[] {
  const counts = new Map<string, number>();
  for (const p of items) for (const s of p.stack) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}
