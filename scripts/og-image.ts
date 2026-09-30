// og-image.ts: renders the share images (og:image, twitter:image), one per language, from the brand and the data.
//
// Usage: npm run og:image -- [--dist dist] [--out public/og] [--channel chrome]
//   Run `npm run build` first: the label is set in Inter 400 read from the build's own font files, so the
//   image uses the site's font without a network request. Commit the PNGs it writes (og-en.png, og-pt.png).
//
// Each image is 1200 x 630: a black background with the page's dot grid (1.4 px dots every 28 px in #1f2937,
// the rule in src/styles/site.css), the logo lockup (scripts/og-image/lockup.svg, logo 4a for dark
// backgrounds, white with the bar in #07b6f0) and the approved label of that language (profile.label in
// src/data/profile.ts), one line per part, in --pui-text-muted. No other text. Rendering is deterministic for a
// given Chromium and font file: pixel ratio 1, no animation, no time or random input.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { profile, type Lang } from "../src/data/index.ts";
import { OG_HEIGHT, OG_WIDTH, ogImagePath } from "../src/lib/og.ts";

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The woff2 file of Inter at `weight` declared by the built home page's @font-face rules. */
export function interFont(html: string, weight: number): string | null {
  for (const [rule] of html.matchAll(/@font-face\{[^}]*\}/g)) {
    if (!/font-family:\s*"?Inter-/.test(rule) || !rule.includes(`font-weight:${weight};`)) continue;
    const url = /url\("?([^")]+\.woff2)"?\)/.exec(rule)?.[1];
    if (url) return url;
  }
  return null;
}

/** The HTML drawn into one share image. */
export function ogHtml(lang: Lang, lockupSvg: string, fontBase64: string): string {
  const lines = profile.label[lang].map((l) => `<p>${escapeHtml(l)}</p>`).join("");
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
@font-face{font-family:Label;src:url(data:font/woff2;base64,${fontBase64}) format("woff2");font-weight:400}
*{margin:0;box-sizing:border-box}
html,body{width:${OG_WIDTH}px;height:${OG_HEIGHT}px;overflow:hidden}
body{background-color:#000;background-image:radial-gradient(circle,#1f2937 0.7px,transparent 1px);background-size:28px 28px;background-position:0 0;
display:flex;flex-direction:column;justify-content:center;padding:0 84px;font-family:Label,sans-serif;-webkit-font-smoothing:antialiased}
.lockup{display:block;width:504px;height:auto}
.label{margin-top:56px;font-size:32px;line-height:1.4;letter-spacing:-0.01em;color:#9ca3af}
</style></head><body>${lockupSvg.replace("<svg ", '<svg class="lockup" ')}<div class="label">${lines}</div></body></html>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (argv.includes("--help")) {
    const self = readFileSync(new URL(import.meta.url), "utf8");
    console.log(self.split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
    process.exit(0);
  }
  const dist = resolve(flag("--dist", "dist"));
  const out = resolve(flag("--out", "public/og"));
  const channel = flag("--channel", "");
  let home: string;
  try {
    home = readFileSync(join(dist, "index.html"), "utf8");
  } catch {
    console.error(`og-image: ${dist}/index.html not found; run npm run build first`);
    process.exit(2);
  }
  const font = interFont(home, 400);
  if (!font) {
    console.error("og-image: no Inter 400 @font-face in the built home page");
    process.exit(2);
  }
  const fontBase64 = readFileSync(join(dist, font)).toString("base64");
  const lockup = readFileSync(new URL("./og-image/lockup.svg", import.meta.url), "utf8");
  if (/<metadata\b/i.test(lockup)) {
    console.error("og-image: scripts/og-image/lockup.svg carries <metadata>; strip it first");
    process.exit(2);
  }
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: OG_WIDTH, height: OG_HEIGHT }, deviceScaleFactor: 1 });
    for (const lang of ["en", "pt"] as const) {
      await page.setContent(ogHtml(lang, lockup, fontBase64), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const file = join(out, ogImagePath(lang).split("/").pop()!);
      writeFileSync(file, await page.screenshot({ type: "png", animations: "disabled" }));
      console.log(`${file} ${readFileSync(file).length} bytes`);
    }
  } finally {
    await browser.close();
  }
}
