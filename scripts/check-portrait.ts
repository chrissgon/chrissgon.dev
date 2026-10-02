// check-portrait.ts: loads the built home pages in headless Chromium and checks the portrait island.
//
// Usage: npm run check:portrait -- [--dist dist] [--jobs 4] [--with-synthetic-clips]
//   Run `npm run build` first. Playwright's Chromium must be installed (npx playwright install chromium).
//   --with-synthetic-clips also encodes synthetic clips (scripts/encode-portrait.sh --self-test, needs ffmpeg),
//   builds the site with them into a temporary folder (PORTRAIT_CLIPS_DIR) and checks the video path.
//
// Checks, EN and PT, one PASS or FAIL line each on stdout, exit 1 on any failure:
//   - the canvas is shown and has dots drawn on it; the page scrolls no wider than the viewport (375 px)
//   - at 375 px (touch) the portrait starts behind the hero text with no line between them, and every link
//     and button of the text takes a tap (elementFromPoint), and a tapped install tab is selected
//   - no video is requested when the clips are absent, with reduced motion, or with Save-Data
//   - when the build has the real clips (dist/portrait/portrait-loop.*), the default visit requests one after
//     load, the dots change with it, it pauses off-screen, and no long task happens at CPU x8 (the same
//     checks as the synthetic clips); the pointer check then runs with Save-Data, the poster-only path
//   - no console error and no page error
//   - without JavaScript the fallback image loads and the canvas takes no room
//   - the lab's dot-portrait experiment (/lab/ and /pt/lab/): the portrait starts in dots, its drawing control
//     is shown with dots pressed, the blocks choice (by keyboard) redraws it in blocks, and the dots choice
//     gives the dot picture again, pixel for pixel (Save-Data)
//   - the pointer pushes dots away, and once it leaves the canvas shows the poster again, pixel for pixel
//   - scrolled 40 px and a third of the portrait's box, the bright pixels stay within 3% of the unscrolled
//     frame; scrolled past the box, the dots are back on the grid (Save-Data, no clip)
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
import { routePick } from "./pick-fixture.ts";

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
// The real clips, when the build carries them (scripts/encode-portrait.sh writes them to public/portrait/).
const REAL_CLIPS = ["webm", "mp4"].some((x) => existsSync(join(DIST, "portrait", `portrait-loop.${x}`)));
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
  // The pick section's refresh reads GitHub once it comes near: answer it with the build's round (no network).
  await routePick(ctx);
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
  // Long enough for the idle callback after load (<= 2 s): a clip would be requested by now.
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

async function pointer(browser: Browser, base: string, path: string, label: string, o: Parameters<typeof open>[2] = {}) {
  const s = await open(browser, base + path, o);
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

/** Bright pixels of the portrait canvas (opaque and light): the dots of the face that fade on the way back to the grid. */
const bright = (page: Page) =>
  page.evaluate(() => {
    const cv = document.querySelector<HTMLCanvasElement>("[data-portrait] canvas");
    if (!cv || !cv.width || !cv.height) return 0;
    const d = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 128 && d[i - 3]! + d[i - 2]! + d[i - 1]! > 384) n++;
    return n;
  });

/**
 * The portrait stays whole while most of it is on screen (grid.ts scrollBack): 40 px down and a third of the
 * portrait's box down, the bright pixels stay within 3% of the unscrolled frame; with the box scrolled past,
 * the dots are back on the grid. Save-Data, so no clip changes the frame between the two readings.
 */
async function scrolled(browser: Browser, base: string, path: string, label: string) {
  const s = await open(browser, base + path, { saveData: true });
  await sleep(1500);
  const rest = await bright(s.page);
  const box = await s.page.evaluate(() => {
    const r = document.querySelector("[data-portrait]")!.parentElement!.parentElement!.getBoundingClientRect();
    return { top: r.top + scrollY, height: r.height };
  });
  const at = async (y: number) => {
    await s.page.evaluate((y) => scrollTo(0, y), y);
    await sleep(900);
    return bright(s.page);
  };
  const near = (n: number) => rest > 1000 && Math.abs(n - rest) <= rest * 0.03;
  const pct = (n: number) => `${rest} -> ${n} (${((100 * n) / Math.max(1, rest) - 100).toFixed(1)}%)`;
  const a = await at(40), b = await at(Math.round(box.top + box.height / 3)), c = await at(Math.round(box.top + box.height));
  check(`${label} scroll: the portrait stays whole 40 px down`, near(a), pct(a));
  check(`${label} scroll: the portrait stays whole a third of its box down`, near(b), pct(b));
  check(`${label} scroll: back on the grid once its box has scrolled past`, c < rest * 0.05, pct(c));
  check(`${label} scroll: no console errors`, s.errors.length === 0, s.errors.join(" | "));
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
  const s = await open(browser, base + path, { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await sleep(300);
  const w = await s.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  check(`${label} 375 px: no horizontal scroll`, w.scroll <= w.client, `${w.scroll} > ${w.client}`);
  // One column: the portrait is the hero's background. Its slot starts behind the text (no divider between
  // them), and every control of the text still takes the tap: nothing of the portrait is on top of it.
  const hero = await s.page.evaluate(() => {
    const text = document.querySelector(".hero-text")!, slot = document.querySelector("[data-portrait]")!;
    const hits = [...text.querySelectorAll<HTMLElement>("a, button:not([hidden])")].filter((e) => e.offsetParent).map((e) => {
      const r = e.getBoundingClientRect();
      e.scrollIntoView({ block: "center" });
      const q = e.getBoundingClientRect(), hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      return { name: e.textContent!.trim(), top: r.top, ok: !!hit && (hit === e || e.contains(hit)) };
    });
    scrollTo(0, 0);
    return {
      behind: slot.getBoundingClientRect().top < text.getBoundingClientRect().bottom,
      border: getComputedStyle(text).borderBottomWidth,
      missed: hits.filter((h) => !h.ok).map((h) => h.name),
      count: hits.length,
    };
  });
  check(`${label} 375 px: the portrait starts behind the text, with no line between them`, hero.behind && hero.border === "0px", JSON.stringify(hero));
  check(`${label} 375 px: every link and button of the hero text takes the tap`, hero.count >= 6 && hero.missed.length === 0, JSON.stringify(hero));
  const tab = s.page.locator('.hero [role="tab"]').nth(1);
  await tab.tap();
  check(`${label} 375 px: a tap on an install tab selects it`, (await tab.getAttribute("aria-selected")) === "true");
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

/**
 * The lab's dot-portrait experiment (/lab/#dot-portrait): the portrait starts in dots, and the control above it
 * redraws it in blocks and back. Save-Data, so the picture is the poster and can be compared pixel for pixel.
 */
async function drawings(browser: Browser, base: string, path: string, label: string) {
  const s = await open(browser, base + path + "#dot-portrait", { saveData: true });
  await sleep(2500);
  const group = s.page.locator("[data-portrait-drawing]");
  const pressed = () => group.locator("[data-drawing]").evaluateAll((bs) => bs.map((b) => `${(b as HTMLElement).dataset.drawing}:${b.getAttribute("aria-pressed")}`).join(" "));
  const dots = await drawn(s.page);
  const enabled = await group.locator("button:not([disabled])").count();
  check(`${label} lab: the drawing control is shown, named and enabled, with dots pressed`, (await group.isVisible()) && !!(await group.getAttribute("aria-label")) && enabled === 2 && (await pressed()) === "dots:true blocks:false", `${await pressed()}, ${enabled} enabled`);
  check(`${label} lab: the portrait starts drawn in dots`, dots.n > 1000 && (await s.page.locator("[data-portrait]").getAttribute("data-drawing")) === "dots", `drawn px ${dots.n}`);
  // With the keyboard: a pointer resting on the control would push the dots under it and change the picture.
  await group.locator('[data-drawing="blocks"]').focus();
  await s.page.keyboard.press("Enter");
  await sleep(1500);
  const blocks = await drawn(s.page);
  check(`${label} lab: the blocks choice redraws the portrait in blocks`, (await pressed()) === "dots:false blocks:true" && blocks.sig !== dots.sig && blocks.n > dots.n, `${dots.n}/${dots.sig} -> ${blocks.n}/${blocks.sig}`);
  await group.locator('[data-drawing="dots"]').focus();
  await s.page.keyboard.press("Enter");
  await sleep(1500);
  const back = await drawn(s.page);
  check(`${label} lab: the dots choice gives the dot picture again, pixel for pixel`, (await pressed()) === "dots:true blocks:false" && back.sig === dots.sig && back.n === dots.n, `${dots.n}/${dots.sig} -> ${back.n}/${back.sig}`);
  check(`${label} lab: no console errors`, s.errors.length === 0, s.errors.join(" | "));
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
    if (REAL_CLIPS) {
      tasks.push(() => withClips(browser, base, path, `${label} real`));
      tasks.push(() => clipTasks(browser, base, path, `${label} real`));
    } else tasks.push(() => poster(browser, base, path, label, {}, "default"));
    tasks.push(() => poster(browser, base, path, label, { reducedMotion: "reduce" }, "reduced motion"));
    tasks.push(() => poster(browser, base, path, label, { saveData: true }, "Save-Data"));
    tasks.push(() => noJs(browser, base, path, label));
    tasks.push(() => narrow(browser, base, path, label));
    tasks.push(() => scrolled(browser, base, path, label));
    // With the real clips the default visit plays the loop, so the poster-exact check runs where no clip
    // plays and the pointer still moves dots: Save-Data (gating.ts).
    tasks.push(() => (REAL_CLIPS ? pointer(browser, base, path, `${label} Save-Data`, { saveData: true }) : pointer(browser, base, path, label)));
    tasks.push(() => drawings(browser, base, `${path}lab/`, label));
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
