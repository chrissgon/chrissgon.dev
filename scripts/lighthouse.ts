// Run Lighthouse 13.5.0 (pinned in package.json) on the built site served locally, mobile profile, and fail
// when a page scores under the gates of ADR-0009: performance >= 0.9 and agentic-browsing = 1 (AC-7 gate,
// AC-8). The `agentic-browsing` category exists only from Lighthouse 13, hence the CLI and not @lhci/cli.
//
// Usage: tsx scripts/lighthouse.ts [--dist dist] [--pages /,/pt/] [--warmup 1] [--runs 5] [--out lighthouse-report]
//                                  [--performance 0.9] [--agentic 1]
// Serves dist/ on 127.0.0.1 (gzip, like the CDN), runs the CLI `--warmup` times per page and discards those
// runs, then `--runs` measured times per page (Chrome from CHROME_PATH or the system install), and gates on
// the median score of each category. The warm-up absorbs the cold start of a fresh runner (first Chrome
// launch, cold disk cache, jobs still settling): before it, the first run on / scored 55 to 95 in CI while
// the next ones scored 98 to 99. The gates never move; only the measured runs count. Each run's
// benchmarkIndex (Lighthouse's CPU estimate of the machine) is reported so a slow runner is visible.
// Reports go to `--out` (one JSON per run, warm-ups included); the summary goes to stdout and to
// $GITHUB_STEP_SUMMARY when set.
// Exit 0 when every page passes, 1 when a gate fails, 2 on a usage or run error.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve } from "node:path";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";

export const CATEGORIES = ["performance", "agentic-browsing"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Scores = Record<Category, number | null>;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
};
const COMPRESS = /^(text\/|application\/(json|xml)|image\/svg)/;

/** The file of dist/ a URL path maps to, as a static host does (folders serve their index.html). */
export function fileFor(dist: string, urlPath: string): string | null {
  const path = decodeURIComponent(urlPath.split("?")[0]!);
  const file = normalize(join(dist, path));
  if (!file.startsWith(dist)) return null;
  if (existsSync(file) && statSync(file).isFile()) return file;
  const index = join(file, "index.html");
  return existsSync(index) ? index : null;
}

export function serve(dist: string): Promise<Server> {
  const root = resolve(dist);
  const server = createServer((req, res) => {
    const file = fileFor(root, req.url ?? "/");
    const notFound = join(root, "404.html");
    const status = file ? 200 : 404;
    const path = file ?? (existsSync(notFound) ? notFound : null);
    const type = path ? (TYPES[extname(path)] ?? "application/octet-stream") : "text/plain; charset=utf-8";
    let body = path ? readFileSync(path) : Buffer.from("Not found");
    const headers: Record<string, string> = { "Content-Type": type, "Cache-Control": "public, max-age=31536000" };
    if (COMPRESS.test(type) && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
      body = gzipSync(body);
      headers["Content-Encoding"] = "gzip";
    }
    res.writeHead(status, headers).end(body);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Category scores of one Lighthouse result (the LHR JSON). */
export function scoresOf(lhr: { categories?: Record<string, { score: number | null } | undefined> }): Scores {
  return {
    performance: lhr.categories?.performance?.score ?? null,
    "agentic-browsing": lhr.categories?.["agentic-browsing"]?.score ?? null,
  };
}

/** The benchmarkIndex of one Lighthouse result: its CPU estimate of the machine, higher is faster. */
export function benchmarkOf(lhr: { environment?: { benchmarkIndex?: number } }): number | null {
  const b = lhr.environment?.benchmarkIndex;
  return typeof b === "number" && Number.isFinite(b) ? b : null;
}

/** Median scores of several runs of one page. */
export function medianScores(runs: Scores[]): Scores {
  const pick = (c: Category) => median(runs.map((r) => r[c]).filter((v): v is number => v !== null));
  return { performance: pick("performance"), "agentic-browsing": pick("agentic-browsing") };
}

/** Gate failures of a page's median scores; a missing category is a failure. */
export function gateFailures(page: string, scores: Scores, gates: Record<Category, number>): string[] {
  return CATEGORIES.flatMap((c) => {
    const s = scores[c];
    if (s === null) return [`lighthouse: ${page} has no ${c} score`];
    return s + 1e-9 < gates[c] ? [`lighthouse: ${page} ${c} ${Math.round(s * 100)} is under ${Math.round(gates[c] * 100)}`] : [];
  });
}

/** Audits of the agentic-browsing category that did not pass, for the report. */
export function failingAgenticAudits(lhr: {
  categories?: Record<string, { auditRefs?: { id: string }[] } | undefined>;
  audits?: Record<string, { score: number | null; scoreDisplayMode?: string; title?: string }>;
}): string[] {
  const refs = lhr.categories?.["agentic-browsing"]?.auditRefs ?? [];
  return refs.flatMap(({ id }) => {
    const a = lhr.audits?.[id];
    if (!a || a.scoreDisplayMode === "notApplicable" || a.scoreDisplayMode === "manual" || a.score === 1) return [];
    return [`${id} (${a.score})`];
  });
}

function lighthouseBin(): string {
  const require = createRequire(import.meta.url);
  return join(require.resolve("lighthouse/package.json"), "..", "cli", "index.js");
}

/** Run the CLI in a child process; asynchronous, because the static server lives in this process. */
async function runLighthouse(url: string, out: string): Promise<Record<string, unknown>> {
  const args = [
    lighthouseBin(),
    url,
    "--quiet",
    "--output=json",
    `--output-path=${out}`,
    `--only-categories=${CATEGORIES.join(",")}`,
    "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
  ];
  const child = spawn(process.execPath, args, { stdio: ["ignore", "ignore", "pipe"], timeout: 180_000 });
  let stderr = "";
  child.stderr.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-4000)));
  const status = await new Promise<number | null>((ok) => child.on("close", ok));
  if (status !== 0 || !existsSync(out)) throw new Error(`lighthouse failed on ${url} (exit ${status}): ${stderr}`);
  const lhr = JSON.parse(readFileSync(out, "utf8")) as Record<string, unknown> & { runtimeError?: { message?: string } };
  if (lhr.runtimeError) throw new Error(`lighthouse: ${url}: ${lhr.runtimeError.message ?? "runtime error"}`);
  return lhr;
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help")) {
    console.log("Usage: tsx scripts/lighthouse.ts [--dist dist] [--pages /,/pt/] [--warmup 1] [--runs 5] [--out lighthouse-report] [--performance 0.9] [--agentic 1]");
    return 0;
  }
  const opt = (name: string, fallback: string) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
  };
  const dist = resolve(opt("--dist", "dist"));
  const pages = opt("--pages", "/,/pt/").split(",").filter(Boolean);
  const warmup = Number(opt("--warmup", "1"));
  const runs = Number(opt("--runs", "5"));
  const out = resolve(opt("--out", "lighthouse-report"));
  const gates = { performance: Number(opt("--performance", "0.9")), "agentic-browsing": Number(opt("--agentic", "1")) };
  if (!existsSync(join(dist, "index.html"))) {
    console.error(`lighthouse: ${dist}/index.html not found; run npm run build first`);
    return 2;
  }
  if (
    !Number.isInteger(runs) || runs < 1 || !Number.isInteger(warmup) || warmup < 0 ||
    Object.values(gates).some((g) => !(g >= 0 && g <= 1))
  ) {
    console.error("lighthouse: --runs must be a positive integer, --warmup a non-negative integer and the gates between 0 and 1");
    return 2;
  }
  mkdirSync(out, { recursive: true });
  const server = await serve(dist);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const rows: string[] = [];
  const failures: string[] = [];
  const pct = (v: number | null) => (v === null ? "n/a" : String(Math.round(v * 100)));
  try {
    // One page and one run at a time: parallel Chrome instances on one runner compete for the CPU and
    // would skew the performance score.
    for (const page of pages) {
      const name = page.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home";
      const warm: string[] = [];
      for (let i = 1; i <= warmup; i++) {
        const lhr = await runLighthouse(`${base}${page}`, join(out, `${name}-warmup-${i}.json`));
        const s = scoresOf(lhr as Parameters<typeof scoresOf>[0]);
        warm.push(pct(s.performance));
        console.error(`lighthouse: ${page} warm-up ${i} (discarded): ${JSON.stringify({ ...s, benchmarkIndex: benchmarkOf(lhr) })}`);
      }
      const results: Scores[] = [];
      const benchmarks: (number | null)[] = [];
      let agentic: string[] = [];
      for (let i = 1; i <= runs; i++) {
        const lhr = await runLighthouse(`${base}${page}`, join(out, `${name}-${i}.json`));
        results.push(scoresOf(lhr as Parameters<typeof scoresOf>[0]));
        benchmarks.push(benchmarkOf(lhr));
        agentic = failingAgenticAudits(lhr as Parameters<typeof failingAgenticAudits>[0]);
        console.error(`lighthouse: ${page} run ${i}: ${JSON.stringify({ ...results.at(-1), benchmarkIndex: benchmarks.at(-1) })}`);
      }
      const m = medianScores(results);
      const bench = benchmarks.map((b) => (b === null ? "n/a" : String(Math.round(b)))).join(", ");
      rows.push(`| ${page} | ${pct(m.performance)} | ${pct(m["agentic-browsing"])} | ${results.map((r) => pct(r.performance)).join(", ")} | ${warm.join(", ") || "none"} | ${bench} | ${agentic.join(", ") || "none"} |`);
      failures.push(...gateFailures(page, m, gates));
    }
  } finally {
    server.close();
  }
  const summary = [
    `### Lighthouse 13.5.0, mobile, median of ${runs} run(s) after ${warmup} discarded warm-up run(s) per page`,
    "",
    `Gates, on the median: performance >= ${gates.performance * 100}, agentic-browsing >= ${gates["agentic-browsing"] * 100}.`,
    "",
    "| Page | Performance | Agentic browsing | Performance per run | Warm-up (discarded) | benchmarkIndex per run | Agentic audits not passing |",
    "|------|-------------|------------------|---------------------|---------------------|------------------------|----------------------------|",
    ...rows,
    "",
    ...(failures.length ? failures.map((f) => `- ${f}`) : ["All gates pass."]),
    "",
  ].join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  writeFileSync(join(out, "summary.md"), summary);
  return failures.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(2);
    },
  );
}
