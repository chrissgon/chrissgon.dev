// check-playground.ts: the lab's perfectui-live playground (src/scripts/playground.ts) in headless Chromium, on
// the built site, EN and PT.
//
// Usage: npm run check:playground -- [--dist dist] [--channel chrome]
//   Run `npm run build` first. Uses Playwright's Chromium, or with --channel chrome the installed Google Chrome.
//   The site is served from dist/ with the headers netlify.toml gives the fonts (Access-Control-Allow-Origin).
//
// Checks, per language (both run at the same time, each in its own browser context):
//   lazy       the home page and the lab page as loaded ask for no playground chunk; opening the experiment does
//   editor     a labelled, described textbox holds the selected tab's example, as printed
//   sandbox    the preview is an iframe with sandbox="allow-scripts" only and the preview's CSP
//   typing     markup typed into the editor renders styled with Perfect UI and the site's font in the preview
//   keyboard   Tab indents and keeps focus; Esc lets go of Tab without closing the experiment, then Tab leaves
//   reset      Reset restores the tab's example and its preview
//   tabs       another tab loads its own example
//   isolation  a typed <script> cannot read parent.document or navigate the page; a link does not navigate
//   height     the preview grows with tall content, within its bounds
//   agent      with the header's "view as agent" switch on, the editor is hidden
//   no-js      without JavaScript the experiment shows the static example and code, and no editor
// One PASS or FAIL line per check on stdout; exit 1 on any failure.
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { netlifyHeader } from "./check-dist.ts";
import { routePick } from "./pick-fixture.ts";
import { MAX_HEIGHT, MIN_HEIGHT } from "../src/lib/playground.ts";
import labels from "../src/data/labels.ts";

const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  console.log("Usage: npm run check:playground -- [--dist dist] [--channel chrome]");
  process.exit(0);
}
const flag = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
};
const DIST = resolve(flag("--dist", "dist"));
const CHANNEL = flag("--channel", "");
if (!existsSync(join(DIST, "lab", "index.html"))) {
  console.error(`check-playground: ${DIST}/lab/index.html not found; run npm run build first`);
  process.exit(2);
}
const FONTS_ACAO = netlifyHeader(readFileSync("netlify.toml", "utf8"), "/_astro/fonts/*", "access-control-allow-origin") ?? "";

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
      const headers: Record<string, string | number> = { "Content-Type": TYPES[extname(p)] ?? "application/octet-stream", "Content-Length": body.length };
      if (p.startsWith("/_astro/fonts/") && FONTS_ACAO) headers["Access-Control-Allow-Origin"] = FONTS_ACAO;
      res.writeHead(200, headers);
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

async function check(lang: "en" | "pt", name: string, fn: () => Promise<string | void>) {
  try {
    const info = await fn();
    results.push({ name: `${lang} ${name}`, ok: true, info: info ?? "" });
  } catch (e) {
    results.push({ name: `${lang} ${name}`, ok: false, info: String(e).split("\n")[0]! });
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const PANEL = "#perfectui-live [role=tabpanel]:not([hidden])";

async function run(browser: Browser, base: string, lang: "en" | "pt") {
  const prefix = lang === "pt" ? "/pt" : "";
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // The home page's "Pick the next post" asks GitHub for the round; answered here, so the check needs no network.
  await routePick(ctx);
  const chunks: string[] = [];
  ctx.on("request", (r) => {
    if (/\/_astro\/playground\.[^/]*\.js$/.test(new URL(r.url()).pathname)) chunks.push(r.url());
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const editor = page.locator(`${PANEL} textarea`);
  const frame = page.frameLocator(`${PANEL} iframe`);
  const frameOf = async () => (await page.locator(`${PANEL} iframe`).elementHandle())!.contentFrame();
  const example = async () => ((await page.locator(`${PANEL} pre`).textContent()) ?? "").replace(/\n$/, "");

  await check(lang, "lazy", async () => {
    await page.goto(`${base}${prefix}/`, { waitUntil: "load" });
    await page.goto(`${base}${prefix}/lab/`, { waitUntil: "load" });
    await page.waitForTimeout(300);
    assert(chunks.length === 0, `the playground chunk loaded before the experiment opened: ${chunks.join(", ")}`);
    await page.locator('[data-open="perfectui-live"]').click();
    await editor.waitFor({ timeout: 5000 });
    const opened: number = chunks.length;
    assert(opened === 1, `expected one playground chunk request after opening, got ${opened}`);
    return new URL(chunks[0]!).pathname;
  });

  await check(lang, "editor", async () => {
    const byRole = page.getByRole("textbox", { name: labels.playgroundEdit[lang] });
    assert((await byRole.count()) === 1, `no single textbox named "${labels.playgroundEdit[lang]}"`);
    const hintId = await editor.getAttribute("aria-describedby");
    assert(hintId && (await page.locator(`#${hintId}`).textContent()) === labels.playgroundHint[lang], "the editor is not described by its hint");
    assert((await editor.inputValue()) === (await example()), "the editor does not hold the tab's example");
    const style = await editor.evaluate((el) => [getComputedStyle(el).whiteSpace, getComputedStyle(el).fontFamily]);
    assert(style[0] === "pre-wrap" && /mono/i.test(style[1]!), `the editor does not wrap in the mono font: ${style.join(", ")}`);
  });

  await check(lang, "sandbox", async () => {
    const iframe = page.locator(`${PANEL} iframe`);
    const sandbox = await iframe.getAttribute("sandbox");
    assert(sandbox === "allow-scripts", `sandbox is "${sandbox}"`);
    const srcdoc = (await iframe.getAttribute("srcdoc")) ?? "";
    assert(srcdoc.includes('http-equiv="Content-Security-Policy" content="default-src \'none\';'), "no CSP in the preview");
    assert((await iframe.getAttribute("title")) === labels.playgroundPreview[lang], "the preview has no title");
  });

  await check(lang, "typing", async () => {
    errors.length = 0;
    await editor.fill("");
    await editor.pressSequentially('<button class="pui-btn pui-solid pui-theme">Hi</button>', { delay: 5 });
    await frame.locator("button", { hasText: "Hi" }).waitFor({ timeout: 3000 });
    const want = await page.evaluate(() => {
      const b = document.createElement("button");
      b.className = "pui-btn pui-solid pui-theme";
      document.body.append(b);
      const s = getComputedStyle(b);
      const out = { bg: s.backgroundColor, radius: s.borderRadius };
      b.remove();
      return out;
    });
    const f = await frameOf();
    assert(f, "no preview frame");
    const got = await f.evaluate(async () => {
      await document.fonts.ready;
      const b = document.querySelector("button")!;
      const s = getComputedStyle(b);
      return { bg: s.backgroundColor, radius: s.borderRadius, fonts: [...document.fonts].filter((x) => x.status === "loaded").map((x) => x.family) };
    });
    assert(got.bg === want.bg && got.bg !== "rgba(0, 0, 0, 0)", `button background ${got.bg}, the page's is ${want.bg}`);
    assert(got.radius === want.radius, `button radius ${got.radius}, the page's is ${want.radius}`);
    assert(got.fonts.some((x) => x.startsWith("Inter")), `the site's font did not load in the preview (loaded: ${got.fonts.join(", ") || "none"})`);
    assert(errors.length === 0, `console errors: ${errors.join(" | ")}`);
    return `background ${got.bg}`;
  });

  await check(lang, "keyboard", async () => {
    await editor.fill("<p>x</p>");
    await editor.focus();
    await page.keyboard.press("End");
    await page.keyboard.press("Tab");
    assert((await editor.inputValue()) === "<p>x</p>  ", `Tab did not indent: ${JSON.stringify(await editor.inputValue())}`);
    assert(await editor.evaluate((el) => el === document.activeElement), "Tab moved the focus out of the editor");
    await page.keyboard.press("Escape");
    assert(await page.locator("#perfectui-live.is-open").count(), "Esc in the editor closed the experiment");
    await page.keyboard.press("Tab");
    const now = await page.evaluate(() => document.activeElement?.hasAttribute("data-editor-reset") ?? false);
    assert(now, "after Esc, Tab did not move to the Reset button");
    await page.keyboard.press("Shift+Tab");
    assert(await editor.evaluate((el) => el === document.activeElement), "Shift+Tab did not come back to the editor");
    await page.keyboard.press("Shift+Tab");
    assert(!(await editor.evaluate((el) => el === document.activeElement)), "Shift+Tab did not leave the editor");
  });

  await check(lang, "reset", async () => {
    await editor.fill("<p>changed</p>");
    await frame.locator("p", { hasText: "changed" }).waitFor({ timeout: 3000 });
    await page.locator(`${PANEL} [data-editor-reset]`).click();
    assert((await editor.inputValue()) === (await example()), "Reset did not restore the example");
    await frame.locator("a.pui-btn").nth(1).waitFor({ timeout: 3000 });
    assert((await frame.locator("p").count()) === 0, "the preview still shows the edit");
  });

  await check(lang, "tabs", async () => {
    await page.locator("#lab-tab-card").click();
    await editor.waitFor({ timeout: 3000 });
    const value = await editor.inputValue();
    assert(value === (await example()) && value.includes('class="pui-card"'), "the Card tab does not hold its example");
    await frame.locator(".pui-card").waitFor({ timeout: 3000 });
    await page.locator("#lab-tab-button").click();
  });

  await check(lang, "isolation", async () => {
    const url = page.url();
    const title = await page.title();
    await editor.fill(
      '<script>try { parent.document.title = "x"; document.body.dataset.parent = "reached" } catch (e) { document.body.dataset.parent = "blocked:" + e.name }' +
        'try { top.location.href = "/"; document.body.dataset.top = "no error" } catch (e) { document.body.dataset.top = "blocked:" + e.name }' +
        'document.body.dataset.open = String(window.open("/") === null)</script><a id="go" href="/">home</a>',
    );
    await frame.locator("#go").waitFor({ timeout: 3000 });
    const f = await frameOf();
    assert(f, "no preview frame");
    const r = await f.evaluate(() => ({ ...document.body.dataset }));
    assert(r.parent?.startsWith("blocked:SecurityError"), `parent.document: ${r.parent}`);
    assert(r.open === "true", "window.open was not blocked");
    await frame.locator("#go").click();
    await page.waitForTimeout(500);
    assert(page.url() === url, `the page navigated to ${page.url()}`);
    assert((await page.title()) === title, "the page's title changed");
    assert((await frame.locator("#go").count()) === 1, "the link navigated the preview");
    return `parent.document ${r.parent}; top navigation ${r.top}`;
  });

  await check(lang, "height", async () => {
    const iframe = page.locator(`${PANEL} iframe`);
    await editor.fill('<div style="height: 460px">tall</div>');
    await page.waitForFunction((sel) => parseFloat((document.querySelector(sel) as HTMLElement).style.height) >= 460, `${PANEL} iframe`, { timeout: 3000 });
    const tall = parseFloat((await iframe.evaluate((el) => (el as HTMLElement).style.height)) || "0");
    await editor.fill('<div style="height: 4000px">taller</div>');
    await page.waitForFunction((max) => parseFloat((document.querySelector("#perfectui-live [role=tabpanel]:not([hidden]) iframe") as HTMLElement).style.height) === max, MAX_HEIGHT, { timeout: 3000 });
    await editor.fill("<b>short</b>");
    await page.waitForFunction((min) => parseFloat((document.querySelector("#perfectui-live [role=tabpanel]:not([hidden]) iframe") as HTMLElement).style.height) === min, MIN_HEIGHT, { timeout: 3000 });
    return `${tall}px for 460 px of content, ${MAX_HEIGHT}px at most, ${MIN_HEIGHT}px at least`;
  });

  await check(lang, "agent", async () => {
    await page.locator(".frame > header .agent-toggle").check();
    assert(await editor.isHidden(), "the editor shows with view as agent on");
    await page.locator(".frame > header .agent-toggle").uncheck();
    assert(await editor.isVisible(), "the editor does not come back with view as agent off");
  });
  await ctx.close();

  const nojs = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  await routePick(nojs);
  const p2: Page = await nojs.newPage();
  await check(lang, "no-js", async () => {
    await p2.goto(`${base}${prefix}/lab/#perfectui-live`, { waitUntil: "load" });
    assert(await p2.locator(`${PANEL} pre`).isVisible(), "the static code is not shown");
    assert(await p2.locator(`${PANEL} .live a.pui-btn`).first().isVisible(), "the static example is not shown");
    assert((await p2.locator("#perfectui-live textarea, #perfectui-live iframe").count()) === 0, "an editor or preview exists without JavaScript");
  });
  await nojs.close();
}

const browser = await chromium.launch(CHANNEL ? { channel: CHANNEL } : {});
const { server, base } = await serve(DIST);
try {
  await Promise.all((["en", "pt"] as const).map((lang) => run(browser, base, lang)));
} finally {
  await browser.close();
  server.close();
}
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.info ? `: ${r.info}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `check-playground: ${failed} of ${results.length} checks failed` : `check-playground: ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
