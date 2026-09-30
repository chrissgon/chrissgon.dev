import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  checkDist,
  firstRenderUrls,
  fontsCorsProblems,
  hasSvgMetadata,
  llmsTxtProblems,
  manifestHeaderProblems,
  manifestProblems,
  netlifyHeader,
  pageWeight,
  pngSize,
  resolveUrl,
  tailwindClasses,
  tailwindWordIn,
} from "../scripts/check-dist.ts";
import {
  benchmarkOf,
  failingAgenticAudits,
  fileFor,
  gateFailures,
  median,
  medianScores,
  scoresOf,
  serve,
} from "../scripts/lighthouse.ts";

const CSS = ".pui-btn{display:inline-flex}\n@font-face{font-family:Inter;src:url(/_astro/inter.woff2) format('woff2')}";
const LD = '<script type="application/ld+json">{"@graph":[{"@type":"Person"}]}</script>';
const ICONS =
  '<link rel="canonical" href="https://chrissgon.dev/"><link rel="icon" href="/favicon.ico" sizes="48x48">' +
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">' +
  '<link rel="manifest" href="/site.webmanifest">';
const OG =
  '<meta property="og:image" content="https://chrissgon.dev/og/og-en.png"><meta property="og:image:width" content="1200">' +
  '<meta property="og:image:height" content="630"><meta property="og:image:alt" content="chrissgon">' +
  '<meta name="twitter:image" content="https://chrissgon.dev/og/og-en.png">';
const page = (body: string, head = "") =>
  `<!doctype html><html><head><link rel="stylesheet" href="/_astro/site.css">${ICONS}${OG}${head}${LD}</head><body><a class="pui-btn pui-solid">x</a>${body}</body></html>`;
/** The first bytes of a PNG: signature and IHDR, enough for its size. */
function png(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "latin1");
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr]);
}
const MANIFEST = JSON.stringify({ name: "Christopher Gonçalves", short_name: "chrissgon", start_url: "/", icons: [{ src: "/icon-192.png" }] });
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32"/></svg>';
const LLMS = "# Christopher Gonçalves\n\n> A label long enough to pass the audit.\n\n- [GitHub](https://github.com/chrissgon)\n";

/** A dist/ folder that passes every check; `files` adds or replaces files. */
function dist(files: Record<string, string | Buffer> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "dist-"));
  const all: Record<string, string | Buffer> = {
    "index.html": page(""),
    "pt/index.html": page(""),
    "projects/index.html": page(""),
    "_astro/site.css": CSS,
    "_astro/inter.woff2": Buffer.alloc(20_000),
    "llms.txt": LLMS,
    "pt/llms.txt": LLMS,
    "favicon.ico": Buffer.alloc(100, 1),
    "favicon.svg": SVG,
    "apple-touch-icon.png": png(180, 180),
    "icon-192.png": png(192, 192),
    "site.webmanifest": MANIFEST,
    "og/og-en.png": png(1200, 630),
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

describe("check-dist (ADR-0009)", () => {
  it("passes a clean build and measures the first render", () => {
    const r = checkDist(dist());
    expect(r.findings).toEqual([]);
    expect(r.weights.map((w) => w.page)).toEqual(["index.html", "pt/index.html"]);
    expect(r.weights[0]!.resources.map((x) => x.path).sort()).toEqual(["_astro/inter.woff2", "_astro/site.css", "index.html"]);
  });

  it("fails when a page does not load the Perfect UI stylesheet or the home page has no pui-btn", () => {
    const bare = "<!doctype html><html><head>" + LD + "</head><body><p>x</p></body></html>";
    const r = checkDist(dist({ "projects/index.html": bare, "pt/index.html": bare }));
    expect(r.findings).toContain("perfect-ui: projects/index.html does not load the Perfect UI stylesheet (.pui-btn)");
    expect(r.findings).toContain("perfect-ui: pt/index.html uses no pui-btn class");
  });

  it("finds Tailwind files, words, variables and utility classes", () => {
    const r = checkDist(
      dist({
        "_astro/tailwind.css": "a{}",
        "_astro/x.css": ".a{--tw-ring-color:red}",
        "_astro/y.js": "/*! tailwindcss v3 */",
        "projects/index.html": page('<div class="flex items-center p-4 md:grid pui-card portrait">x</div><style>/* tailwind */</style>'),
      }),
    );
    expect(r.findings).toEqual(
      expect.arrayContaining([
        "tailwind: file _astro/tailwind.css",
        "tailwind: --tw- variables in _astro/x.css",
        'tailwind: the word "tailwind" in _astro/y.js',
        'tailwind: the word "tailwind" in projects/index.html',
        'tailwind: class "items-center" in projects/index.html',
        'tailwind: class "p-4" in projects/index.html',
        'tailwind: class "md:grid" in projects/index.html',
      ]),
    );
    expect(tailwindClasses('<p class="pui-btn pui-solid portrait card-grid is-active">')).toEqual([]);
    expect(tailwindClasses("<p class='text-sm bg-blue-500 rounded-lg shadow w-1/2'>")).toEqual([
      "text-sm",
      "bg-blue-500",
      "rounded-lg",
      "shadow",
      "w-1/2",
    ]);
  });

  it("lets a project's text name Tailwind as its stack, in the page, llms.txt and JSON-LD", () => {
    const stack = '<p class="meta">Web &amp; UI · TypeScript, React, Redux, Tailwind, Perfect UI</p><div data-stack=\'["Tailwind"]\'></div>';
    const ld = '<script type="application/ld+json">{"description":"built with Tailwind"}</script>';
    expect(checkDist(dist({ "projects/index.html": page(stack + ld), "llms.txt": `${LLMS}- rickandmorty: Tailwind\n` })).findings).toEqual([]);
    expect(tailwindWordIn("a.svg", "<svg><style>.tailwind{}</style></svg>")).toBe(true);
    expect(tailwindWordIn("a.html", "<p>Tailwind</p><script>let x = 1</script>")).toBe(false);
    expect(tailwindWordIn("a.json", '{"stack":["Tailwind"]}')).toBe(false);
  });

  it("wants netlify.toml to serve the manifest as application/manifest+json", () => {
    const block = (type: string) =>
      `[build]\n  publish = "dist"\n\n[[headers]]\n  for = "/site.webmanifest"\n  [headers.values]\n    Content-Type = "${type}"\n\n[[redirects]]\n  from = "/a"\n  to = "/"\n`;
    expect(manifestHeaderProblems(block("application/manifest+json"))).toEqual([]);
    expect(manifestHeaderProblems(block("application/json"))).toEqual([
      "netlify: /site.webmanifest is served as application/json, not application/manifest+json",
    ]);
    expect(manifestHeaderProblems('[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Frame-Options = "DENY"\n')).toEqual([
      'netlify: netlify.toml has no [[headers]] block for "/site.webmanifest"',
    ]);
    // A Content-Type of another block does not count for the manifest.
    const split = '[[headers]]\n  for = "/site.webmanifest"\n  [headers.values]\n    Cache-Control = "max-age=0"\n\n[[headers]]\n  for = "/x"\n  [headers.values]\n    Content-Type = "application/manifest+json"\n';
    expect(manifestHeaderProblems(split)).toEqual([
      "netlify: /site.webmanifest is served as Netlify's default (application/octet-stream), not application/manifest+json",
    ]);
    // This repository's config passes.
    expect(manifestHeaderProblems(readFileSync(new URL("../netlify.toml", import.meta.url), "utf8"))).toEqual([]);
  });

  it("wants netlify.toml to let the lab's sandboxed preview load the fonts (Access-Control-Allow-Origin *)", () => {
    const block = (value: string) => `[[headers]]\n  for = "/_astro/fonts/*"\n  [headers.values]\n    ${value}\n`;
    expect(fontsCorsProblems(block('Access-Control-Allow-Origin = "*"'))).toEqual([]);
    expect(fontsCorsProblems(block('Access-Control-Allow-Origin = "https://chrissgon.dev"'))).toEqual([
      'netlify: /_astro/fonts/* is served with Access-Control-Allow-Origin "https://chrissgon.dev", not "*"',
    ]);
    expect(fontsCorsProblems(block('Cache-Control = "max-age=0"'))).toEqual([
      'netlify: /_astro/fonts/* is served with Access-Control-Allow-Origin unset, not "*"',
    ]);
    // A block for another path does not count.
    expect(fontsCorsProblems('[[headers]]\n  for = "/_astro/*"\n  [headers.values]\n    Access-Control-Allow-Origin = "*"\n')).toEqual([
      'netlify: netlify.toml has no [[headers]] block for "/_astro/fonts/*"',
    ]);
    expect(netlifyHeader(block('Access-Control-Allow-Origin = "*"'), "/_astro/fonts/*", "access-control-allow-origin")).toBe("*");
    // This repository's config passes.
    expect(fontsCorsProblems(readFileSync(new URL("../netlify.toml", import.meta.url), "utf8"))).toEqual([]);
  });

  it("allows one canvas per page and fails on two, ignoring noscript", () => {
    expect(checkDist(dist({ "index.html": page("<canvas></canvas><noscript><canvas></canvas></noscript>") })).findings).toEqual([]);
    expect(checkDist(dist({ "index.html": page("<canvas></canvas><canvas></canvas>") })).findings).toEqual([
      "canvas: 2 <canvas> elements in index.html (at most 1)",
    ]);
  });

  it("fails a home page over the 150 KB budget and names its weight", () => {
    const big = Buffer.alloc(160 * 1024, 1);
    const r = checkDist(dist({ "index.html": page('<img src="/hero.webp">'), "hero.webp": big }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatch(/^weight: index\.html first render is 1\d\d\.\d KB, over the 150 KB budget$/);
  });

  it("leaves lazy images, noscript fallbacks and the portrait video out of the first render", () => {
    const big = Buffer.alloc(200 * 1024, 1);
    const html = page(
      '<img src="/a.webp" loading="lazy"><noscript><img src="/b.webp"></noscript><link rel="preload" href="/portrait/portrait-loop.webm">',
    );
    const r = checkDist(dist({ "index.html": html, "a.webp": big, "b.webp": big, "portrait/portrait-loop.webm": big }));
    expect(r.findings).toEqual([]);
  });

  it("follows module imports, counts text gzip-compressed and flags another origin", () => {
    const js = "import{a as b}from\"./chunk.js\";import \"/_astro/side.js\";b();";
    const root = dist({
      "index.html": page('<script type="module" src="/_astro/page.js"></script><script src="https://cdn.example.com/x.js"></script>'),
      "_astro/page.js": js,
      "_astro/chunk.js": "export const a=()=>1;",
      "_astro/side.js": "console.log(1)",
    });
    const w = pageWeight(root, "index.html");
    expect(w.resources.map((r) => r.path)).toEqual(expect.arrayContaining(["_astro/page.js", "_astro/chunk.js", "_astro/side.js"]));
    expect(w.resources.find((r) => r.path === "_astro/page.js")!.bytes).toBe(gzipSync(js, { level: 9 }).length);
    expect(checkDist(root).findings).toEqual(["weight: index.html loads https://cdn.example.com/x.js from another origin before the first render"]);
  });

  it("counts the fonts declared in an inline style once, with the preloaded ones", () => {
    const style = "<style>@font-face{src:url(/_astro/inter.woff2)}@font-face{src:url('/_astro/mono.woff2') format('woff2')}</style>";
    const root = dist({
      "index.html": page("", `${style}<link rel="preload" href="/_astro/inter.woff2" as="font">`),
      "_astro/mono.woff2": Buffer.alloc(10_000),
    });
    const w = pageWeight(root, "index.html");
    expect(w.resources.map((r) => r.path).sort()).toEqual(["_astro/inter.woff2", "_astro/mono.woff2", "_astro/site.css", "index.html"]);
  });

  it("reports a referenced file that is not in dist/", () => {
    expect(checkDist(dist({ "index.html": page('<script type="module" src="/_astro/gone.js"></script>') })).findings).toEqual([
      "weight: index.html references _astro/gone.js, which is not in dist/",
    ]);
  });

  it("checks llms.txt like the Lighthouse audit and the JSON-LD Person", () => {
    expect(llmsTxtProblems("no heading, no link")).toEqual(["no H1", "no link", "shorter than 50 characters"]);
    expect(llmsTxtProblems(LLMS)).toEqual([]);
    const r = checkDist(dist({ "pt/llms.txt": "hello", "index.html": page("").replace(LD, "") }));
    expect(r.findings).toEqual(
      expect.arrayContaining(["jsonld: index.html has no Person", "llms: pt/llms.txt: no H1"]),
    );
  });

  it("fails a page without a favicon link, og:image or twitter:image, or pointing to a missing file", () => {
    const bare = page("").replace(ICONS, '<link rel="canonical" href="https://chrissgon.dev/projects/">').replace(OG, "");
    expect(checkDist(dist({ "projects/index.html": bare })).findings).toEqual([
      "head: projects/index.html has no favicon.ico link",
      "head: projects/index.html has no favicon.svg link",
      "head: projects/index.html has no apple-touch-icon link",
      "head: projects/index.html has no manifest link",
      "head: projects/index.html has no og:image",
      "head: projects/index.html has no twitter:image",
    ]);
    const root = dist();
    rmSync(join(root, "favicon.svg"));
    rmSync(join(root, "og/og-en.png"));
    expect(checkDist(root).findings).toEqual(
      ["index.html", "projects/index.html", "pt/index.html"].flatMap((p) => [
        `head: ${p} links favicon.svg to /favicon.svg, which is not in dist/`,
        `head: ${p} og:image https://chrissgon.dev/og/og-en.png is not in dist/`,
        `head: ${p} twitter:image https://chrissgon.dev/og/og-en.png is not in dist/`,
      ]),
    );
  });

  it("wants og:image absolute on the page's origin, a PNG of the declared size, with an alt", () => {
    const relative = page("").replace(OG, OG.replaceAll("https://chrissgon.dev/og/", "/og/"));
    expect(checkDist(dist({ "projects/index.html": relative })).findings).toEqual([
      "head: projects/index.html og:image /og/og-en.png is not an absolute URL on the page's origin (https://chrissgon.dev)",
      "head: projects/index.html twitter:image /og/og-en.png is not an absolute URL on the page's origin (https://chrissgon.dev)",
    ]);
    const wrong = page("").replace('content="630"', 'content="600"').replace('<meta property="og:image:alt" content="chrissgon">', "");
    expect(checkDist(dist({ "projects/index.html": wrong })).findings).toEqual([
      "head: projects/index.html og:image is 1200x630, declared 1200x600",
      "head: projects/index.html has no og:image:alt",
    ]);
    expect(pngSize(png(1200, 630))).toEqual({ width: 1200, height: 630 });
    expect(pngSize(Buffer.from("GIF89a not a png at all"))).toBeNull();
  });

  it("checks the manifest's names, start URL and icons", () => {
    expect(manifestProblems("site.webmanifest", MANIFEST, () => true)).toEqual([]);
    expect(manifestProblems("site.webmanifest", "{", () => true)).toEqual(["manifest: site.webmanifest is not valid JSON"]);
    expect(manifestProblems("site.webmanifest", JSON.stringify({ name: "x", icons: [{ src: "/gone.png" }, {}] }), () => false)).toEqual([
      "manifest: site.webmanifest has no short_name",
      "manifest: site.webmanifest has no start_url",
      "manifest: site.webmanifest icon /gone.png is not in dist/",
      "manifest: site.webmanifest icon (no src) is not in dist/",
    ]);
    const root = dist();
    rmSync(join(root, "icon-192.png"));
    expect(checkDist(root).findings).toEqual(["manifest: site.webmanifest icon /icon-192.png is not in dist/"]);
  });

  it("fails an SVG file or an inline SVG that carries <metadata>", () => {
    const withMeta = SVG.replace("<rect", "<metadata>c2pa</metadata><rect");
    expect(hasSvgMetadata("a.svg", SVG)).toBe(false);
    expect(hasSvgMetadata("a.svg", withMeta)).toBe(true);
    expect(hasSvgMetadata("index.html", `<p>metadata</p>${SVG}`)).toBe(false);
    const r = checkDist(dist({ "favicon.svg": withMeta, "pt/index.html": page(withMeta) }));
    expect(r.findings).toEqual(["svg: favicon.svg carries a <metadata> element", "svg: pt/index.html carries a <metadata> element"]);
  });

  it("resolves URLs like a browser on the same origin", () => {
    expect(resolveUrl("/_astro/a.css?v=1", "pt/index.html")).toBe("_astro/a.css");
    expect(resolveUrl("./b.js", "_astro/a.js")).toBe("_astro/b.js");
    expect(resolveUrl("https://x.dev/a.js", "index.html")).toBeNull();
    expect(resolveUrl("data:image/png;base64,AA", "index.html")).toBe("");
    expect(firstRenderUrls('<link rel="icon" href="/f.ico"><link rel=stylesheet href=/a.css>')).toEqual(["/a.css"]);
  });

  it("fails on an empty dist/", () => {
    expect(checkDist(mkdtempSync(join(tmpdir(), "empty-"))).findings[0]).toMatch(/^dist: no HTML page/);
  });
});

describe("lighthouse gate (ADR-0009)", () => {
  const lhr = (performance: number | null, agentic: number | null) => ({
    categories: { performance: { score: performance }, "agentic-browsing": { score: agentic } },
  });
  const gates = { performance: 0.9, "agentic-browsing": 1 };

  it("takes the median of the runs per category", () => {
    expect(median([0.8, 1, 0.95])).toBe(0.95);
    expect(median([0.8, 1])).toBe(0.9);
    expect(median([])).toBeNull();
    expect(medianScores([scoresOf(lhr(0.85, 1)), scoresOf(lhr(0.97, 1)), scoresOf(lhr(0.92, 1))])).toEqual({
      performance: 0.92,
      "agentic-browsing": 1,
    });
  });

  it("reads the benchmarkIndex of a run, null when missing", () => {
    expect(benchmarkOf({ environment: { benchmarkIndex: 1834.5 } })).toBe(1834.5);
    expect(benchmarkOf({ environment: {} })).toBeNull();
    expect(benchmarkOf({})).toBeNull();
  });

  it("keeps one or two slow runs out of the median of 5 without moving the gate", () => {
    const runs = [0.55, 0.77, 0.99, 0.99, 0.99].map((p) => scoresOf(lhr(p, 1)));
    expect(gateFailures("/", medianScores(runs), gates)).toEqual([]);
    const slow = [0.55, 0.77, 0.89, 0.99, 0.99].map((p) => scoresOf(lhr(p, 1)));
    expect(gateFailures("/", medianScores(slow), gates)).toEqual(["lighthouse: / performance 89 is under 90"]);
  });

  it("passes at the gates and fails under them or without a category", () => {
    expect(gateFailures("/", { performance: 0.9, "agentic-browsing": 1 }, gates)).toEqual([]);
    expect(gateFailures("/pt/", { performance: 0.89, "agentic-browsing": 0.75 }, gates)).toEqual([
      "lighthouse: /pt/ performance 89 is under 90",
      "lighthouse: /pt/ agentic-browsing 75 is under 100",
    ]);
    expect(gateFailures("/", scoresOf({ categories: {} }), gates)).toEqual([
      "lighthouse: / has no performance score",
      "lighthouse: / has no agentic-browsing score",
    ]);
  });

  it("lists the agentic audits that did not pass, skipping the ones that do not apply", () => {
    const report = {
      categories: { "agentic-browsing": { auditRefs: [{ id: "llms-txt" }, { id: "webmcp-registered-tools" }, { id: "agent-accessibility-tree" }] } },
      audits: {
        "llms-txt": { score: 0 },
        "webmcp-registered-tools": { score: null, scoreDisplayMode: "notApplicable" },
        "agent-accessibility-tree": { score: 1 },
      },
    };
    expect(failingAgenticAudits(report)).toEqual(["llms-txt (0)"]);
  });

  it("serves dist/ like a static host, gzip for text, never outside the folder", async () => {
    const root = dist();
    expect(fileFor(root, "/pt/")).toBe(join(root, "pt/index.html"));
    expect(fileFor(root, "/../../etc/passwd")).toBeNull();
    const server = await serve(root);
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const res = await fetch(`${base}/llms.txt`, { headers: { "Accept-Encoding": "gzip" } });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(res.headers.get("content-encoding")).toBe("gzip");
      expect(await res.text()).toBe(LLMS);
      expect((await fetch(`${base}/missing/`)).status).toBe(404);
    } finally {
      server.close();
    }
  });
});
