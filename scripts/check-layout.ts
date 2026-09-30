// check-layout.ts: loads every built page in headless Chromium at phone to desktop widths and fails when the
// page scrolls sideways.
//
// Usage: npm run check:layout -- [--dist dist] [--jobs 6] [--channel chrome] [--widths 320,768]
//   Run `npm run build` first. Uses Playwright's Chromium (npx playwright install chromium), or, with
//   --channel chrome, the Google Chrome installed on the machine (CI uses the one on the runner image).
//
// Each state (page, width) passes when document.documentElement.scrollWidth is no wider than the viewport's
// layout width (clientWidth, the viewport less a classic scrollbar) and no element's right edge passes it.
// Scrollbars are drawn (Chromium hides them when headless), so a 100vw box under a 15 px scrollbar fails
// here as it does on a desktop with classic scrollbars.
// States: /, /projects/, /writing/, /lab/ and their /pt/ pages, each as loaded and with every "view as
// agent" switch on; /lab/ and /pt/lab/ with each experiment opened (/lab/#<id>), and #view-as-agent opened
// with its switch on. Widths: 320 360 375 390 414 600 768 820 1024 1100 1186 1280 1366 1440 1920.
// A failing state lists the elements that stick out (their right edge, in px past the viewport), outermost
// first. One PASS or FAIL line per state on stdout, then a width x page summary; exit 1 on any failure.
// States are independent and run in parallel (--jobs); each uses its own browser context.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { chromium, type Browser } from "playwright";

const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  const self = await readFile(new URL(import.meta.url), "utf8");
  console.log(self.split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
  process.exit(0);
}
const flag = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
};
const DIST = resolve(flag("--dist", "dist"));
const JOBS = Math.max(1, Number(flag("--jobs", "6")) || 6);
const CHANNEL = flag("--channel", "");
const WIDTHS = flag("--widths", "320,360,375,390,414,600,768,820,1024,1100,1186,1280,1366,1440,1920")
  .split(",").map(Number).filter((n) => n > 0);
if (!existsSync(join(DIST, "index.html"))) {
  console.error(`check-layout: ${DIST}/index.html not found; run npm run build first`);
  process.exit(2);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webm": "video/webm", ".mp4": "video/mp4", ".webp": "image/webp", ".woff2": "font/woff2", ".txt": "text/plain",
  ".xml": "application/xml", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".avif": "image/avif",
};

async function serve(root: string): Promise<{ server: Server; base: string }> {
  const server = createServer(async (req, res) => {
    try {
      let p = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
      if (p.includes("..")) throw new Error("path");
      if (p.endsWith("/")) p += "index.html";
      const body = await readFile(join(root, p));
      res.writeHead(200, { "Content-Type": TYPES[extname(p)] ?? "application/octet-stream", "Content-Length": body.length });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return { server, base: `http://127.0.0.1:${addr.port}` };
}

interface State { page: string; path: string; hash: string; agent: boolean }
const PAGES = ["/", "/projects/", "/writing/", "/lab/"];
const LAB_IDS = await (async () => {
  const html = await readFile(join(DIST, "lab", "index.html"), "utf8");
  return [...html.matchAll(/data-panel="([^"]+)"/g)].map((m) => m[1]!);
})();
const states: State[] = [];
for (const prefix of ["", "/pt"]) {
  for (const p of PAGES) {
    const path = prefix + p;
    states.push({ page: path, path, hash: "", agent: false }, { page: `${path} agent`, path, hash: "", agent: true });
    if (p === "/lab/") {
      for (const id of LAB_IDS) states.push({ page: `${path}#${id}`, path, hash: `#${id}`, agent: false });
      if (LAB_IDS.includes("view-as-agent")) states.push({ page: `${path}#view-as-agent agent`, path, hash: "#view-as-agent", agent: true });
    }
  }
}

interface Result { page: string; width: number; ok: boolean; info: string }
const results: Result[] = [];
const scrollbars = new Set<number>();

async function sweep(browser: Browser, base: string, s: State, width: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  try {
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(base + s.path + s.hash, { waitUntil: "load" });
    if (s.agent) {
      await page.evaluate(() => {
        for (const c of document.querySelectorAll<HTMLInputElement>(".agent-toggle")) {
          c.checked = true;
          c.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    }
    // Reveal-on-scroll and the portrait size themselves after load; let them settle.
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const de = document.documentElement, vw = de.clientWidth;
      const out: Array<{ sel: string; right: number }> = [];
      for (const el of document.body.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right + window.scrollX <= vw + 0.5) continue;
        // Only boxes no ancestor clips sideways reach the page's scroll width.
        let a = el.parentElement, clipped = false, outer = true;
        while (a && a !== document.body) {
          if (getComputedStyle(a).overflowX !== "visible") { clipped = true; break; }
          if (a.getBoundingClientRect().right + window.scrollX > vw + 0.5) outer = false;
          a = a.parentElement;
        }
        if (clipped) continue;
        const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : "";
        const id = el.id ? `#${el.id}` : "";
        const parent = el.parentElement;
        const pcls = parent && typeof parent.className === "string" && parent.className.trim() ? "." + parent.className.trim().split(/\s+/)[0] : "";
        out.push({ sel: `${outer ? "" : "  in: "}${parent ? parent.tagName.toLowerCase() + pcls + " > " : ""}${el.tagName.toLowerCase()}${id}${cls}`, right: Math.round((r.right + window.scrollX - vw) * 10) / 10 });
      }
      return { scroll: de.scrollWidth, client: vw, inner: window.innerWidth, out };
    });
    scrollbars.add(m.inner - m.client);
    const ok = m.scroll <= m.client && m.out.length === 0 && errors.length === 0;
    const outer = m.out.filter((o) => !o.sel.startsWith("  in: "));
    const info = `scrollWidth ${m.scroll}, clientWidth ${m.client}, innerWidth ${m.inner}` +
      (outer.length ? `; sticks out: ${outer.slice(0, 6).map((o) => `${o.sel} +${o.right}px`).join("; ")}${outer.length > 6 ? `; +${outer.length - 6} more` : ""}` : "") +
      (m.scroll > m.client && !m.out.length ? "; no element box sticks out (a pseudo-element or a shadow?)" : "") +
      (errors.length ? `; page errors: ${errors.join(" | ")}` : "");
    results.push({ page: s.page, width, ok, info });
  } finally {
    await ctx.close();
  }
}

// --hide-scrollbars is one of Playwright's default headless flags; without it the page gets a real scrollbar.
const browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"], ...(CHANNEL ? { channel: CHANNEL } : {}) });
const { server, base } = await serve(DIST);
try {
  const tasks: Array<() => Promise<void>> = [];
  for (const s of states) for (const w of WIDTHS) tasks.push(() => sweep(browser, base, s, w));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(JOBS, tasks.length) }, async () => {
    while (next < tasks.length) {
      const t = tasks[next++]!;
      await t().catch((e: unknown) => results.push({ page: "crash", width: 0, ok: false, info: String(e) }));
    }
  }));
} finally {
  await browser.close();
  server.close();
}

const order = new Map(states.map((s, i) => [s.page, i]));
results.sort((a, b) => (order.get(a.page) ?? -1) - (order.get(b.page) ?? -1) || a.width - b.width);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.page} @ ${r.width}${r.ok ? "" : ` (${r.info})`}`);
// Summary: one row per width, one column per page, the overflow in px or "ok".
const pages = states.map((s) => s.page);
console.log(`\nwidth | ${pages.join(" | ")}`);
for (const w of WIDTHS) {
  const row = pages.map((p) => {
    const r = results.find((x) => x.page === p && x.width === w);
    if (!r) return "?";
    if (r.ok) return "ok";
    const m = /scrollWidth (\d+), clientWidth (\d+)/.exec(r.info);
    return m ? `+${Number(m[1]) - Number(m[2])}` : "FAIL";
  });
  console.log(`${w} | ${row.join(" | ")}`);
}
const failed = results.filter((r) => !r.ok).length;
// A page taller than the viewport shows a classic scrollbar; 0 px means overlay scrollbars (the check is weaker).
console.log(`\nscrollbar widths seen: ${[...scrollbars].sort((a, b) => a - b).join(", ")} px`);
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
