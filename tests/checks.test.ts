import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  checkDist,
  firstRenderUrls,
  llmsTxtProblems,
  pageWeight,
  resolveUrl,
  tailwindClasses,
} from "../scripts/check-dist.ts";
import {
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
const page = (body: string, head = "") =>
  `<!doctype html><html><head><link rel="stylesheet" href="/_astro/site.css">${head}${LD}</head><body><a class="pui-btn pui-solid">x</a>${body}</body></html>`;
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
        "projects/index.html": page('<div class="flex items-center p-4 md:grid pui-card portrait">made with Tailwind</div>'),
      }),
    );
    expect(r.findings).toEqual(
      expect.arrayContaining([
        "tailwind: file _astro/tailwind.css",
        "tailwind: --tw- variables in _astro/x.css",
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
