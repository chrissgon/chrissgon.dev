// Check the built site in dist/ (ADR-0007, ADR-0009; design: "check-dist"). Fails the build when:
//   - a page does not load the Perfect UI stylesheet (a CSS with the `.pui-btn` rule), or the home page
//     does not use a `pui-btn` class (AC-1);
//   - any Tailwind trace is found: a file named after it, the word in code (a stylesheet, a script, or a
//     page's <style> and <script> blocks other than JSON-LD; a project's text may name Tailwind as its stack),
//     `--tw-` variables, or a Tailwind utility class in the markup (AC-1);
//   - a page has more than one <canvas>;
//   - the first render of a home page (EN and PT) weighs more than 150 KB: the HTML, the stylesheets,
//     scripts and their static imports, preloads, eager images, and every font the loaded CSS declares (an
//     upper bound), gzip for text and raw bytes for binaries; the lazy portrait video is excluded;
//   - a llms.txt lacks an H1, a link or 50 characters (the Lighthouse `llms-txt` audit), or a home page
//     lacks the JSON-LD Person;
//   - a page lacks a favicon link (favicon.ico, favicon.svg, apple-touch-icon, manifest), og:image or
//     twitter:image, or one of them points to a file that is not in dist/; og:image is not an absolute URL on
//     the page's origin, not a PNG of the declared og:image:width and og:image:height, or has no alt; the
//     manifest lacks a name, short_name, start_url or icons, or an icon is not in dist/;
//   - an SVG file, or an inline <svg> of a page, carries a <metadata> element;
//   - the Netlify config (netlify.toml) does not serve /site.webmanifest as application/manifest+json
//     (Netlify's default for .webmanifest is application/octet-stream), or does not send
//     Access-Control-Allow-Origin "*" for /_astro/fonts/* (the lab's sandboxed preview loads the fonts).
//
// Usage: tsx scripts/check-dist.ts [--dist <dir>] [--budget-kb <n>] [--netlify-toml <file>] [--json]
// Findings go to stdout (one per line; with --json, a JSON report); the weight report goes to stderr.
// Exit 0 clean, 1 findings, 2 usage error.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, posix, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

export const BUDGET_KB = 150;
export const HOME_PAGES = ["index.html", "pt/index.html"];
const TEXT_EXT = new Set([".html", ".css", ".js", ".mjs", ".svg", ".json", ".txt", ".xml"]);
const FONT_EXT = /\.(woff2?|ttf|otf)$/i;
/** The portrait clips load after the first render (ADR-0008) and stay out of the budget. */
const EXCLUDED = /\.(webm|mp4)$/i;

export interface Resource {
  path: string;
  bytes: number;
}
export interface Weight {
  page: string;
  total: number;
  resources: Resource[];
  external: string[];
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** HTML without the parts a browser with JavaScript does not render on load. */
export function renderedHtml(html: string): string {
  return html.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "").replace(/<template\b[\s\S]*?<\/template>/gi, "");
}

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(1).find((v) => v !== undefined);

/** URLs a page asks for before its first render. */
export function firstRenderUrls(html: string): string[] {
  const doc = renderedHtml(html);
  const urls: string[] = [];
  for (const [tag] of doc.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    const href = attr(tag, "href");
    if (href && (rel.includes("stylesheet") || rel.includes("preload") || rel.includes("modulepreload"))) urls.push(href);
  }
  for (const [tag] of doc.matchAll(/<script\b[^>]*>/gi)) {
    const src = attr(tag, "src");
    if (src) urls.push(src);
  }
  for (const [tag] of doc.matchAll(/<img\b[^>]*>/gi)) {
    const src = attr(tag, "src");
    if (src && (attr(tag, "loading") ?? "").toLowerCase() !== "lazy") urls.push(src);
  }
  return urls;
}

/** Static imports of a JavaScript module and url() references of a stylesheet, relative to the file. */
export function nestedUrls(path: string, content: string): string[] {
  if (/\.m?js$/.test(path)) {
    return [...content.matchAll(/(?:^|[;\s}])import\s*(?:[\w*{}\s,$]+from\s*)?["']([^"']+)["']/g)].map((m) => m[1]!);
  }
  if (path.endsWith(".css")) {
    const fromImports = [...content.matchAll(/@import\s+(?:url\()?["']?([^"')\s;]+)/g)].map((m) => m[1]!);
    const fonts = [...content.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]!).filter((u) => FONT_EXT.test(u.split(/[?#]/)[0]!));
    return [...fromImports, ...fonts];
  }
  return [];
}

export const transferSize = (path: string, content: Buffer) =>
  TEXT_EXT.has(extname(path).toLowerCase()) ? gzipSync(content, { level: 9 }).length : content.length;

/** Resolve a URL of a file in dist/ against the file that references it; null for another origin. */
export function resolveUrl(url: string, fromFile: string): string | null {
  if (/^(data|blob):/i.test(url)) return "";
  if (/^([a-z]+:)?\/\//i.test(url)) return null;
  const clean = url.split(/[?#]/)[0]!;
  return clean.startsWith("/") ? posix.normalize(clean).slice(1) : posix.normalize(posix.join(posix.dirname(fromFile), clean));
}

/** First-render weight of one page of `dist`, following stylesheets and module imports. */
export function pageWeight(dist: string, page: string, read: (p: string) => Buffer | null = (p) => {
  const file = join(dist, p);
  return existsSync(file) && statSync(file).isFile() ? readFileSync(file) : null;
}): Weight & { missing: string[] } {
  const html = read(page);
  if (!html) return { page, total: 0, resources: [], external: [], missing: [page] };
  const resources: Resource[] = [{ path: page, bytes: transferSize(page, html) }];
  const seen = new Set([page]);
  const external: string[] = [];
  const missing: string[] = [];
  const doc = html.toString("utf8");
  // Fonts declared in inline <style> blocks (the Fonts API writes its @font-face rules there) count too.
  const inlineCss = [...renderedHtml(doc).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]!).join("\n");
  const queue = [...firstRenderUrls(doc), ...nestedUrls("inline.css", inlineCss)].map((u) => [u, page] as const);
  while (queue.length) {
    const [url, from] = queue.shift()!;
    const path = resolveUrl(url, from);
    if (path === null) {
      external.push(url);
      continue;
    }
    if (path === "" || seen.has(path) || EXCLUDED.test(path)) continue;
    seen.add(path);
    const content = read(path);
    if (!content) {
      missing.push(path);
      continue;
    }
    resources.push({ path, bytes: transferSize(path, content) });
    for (const u of nestedUrls(path, content.toString("utf8"))) queue.push([u, path]);
  }
  return { page, total: resources.reduce((n, r) => n + r.bytes, 0), resources, external, missing };
}

const TW_VARIANT = /^(sm|md|lg|xl|2xl|hover|focus|focus-visible|focus-within|active|disabled|dark|group-hover|peer-[a-z-]+|motion-safe|motion-reduce|first|last|odd|even):\S+$/;
const TW_UTILITY = [
  /^-?(p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|right|bottom|left|z|order|basis|w|h|size|min-w|min-h|max-w|max-h|translate-x|translate-y|scale|rotate|col-span|row-span|grid-cols|grid-rows|leading|tracking|opacity|duration|delay)-(\d+(\.\d+)?|px|auto|full|screen|min|max|fit|\d+\/\d+|\[[^\]]+\])$/,
  /^(text|bg|border|ring|fill|stroke|from|via|to|divide|outline|decoration|accent|caret|shadow)-(inherit|current|transparent|black|white|(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(\/\d+)?|\[[^\]]+\])$/,
  /^text-(xs|sm|base|lg|[2-9]?xl)$/,
  /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|sans|serif|mono)$/,
  /^(flex|grid|items|justify|content|self|place-items|place-content)-(row|col|row-reverse|col-reverse|wrap|nowrap|center|start|end|between|around|evenly|stretch|baseline|1|auto|initial|none)$/,
  /^(rounded|shadow)(-(none|xs|sm|md|lg|xl|2xl|3xl|full|inner|[trblse]{1,2}(-(sm|md|lg|xl|2xl|3xl|full))?))?$/,
];

/**
 * The word "tailwind" in code: a stylesheet or a script, or an HTML or SVG file's <style> and <script> blocks
 * (JSON-LD excluded). Text that people or agents read (a page's content, llms.txt, JSON data) may name Tailwind as
 * the stack of a project; the file name, `--tw-` and utility-class rules still catch the framework itself.
 */
export function tailwindWordIn(path: string, content: string): boolean {
  const ext = extname(path).toLowerCase();
  if (ext === ".css" || ext === ".js" || ext === ".mjs") return /tailwind/i.test(content);
  if (ext !== ".html" && ext !== ".svg") return false;
  const styles = [...content.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]!);
  const scripts = [...content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => !/type\s*=\s*["']?application\/ld\+json/i.test(m[1]!))
    .map((m) => m[2]!);
  return [...styles, ...scripts].some((c) => /tailwind/i.test(c));
}

/**
 * The value netlify.toml gives a header for a path: null when no [[headers]] block is `for` that path, "" when
 * the block does not set the header. A minimal reader of the file's [[headers]] blocks.
 */
export function netlifyHeader(toml: string, path: string, header: string): string | null {
  // Each [[headers]] block runs until the next table header other than its own [headers.values].
  const blocks = toml
    .split(/^[ \t]*\[\[headers\]\][ \t]*$/m)
    .slice(1)
    .map((b) => b.split(/^[ \t]*\[(?!headers\.values\])/m)[0]!);
  const re = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const block = blocks.find((b) => new RegExp(`^[ \\t]*for[ \\t]*=[ \\t]*["']${re(path)}["'][ \\t]*$`, "m").test(b));
  if (!block) return null;
  const values = block.split(/^[ \t]*\[headers\.values\][ \t]*$/m)[1];
  return (values && new RegExp(`^[ \\t]*["']?${re(header)}["']?[ \\t]*=[ \\t]*["']([^"']*)["'][ \\t]*$`, "im").exec(values)?.[1]) || "";
}

/**
 * The Netlify config must serve the web app manifest as application/manifest+json: a [[headers]] block for
 * "/site.webmanifest" whose values set Content-Type to it.
 */
export function manifestHeaderProblems(toml: string): string[] {
  const type = netlifyHeader(toml, "/site.webmanifest", "content-type");
  if (type === null) return ['netlify: netlify.toml has no [[headers]] block for "/site.webmanifest"'];
  return type === "application/manifest+json"
    ? []
    : [`netlify: /site.webmanifest is served as ${type || "Netlify's default (application/octet-stream)"}, not application/manifest+json`];
}

/**
 * The lab's perfectui-live preview is a sandboxed iframe with an opaque origin (src/scripts/playground.ts), and
 * fonts load through CORS: netlify.toml must send Access-Control-Allow-Origin "*" for "/_astro/fonts/*".
 */
export function fontsCorsProblems(toml: string): string[] {
  const allow = netlifyHeader(toml, "/_astro/fonts/*", "access-control-allow-origin");
  if (allow === null) return ['netlify: netlify.toml has no [[headers]] block for "/_astro/fonts/*"'];
  return allow === "*" ? [] : [`netlify: /_astro/fonts/* is served with Access-Control-Allow-Origin ${allow ? `"${allow}"` : "unset"}, not "*"`];
}

/** Tailwind utility classes among the class tokens of an HTML document. */
export function tailwindClasses(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    for (const token of (m[1] ?? m[2] ?? "").split(/\s+/).filter(Boolean)) {
      if (TW_VARIANT.test(token) || TW_UTILITY.some((re) => re.test(token))) found.add(token);
    }
  }
  return [...found];
}

/** The rules of the Lighthouse `llms-txt` audit: an H1, at least one link, 50 characters or more. */
export function llmsTxtProblems(text: string): string[] {
  const problems: string[] = [];
  if (!/^# \S/m.test(text)) problems.push("no H1");
  if (!/\[[^\]]+\]\([^)]+\)|https?:\/\//.test(text)) problems.push("no link");
  if (text.trim().length < 50) problems.push("shorter than 50 characters");
  return problems;
}

/** The icon links every page carries (favicon/head-snippet.html of logo 4a), by what they must match. */
export const ICON_LINKS: { name: string; match: (rel: string[], tag: string) => boolean }[] = [
  { name: "favicon.ico", match: (rel, tag) => rel.includes("icon") && /\.ico$/i.test(attr(tag, "href") ?? "") },
  { name: "favicon.svg", match: (rel, tag) => rel.includes("icon") && (attr(tag, "type") ?? "") === "image/svg+xml" },
  { name: "apple-touch-icon", match: (rel) => rel.includes("apple-touch-icon") },
  { name: "manifest", match: (rel) => rel.includes("manifest") },
];

/** Width and height of a PNG from its IHDR chunk; null when the bytes are not a PNG. */
export function pngSize(b: Buffer): { width: number; height: number } | null {
  if (b.length < 24 || !b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  if (b.toString("latin1", 12, 16) !== "IHDR") return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const metaContent = (html: string, key: string): string | undefined => {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if ((attr(tag, "property") ?? attr(tag, "name")) === key) return attr(tag, "content");
  }
  return undefined;
};

/**
 * Icons and share image of one page: each icon link present and pointing to a file of dist/; og:image and
 * twitter:image absolute, on the page's own origin (its canonical), pointing to a PNG of dist/ whose size is the
 * declared og:image:width and og:image:height, with an alt text.
 */
export function headProblems(page: string, html: string, read: (p: string) => Buffer | null): string[] {
  const problems: string[] = [];
  const links = [...renderedHtml(html).matchAll(/<link\b[^>]*>/gi)].map(([tag]) => ({
    tag,
    rel: (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/),
  }));
  for (const icon of ICON_LINKS) {
    const link = links.find((l) => icon.match(l.rel, l.tag));
    const href = link && attr(link.tag, "href");
    if (!href) {
      problems.push(`head: ${page} has no ${icon.name} link`);
      continue;
    }
    const path = resolveUrl(href, page);
    if (!path || !read(path)) problems.push(`head: ${page} links ${icon.name} to ${href}, which is not in dist/`);
  }
  const canonical = links.find((l) => l.rel.includes("canonical"));
  const origin = canonical ? new URL(attr(canonical.tag, "href") ?? "", "http://invalid").origin : null;
  for (const key of ["og:image", "twitter:image"]) {
    const url = metaContent(html, key);
    if (!url) {
      problems.push(`head: ${page} has no ${key}`);
      continue;
    }
    if (!/^https?:\/\//.test(url) || new URL(url).origin !== origin) {
      problems.push(`head: ${page} ${key} ${url} is not an absolute URL on the page's origin (${origin ?? "no canonical"})`);
      continue;
    }
    const file = read(resolveUrl(new URL(url).pathname, page) ?? "");
    if (!file) {
      problems.push(`head: ${page} ${key} ${url} is not in dist/`);
      continue;
    }
    if (key !== "og:image") continue;
    const size = pngSize(file);
    const declared = { width: Number(metaContent(html, "og:image:width")), height: Number(metaContent(html, "og:image:height")) };
    if (!size) problems.push(`head: ${page} og:image ${url} is not a PNG`);
    else if (size.width !== declared.width || size.height !== declared.height) {
      problems.push(`head: ${page} og:image is ${size.width}x${size.height}, declared ${declared.width}x${declared.height}`);
    }
    if (!metaContent(html, "og:image:alt")) problems.push(`head: ${page} has no og:image:alt`);
  }
  return problems;
}

/** The web app manifest: a name, a short name, a start URL, and every icon a file of dist/. */
export function manifestProblems(path: string, text: string, exists: (p: string) => boolean): string[] {
  let m: { name?: unknown; short_name?: unknown; start_url?: unknown; icons?: { src?: unknown }[] };
  try {
    m = JSON.parse(text);
  } catch {
    return [`manifest: ${path} is not valid JSON`];
  }
  const problems: string[] = [];
  for (const key of ["name", "short_name", "start_url"] as const) {
    if (typeof m[key] !== "string" || !m[key]) problems.push(`manifest: ${path} has no ${key}`);
  }
  if (!Array.isArray(m.icons) || !m.icons.length) problems.push(`manifest: ${path} lists no icon`);
  for (const icon of Array.isArray(m.icons) ? m.icons : []) {
    const src = typeof icon.src === "string" ? icon.src : "";
    const p = resolveUrl(src, path);
    if (!src || !p || !exists(p)) problems.push(`manifest: ${path} icon ${src || "(no src)"} is not in dist/`);
  }
  return problems;
}

/** An SVG file, or an inline <svg> of a page, that carries a <metadata> element (the C2PA block of an export). */
export const hasSvgMetadata = (path: string, text: string): boolean =>
  path.endsWith(".svg") ? /<metadata\b/i.test(text) : [...text.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)].some(([s]) => /<metadata\b/i.test(s));

export interface Report {
  findings: string[];
  weights: Weight[];
}

export function checkDist(dist: string, budgetKb = BUDGET_KB): Report {
  const findings: string[] = [];
  const files = walk(dist).map((f) => relative(dist, f).split("\\").join("/"));
  const htmlPages = files.filter((f) => f.endsWith(".html"));
  if (!htmlPages.length) return { findings: [`dist: no HTML page in ${dist} (run astro build first)`], weights: [] };
  const text = (f: string) => readFileSync(join(dist, f), "utf8");

  for (const f of files) {
    if (/tailwind/i.test(f)) findings.push(`tailwind: file ${f}`);
    else if (TEXT_EXT.has(extname(f).toLowerCase())) {
      const content = text(f);
      if (tailwindWordIn(f, content)) findings.push(`tailwind: the word "tailwind" in ${f}`);
      if (/--tw-[a-z]/.test(content)) findings.push(`tailwind: --tw- variables in ${f}`);
      if ((f.endsWith(".svg") || f.endsWith(".html")) && hasSvgMetadata(f, content)) findings.push(`svg: ${f} carries a <metadata> element`);
    }
  }

  const cssWithPui = new Set(files.filter((f) => f.endsWith(".css") && /\.pui-btn\b/.test(text(f))));
  const fileSet = new Set(files);
  const read = (p: string) => (fileSet.has(p) ? readFileSync(join(dist, p)) : null);
  const manifests = new Set<string>();
  for (const page of htmlPages) {
    const html = text(page);
    for (const cls of tailwindClasses(html)) findings.push(`tailwind: class "${cls}" in ${page}`);
    const canvases = (renderedHtml(html).match(/<canvas\b/gi) ?? []).length;
    if (canvases > 1) findings.push(`canvas: ${canvases} <canvas> elements in ${page} (at most 1)`);
    const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].some((m) => /\.pui-btn\b/.test(m[1]!));
    const linked = firstRenderUrls(html).some((u) => {
      const p = resolveUrl(u, page);
      return p !== null && cssWithPui.has(p);
    });
    if (!inline && !linked) findings.push(`perfect-ui: ${page} does not load the Perfect UI stylesheet (.pui-btn)`);
    findings.push(...headProblems(page, html, read));
    for (const [tag] of renderedHtml(html).matchAll(/<link\b[^>]*>/gi)) {
      const href = /\brel\s*=\s*["']?manifest\b/i.test(tag) ? attr(tag, "href") : undefined;
      const p = href && resolveUrl(href, page);
      if (p && fileSet.has(p)) manifests.add(p);
    }
  }
  for (const m of manifests) findings.push(...manifestProblems(m, text(m), (p) => fileSet.has(p)));

  const weights: Weight[] = [];
  for (const page of HOME_PAGES) {
    const w = pageWeight(dist, page);
    for (const m of w.missing) findings.push(`weight: ${page} references ${m}, which is not in dist/`);
    for (const e of w.external) findings.push(`weight: ${page} loads ${e} from another origin before the first render`);
    if (w.missing.includes(page)) continue;
    weights.push(w);
    if (w.total > budgetKb * 1024) {
      findings.push(`weight: ${page} first render is ${(w.total / 1024).toFixed(1)} KB, over the ${budgetKb} KB budget`);
    }
    const html = text(page);
    if (!/\bclass\s*=\s*["'][^"']*\bpui-btn\b/.test(html)) findings.push(`perfect-ui: ${page} uses no pui-btn class`);
    const ld = [...html.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
    if (!ld.some((j) => /"@type"\s*:\s*"Person"/.test(j))) findings.push(`jsonld: ${page} has no Person`);
  }

  for (const f of ["llms.txt", "pt/llms.txt"]) {
    if (!files.includes(f)) findings.push(`llms: ${f} is missing`);
    else for (const p of llmsTxtProblems(text(f))) findings.push(`llms: ${f}: ${p}`);
  }
  return { findings, weights };
}

export function formatWeight(w: Weight): string {
  const top = [...w.resources].sort((a, b) => b.bytes - a.bytes);
  return [
    `check-dist: ${w.page} first render ${(w.total / 1024).toFixed(1)} KB (gzip for text) in ${w.resources.length} files`,
    ...top.map((r) => `  ${(r.bytes / 1024).toFixed(1).padStart(7)} KB  ${r.path}`),
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    console.log("Usage: tsx scripts/check-dist.ts [--dist <dir>] [--budget-kb <n>] [--netlify-toml <file>] [--json]");
    process.exit(0);
  }
  const opt = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const budget = Number(opt("--budget-kb") ?? BUDGET_KB);
  if (!Number.isFinite(budget) || budget <= 0) {
    console.error("check-dist: --budget-kb must be a positive number");
    process.exit(2);
  }
  const report = checkDist(resolve(opt("--dist") ?? "dist"), budget);
  const toml = resolve(opt("--netlify-toml") ?? "netlify.toml");
  if (existsSync(toml)) {
    const text = readFileSync(toml, "utf8");
    report.findings.push(...manifestHeaderProblems(text), ...fontsCorsProblems(text));
  } else {
    report.findings.push(`netlify: ${toml} is missing`);
  }
  for (const w of report.weights) console.error(formatWeight(w));
  if (argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else for (const f of report.findings) console.log(f);
  console.error(report.findings.length ? `check-dist: ${report.findings.length} finding(s)` : "check-dist: clean");
  process.exit(report.findings.length ? 1 : 0);
}
