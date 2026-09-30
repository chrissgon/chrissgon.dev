// The matching of the sensitive-topics lock, with no Node import, so the page's lazy pick refresh
// (src/scripts/pick-refresh.ts) can run the same lock as the build (scripts/check-sensitive.ts) on the topics it
// fetches. Keywords match as whole words or phrases, case-insensitive, after removing the topic's `exclude`
// phrases from the text.
import type { SensitiveExclude, SensitiveTopics } from "../data/schema.ts";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const wholeWord = (phrase: string) => new RegExp(`(?<![\\p{L}\\p{N}_])${escape(phrase)}(?![\\p{L}\\p{N}_])`, "iu");

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
