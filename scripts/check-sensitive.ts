// Fail the build when a sensitive topic or a private term appears in the data or the built site (ADR-0002).
//
// Usage: tsx scripts/check-sensitive.ts --data|--dist [--root <dir>]
//   --data   scan src/data/** (before astro build)
//   --dist   scan dist/**: HTML text and alt/aria-label/content/title attributes, JSON-LD, .txt files
//   --root   project root (default: the current directory)
// Public keywords: src/data/sensitive-topics.json (verbatim copy of the brand profile's list), plus this
// site's false positives in src/data/sensitive-exclude.json. Private terms (optional, never committed): the env
// variable SENSITIVE_PRIVATE_TERMS (one per line) and docs/private-terms.txt (one per line).
// Findings go to stdout; diagnostics to stderr. Exit 0 clean, 1 findings, 2 usage error.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { SensitiveExclude, SensitiveTopics, parseData } from "../src/data/schema.ts";
import {
  formatFinding,
  htmlToText,
  loadPrivateTerms,
  scanText,
  withLocalExcludes,
  type Finding,
} from "../src/lib/sensitive.ts";

const TOPICS_FILE = "src/data/sensitive-topics.json";
const EXCLUDE_FILE = "src/data/sensitive-exclude.json";
const PRIVATE_FILE = "docs/private-terms.txt";
const DATA_EXT = /\.(ts|json|txt|md)$/;
const DIST_EXT = /\.(html|txt)$/;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export function run(argv: string[], env: NodeJS.ProcessEnv = process.env): { code: number; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  if (argv.includes("--help") || argv.includes("-h")) {
    out.push("Usage: tsx scripts/check-sensitive.ts --data|--dist [--root <dir>]");
    return { code: 0, out, err };
  }
  const mode = argv.includes("--data") ? "data" : argv.includes("--dist") ? "dist" : null;
  const rootIdx = argv.indexOf("--root");
  const root = resolve(rootIdx >= 0 ? (argv[rootIdx + 1] ?? ".") : ".");
  if (!mode) {
    err.push("check-sensitive: pass --data or --dist (see --help)");
    return { code: 2, out, err };
  }

  const topicsRaw = readFileSync(join(root, TOPICS_FILE), "utf8");
  const publicTopics = parseData(SensitiveTopics, JSON.parse(topicsRaw), TOPICS_FILE);
  const excludePath = join(root, EXCLUDE_FILE);
  const local = existsSync(excludePath)
    ? parseData(SensitiveExclude, JSON.parse(readFileSync(excludePath, "utf8")), EXCLUDE_FILE)
    : {};
  const topics = withLocalExcludes(publicTopics, local);
  err.push(`check-sensitive: public list ${TOPICS_FILE} sha256 ${createHash("sha256").update(topicsRaw).digest("hex")}`);

  const priv = loadPrivateTerms(env.SENSITIVE_PRIVATE_TERMS, join(root, PRIVATE_FILE));
  err.push(
    priv.terms.length
      ? `check-sensitive: private terms: ${priv.terms.length} from ${priv.sources.join(", ")}`
      : `check-sensitive: private terms: none configured (no SENSITIVE_PRIVATE_TERMS, no ${PRIVATE_FILE}); only the public list was checked`,
  );

  const base = join(root, mode === "data" ? "src/data" : "dist");
  if (!existsSync(base)) {
    err.push(`check-sensitive: ${relative(root, base)} does not exist`);
    return { code: 2, out, err };
  }
  const files = walk(base)
    .filter((f) => (mode === "data" ? DATA_EXT : DIST_EXT).test(f))
    .filter((f) => ![TOPICS_FILE, EXCLUDE_FILE].includes(relative(root, f)));

  const findings: Finding[] = [];
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const text = file.endsWith(".html") ? htmlToText(raw) : raw;
    findings.push(...scanText(relative(root, file), text, topics, priv.terms));
  }
  for (const f of findings) out.push(formatFinding(f));
  err.push(`check-sensitive: ${mode}: ${files.length} files, ${findings.length} findings`);
  return { code: findings.length ? 1 : 0, out, err };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("check-sensitive.ts")) {
  const { code, out, err } = run(process.argv.slice(2));
  for (const l of out) console.log(l);
  for (const l of err) console.error(l);
  process.exit(code);
}
