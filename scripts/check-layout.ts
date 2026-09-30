// check-layout.ts: loads every built page in headless Chromium at phone to desktop widths and fails when the
// page scrolls sideways or a grid of bordered cells misses a line.
//
// Usage: npm run check:layout -- [--dist dist] [--jobs 6] [--channel chrome] [--widths 320,768]
//   Run `npm run build` first. Uses Playwright's Chromium (npx playwright install chromium), or, with
//   --channel chrome, the Google Chrome installed on the machine (CI uses the one on the runner image).
//
// Each state (page, width) passes when document.documentElement.scrollWidth is no wider than the viewport's
// layout width (clientWidth, the viewport less a classic scrollbar), no element's right edge passes it, and no
// code scrolls sideways inside its own box: every pre, code, kbd, samp, output, read-only input or textarea,
// element with a code class (.code, *-code, code-*) and the lab's eval table (.evals) has scrollWidth <=
// clientWidth (an inline one: its nearest block). Code wraps instead (src/lib/code.ts, src/styles/site.css).
// Scrollbars are drawn (Chromium hides them when headless), so a 100vw box under a 15 px scrollbar fails
// here as it does on a desktop with classic scrollbars.
// States: /, /projects/, /writing/, /lab/ and their /pt/ pages, each as loaded and with every "view as
// agent" switch on; /lab/ and /pt/lab/ with each experiment opened (/lab/#<id>), and #view-as-agent opened
// with its switch on. Widths: 320 360 375 390 414 600 768 820 1024 1100 1186 1280 1366 1440 1920.
// A failing state lists the elements that stick out (their right edge, in px past the viewport), outermost
// first, and the code that scrolls sideways (its overflow in px).
// Each state also checks the lines of every grid of bordered cells (.cells, src/styles/site.css): every cell's
// right and bottom edges and the grid's four edges must each lie on one drawn 1 px line (a straight border of
// any element: the cell, a neighbour, the frame, the section) along their whole length, neither missing (a
// row with empty slots left open) nor doubled (two parallel lines side by side). The grid is checked as
// loaded and again with its last 1 to (columns - 1) cells hidden, so every shape of an incomplete last row is
// seen at every width, whatever the item count (a stat left out, a post removed).
// In each state with "view as agent" on, a switched-on scope shows only its reading (.agent-text) and the frame
// (cell tags, corner markers, site header and footer, the switch): any other element that draws text fails, and
// so does a heading of the scope (outside the hidden human forms) drawn taller than 1 px or missing from the
// accessibility tree (hidden the .sr-only way, never removed, so aria-labelledby still names its section).
// One PASS or FAIL line per state on stdout, then a width x page summary; exit 1 on any failure.
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

// Runs in the page, as plain JavaScript (a string, so no build helper leaks into it). Returns one message per
// missing or doubled line of a .cells grid; [] when every grid is closed.
const CELL_LINES = `(() => {
  const px = (v) => parseFloat(v) || 0;
  const SIDES = ["Top", "Right", "Bottom", "Left"];
  // Every straight line drawn by a border: v (vertical) and h (horizontal) segments, p0-p1 across the line,
  // a0-a1 along it. Rounded boxes (cards, buttons) are not lines of the grid.
  const collect = () => {
    const v = [], h = [];
    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || px(cs.opacity) === 0) continue;
      if (["TopLeft", "TopRight", "BottomLeft", "BottomRight"].some((c) => px(cs["border" + c + "Radius"]) > 0)) continue;
      for (const s of SIDES) {
        const w = px(cs["border" + s + "Width"]);
        if (w < 0.5 || cs["border" + s + "Style"] === "none" || /rgba\\(.*,\\s*0\\)$|transparent/.test(cs["border" + s + "Color"])) continue;
        if (s === "Left") v.push({ p0: r.left, p1: r.left + w, a0: r.top, a1: r.bottom });
        if (s === "Right") v.push({ p0: r.right - w, p1: r.right, a0: r.top, a1: r.bottom });
        if (s === "Top") h.push({ p0: r.top, p1: r.top + w, a0: r.left, a1: r.right });
        if (s === "Bottom") h.push({ p0: r.bottom - w, p1: r.bottom, a0: r.left, a1: r.right });
      }
    }
    return { v, h };
  };
  // px of the edge (at, running from..to) with no line within 1.5 px, and px where two lines sit side by side.
  const edge = (segs, at, from, to) => {
    const near = segs.filter((s) => s.p1 >= at - 1.5 && s.p0 <= at + 1.5);
    let missing = 0, doubled = 0;
    for (let t = from + 1; t <= to - 1; t += 2) {
      const cov = near.filter((s) => s.a0 <= t + 0.5 && s.a1 >= t - 0.5);
      if (!cov.length) missing += 2;
      else if (Math.max(...cov.map((s) => s.p0)) - Math.min(...cov.map((s) => s.p0)) >= 0.75) doubled += 2;
    }
    return { missing, doubled };
  };
  const cellsOf = (grid) => [...grid.children].filter((c) => {
    const cs = getComputedStyle(c);
    return cs.position !== "absolute" && cs.position !== "fixed" && c.getBoundingClientRect().width > 0;
  });
  const columns = (grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length;
  const name = (el) => el.tagName.toLowerCase() + "." + String(el.className).trim().split(/\\s+/).join(".");
  const checkGrid = (grid, note) => {
    const out = [];
    const { v, h } = collect();
    const g = grid.getBoundingClientRect();
    const cells = cellsOf(grid);
    const where = name(grid) + " (" + cells.length + " cells, " + columns(grid) + " columns" + note + ")";
    const report = (what, r) => {
      if (r.missing) out.push(where + ": " + what + " has no line over " + r.missing + " px");
      if (r.doubled) out.push(where + ": " + what + " has a doubled line over " + r.doubled + " px");
    };
    // A cell's lines run the height of its row, not only of its own box: a cell shorter than its row (or than
    // the grid, in the first or last row) leaves its divider short of the lines above or below it. A row is the
    // cells whose boxes overlap this one's by more than the 1 px they hang into the next row.
    const boxes = cells.map((c) => c.getBoundingClientRect());
    boxes.forEach((r, i) => {
      const row = boxes.filter((o) => Math.min(o.bottom, r.bottom) - Math.max(o.top, r.top) > 2);
      let top = Math.min(...row.map((o) => o.top)), bottom = Math.max(...row.map((o) => o.bottom));
      if (!boxes.some((o) => o.bottom <= top + 2)) top = Math.min(top, g.top);
      if (!boxes.some((o) => o.top >= bottom - 2)) bottom = Math.max(bottom, g.bottom);
      report("cell " + (i + 1) + " right edge", edge(v, r.right, top, bottom));
      report("cell " + (i + 1) + " bottom edge", edge(h, bottom, r.left, r.right));
    });
    report("grid top edge", edge(h, g.top, g.left, g.right));
    report("grid left edge", edge(v, g.left, g.top, g.bottom));
    report("grid right edge", edge(v, g.right, g.top, g.bottom));
    report("grid bottom edge", edge(h, g.bottom, g.left, g.right));
    return out;
  };
  const out = [];
  let grids = 0;
  for (const grid of document.querySelectorAll(".cells")) {
    if (grid.getBoundingClientRect().width === 0) continue;
    grids++;
    out.push(...checkGrid(grid, ""));
    const cells = cellsOf(grid);
    for (let j = 1; j < columns(grid) && j < cells.length; j++) {
      const hidden = cells.slice(-j);
      for (const c of hidden) c.style.setProperty("display", "none");
      out.push(...checkGrid(grid, ", last " + j + " hidden"));
      for (const c of hidden) c.style.removeProperty("display");
    }
  }
  return { grids, out };
})()`;

// Runs in the page, as plain JavaScript. With "view as agent" on, a scope shows only its reading (.agent-text)
// and the frame: lists every element in a switched-on scope that still draws text (a text box wider and taller
// than 1 px) outside the reading, the cell tags, corner markers, the site header and footer and the switch, and
// every heading of the scope (outside the hidden human forms) still drawn taller than 1 px. Returns those
// headings too, for the accessibility-tree check that follows.
const AGENT_VIEW = `(() => {
  const CHROME = ".agent-text, .tag, .cm, .switch-label, .frame > header, .frame > footer, .skip";
  const scopes = [...document.querySelectorAll("[data-agent-scope]")].filter((s) => s.querySelector(".agent-toggle:checked"));
  const out = [];
  const headings = [];
  const name = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).join(".") : "");
  const seen = new Set();
  for (const scope of scopes) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.data.replace(/\\s+/g, " ").trim();
      const el = n.parentElement;
      if (!text || !el || el.closest(CHROME) || seen.has(el)) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      if (![...range.getClientRects()].some((r) => r.width > 1 && r.height > 1 && r.right > 0)) continue;
      // Text in a box that clips it to 1 px or less (the .sr-only technique) is not drawn.
      let clipped = false;
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a), r = a.getBoundingClientRect();
        if ((cs.overflowX !== "visible" || cs.overflowY !== "visible" || cs.clipPath !== "none") && (r.width <= 1 || r.height <= 1)) { clipped = true; break; }
      }
      if (clipped) continue;
      seen.add(el);
      out.push(name(el) + " shows \\"" + text.slice(0, 40) + "\\"");
    }
    for (const h of scope.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      if (h.closest(".human, " + CHROME)) continue;
      const tall = h.getBoundingClientRect().height;
      if (tall > 1) out.push(name(h) + " is drawn " + Math.round(tall) + " px tall");
      headings.push({ level: Number(h.tagName[1]), name: h.textContent.replace(/\\s+/g, " ").trim(), sel: name(h) });
    }
  }
  return { scopes: scopes.length, out, headings };
})()`;

interface Result { page: string; width: number; ok: boolean; info: string }
const results: Result[] = [];
const scrollbars = new Set<number>();
const cellGrids = new Map<string, number>();
const agentStates = new Set<string>();
const agentHeadings = new Set<string>();

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
      // Code never scrolls sideways inside its own box: a code element (or, for an inline one, its nearest block)
      // whose content is wider than its box (scrollWidth > clientWidth) is listed.
      const code: Array<{ sel: string; over: number }> = [];
      // .evals: the lab's eval table, whose cells are mono names (skills, models).
      const CODE = "pre, code, kbd, samp, output, input[readonly], textarea[readonly], .code, [class*='-code'], [class*='code-'], .evals";
      for (const el of document.body.querySelectorAll<HTMLElement>(CODE)) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || !el.getClientRects().length) continue;
        // No named helper here: tsx wraps named functions in __name(), which the page does not have.
        const ecls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : "";
        const p = el.parentElement;
        const pcls = p && typeof p.className === "string" && p.className.trim() ? "." + p.className.trim().split(/\s+/)[0] : "";
        const sel = `${p ? p.tagName.toLowerCase() + pcls + " > " : ""}${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${ecls}`;
        if (cs.display === "inline") {
          // An inline code element has no scroll box of its own; its nearest block must not scroll sideways. (Its
          // line boxes are not compared with the block's edge: pre-wrap lets trailing spaces hang past it.)
          let b = el.parentElement;
          while (b && getComputedStyle(b).display === "inline") b = b.parentElement;
          if (b && b.scrollWidth > b.clientWidth) code.push({ sel: `${b.tagName.toLowerCase()} ⊃ ${sel}`, over: b.scrollWidth - b.clientWidth });
        } else if (el.scrollWidth > el.clientWidth) {
          code.push({ sel, over: el.scrollWidth - el.clientWidth });
        }
      }
      return { scroll: de.scrollWidth, client: vw, inner: window.innerWidth, out, code };
    });
    scrollbars.add(m.inner - m.client);
    const lines = (await page.evaluate(CELL_LINES)) as { grids: number; out: string[] };
    cellGrids.set(`${s.page} @ ${width}`, lines.grids);
    // View as agent: only the reading and the frame show, and the hidden headings stay in the accessibility tree
    // (Playwright's role query leaves out what assistive technology does not get: display none, visibility
    // hidden, aria-hidden).
    const agentOut: string[] = [];
    if (s.agent) {
      const av = (await page.evaluate(AGENT_VIEW)) as { scopes: number; out: string[]; headings: Array<{ level: number; name: string; sel: string }> };
      if (av.scopes) agentStates.add(`${s.page} @ ${width}`);
      agentOut.push(...av.out);
      for (const h of av.headings) {
        const re = new RegExp(`^${h.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
        if ((await page.getByRole("heading", { level: h.level, name: re }).count()) === 0) agentOut.push(`${h.sel} is not in the accessibility tree`);
        else agentHeadings.add(`${s.page}: ${h.sel}`);
      }
    }
    const ok = m.scroll <= m.client && m.out.length === 0 && m.code.length === 0 && errors.length === 0 && lines.out.length === 0 && agentOut.length === 0;
    const outer = m.out.filter((o) => !o.sel.startsWith("  in: "));
    const info = `scrollWidth ${m.scroll}, clientWidth ${m.client}, innerWidth ${m.inner}` +
      (outer.length ? `; sticks out: ${outer.slice(0, 6).map((o) => `${o.sel} +${o.right}px`).join("; ")}${outer.length > 6 ? `; +${outer.length - 6} more` : ""}` : "") +
      (m.scroll > m.client && !m.out.length ? "; no element box sticks out (a pseudo-element or a shadow?)" : "") +
      (m.code.length ? `; code scrolls sideways: ${m.code.slice(0, 6).map((c) => `${c.sel} +${c.over}px`).join("; ")}${m.code.length > 6 ? `; +${m.code.length - 6} more` : ""}` : "") +
      (errors.length ? `; page errors: ${errors.join(" | ")}` : "") +
      (lines.out.length ? `; lines: ${lines.out.slice(0, 6).join("; ")}${lines.out.length > 6 ? `; +${lines.out.length - 6} more` : ""}` : "") +
      (agentOut.length ? `; agent view: ${agentOut.slice(0, 6).join("; ")}${agentOut.length > 6 ? `; +${agentOut.length - 6} more` : ""}` : "");
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
// Summary: one row per width, one column per page: the overflow in px, "code" (code scrolling in its box),
// "lines" (a .cells grid left open or doubled), "agent" (view as agent shows more than the reading and the
// frame), "FAIL" (another failure) or "ok".
const pages = states.map((s) => s.page);
console.log(`\nwidth | ${pages.join(" | ")}`);
for (const w of WIDTHS) {
  const row = pages.map((p) => {
    const r = results.find((x) => x.page === p && x.width === w);
    if (!r) return "?";
    if (r.ok) return "ok";
    const m = /scrollWidth (\d+), clientWidth (\d+)/.exec(r.info);
    const over = m ? Number(m[1]) - Number(m[2]) : 0;
    if (over > 0) return `+${over}`;
    if (r.info.includes("; code scrolls sideways: ")) return "code";
    if (r.info.includes("; lines: ")) return "lines";
    return r.info.includes("; agent view: ") ? "agent" : "FAIL";
  });
  console.log(`${w} | ${row.join(" | ")}`);
}
const failed = results.filter((r) => !r.ok).length;
// A page taller than the viewport shows a classic scrollbar; 0 px means overlay scrollbars (the check is weaker).
console.log(`\nscrollbar widths seen: ${[...scrollbars].sort((a, b) => a - b).join(", ")} px`);
const gridCount = [...cellGrids.values()].reduce((a, b) => a + b, 0);
console.log(`cell grids checked: ${gridCount} (in ${[...cellGrids.values()].filter(Boolean).length} of ${cellGrids.size} states)`);
console.log(`agent views checked: ${agentStates.size} states, ${agentHeadings.size} hidden headings found in the accessibility tree`);
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
