// Check the built site in dist/ (ADR-0007, ADR-0009; design: "check-dist"). Fails the build when:
//   - a page does not load the Perfect UI stylesheet (a CSS with the `.pui-btn` rule), or the home page
//     does not use a `pui-btn` class (AC-1);
//   - any Tailwind trace is found: a file named after it, the word in a text file, `--tw-` variables, or a
//     Tailwind utility class in the markup (AC-1);
//   - a page has more than one <canvas>;
//   - the first render of a home page (EN and PT) weighs more than 150 KB: the HTML, the stylesheets,
//     scripts and their static imports, preloads, eager images, and every font the loaded CSS declares (an
//     upper bound), gzip for text and raw bytes for binaries; the lazy portrait video is excluded;
//   - a llms.txt lacks an H1, a link or 50 characters (the Lighthouse `llms-txt` audit), or a home page
//     lacks the JSON-LD Person.
//
// Usage: tsx scripts/check-dist.ts [--dist <dir>] [--budget-kb <n>] [--json]
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
      if (/tailwind/i.test(content)) findings.push(`tailwind: the word "tailwind" in ${f}`);
      if (/--tw-[a-z]/.test(content)) findings.push(`tailwind: --tw- variables in ${f}`);
    }
  }

  const cssWithPui = new Set(files.filter((f) => f.endsWith(".css") && /\.pui-btn\b/.test(text(f))));
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
  }

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
    console.log("Usage: tsx scripts/check-dist.ts [--dist <dir>] [--budget-kb <n>] [--json]");
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
  for (const w of report.weights) console.error(formatWeight(w));
  if (argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else for (const f of report.findings) console.log(f);
  console.error(report.findings.length ? `check-dist: ${report.findings.length} finding(s)` : "check-dist: clean");
  process.exit(report.findings.length ? 1 : 0);
}
