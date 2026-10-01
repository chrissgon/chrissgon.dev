// The site's small interactive layer (design direction A). Everything here enhances markup that already works
// and reads without JavaScript: tabs (the first tab shows without a script), copy buttons (hidden without a
// script; the text stays selectable), sections entering on scroll and the numbers counting up. With reduced
// motion, every final frame shows at once.
import { frame, parseFigure, progressAt } from "../lib/countup.ts";

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
    try {
      await navigator.clipboard.writeText(target.textContent ?? "");
      button.textContent = button.dataset.copied ?? label;
      if (status) status.textContent = button.dataset.copied ?? "";
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        button.textContent = label;
        if (status) status.textContent = "";
      }, 2000);
    } catch {
      selectAll(target);
      if (status) status.textContent = button.dataset.fallback ?? "";
    }
  });
}

function selectAll(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(range);
}

// A text to copy is a read-only textbox that wraps (src/components/CopyField.astro): focusing it selects all of
// it, as focusing a read-only input would, so Ctrl+C copies it; a click selects it through CSS (user-select: all).
for (const text of document.querySelectorAll<HTMLElement>("[data-copy-text][tabindex]")) {
  text.addEventListener("focus", () => selectAll(text));
}

// Numbers count up to their figure when their strip enters the screen: COUNT_MS each on an ease-out curve,
// every cell STAGGER_MS after the one before. Each number keeps the width of its final figure while it counts
// (so nothing beside it moves), shows its locale's format at every frame and ends on the exact text.
function countUp(nums: HTMLElement[]) {
  if (reduced) return;
  const items = nums
    .map((el) => ({ el, text: el.dataset.count ?? el.textContent ?? "" }))
    .map((x) => ({ ...x, figure: parseFigure(x.text, lang) }))
    .filter((x): x is typeof x & { figure: NonNullable<typeof x.figure> } => x.figure !== null);
  if (!items.length) return;
  // Measure every final width first, then write, so the page lays out once.
  const widths = items.map((x) => x.el.getBoundingClientRect().width);
  items.forEach((x, i) => {
    x.el.style.minWidth = `${widths[i]}px`;
    x.el.style.textAlign = "right";
    x.el.textContent = frame(x.figure, 0);
  });
  const start = performance.now();
  const step = (now: number) => {
    let done = true;
    items.forEach((x, i) => {
      const p = progressAt(now - start, i);
      x.el.textContent = p >= 1 ? x.text : frame(x.figure, p);
      if (p < 1) done = false;
    });
    if (!done) return void requestAnimationFrame(step);
    // Final text in place: give the width back to the layout (the font size changes across breakpoints).
    for (const x of items) {
      x.el.style.minWidth = "";
      x.el.style.textAlign = "";
    }
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
      const nums = [...el.querySelectorAll<HTMLElement>("[data-count]")];
      if (nums.length) void document.fonts.ready.then(() => countUp(nums));
      seen.unobserve(el);
    }
  },
  { rootMargin: "0px 0px -10% 0px" },
);
for (const el of document.querySelectorAll<HTMLElement>(".reveal")) seen.observe(el);

// "Pick the next post" (home page): once the section comes near, a lazy chunk reads the profile's round again
// (rounds change every Monday; deploys are manual). Nothing of it loads with the first render. It lives here, not
// in the home page's script, so the dynamic-import helper stays in this one chunk.
const pick = document.querySelector<HTMLElement>("[data-pick]");
if (pick) {
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      near.disconnect();
      void import("./pick-refresh.ts").then((m) => m.refreshPick(pick), () => {});
    },
    { rootMargin: "600px 0px" },
  );
  near.observe(pick);
}

// The lab's perfectui-live playground (src/scripts/playground.ts): a separate chunk, imported when the lab page
// opens the experiment and dispatches "playground" on its showcase. Its import site is here too, for the same
// reason: the pages share no extra helper chunk for it.
document.addEventListener("playground", (e) => {
  const root = e.target;
  if (root instanceof HTMLElement) void import("./playground.ts").then((m) => m.mountPlayground(root));
});

// Test variations of the portrait, only with ?portrait=text or ?portrait=blocks in the address: letters of
// Perfect UI class names instead of dots (src/lib/portrait/glyphs.ts). Loaded after the page, so the portrait is mounted by then.
const portrait = new URLSearchParams(location.search).get("portrait");
if (portrait) {
  addEventListener("load", () => void import("../lib/portrait/glyphs.ts").then((m) => m.useGlyphs(portrait), () => {}), { once: true });
}

// The background dots step aside from the pointer, like the portrait's (src/lib/griddots/). Only with a mouse or
// pen, without reduced motion or Save-Data, and loaded once the page is idle after load: a separate chunk, so it
// is no part of the first render. Without it the CSS grid is the whole picture.
const saveData = !!(navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
if (!reduced && !saveData && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  const go = () => void import("../lib/griddots/mount.ts").then((m) => m.mountGridDots(), () => {});
  const idle = () => ("requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 3000 }) : setTimeout(go, 1500));
  if (document.readyState === "complete") idle();
  else addEventListener("load", idle, { once: true });
}
