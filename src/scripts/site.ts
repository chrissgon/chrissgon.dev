// The site's small interactive layer (design direction A). Everything here enhances markup that already works
// and reads without JavaScript: tabs (the first tab shows without a script), copy buttons (hidden without a
// script; the text stays selectable), sections entering on scroll and the numbers counting up. With reduced
// motion, every final frame shows at once.
import { frame, parseFigure } from "../lib/countup.ts";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lang = document.documentElement.lang.startsWith("pt") ? "pt" : "en";

// Tabs: [data-tabs] holds [role=tab] buttons that control [role=tabpanel] elements. Arrows move between tabs.
// The selected tab's classes come from the root's data-on / data-off (default: solid inverse / outline surface).
const classes = (value: string | undefined, fallback: string[]) => (value ? value.split(" ") : fallback);
function select(tabs: HTMLButtonElement[], chosen: HTMLButtonElement, focus = false) {
  const root = chosen.closest<HTMLElement>("[data-tabs]");
  const ON = classes(root?.dataset.on, ["pui-solid", "pui-inverse"]);
  const OFF = classes(root?.dataset.off, ["pui-outline", "pui-surface"]);
  for (const tab of tabs) {
    const on = tab === chosen;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    tab.classList.remove(...(on ? OFF : ON));
    tab.classList.add(...(on ? ON : OFF));
    const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
    if (panel) panel.hidden = !on;
  }
  if (focus) chosen.focus();
  chosen.closest("[data-tabs]")?.dispatchEvent(new CustomEvent("tabchange", { bubbles: true }));
}
for (const root of document.querySelectorAll<HTMLElement>("[data-tabs]")) {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[role=tab]")];
  for (const tab of tabs) {
    tab.addEventListener("click", () => select(tabs, tab));
    tab.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(tab);
      const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
      if (next === null) return;
      e.preventDefault();
      select(tabs, tabs[(next + tabs.length) % tabs.length]!, true);
    });
  }
}

// Copy: a [data-copy] button copies the text of the element its value selects inside [data-copy-root]. On
// success it says "Copied" for 2 s (and the status region announces it); on failure the text is selected and
// the status says "Press Ctrl+C to copy".
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
  const root = button.closest<HTMLElement>("[data-copy-root]");
  const status = root?.querySelector<HTMLElement>("[data-copy-status]");
  const label = button.textContent ?? "";
  let timer = 0;
  button.hidden = false;
  button.addEventListener("click", async () => {
    const target = root?.querySelector<HTMLElement>(button.dataset.copy ?? "");
    if (!target) return;
    const input = target instanceof HTMLInputElement ? target : null;
    try {
      await navigator.clipboard.writeText(input ? input.value : (target.textContent ?? ""));
      button.textContent = button.dataset.copied ?? label;
      if (status) status.textContent = button.dataset.copied ?? "";
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        button.textContent = label;
        if (status) status.textContent = "";
      }, 2000);
    } catch {
      if (input) {
        input.select();
        if (status) status.textContent = button.dataset.fallback ?? "";
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(target);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      if (status) status.textContent = button.dataset.fallback ?? "";
    }
  });
}

// Numbers count up to their figure in 600 ms when they enter the screen.
function countUp(el: HTMLElement) {
  const text = el.dataset.count ?? el.textContent ?? "";
  const figure = parseFigure(text, lang);
  if (!figure || reduced) return;
  const start = performance.now();
  const step = (now: number) => {
    const p = (now - start) / 600;
    el.textContent = p >= 1 ? text : frame(figure, p);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Sections enter on scroll within 400 ms (the CSS does the motion; html.js is set in the head).
const seen = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target as HTMLElement;
      el.classList.add("in");
      for (const n of el.querySelectorAll<HTMLElement>("[data-count]")) countUp(n);
      seen.unobserve(el);
    }
  },
  { rootMargin: "0px 0px -10% 0px" },
);
for (const el of document.querySelectorAll<HTMLElement>(".reveal")) seen.observe(el);
