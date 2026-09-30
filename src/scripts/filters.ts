// The project filters in the page (site-projects.md, FLOW-6), shared by the projects page and the home page's
// projects section: [data-filters] holds chip buttons ([data-group] + [data-value], and [data-all]); each
// .card-slot says its types, status and stack. Pressing a chip shows the matching cards, updates every chip's
// count, the result count ([data-result-count]) and the caption's trailing number ([data-count-tag]), shows the
// empty state ([data-empty]) when nothing matches, and keeps the state in the URL query, which the language links
// carry. Toggling reorders within 300 ms (a view transition), at once with reduced motion. Without JavaScript the
// bar stays hidden and every card shows.
import { chipCount, isEmpty, parseQuery, toggle, toQuery, EMPTY, matches, type Allowed, type FilterState, type Group } from "../lib/filters.ts";

const bar = document.querySelector<HTMLElement>("[data-filters]");
const slots = [...document.querySelectorAll<HTMLElement>(".card-slot")];
const items = slots.map((el) => ({
  el,
  types: (el.dataset.types ?? "").split(" "),
  status: el.dataset.status ?? "",
  stack: JSON.parse(el.dataset.stack ?? "[]") as string[],
}));
const count = document.querySelector<HTMLElement>("[data-result-count]");
const empty = document.querySelector<HTMLElement>("[data-empty]");
const tag = document.querySelector<HTMLElement>("[data-count-tag]");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ON = ["pui-solid", "pui-inverse"];
const OFF = ["pui-outline", "pui-surface"];
const press = (b: HTMLElement, on: boolean) => {
  b.setAttribute("aria-pressed", String(on));
  b.classList.remove(...(on ? OFF : ON));
  b.classList.add(...(on ? ON : OFF));
};

if (bar) {
  const allowed = JSON.parse(bar.dataset.allowed ?? "{}") as Allowed;
  let state: FilterState = parseQuery(location.search, allowed);

  const render = () => {
    let shown = 0;
    for (const it of items) {
      const on = matches(it, state);
      it.el.hidden = !on;
      if (on) shown++;
    }
    if (count) count.textContent = String(shown);
    if (tag) tag.textContent = tag.textContent!.replace(/\d+$/, String(shown));
    if (empty) empty.hidden = shown > 0;
    for (const b of document.querySelectorAll<HTMLElement>("[data-group]")) {
      const g = b.dataset.group as Group, v = b.dataset.value ?? "";
      press(b, state[g] === v);
      const n = b.querySelector("[data-chip-count]");
      if (n) n.textContent = String(chipCount(items, state, g, v));
    }
    for (const b of document.querySelectorAll<HTMLElement>("[data-all]")) press(b, isEmpty(state));
    const query = toQuery(state);
    history.replaceState(null, "", location.pathname + query + location.hash);
    for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-lang-link]")) {
      a.search = query;
    }
  };
  const apply = (next: FilterState) => {
    state = next;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (!reduced && doc.startViewTransition) doc.startViewTransition(render);
    else render();
  };
  document.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-group], [data-all]");
    if (!b) return;
    apply(b.hasAttribute("data-all") ? { ...EMPTY } : toggle(state, b.dataset.group as Group, b.dataset.value ?? ""));
  });
  render();
}
