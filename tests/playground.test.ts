import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codeLines } from "../src/lib/code.ts";
import {
  HEIGHT_MESSAGE,
  MAX_HEIGHT,
  MIN_HEIGHT,
  SANDBOX,
  buildSrcdoc,
  debounce,
  escapeAttr,
  escapeRawText,
  exampleText,
  frameHeight,
  indentAt,
  previewCsp,
  type PreviewOptions,
} from "../src/lib/playground.ts";
import { showcase } from "../src/lib/showcase.ts";
import { resolveStats } from "../src/lib/stats.ts";

const site = "https://chrissgon.dev";
const npm = { downloads: 1014, start: "2026-08-30", end: "2026-09-28", package: "@chrissgon/perfectui" as const };
const workbench = { skills: 47, agents: 4, adapters: 3, tree: "18b585ba0b82409c9bc59d4f4a385c6a5bb6abe3", date: "2026-09-30" };

describe("playground debounce", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("calls once, the delay after the last call of a burst, with the last arguments", () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d("a");
    vi.advanceTimersByTime(150);
    d("b");
    vi.advanceTimersByTime(150);
    d("c");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flush runs a pending call now; cancel drops it; neither calls when nothing is pending", () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d.flush();
    d.cancel();
    expect(fn).not.toHaveBeenCalled();
    d(1);
    d.flush();
    expect(fn).toHaveBeenCalledWith(1);
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
    d(2);
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("playground examples", () => {
  // What a tab's <pre> reads as text: CodeLines prints each line's pieces (joined by <wbr>, no text) and a newline.
  const printed = (text: string) => codeLines(text).map((l) => `${l.pieces.join("")}\n`).join("");

  for (const lang of ["en", "pt"] as const) {
    it(`gives back each ${lang.toUpperCase()} example exactly from its printed code`, () => {
      for (const item of showcase(lang, site, resolveStats(lang, { npm, workbench }))) {
        expect(exampleText(printed(item.html))).toBe(item.html);
      }
    });
  }

  it("keeps blank lines and indentation, drops one trailing newline and normalises line endings", () => {
    expect(exampleText("a\n\n  b\n")).toBe("a\n\n  b");
    expect(exampleText("a\r\nb\rc\n")).toBe("a\nb\nc");
    expect(exampleText("")).toBe("");
  });
});

describe("playground preview document", () => {
  const options: PreviewOptions = {
    origin: "https://chrissgon.dev",
    cssHref: "https://chrissgon.dev/_astro/perfectui.X.css?a=1&b=2",
    fontFaces: '@font-face{font-family:Inter;src:url("https://chrissgon.dev/_astro/fonts/a.woff2")}',
    sans: 'Inter, "Inter fallback", sans-serif',
    mono: '"JetBrains Mono", monospace',
    scripts: ["document.body.dataset.x = '</script>';"],
    lang: "pt-BR",
  };
  const doc = buildSrcdoc('<button class="pui-btn pui-solid pui-theme">Hi</button>', options);

  it("renders the markup as is, in the body, after Perfect UI in dark mode", () => {
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain('<html lang="pt-BR" data-pui-mode="dark">');
    expect(doc).toContain('<body><button class="pui-btn pui-solid pui-theme">Hi</button></body>');
    expect(doc.indexOf("<link rel=\"stylesheet\"")).toBeLessThan(doc.indexOf("<body>"));
    expect(doc).toContain('<link rel="stylesheet" href="https://chrissgon.dev/_astro/perfectui.X.css?a=1&amp;b=2">');
    expect(doc).toContain("font-family:Inter, \"Inter fallback\", sans-serif");
    expect(doc).toContain('@font-face{font-family:Inter;src:url("https://chrissgon.dev/_astro/fonts/a.woff2")}');
  });

  it("puts a Content-Security-Policy first that allows only the site's origin and inline scripts", () => {
    const csp = previewCsp("https://chrissgon.dev");
    expect(csp).toBe(
      "default-src 'none'; style-src https://chrissgon.dev 'unsafe-inline'; font-src https://chrissgon.dev; " +
        "img-src https://chrissgon.dev data:; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    );
    const meta = `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">`;
    expect(doc).toContain(meta);
    // Before anything that loads or runs.
    expect(doc.indexOf(meta)).toBeLessThan(doc.indexOf("<link"));
    expect(doc.indexOf(meta)).toBeLessThan(doc.indexOf("<script"));
  });

  it("inlines the fallbacks as modules without letting their text close the script early", () => {
    expect(doc).toContain("<script type=\"module\">document.body.dataset.x = '<\\/script>';</script>");
    expect(doc.match(/<\/script>/g)!.length).toBe(2); // the helper's and the fallback's own closing tags
  });

  it("reports its height to the page and keeps links from navigating", () => {
    expect(doc).toContain(`type: "${HEIGHT_MESSAGE}"`);
    expect(doc).toContain('closest("a[href]")');
  });

  it("escapes attribute values and raw-text closers", () => {
    expect(escapeAttr(`a"b<c>&d`)).toBe("a&quot;b&lt;c&gt;&amp;d");
    expect(escapeRawText("x</style>y</SCRIPT >z</div>")).toBe("x<\\/style>y<\\/SCRIPT >z</div>");
    expect(buildSrcdoc("", { ...options, fontFaces: "a</style><script>alert(1)</script>" })).not.toContain("a</style>");
  });
});

describe("playground frame", () => {
  it("is sandboxed with scripts only: no same origin, navigation of the page, popups, forms or modals", () => {
    expect(SANDBOX.split(/\s+/)).toEqual(["allow-scripts"]);
  });

  it("keeps the reported height within its bounds", () => {
    expect(frameHeight(100)).toBe(MIN_HEIGHT);
    expect(frameHeight(400.2)).toBe(401);
    expect(frameHeight(5000)).toBe(MAX_HEIGHT);
    expect(frameHeight("400")).toBe(MIN_HEIGHT);
    expect(frameHeight(Number.NaN)).toBe(MIN_HEIGHT);
    expect(frameHeight(Infinity)).toBe(MIN_HEIGHT);
  });

  it("indents with two spaces in place of the selection", () => {
    expect(indentAt("<a>", 0, 0)).toEqual({ value: "  <a>", caret: 2 });
    expect(indentAt("<a>x</a>", 3, 4)).toEqual({ value: "<a>  </a>", caret: 5 });
  });
});
