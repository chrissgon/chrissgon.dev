// check-portrait.ts: loads the built home pages in headless Chromium and checks the portrait island.
//
// Usage: npm run check:portrait -- [--dist dist] [--jobs 4] [--with-synthetic-clips]
//   Run `npm run build` first. Playwright's Chromium must be installed (npx playwright install chromium).
//   --with-synthetic-clips also encodes synthetic clips (scripts/encode-portrait.sh --self-test, needs ffmpeg),
//   builds the site with them into a temporary folder (PORTRAIT_CLIPS_DIR) and checks the video path.
//
// Checks, EN and PT, one PASS or FAIL line each on stdout, exit 1 on any failure:
//   - the canvas is shown and has dots drawn on it; the page scrolls no wider than the viewport (375 px)
//   - no video is requested when the clips are absent, with reduced motion, or with Save-Data
//   - no console error and no page error
//   - without JavaScript the fallback image loads and the canvas takes no room
//   - the pointer pushes dots away, and once it leaves the canvas shows the poster again, pixel for pixel
//   - with clips (synthetic): a video is requested after load and the dots change over time
//   - with clips at CPU x8 (DevTools throttling): no long task (> 50 ms) while the clip plays; before the
//     banded repaint (src/lib/portrait/bands.ts) each video frame repainted every dot in one task
// Scenarios are independent and run in parallel (--jobs); each uses its own browser context.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright";

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
const WITH_CLIPS = argv.includes("--with-synthetic-clips");
if (!existsSync(join(DIST, "index.html"))) {
  console.error(`check-portrait: ${DIST}/index.html not found; run npm run build first`);
  process.exit(2);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webm": "video/webm", ".mp4": "video/mp4", ".webp": "image/webp", ".woff2": "font/woff2", ".txt": "text/plain",
  ".xml": "application/xml", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
};

/** Static server for a build folder, with byte ranges (video elements ask for them) and folder index pages. */
async function serve(root: string, overlay?: string): Promise<{ server: Server; base: string }> {
  const server = createServer(async (req, res) => {
    try {
      let p = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
      if (p.includes("..")) throw new Error("path");
      if (p.endsWith("/")) p += "index.html";
      const file = overlay && p.startsWith("/portrait/portrait-") && !p.endsWith(".webp") ? join(overlay, p.slice("/portrait/".length)) : join(root, p);
      const body = await readFile(file);
      const type = TYPES[extname(p)] ?? "application/octet-stream";
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
      if (range) {
        const a = Number(range[1]), b = range[2] ? Number(range[2]) : body.length - 1;
        res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${a}-${b}/${body.length}`, "Accept-Ranges": "bytes", "Content-Length": b - a + 1 });
        res.end(body.subarray(a, b + 1));
        return;
      }
      res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": body.length });
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
const isVideo = (u: string) => /\.(webm|mp4)(\?|#|$)/i.test(u);

interface Opened { page: Page; videos: string[]; errors: string[]; close: () => Promise<void> }

async function open(browser: Browser, url: string, o: BrowserContextOptions & { saveData?: boolean } = {}): Promise<Opened> {
  const { saveData, ...ctxOptions } = o;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...ctxOptions });
  if (saveData) await ctx.addInitScript(() => Object.defineProperty(navigator, "connection", { value: { saveData: true } }));
  const page = await ctx.newPage(), videos: string[] = [], errors: string[] = [];
  page.on("request", (r) => { if (isVideo(r.url())) videos.push(r.url()); });
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "load" });
  return { page, videos, errors, close: () => ctx.close() };
}

/** Pixels of the portrait canvas with any opacity, and a cheap signature of what is drawn. */
const drawn = (page: Page) =>
  page.evaluate(() => {
    const cv = document.querySelector<HTMLCanvasElement>("[data-portrait] canvas");
    if (!cv || !cv.width || !cv.height) return { n: 0, sig: 0 };
    const d = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0, sig = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) { n++; sig = (sig * 31 + d[i - 3]! + i) % 1000000007; }
    return { n, sig };
  });

async function poster(browser: Browser, base: string, path: string, label: string, o: Parameters<typeof open>[2], name: string) {
  const s = await open(browser, base + path, o);
  // Long enough for the idle callback after load (<= 2 s) and the intro (1.2 s): a clip would be requested by now.
  await sleep(4500);
  const box = await s.page.locator("[data-portrait] canvas").boundingBox();
  const d = await drawn(s.page);
  const role = await s.page.locator("[data-portrait] canvas").getAttribute("role");
  check(`${label} ${name}: canvas shown with dots drawn`, !!box && box.width > 0 && box.height > 0 && d.n > 1000 && role === "img", `box ${box?.width}x${box?.height}, drawn px ${d.n}, role ${role}`);
  check(`${label} ${name}: no video requested`, s.videos.length === 0, s.videos.join(", "));
  check(`${label} ${name}: no console errors`, s.errors.length === 0, s.errors.join(" | "));
  if (o?.reducedMotion === "reduce") {
    await s.page.mouse.move(640, 500);
    await sleep(400);
    const later = await drawn(s.page);
    check(`${label} ${name}: still poster (no motion)`, later.sig === d.sig, `signature ${d.sig} -> ${later.sig}`);
  }
  await s.close();
}

async function pointer(browser: Browser, base: string, path: string, label: string) {
  const s = await open(browser, base + path);
  await sleep(1500);
  const rest = await drawn(s.page);
  const face = await s.page.evaluate(() => {
    const r = document.querySelector("[data-portrait]")!.getBoundingClientRect();
    return { x: r.left + r.width * 0.42, y: r.top + r.height * 0.33 };
  });
  await s.page.mouse.move(face.x - 40, face.y);
  await s.page.mouse.move(face.x, face.y, { steps: 4 });
  await sleep(500);
  const pushed = await drawn(s.page);
  await s.page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave")));
  await sleep(1500);
  const back = await drawn(s.page);
  check(`${label} pointer: dots move away from the pointer`, pushed.sig !== rest.sig, `signature ${rest.sig} -> ${pushed.sig}`);
  check(`${label} pointer: the poster comes back exactly once it leaves`, back.sig === rest.sig && back.n === rest.n, `${rest.n}/${rest.sig} -> ${back.n}/${back.sig}`);
  check(`${label} pointer: no console errors`, s.errors.length === 0, s.errors.join(" | "));
  await s.close();
}

/** Longest main-thread task while a clip plays, with the CPU slowed `rate` times (DevTools throttling). */
async function clipTasks(browser: Browser, base: string, path: string, label: string, rate = 8) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push(Math.round(e.duration)); }).observe({ type: "longtask" });
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForFunction(() => [...document.querySelectorAll("video")].some((v) => !v.paused && v.readyState >= 2), null, { timeout: 15000 }).catch(() => {});
  await sleep(300);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await page.evaluate(() => { (window as unknown as { __long: number[] }).__long.length = 0; });
  await sleep(3000);
  const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
  const playing = await page.evaluate(() => [...document.querySelectorAll("video")].some((v) => !v.paused));
  check(`${label} clips at CPU x${rate}: no long task while the clip plays`, playing && long.length === 0, `playing ${playing}, long tasks (ms): ${long.join(", ")}`);
  await ctx.close();
}

async function noJs(browser: Browser, base: string, path: string, label: string) {
  const s = await open(browser, base + path, { javaScriptEnabled: false });
  const img = await s.page.evaluate(() => {
    const i = document.querySelector<HTMLImageElement>("[data-portrait] img");
    const c = document.querySelector<HTMLCanvasElement>("[data-portrait] canvas");
    return { loaded: !!i && i.complete && i.naturalWidth > 0, alt: i?.alt ?? "", canvas: c ? c.getBoundingClientRect().height : -1, role: c?.getAttribute("role") ?? null };
  });
  check(`${label} no JavaScript: fallback image loads, canvas unlabelled`, img.loaded && img.alt.length > 0 && img.role === null, JSON.stringify(img));
  check(`${label} no JavaScript: no video requested`, s.videos.length === 0, s.videos.join(", "));
  await s.close();
}

async function narrow(browser: Browser, base: string, path: string, label: string) {
  const s = await open(browser, base + path, { viewport: { width: 375, height: 812 } });
  await sleep(300);
  const w = await s.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  check(`${label} 375 px: no horizontal scroll`, w.scroll <= w.client, `${w.scroll} > ${w.client}`);
  check(`${label} 375 px: no console errors`, s.errors.length === 0, s.errors.join(" | "));
  await s.close();
}

async function withClips(browser: Browser, base: string, path: string, label: string) {
  const s = await open(browser, base + path);
  await s.page.waitForFunction(() => [...document.querySelectorAll("video")].some((v) => !v.paused && v.readyState >= 2), null, { timeout: 15000 }).catch(() => {});
  const a = await drawn(s.page);
  await sleep(700);
  const b = await drawn(s.page);
  const playing = await s.page.evaluate(() => [...document.querySelectorAll("video")].map((v) => ({ src: v.currentSrc.split("/").pop(), paused: v.paused })));
  check(`${label} clips: a clip is requested after load and plays`, s.videos.length > 0 && playing.some((v) => !v.paused), JSON.stringify(playing));
  check(`${label} clips: the dots change with the video`, a.n > 1000 && a.sig !== b.sig, `drawn ${a.n}, ${a.sig} -> ${b.sig}`);
  await s.page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await sleep(600);
  const off = await s.page.evaluate(() => [...document.querySelectorAll("video")].every((v) => v.paused || v.ended));
  check(`${label} clips: the video pauses off-screen`, off);
  check(`${label} clips: no console errors`, s.errors.length === 0, s.errors.join(" | "));
  await s.close();
}

async function pool(tasks: Array<() => Promise<void>>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(JOBS, tasks.length) }, async () => {
    while (next < tasks.length) await tasks[next++]!().catch((e: unknown) => check("scenario crashed", false, String(e)));
  }));
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const servers: Server[] = [];
let tmp = "";
try {
  const { server, base } = await serve(DIST);
  servers.push(server);
  const tasks: Array<() => Promise<void>> = [];
  for (const [path, label] of [["/", "EN"], ["/pt/", "PT"]] as const) {
    tasks.push(() => poster(browser, base, path, label, {}, "default"));
    tasks.push(() => poster(browser, base, path, label, { reducedMotion: "reduce" }, "reduced motion"));
    tasks.push(() => poster(browser, base, path, label, { saveData: true }, "Save-Data"));
    tasks.push(() => noJs(browser, base, path, label));
    tasks.push(() => narrow(browser, base, path, label));
    tasks.push(() => pointer(browser, base, path, label));
  }
  if (WITH_CLIPS) {
    // Sequential by need: the clips must exist before the build that finds them, and the build before the checks.
    tmp = mkdtempSync(join(tmpdir(), "check-portrait-"));
    const clips = join(tmp, "clips"), out = join(tmp, "dist");
    execFileSync("bash", ["scripts/encode-portrait.sh", "--self-test", "--keep", clips], { stdio: ["ignore", "ignore", "inherit"] });
    execFileSync("npx", ["astro", "build", "--outDir", out], { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, PORTRAIT_CLIPS_DIR: clips } });
    const c = await serve(out, clips);
    servers.push(c.server);
    for (const [path, label] of [["/", "EN"], ["/pt/", "PT"]] as const) {
      tasks.push(() => withClips(browser, c.base, path, label));
      tasks.push(() => clipTasks(browser, c.base, path, label));
      tasks.push(() => poster(browser, c.base, path, `${label} clips`, { reducedMotion: "reduce" }, "reduced motion"));
      tasks.push(() => poster(browser, c.base, path, `${label} clips`, { saveData: true }, "Save-Data"));
    }
  }
  await pool(tasks);
} finally {
  await browser.close();
  for (const s of servers) s.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}

results.sort((a, b) => a.name.localeCompare(b.name));
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.ok || !r.info ? "" : ` (${r.info})`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
