// "Pick the next post", refreshed in the page (src/components/PickNext.astro): production deploys are manual and
// rounds change every Monday, so once the section comes near, this lazy chunk reads the profile's pick.json again
// (raw.githubusercontent.com, a public file served with CORS), validates it (src/lib/pick.ts), runs the same
// sensitive-topics lock as the build on the texts it would show, and redraws the section, as text only, when the
// round differs from the build's. On any error, an older round or a text the lock stops, the build's content stays.
// External content is data: nothing in the file is followed or rendered as HTML.
import { MAX_PICK_BYTES, PICK_RAW_URL, parsePick, pickMarkdown, pickView, viewKey, viewTexts, type PickData, type PickView } from "../lib/pick.ts";
import { matchTopics, withLocalExcludes } from "../lib/topics.ts";
import type { Lang, SensitiveExclude, SensitiveTopics } from "../data/schema.ts";
import publicTopics from "../data/sensitive-topics.json";
import localExcludes from "../data/sensitive-exclude.json";

const TIMEOUT_MS = 5000;

async function load(): Promise<PickData | null> {
  const signal = "timeout" in AbortSignal ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  const res = await fetch(PICK_RAW_URL, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
  if (!res.ok) return null;
  const body = await res.text();
  return body.length > MAX_PICK_BYTES ? null : parsePick(JSON.parse(body));
}

/** True when a text the section could show trips the sensitive-topics lock. */
export function tripsLock(data: PickData): boolean {
  const topics = withLocalExcludes(publicTopics as SensitiveTopics, localExcludes as SensitiveExclude);
  const texts = [data.pillar, ...Object.values(data.options), ...data.history.flatMap((h) => Object.values(h.options))];
  return texts.some((s) => matchTopics(s, topics).length > 0);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, ...children: (string | Node)[]) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...children);
  return e;
}

/** The section's markup for a view: the same elements and classes as PickNext.astro, built from text nodes. */
export function renderPick(section: HTMLElement, view: PickView, lang: Lang) {
  const body = section.querySelector<HTMLElement>("[data-pick-body]");
  const reading = section.querySelector<HTMLElement>(".agent-text");
  if (!body || !reading) return;
  const x = viewTexts(view, lang);
  const nodes: HTMLElement[] = [];
  if (view.state === "open" && x.lead) {
    nodes.push(el("p", "pick-lead", x.lead[0], el("strong", undefined, x.pillar), x.lead[1]));
    const list = el("ol", "pick-list");
    for (const o of view.options) {
      const a = el("a", "pui-btn pui-outline pui-surface", x.button);
      a.href = o.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("aria-label", `${x.button} ${o.letter}: ${o.topic}`);
      list.append(el("li", undefined, el("span", "pick-letter mono", o.letter), el("span", "pick-topic", o.topic), a));
    }
    nodes.push(list);
  } else {
    nodes.push(el("p", "pick-lead", x.closed));
  }
  if (view.last && x.last) {
    const last = el("p", "pick-last", x.last[0], el("strong", undefined, view.last.topic), x.last[1], " ");
    if (view.last.url) {
      const a = el("a", undefined, x.wrote);
      a.href = view.last.url;
      last.append(a, ".");
    } else last.append(x.writing);
    nodes.push(last);
  }
  body.replaceChildren(...nodes);
  reading.textContent = pickMarkdown(view, lang).trimEnd();
  section.dataset.pick = viewKey(view);
  section.dataset.round = view.round;
}

export async function refreshPick(section: HTMLElement, now = new Date()): Promise<void> {
  try {
    const data = await load();
    if (!data || data.round < (section.dataset.round ?? "") || tripsLock(data)) return;
    const view = pickView(data, now);
    if (viewKey(view) === section.dataset.pick) return;
    renderPick(section, view, document.documentElement.lang.startsWith("pt") ? "pt" : "en");
  } catch {
    // Offline, blocked, a timeout or bad JSON: the build's round stays.
  }
}
