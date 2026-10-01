// check-griddots.ts: loads the built pages in headless Chromium and checks the background dots that step aside
// from the pointer (src/lib/griddots/).
//
// Usage: npm run check:griddots -- [--dist dist] [--jobs 4] [--channel chrome] [--shots <dir>]
//   Run `npm run build` first. --shots also saves 1440 px screenshots with the pointer over the background, in
//   the hero (outside the portrait) and in a lower section, as bg-dots-*.png in <dir>.
//
// Checks, one PASS or FAIL line each on stdout, exit 1 on any failure:
//   - on /, /projects/, /writing/, /lab/ and their /pt/ pages, at 1440 px with a mouse (pixel ratio 2; also 1
//     and 1.5 on two of them), at the top and lower down (at 1920 px when a page has no bare stretch of grid
//     lower down at 1440 px, as the projects page with complete rows of cards): the layer loads after load and sits behind the
//     content (the body is a stacking context, the layer has z-index -1 and takes no pointer event); the
//     pointer over an empty stretch of the grid moves the dots near it (the pixels differ from the plain CSS
//     grid); dots at the edge of the push radius, drawn by the canvas but not moved, light the same pixels as
//     the CSS grid (within 2 levels of the gradients' dithering); within 1 s of the pointer leaving, the
//     pixels are the plain grid's again and the canvas is empty; no frame is requested while the pointer
//     rests or once everything has settled; no horizontal scroll, no layout shift, no console error
//   - with --shots: the pointer in the hero, between its text and the portrait, moves the dots near it
//   - scrolled down with the pointer still: the dots under it move, and come back to the grid exactly
//   - the pointer over the portrait's face (home, EN and PT): the canvas draws nothing inside the portrait,
//     whose own dots react instead
//   - a hidden tab: the canvas empties and no frame is requested
//   - reduced motion, and a touch phone (375 px): no layer, and no script requested after load (the
//     portrait's painter chunk aside, which every visit of the home page asks for as it starts)
// Scenarios are independent and run in parallel (--jobs); each uses its own browser context.

import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright";
import { routePick } from "./pick-fixture.ts";
import { BG_PUSH_R } from "../src/lib/portrait/push.ts";

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
const JOBS = Math.max(1, Number(flag("--jobs", "4")) || 4);
const CHANNEL = flag("--channel", "");
const SHOTS = flag("--shots", "");
if (!existsSync(join(DIST, "index.html"))) {
  console.error(`check-griddots: ${DIST}/index.html not found; run npm run build first`);
  process.exit(2);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webp": "image/webp", ".woff2": "font/woff2", ".txt": "text/plain", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".avif": "image/avif",
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

interface Result { name: string; ok: boolean; info: string }
const results: Result[] = [];
const check = (name: string, ok: boolean, info = "") => results.push({ name, ok, info });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Opened { page: Page; errors: string[]; lateScripts: string[]; close: () => Promise<void> }

async function open(browser: Browser, url: string, o: BrowserContextOptions = {}): Promise<Opened> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, ...o });
  // The pick section's refresh reads GitHub once it comes near: answer it with the build's round (no network).
  await routePick(ctx);
  // Counts the animation frames each script asks for (by the script's URL, from the caller's stack), and the
  // layout shifts after the test starts measuring (window.__measure). A string, not a function: tsx would wrap
  // named inner functions in a helper the page does not have.
  await ctx.addInitScript(`
    window.__frames = {};
    window.__shift = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function (f) {
      const m = /(https?:[^\\s)]+?\\.js)/.exec((new Error().stack || "").split("\\n").slice(2).join(" "));
      const u = m ? m[1] : "?";
      window.__frames[u] = (window.__frames[u] || 0) + 1;
      return raf(f);
    };
    new PerformanceObserver(function (l) {
      for (const e of l.getEntries()) if (window.__measure && !e.hadRecentInput) window.__shift += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    addEventListener("load", function () { window.__loaded = true; });
  `);
  const page = await ctx.newPage(), errors: string[] = [], lateScripts: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", async (r) => {
    if (r.resourceType() !== "script") return;
    // The portrait's painter (src/lib/portrait/glyphs.ts) is asked for as the page starts, on every visit of
    // a page with the portrait; its request can still be on its way when the load event fires.
    if (/\/glyphs\.[^/]*\.js$/.test(r.url())) return;
    const loaded = await page.evaluate(() => (window as unknown as { __loaded?: boolean }).__loaded === true).catch(() => false);
    if (loaded) lateScripts.push(r.url());
  });
  await page.goto(url, { waitUntil: "load" });
  return { page, errors, lateScripts, close: () => ctx.close() };
}

const layerUp = (page: Page) => page.waitForFunction(() => !!document.querySelector(".grid-dots canvas"), null, { timeout: 10_000 });

/** RGBA pixels of a CSS-px box of the page, from a screenshot (device px). */
async function pixels(page: Page, x: number, y: number, w: number, h: number): Promise<Buffer> {
  return page.screenshot({ clip: { x, y, width: w, height: h }, animations: "disabled", caret: "hide" });
}

/**
 * Pixels of two same-size screenshots that differ by more than `tol` levels on a channel. A dot is 31/41/55 on
 * black, so a moved or missing dot differs by far more; hiding the layer can shift a glyph's anti-aliasing by
 * a level or two, which this ignores. Decoded in the page (a string: see open()).
 */
async function differing(page: Page, a: Buffer, b: Buffer, tol = 6): Promise<number> {
  return page.evaluate(`(async () => {
    const load = function (s) { return new Promise(function (res) { const i = new Image(); i.onload = function () { res(i); }; i.src = s; }); };
    const read = function (i) { const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const x = c.getContext("2d"); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data; };
    const ia = await load("data:image/png;base64,${a.toString("base64")}"), ib = await load("data:image/png;base64,${b.toString("base64")}");
    if (ia.width !== ib.width || ia.height !== ib.height) return -1;
    const da = read(ia), db = read(ib);
    let n = 0;
    for (let k = 0; k < da.length; k += 4)
      if (Math.abs(da[k] - db[k]) > ${tol} || Math.abs(da[k + 1] - db[k + 1]) > ${tol} || Math.abs(da[k + 2] - db[k + 2]) > ${tol}) n++;
    return n;
  })()`);
}

/** Non-transparent pixels the canvas draws inside a box of viewport px (all of it without a box). */
function canvasInk(page: Page, box?: { x: number; y: number; w: number; h: number }): Promise<number> {
  return page.evaluate((b) => {
    const c = document.querySelector<HTMLCanvasElement>(".grid-dots canvas");
    if (!c || !c.width) return 0;
    const r = c.getBoundingClientRect(), k = c.width / r.width;
    let x0 = 0, y0 = 0, x1 = c.width, y1 = c.height;
    if (b) {
      x0 = Math.max(0, Math.floor((b.x - r.left) * k)); y0 = Math.max(0, Math.floor((b.y - r.top) * k));
      x1 = Math.min(c.width, Math.ceil((b.x + b.w - r.left) * k)); y1 = Math.min(c.height, Math.ceil((b.y + b.h - r.top) * k));
    }
    if (x1 <= x0 || y1 <= y0) return 0;
    const d = c.getContext("2d")!.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    return n;
  }, box);
}

/** Animation frames asked for so far by the scripts loaded after load (the background dots' chunk). */
const frames = (o: Opened) =>
  o.page.evaluate((urls) => {
    const f = (window as unknown as { __frames: Record<string, number> }).__frames;
    return urls.reduce((n, u) => n + (f[u] ?? 0), 0);
  }, o.lateScripts);

/** Pixels of a box with the layer hidden: the plain CSS grid, at the same moment and scroll position. */
async function plainPixels(page: Page, x: number, y: number, w: number, h: number): Promise<Buffer> {
  await page.evaluate(() => { document.querySelector<HTMLElement>(".grid-dots")!.style.visibility = "hidden"; });
  const px = await pixels(page, x, y, w, h);
  await page.evaluate(() => { document.querySelector<HTMLElement>(".grid-dots")!.style.visibility = ""; });
  return px;
}

/** Clearances tried around a test spot: the whole push radius first, then a narrower stretch where a page
 *  (a dense grid of cards) has no bare area that wide; the compared box is the clearance found. */
const CLEARS = [BG_PUSH_R + 6, 110, 100];

/** The first spot with the widest clearance in CLEARS, with that clearance as `r`. */
async function emptySpot(page: Page, fromY: number): Promise<{ x: number; y: number; r: number } | null> {
  for (const r of CLEARS) {
    const s = await bareSpot(page, fromY, r);
    if (s) return { ...s, r };
  }
  return null;
}

/**
 * A point over bare grid: the element under it and its ancestors paint no box (no background, image or media),
 * nor within `clear` px around it, and it is at least `clear` px from the portrait. Media no larger than 24 px
 * (the header's logo symbol) counts as a glyph of text, which is allowed. Searches the viewport's rows from
 * `fromY`, left to right.
 */
async function bareSpot(page: Page, fromY: number, clear: number): Promise<{ x: number; y: number } | null> {
  // A string, not a function: tsx would wrap a named inner function in a helper the page does not have.
  return page.evaluate(`(() => {
    const fromY = ${fromY}, clear = ${clear};
    const bare = function (x, y) {
      for (let e = document.elementFromPoint(x, y); e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        if (/^(IMG|VIDEO|CANVAS|svg|PICTURE|IFRAME)$/.test(e.tagName) && (r.width > 24 || r.height > 24)) return false;
        if (cs.backgroundImage !== "none" || !/rgba\\(0, 0, 0, 0\\)|transparent/.test(cs.backgroundColor)) return false;
      }
      return true;
    };
    const p = document.querySelector("[data-portrait]")?.getBoundingClientRect();
    for (let y = Math.max(fromY, clear); y < innerHeight - clear; y += 14)
      for (let x = clear; x < innerWidth - clear; x += 14) {
        if (p && x > p.left - clear - 170 && x < p.right + clear + 170 && y > p.top - clear - 170 && y < p.bottom + clear + 170) continue;
        let ok = true;
        for (let dy = -clear; ok && dy <= clear; dy += 14) for (let dx = -clear; ok && dx <= clear; dx += 14) ok = bare(x + dx, y + dy);
        if (ok) return { x, y };
      }
    return null;
  })()`);
}

/** Moves the pointer onto (x, y) from a little aside, as a hand would. */
async function glide(page: Page, x: number, y: number) {
  await page.mouse.move(x - 40, y + 30);
  await page.mouse.move(x, y, { steps: 8 });
}

/** A resting grid dot just inside the push radius of (x, y): drawn by the canvas under the pointer, but moved by under half a device px. */
function edgeDot(x: number, y: number, scrollY: number): { x: number; y: number } {
  const cells = Math.ceil(BG_PUSH_R / 28) + 1;
  for (let j = -cells; j <= cells; j++)
    for (let i = -cells; i <= cells; i++) {
      const dx = 28 * (Math.round((x - 14) / 28) + i) + 14, dy = 28 * (Math.round((y + scrollY - 14) / 28) + j) + 14 - scrollY;
      const d = Math.hypot(dx - x, dy - y);
      if (d > BG_PUSH_R - 4.5 && d < BG_PUSH_R - 0.5) return { x: dx, y: dy };
    }
  return { x: -1, y: -1 };
}

/** A wider window for a page whose lower half, at 1440 px, is a full grid of cards with no bare stretch as wide as
 *  the push radius (the projects page once its last row of cards is complete): the grid beside the frame is bare. */
const WIDE = { width: 1920, height: 1080 };

async function pointerScenario(browser: Browser, base: string, path: string, where: "top" | "lower", dpr = 2, wider = false): Promise<void> {
  const label = `${path} ${where}${dpr === 2 ? "" : ` at pixel ratio ${dpr}`}${wider ? ` at ${WIDE.width} px` : ""}`;
  const o = await open(browser, base + path, { deviceScaleFactor: dpr, ...(wider ? { viewport: WIDE } : {}) });
  const { page } = o;
  try {
    await layerUp(page);
    const layer = await page.evaluate(() => {
      const l = document.querySelector(".grid-dots")!, cs = getComputedStyle(l), b = getComputedStyle(document.body);
      return { z: cs.zIndex, pe: cs.pointerEvents, parent: l.parentElement === document.body, iso: b.isolation, pos: b.position };
    });
    check(`${label}: layer behind the content, no pointer target`, layer.z === "-1" && layer.pe === "none" && layer.parent && layer.iso === "isolate" && layer.pos === "relative", JSON.stringify(layer));
    await page.evaluate(() => { (window as unknown as { __measure: boolean }).__measure = true; });
    // The top of the page, or the first stretch of bare grid found scrolling down from the middle.
    let spot: { x: number; y: number; r: number } | null = null;
    if (where === "top") spot = await emptySpot(page, 120);
    else
      for (const at of [0.45, 0.6, 0.3, 0.75, 0.9, 1]) {
        await page.evaluate((a) => scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * a)), at);
        await sleep(700); // sections entering on scroll settle
        if ((spot = await emptySpot(page, 120))) break;
      }
    if (!spot && where === "lower" && !wider) {
      await o.close();
      return pointerScenario(browser, base, path, where, dpr, true);
    }
    if (!spot) { check(`${label}: an empty stretch of grid to test on`, false, "none found"); return; }
    const sy = await page.evaluate(() => scrollY);
    const R = spot.r, box = { x: spot.x - R, y: spot.y - R, w: 2 * R, h: 2 * R };
    const edge = edgeDot(spot.x, spot.y, sy);
    await glide(page, spot.x, spot.y);
    await sleep(600);
    const pushed = await pixels(page, box.x, box.y, box.w, box.h), plain = await plainPixels(page, box.x, box.y, box.w, box.h);
    const ink = await canvasInk(page, box), ran = await frames(o), moved = await differing(page, pushed, plain);
    check(`${label}: the pointer moves the dots near it`, moved > 20 && ink > 0 && ran > 0, `${moved} px differ from the plain grid, canvas px ${ink}, ${ran} frames, at ${spot.x},${spot.y + sy}`);
    const edgeNow = await pixels(page, edge.x - 4, edge.y - 4, 8, 8), edgePlain = await plainPixels(page, edge.x - 4, edge.y - 4, 8, 8);
    const edgeInk = await canvasInk(page, { x: edge.x - 3, y: edge.y - 3, w: 6, h: 6 });
    // Same pixels lit; a level or two of the gradients' dithering apart at most (1 px at pixel ratio 1).
    const edgeOff = await differing(page, edgeNow, edgePlain, 2);
    check(`${label}: a dot drawn in place matches the CSS grid pixel for pixel`, edgeInk > 0 && edgeOff === 0, `edge dot ${edge.x},${edge.y + sy}, canvas px ${edgeInk}, ${edgeOff} px differ`);
    const f0 = await frames(o);
    await sleep(500);
    check(`${label}: no frame requested while the pointer rests`, (await frames(o)) === f0, `${(await frames(o)) - f0} frames`);
    if (SHOTS && (path === "/" || path === "/pt/") && where === "lower" && dpr === 2) {
      const name = `bg-dots-${path === "/" ? "en" : "pt"}-lower`;
      await page.screenshot({ path: join(SHOTS, `${name}.png`) });
      await page.screenshot({ path: join(SHOTS, `${name}-zoom.png`), clip: { x: spot.x - 160, y: spot.y - 120, width: 320, height: 240 } });
    }
    // Leave: the pointer goes off the page.
    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave")));
    await sleep(1000);
    const back = await pixels(page, box.x, box.y, box.w, box.h), backPlain = await plainPixels(page, box.x, box.y, box.w, box.h);
    const left = await canvasInk(page), off = await differing(page, back, backPlain);
    check(`${label}: back on the grid within 1 s, canvas empty`, off === 0 && left === 0, `${off} px differ from the plain grid, canvas px ${left}`);
    const f1 = await frames(o);
    await sleep(500);
    check(`${label}: the frame loop stops once settled`, (await frames(o)) === f1, `${(await frames(o)) - f1} frames`);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const shift = await page.evaluate(() => (window as unknown as { __shift: number }).__shift);
    check(`${label}: no horizontal scroll, no layout shift`, wide <= 0 && shift === 0, `overflow ${wide}, CLS ${shift}`);
    check(`${label}: no console error`, o.errors.length === 0, o.errors.join(" | "));
  } finally {
    await o.close();
  }
}

async function scrollScenario(browser: Browser, base: string) {
  const o = await open(browser, base + "/projects/");
  const { page } = o;
  try {
    await layerUp(page);
    const spot = await emptySpot(page, 150);
    if (!spot) { check("/projects/ scroll: an empty stretch of grid", false); return; }
    await glide(page, spot.x, spot.y);
    await sleep(400);
    const rest0 = await canvasInk(page);
    // Scroll by a whole tile under a still pointer: other dots now sit under it, and they move.
    await page.mouse.wheel(0, 56);
    await sleep(700);
    const sy = await page.evaluate(() => scrollY);
    check("/projects/ scroll: dots under a still pointer move while scrolling", rest0 > 0 && (await canvasInk(page)) > 0, `scrollY ${sy}`);
    const box = { x: spot.x - spot.r, y: spot.y - spot.r, w: 2 * spot.r, h: 2 * spot.r };
    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave")));
    await sleep(1000);
    const after = await pixels(page, box.x, box.y, box.w, box.h), plain = await plainPixels(page, box.x, box.y, box.w, box.h);
    const off = await differing(page, after, plain);
    check("/projects/ scroll: back exactly on the CSS grid after scrolling", off === 0 && (await canvasInk(page)) === 0, `${off} px differ`);
  } finally {
    await o.close();
  }
}

/** Screenshots with the pointer in the hero, between its text and the portrait (--shots). */
async function heroShot(browser: Browser, base: string, path: string) {
  const o = await open(browser, base + path);
  const { page } = o;
  try {
    await layerUp(page);
    const at = await page.evaluate(() => {
      const t = document.querySelector(".hero-text")!.getBoundingClientRect(), p = document.querySelector("[data-portrait]")!.getBoundingClientRect();
      return { x: Math.round((t.right + p.left) / 2), y: Math.round(p.top + p.height * 0.3) };
    });
    await glide(page, at.x, at.y);
    await sleep(600);
    const ink = await canvasInk(page, { x: at.x - BG_PUSH_R - 30, y: at.y - BG_PUSH_R - 30, w: 2 * BG_PUSH_R + 60, h: 2 * BG_PUSH_R + 60 });
    check(`${path} hero between the text and the portrait: the dots near the pointer move`, ink > 0, `canvas px ${ink} at ${at.x},${at.y}`);
    const name = `bg-dots-${path === "/" ? "en" : "pt"}-hero`;
    await page.screenshot({ path: join(SHOTS, `${name}.png`) });
    await page.screenshot({ path: join(SHOTS, `${name}-zoom.png`), clip: { x: at.x - 160, y: at.y - 120, width: 320, height: 240 } });
  } finally {
    await o.close();
  }
}

async function portraitScenario(browser: Browser, base: string, path: string) {
  const o = await open(browser, base + path);
  const { page } = o;
  try {
    await layerUp(page);
    const p = await page.evaluate(() => {
      const r = document.querySelector("[data-portrait]")!.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    await glide(page, p.x + p.w * 0.55, p.y + p.h * 0.35);
    await sleep(600);
    const inside = await canvasInk(page, { x: p.x + 2, y: p.y + 2, w: p.w - 4, h: p.h - 4 });
    const portrait = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>("[data-portrait] canvas")!;
      return c.hasAttribute("data-grid-owner") && typeof (c as unknown as { ownsGridDot?: unknown }).ownsGridDot === "function";
    });
    check(`${path} portrait: the background canvas leaves the portrait's dots to it`, inside === 0 && portrait, `canvas px inside the portrait ${inside}`);
  } finally {
    await o.close();
  }
}

async function hiddenScenario(browser: Browser, base: string) {
  const o = await open(browser, base + "/writing/");
  const { page } = o;
  try {
    await layerUp(page);
    const spot = await emptySpot(page, 150);
    if (!spot) { check("/writing/ hidden tab: an empty stretch of grid", false); return; }
    await glide(page, spot.x, spot.y);
    await sleep(300);
    const before = await canvasInk(page);
    await page.evaluate(`Object.defineProperty(document, "hidden", { configurable: true, get: function () { return true; } });
      document.dispatchEvent(new Event("visibilitychange"));`);
    const f0 = await frames(o);
    await page.mouse.move(spot.x + 20, spot.y + 10);
    await sleep(500);
    check("/writing/ hidden tab: canvas empty, no frame requested", before > 0 && (await canvasInk(page)) === 0 && (await frames(o)) === f0, `before ${before}`);
  } finally {
    await o.close();
  }
}

async function offScenario(browser: Browser, base: string, label: string, o: BrowserContextOptions) {
  const s = await open(browser, base + "/", o);
  try {
    await sleep(4500); // past the idle timeout the loader would wait for
    await s.page.mouse.move(300, 400).catch(() => {});
    const layer = await s.page.evaluate(() => !!document.querySelector(".grid-dots"));
    check(`${label}: no layer, no script requested after load`, !layer && s.lateScripts.length === 0, s.lateScripts.join(" "));
  } finally {
    await s.close();
  }
}

const { server, base } = await serve(DIST);
const browser = await chromium.launch(CHANNEL ? { channel: CHANNEL } : {});
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PAGES = ["/", "/projects/", "/writing/", "/lab/"].flatMap((p) => [p, p === "/" ? "/pt/" : `/pt${p}`]);
const jobs: Array<() => Promise<void>> = [
  ...PAGES.flatMap((p) => [() => pointerScenario(browser, base, p, "top"), () => pointerScenario(browser, base, p, "lower")]),
  () => pointerScenario(browser, base, "/", "lower", 1),
  () => pointerScenario(browser, base, "/projects/", "top", 1.5),
  ...(SHOTS ? [() => heroShot(browser, base, "/"), () => heroShot(browser, base, "/pt/")] : []),
  () => scrollScenario(browser, base),
  () => portraitScenario(browser, base, "/"),
  () => portraitScenario(browser, base, "/pt/"),
  () => hiddenScenario(browser, base),
  () => offScenario(browser, base, "reduced motion", { reducedMotion: "reduce" }),
  () => offScenario(browser, base, "touch phone 375 px", { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }),
];
let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, async () => {
  while (next < jobs.length) {
    const job = jobs[next++]!;
    try { await job(); } catch (e) { check("scenario ran", false, String(e)); }
  }
}));
await browser.close();
server.close();

for (const r of results.sort((a, b) => a.name.localeCompare(b.name))) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.info ? ` (${r.info})` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\ncheck-griddots: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
