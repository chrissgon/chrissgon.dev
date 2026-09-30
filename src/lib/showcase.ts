// perfectui-live: the Perfect UI components shown on the home page and in the lab, each as one markup string
// that the page renders twice, live and as code, so the code is always the component's own (site-home.md,
// region 6). Button: the hero's two links; Card: the "For agents" card; Modal: the "Request permission" example
// of the Perfect UI design system, section 4.8, verbatim; Switch: the "view as agent" switch; Table: the
// numbers strip in a table inside a card.
import { products, t, type Lang } from "../data/index.ts";
import { MCP_PATH } from "../mcp/tools.ts";
import type { ShownStat } from "./stats.ts";

export const SHOWCASE_IDS = ["button", "card", "modal", "switch", "table"] as const;
export type ShowcaseId = (typeof SHOWCASE_IDS)[number];

export interface ShowcaseItem {
  id: ShowcaseId;
  /** The component's name, the same in both languages. */
  name: string;
  html: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The two product links of the hero, with the hero's classes. */
export function productButtons(): string {
  return products
    .map((p) => `<a class="pui-btn ${p.id === "perfectui" ? "pui-solid pui-theme" : "pui-outline pui-surface"}" href="${esc(p.url)}">${esc(p.name)}</a>`)
    .join("\n");
}

// Perfect UI design system (perfectui/design-system/DESIGN-SYSTEM.md), 4.8 Modal, "Example: Request permission".
export const MODAL_EXAMPLE = `<button class="pui-btn pui-solid pui-theme" commandfor="notify" command="show-modal">
  <i class="icon icon-bell"></i> Turn on notifications
</button>

<dialog class="pui-modal" id="notify" closedby="any" aria-labelledby="notify-title">
  <div class="pui-card">
    <div class="pui-card-header" id="notify-title">
      <i class="icon icon-bell-ring"></i> Allow notifications?
    </div>
    <div class="pui-card-content">
      We will let you know when someone mentions you or a build fails.
      You can change this later in Settings.
      <div style="display: flex; gap: 8px; justify-content: flex-end">
        <button class="pui-btn pui-outline pui-surface" commandfor="notify" command="close">
          Not now
        </button>
        <button class="pui-btn pui-solid pui-theme" commandfor="notify" command="close">
          <i class="icon icon-check"></i> Allow
        </button>
      </div>
    </div>
  </div>
</dialog>`;

export function showcase(lang: Lang, site: string, stats: ShownStat[]): ShowcaseItem[] {
  const card = [
    `<div class="pui-card">`,
    `  <div class="pui-card-header">${esc(t(lang, "navAgents"))}</div>`,
    `  <div class="pui-card-content">`,
    `    ${esc(t(lang, "connectAgent"))}`,
    `    <code>${esc(site + MCP_PATH)}</code>`,
    `    <button class="pui-btn pui-outline pui-surface">${esc(t(lang, "copy"))}</button>`,
    `    <button class="pui-btn pui-outline pui-surface">${esc(t(lang, "toolsList"))}</button>`,
    `    <a href="${lang === "en" ? "/llms.txt" : "/pt/llms.txt"}">${esc(t(lang, "readLlms"))}</a>`,
    `  </div>`,
    `</div>`,
  ].join("\n");
  const table = [
    `<div class="pui-card">`,
    `  <table class="pui-table">`,
    `    <tbody>`,
    ...stats.map((s) => `      <tr><td>${esc(s.value)}</td><td>${esc(s.label)}</td></tr>`),
    `    </tbody>`,
    `  </table>`,
    `</div>`,
  ].join("\n");
  return [
    { id: "button", name: "Button", html: productButtons() },
    { id: "card", name: "Card", html: card },
    { id: "modal", name: "Modal", html: MODAL_EXAMPLE },
    { id: "switch", name: "Switch", html: `<label><input type="checkbox" class="pui-switch"> ${esc(t(lang, "viewAsAgent"))}</label>` },
    { id: "table", name: "Table", html: table },
  ];
}
