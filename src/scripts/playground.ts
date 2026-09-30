// perfectui-live playground (the lab page imports this chunk only when the experiment opens): each tab's printed
// markup becomes an editor, prefilled with the tab's example, and its live component becomes a preview of what
// the visitor types, rendered 200 ms after the last keystroke. Reset puts the example back. Pure parts:
// src/lib/playground.ts.
//
// The preview is an iframe with sandbox="allow-scripts" and a srcdoc document: without allow-same-origin its
// origin is opaque, so a script the visitor types runs there and cannot read or change this page (parent.document
// throws); without allow-top-navigation, allow-popups, allow-forms or allow-modals it cannot navigate this page,
// open windows, post forms or raise dialogs. It loads Perfect UI's stylesheet and the site's fonts from this
// site's own build, and Perfect UI's JavaScript fallbacks (inlined here) only for what this browser lacks.
// ?inline: the stylesheet's text, added by mountPlayground. A plain CSS import would make the build inline it
// into every page's first render, as it does for the CSS of every script a page carries.
import editorCss from "../styles/playground.css?inline";
import puiCss from "@chrissgon/perfectui/perfectui.css?url";
import anchorPositioning from "@chrissgon/perfectui/fallbacks/anchor-positioning?raw";
import checkboxIndeterminate from "@chrissgon/perfectui/fallbacks/checkbox-indeterminate?raw";
import commandFor from "@chrissgon/perfectui/fallbacks/command-for?raw";
import dialogClosedby from "@chrissgon/perfectui/fallbacks/dialog-closedby?raw";
import interestFor from "@chrissgon/perfectui/fallbacks/interest-for?raw";
import {
  HEIGHT_MESSAGE,
  MIN_HEIGHT,
  SANDBOX,
  buildSrcdoc,
  debounce,
  exampleText,
  frameHeight,
  indentAt,
  type PreviewOptions,
} from "../lib/playground.ts";

// Perfect UI 1.0.0's loader (dist/js/index.js) with the same support checks: a fallback goes into the preview
// only when the browser lacks the feature, as the loader would load it.
const FALLBACKS: Array<{ src: string; supported: () => boolean }> = [
  { src: commandFor, supported: () => "commandForElement" in HTMLButtonElement.prototype },
  { src: dialogClosedby, supported: () => "closedBy" in HTMLDialogElement.prototype },
  { src: interestFor, supported: () => "interestForElement" in HTMLButtonElement.prototype },
  { src: anchorPositioning, supported: () => CSS.supports("anchor-name: --a") },
  { src: checkboxIndeterminate, supported: () => false },
];

const DELAY_MS = 200;

function previewOptions(root: HTMLElement): PreviewOptions {
  const fontFaces: string[] = [];
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    const base = sheet.href ?? location.href;
    for (const rule of rules) {
      if (rule instanceof CSSFontFaceRule) {
        // Absolute URLs: the preview's own URL is about:srcdoc.
        fontFaces.push(rule.cssText.replace(/url\("?([^")]+)"?\)/g, (_, u: string) => `url("${new URL(u, base).href}")`));
      }
    }
  }
  const code = root.querySelector("pre") ?? document.documentElement;
  return {
    origin: location.origin,
    cssHref: new URL(puiCss, location.href).href,
    fontFaces: fontFaces.join("\n"),
    sans: getComputedStyle(document.documentElement).fontFamily,
    mono: getComputedStyle(code).fontFamily,
    scripts: FALLBACKS.filter((f) => !f.supported()).map((f) => f.src),
    lang: document.documentElement.lang,
  };
}

const fieldSizing = CSS.supports("field-sizing", "content");

export function mountPlayground(root: HTMLElement): void {
  if (root.dataset.playgroundReady !== undefined) return;
  root.dataset.playgroundReady = "";
  const style = document.createElement("style");
  style.textContent = editorCss;
  document.head.append(style);
  const template = root.querySelector<HTMLTemplateElement>("template[data-editor]");
  if (!template) return;
  const options = previewOptions(root);
  const frames: HTMLIFrameElement[] = [];
  const panels = [...root.querySelectorAll<HTMLElement>("[role=tabpanel]")];
  const resizers: Array<() => void> = [];

  addEventListener("message", (e: MessageEvent) => {
    const data = e.data as { type?: unknown; height?: unknown } | null;
    if (!data || data.type !== HEIGHT_MESSAGE) return;
    const frame = frames.find((f) => f.contentWindow === e.source);
    if (frame) frame.style.height = `${frameHeight(data.height)}px`;
  });
  if (!fieldSizing) addEventListener("resize", debounce(() => resizers.forEach((r) => r()), 100));

  function enhance(panel: HTMLElement | undefined) {
    if (!panel || panel.dataset.editor !== undefined) return;
    const pre = panel.querySelector<HTMLElement>(".showcase-code pre");
    const live = panel.querySelector<HTMLElement>(".showcase-live .live");
    if (!pre || !live) return;
    panel.dataset.editor = "";
    const example = exampleText(pre.textContent ?? "");

    const ui = template!.content.firstElementChild!.cloneNode(true) as HTMLElement;
    const text = ui.querySelector("textarea")!;
    const hint = ui.querySelector<HTMLElement>("[data-editor-hint]")!;
    const reset = ui.querySelector<HTMLButtonElement>("[data-editor-reset]")!;
    hint.id = `${panel.id}-hint`;
    text.id = `${panel.id}-editor`;
    text.setAttribute("aria-describedby", hint.id);
    text.value = example;

    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", SANDBOX);
    frame.className = "preview";
    frame.title = root.dataset.previewTitle ?? "";
    frame.referrerPolicy = "no-referrer";
    frame.style.height = `${MIN_HEIGHT}px`;
    frames.push(frame);

    const render = () => {
      frame.srcdoc = buildSrcdoc(text.value, options);
    };
    const later = debounce(render, DELAY_MS);
    const fit = () => {
      if (fieldSizing) return;
      text.style.height = "auto";
      text.style.height = `${text.scrollHeight + text.offsetHeight - text.clientHeight}px`;
    };
    resizers.push(fit);

    text.addEventListener("input", () => {
      fit();
      later();
    });
    reset.addEventListener("click", () => {
      later.cancel();
      text.value = example;
      fit();
      render();
    });

    // Tab indents while the editor holds it; Esc lets go (the next Tab leaves) without closing the experiment,
    // and a second Esc closes it as anywhere else on the page. Shift+Tab always leaves. Focus holds Tab again.
    let holdsTab = true;
    text.addEventListener("focus", () => {
      holdsTab = true;
    });
    text.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && holdsTab) {
        holdsTab = false;
        e.stopPropagation();
        return;
      }
      if (e.key !== "Tab" || !holdsTab || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      // insertText keeps the browser's undo history and fires input; otherwise edit the value directly.
      if (!document.execCommand("insertText", false, "  ")) {
        const next = indentAt(text.value, text.selectionStart, text.selectionEnd);
        text.value = next.value;
        text.setSelectionRange(next.caret, next.caret);
        text.dispatchEvent(new Event("input"));
      }
    });

    pre.hidden = true;
    pre.after(ui);
    live.hidden = true;
    live.after(frame);
    fit();
    render();
  }

  const shown = () => panels.find((p) => !p.hidden);
  enhance(shown());
  root.addEventListener("tabchange", () => enhance(shown()));
}
