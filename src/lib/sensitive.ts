// The sensitive-topics lock (ADR-0002). Same matching as the brand profile's lock: keywords match as
// whole words or phrases, case-insensitive, after removing the topic's `exclude` phrases from the text.
// Private terms (names that must never appear, kept out of git) are reported by number, never by text.
import { existsSync, readFileSync } from "node:fs";
import type { SensitiveExclude, SensitiveTopics } from "../data/schema.ts";

export interface Finding {
  file: string;
  line: number;
  /** A topic name, or "private-term". */
  topic: string;
  /** The keyword for a topic; "#<n>" (1-based) for a private term. */
  match: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wholeWord = (phrase: string) => new RegExp(`(?<![\\p{L}\\p{N}_])${escape(phrase)}(?![\\p{L}\\p{N}_])`, "iu");

/** The public list with this site's own `exclude` additions; an addition for an unknown topic is an error. */
export function withLocalExcludes(topics: SensitiveTopics, local: SensitiveExclude): SensitiveTopics {
  const merged = structuredClone(topics);
  for (const [topic, entries] of Object.entries(local)) {
    const t = merged.topics[topic];
    if (!t) throw new Error(`sensitive-exclude.json: unknown topic ${topic}`);
    t.exclude.push(...entries.map((e) => e.phrase));
  }
  return merged;
}

/** Topics and keywords found in one piece of text. */
export function matchTopics(text: string, topics: SensitiveTopics): { topic: string; keyword: string }[] {
  const hits: { topic: string; keyword: string }[] = [];
  for (const [topic, t] of Object.entries(topics.topics)) {
    let low = text.toLowerCase();
    for (const phrase of t.exclude) low = low.split(phrase.toLowerCase()).join(" ");
    for (const keyword of t.keywords) {
      if (wholeWord(keyword.toLowerCase()).test(low)) hits.push({ topic, keyword });
    }
  }
  return hits;
}

/** Line-by-line scan of a text; line numbers are 1-based. */
export function scanText(file: string, text: string, topics: SensitiveTopics, privateTerms: string[]): Finding[] {
  const findings: Finding[] = [];
  const privateRes = privateTerms.map(wholeWord);
  text.split("\n").forEach((lineText, i) => {
    for (const hit of matchTopics(lineText, topics)) {
      findings.push({ file, line: i + 1, topic: hit.topic, match: hit.keyword });
    }
    privateRes.forEach((re, n) => {
      if (re.test(lineText)) findings.push({ file, line: i + 1, topic: "private-term", match: `#${n + 1}` });
    });
  });
  return findings;
}

export function formatFinding(f: Finding): string {
  return f.topic === "private-term"
    ? `private-term ${f.match} in ${f.file}:${f.line}`
    : `sensitive: ${f.topic} "${f.match}" in ${f.file}:${f.line}`;
}

const TEXT_ATTRS = new Set(["alt", "aria-label", "content", "title"]);
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const newlines = (s: string) => "\n".repeat((s.match(/\n/g) ?? []).length);

/**
 * The text a reader or an agent gets from an HTML page: visible text, the alt, aria-label, content and
 * title attributes, and JSON-LD; without <style> and other <script>. Line numbers are kept.
 */
export function htmlToText(html: string): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, newlines);
  out = out.replace(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi, (m, tag: string, attrs: string, body: string) => {
    const keep = tag.toLowerCase() === "script" && /type\s*=\s*["']?application\/ld\+json/i.test(attrs);
    // JSON-LD is read by agents: keep its body, drop the two tags, keep every line break.
    return keep ? ` ${body.replace(/<[^>]*>/g, " ")} ` + newlines(m.replace(body, "")) : newlines(m);
  });
  out = out.replace(/<[^>]*>/g, (tag) => {
    const values: string[] = [];
    for (const a of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      if (TEXT_ATTRS.has(a[1]!.toLowerCase())) values.push(a[3] ?? a[4] ?? "");
    }
    return ` ${values.join(" ")} ` + newlines(tag);
  });
  return decode(out);
}

export interface PrivateTerms {
  terms: string[];
  sources: string[];
}

/**
 * Private terms from the env variable SENSITIVE_PRIVATE_TERMS (one per line) and from the local file
 * docs/private-terms.txt (one per line, `#` starts a comment). Neither is required.
 */
export function loadPrivateTerms(env: string | undefined, file: string): PrivateTerms {
  const terms: string[] = [];
  const sources: string[] = [];
  const add = (raw: string, source: string) => {
    const list = raw
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*$/, "").trim())
      .filter(Boolean);
    if (list.length) {
      terms.push(...list);
      sources.push(`${source} (${list.length})`);
    }
  };
  if (env) add(env, "SENSITIVE_PRIVATE_TERMS");
  if (existsSync(file)) add(readFileSync(file, "utf8"), file);
  return { terms: [...new Set(terms)], sources };
}
