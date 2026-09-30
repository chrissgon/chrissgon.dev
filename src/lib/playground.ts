// perfectui-live playground: pure helpers for the lab's editable Perfect UI examples (src/scripts/playground.ts
// holds the DOM). The visitor's markup renders in an iframe built from a srcdoc string: sandbox="allow-scripts"
// without allow-same-origin, so the document has an opaque origin and its scripts cannot reach the site; a meta
// Content-Security-Policy lets it load only the site's own Perfect UI stylesheet and fonts, run inline scripts
// and nothing else (no fetch, no remote images, no <base>, no form posts).

/** The iframe's sandbox: scripts only (Perfect UI's fallbacks, the size report and the visitor's own tests). */
export const SANDBOX = "allow-scripts";

/** The preview's height in px: at least MIN (room for the modal example), at most MAX, then it scrolls itself. */
export const MIN_HEIGHT = 280;
export const MAX_HEIGHT = 640;

/** The message the preview sends to the page with its content height. */
export const HEIGHT_MESSAGE = "perfectui-live:height";

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Runs a pending call now. */
  flush(): void;
  /** Drops a pending call. */
  cancel(): void;
}

/** fn, called once `ms` after the last of a burst of calls, with that last call's arguments. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: A | undefined;
  const run = () => {
    timer = undefined;
    const args = last;
    last = undefined;
    if (args) fn(...args);
  };
  const d = (...args: A) => {
    last = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(run, ms);
  };
  d.flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    run();
  };
  d.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    last = undefined;
  };
  return d;
}

/**
 * The example a tab starts from: the text of its printed code (src/components/CodeLines.astro ends every line,
 * the last one too, with a newline; its <wbr> add no text). Line endings become "\n".
 */
export function exampleText(printed: string): string {
  return printed.replace(/\r\n?/g, "\n").replace(/\n$/, "");
}

/** Text for a double-quoted HTML attribute value. */
export function escapeAttr(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Text for the inside of a <style> or <script> element: no sequence that would close it early. */
export function escapeRawText(s: string): string {
  return s.replace(/<\/(?=(style|script)\b)/gi, "<\\/");
}

/** The preview's Content-Security-Policy: the site's origin for styles, fonts and images; inline scripts. */
export function previewCsp(origin: string): string {
  return [
    "default-src 'none'",
    `style-src ${origin} 'unsafe-inline'`,
    `font-src ${origin}`,
    `img-src ${origin} data:`,
    "script-src 'unsafe-inline'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

// Runs first in the preview: reports the content's height to the page (the body is at least the frame's height,
// so the content's own box is measured) and keeps links from navigating the preview.
const HELPER = `(() => {
  const post = () => {
    const kids = [...document.body.children].filter((el) => el.getClientRects().length && getComputedStyle(el).position !== "fixed");
    if (!kids.length) return parent.postMessage({ type: "${HEIGHT_MESSAGE}", height: 0 }, "*");
    const top = Math.min(...kids.map((el) => el.getBoundingClientRect().top));
    const bottom = Math.max(...kids.map((el) => el.getBoundingClientRect().bottom));
    const pad = parseFloat(getComputedStyle(document.body).paddingTop) + parseFloat(getComputedStyle(document.body).paddingBottom);
    parent.postMessage({ type: "${HEIGHT_MESSAGE}", height: Math.ceil(bottom - top + pad) }, "*");
  };
  addEventListener("DOMContentLoaded", () => {
    const ro = new ResizeObserver(post);
    for (const el of document.body.children) ro.observe(el);
    post();
  });
  addEventListener("load", post);
  document.fonts.ready.then(post);
  addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.closest("a[href]")) e.preventDefault();
  }, true);
})();`;

export interface PreviewOptions {
  /** The site's origin, e.g. https://chrissgon.dev (the only origin the preview may load from). */
  origin: string;
  /** Absolute URL of Perfect UI's stylesheet, as the site's build serves it. */
  cssHref: string;
  /** The page's @font-face rules, so the preview uses the site's fonts. */
  fontFaces: string;
  /** The page's sans and mono font-family lists. */
  sans: string;
  mono: string;
  /** Perfect UI fallbacks this browser needs, as module source. */
  scripts: string[];
  lang: string;
}

/** The preview document: Perfect UI in dark mode, the site's fonts, then the visitor's markup as the body. */
export function buildSrcdoc(markup: string, o: PreviewOptions): string {
  const css = `${o.fontFaces}
html{background:var(--pui-bg);color:var(--pui-text);font-family:${o.sans};line-height:1.5}
body{box-sizing:border-box;min-height:100vh;margin:0;padding:24px;display:flex;flex-wrap:wrap;align-items:center;align-content:center;justify-content:center;gap:12px;font-size:14px;overflow-wrap:anywhere}
*,*::before,*::after{box-sizing:border-box}
code,kbd,pre,samp{font-family:${o.mono};overflow-wrap:anywhere}
pre{white-space:pre-wrap}
img{max-width:100%}
a:not([class]){color:var(--pui-text);text-underline-offset:3px}
:focus-visible{outline:2px solid var(--pui-theme);outline-offset:2px}
body>.pui-card{width:min(420px,100%)}
label:has(>.pui-switch,>.pui-checkbox,>.pui-radio){display:inline-flex;align-items:center;gap:8px}`;
  return [
    "<!doctype html>",
    `<html lang="${escapeAttr(o.lang)}" data-pui-mode="dark">`,
    "<head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(previewCsp(o.origin))}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<link rel="stylesheet" href="${escapeAttr(o.cssHref)}">`,
    `<style>${escapeRawText(css)}</style>`,
    `<script>${HELPER}</script>`,
    ...o.scripts.map((s) => `<script type="module">${escapeRawText(s)}</script>`),
    "</head>",
    `<body>${markup}</body>`,
    "</html>",
  ].join("\n");
}

/** The frame's height for a reported content height: within [MIN_HEIGHT, MAX_HEIGHT]; MIN_HEIGHT when unusable. */
export function frameHeight(reported: unknown): number {
  if (typeof reported !== "number" || !Number.isFinite(reported)) return MIN_HEIGHT;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(reported)));
}

/** Two spaces in place of the selection [start, end), and where the caret goes after them. */
export function indentAt(value: string, start: number, end: number): { value: string; caret: number } {
  return { value: value.slice(0, start) + "  " + value.slice(end), caret: start + 2 };
}
