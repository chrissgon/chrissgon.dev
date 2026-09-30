import { describe, expect, it } from "vitest";
import { fromBody } from "../scripts/fetch-pick.ts";
import { pickSnapshot, readPick } from "../src/data/pick.ts";
import { labels, sensitiveTopics } from "../src/data/index.ts";
import { formatDate } from "../src/lib/format.ts";
import { llmsText } from "../src/lib/llms.ts";
import {
  closesAt,
  formatDay,
  issueUrl,
  parsePick,
  pickMarkdown,
  pickView,
  safePostUrl,
  viewKey,
  winnerOf,
  type PickData,
} from "../src/lib/pick.ts";
import { matchTopics } from "../src/lib/sensitive.ts";
import { tripsLock } from "../src/scripts/pick-refresh.ts";

// The profile's data/pick.json as its workflow writes it (chrissgon/chrissgon, read on 2026-09-30).
const profile = {
  open: true,
  round: "2026-09-29",
  closes: "2026-10-05",
  pillar: "AI built in public",
  options: {
    A: "A cheap model obeyed a prompt injection. How a skill fixed it.",
    B: "LinkedIn's API won't let me read comments. What I did instead.",
    C: "Evals with and without a skill: the real numbers.",
  },
  picks: { "568356af85f64390": "A", "0123456789abcdef": "C", fedcba9876543210: "A" },
  history: [] as unknown[],
};
const past = (over: Record<string, unknown> = {}) => ({
  round: "2026-09-22",
  pillar: "Build to serve",
  options: { A: "Topic one", B: "Topic two", C: "Topic three" },
  counts: { A: 1, B: 4, C: 2 },
  winner: "B",
  post_url: "https://www.linkedin.com/feed/update/urn:li:share:1/",
  ...over,
});
const before = new Date("2026-10-01T10:00:00Z");
const site = "https://chrissgon.dev";

describe("parsePick", () => {
  it("reads the profile's format, keeps three counts and drops the pick ids and unknown fields", () => {
    const data = parsePick({ ...profile, extra: "x" })!;
    expect(data.counts).toEqual({ A: 2, B: 0, C: 1 });
    expect(JSON.stringify(data)).not.toMatch(/568356af85f64390|picks|extra/);
    expect(data.options.B).toBe(profile.options.B);
    // What the site keeps (with counts) reads back the same.
    expect(parsePick(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("reads a history of past rounds, dropping a post link that is not https on LinkedIn or this site", () => {
    const data = parsePick({ ...profile, history: [past(), past({ post_url: "javascript:alert(1)" }), past({ post_url: "https://evil.example/x" }), past({ winner: null, post_url: null })] })!;
    expect(data.history.map((h) => h.post_url)).toEqual(["https://www.linkedin.com/feed/update/urn:li:share:1/", null, null, null]);
    expect(safePostUrl("https://chrissgon.dev/writing/")).toBe("https://chrissgon.dev/writing/");
    expect(safePostUrl("http://www.linkedin.com/x")).toBeNull();
    expect(safePostUrl("https://linkedin.com.evil.example/x")).toBeNull();
    expect(safePostUrl("https://user:pw@www.linkedin.com/x")).toBeNull();
  });

  it("rejects malformed data as a whole", () => {
    const bad: unknown[] = [
      null,
      [],
      "text",
      { ...profile, open: "yes" },
      { ...profile, round: "2026-13-01" },
      { ...profile, closes: "2026-09-01" },
      { ...profile, pillar: "" },
      { ...profile, options: { A: "a", B: "b" } },
      { ...profile, options: { ...profile.options, C: 3 } },
      { ...profile, options: { ...profile.options, C: "line\nbreak" } },
      { ...profile, options: { ...profile.options, C: "zero\u200bwidth" } },
      { ...profile, options: { ...profile.options, C: "x".repeat(201) } },
      { ...profile, picks: { a: "D" } },
      { ...profile, picks: undefined },
      { ...profile, history: "none" },
      { ...profile, history: [past({ winner: "D" })] },
      { ...profile, history: [past({ counts: { A: -1, B: 0, C: 0 } })] },
      { ...profile, history: [past({ round: "yesterday" })] },
    ];
    for (const b of bad) expect(parsePick(b), JSON.stringify(b)).toBeNull();
  });

  it("refuses a file that is too large or not JSON at build, and reads a good one", () => {
    expect(fromBody("{")).toBe("the file is not JSON");
    expect(fromBody(" ".repeat(70_000))).toMatch(/larger than/);
    expect(fromBody(JSON.stringify({ ...profile, open: 1 }))).toBe("the file is not a valid pick round");
    expect(typeof fromBody(JSON.stringify(profile))).toBe("object");
  });

  it("has a valid committed snapshot without pick ids", () => {
    expect(pickSnapshot.pillar).toBe("AI built in public");
    expect(readPick({ root: "/nonexistent" })).toEqual(pickSnapshot);
  });
});

describe("pickView", () => {
  const data = parsePick(profile)!;

  it("shows the open round with its three topics and their issue links", () => {
    const view = pickView(data, before);
    expect(view.state).toBe("open");
    if (view.state !== "open") return;
    expect(view.options.map((o) => o.letter)).toEqual(["A", "B", "C"]);
    expect(view.options[1]!.topic).toBe(profile.options.B);
    expect(view.last).toBeNull();
  });

  it("closes the round at 12:00 UTC of its closing day and shows its result by the profile's rule", () => {
    expect(closesAt("2026-10-05").toISOString()).toBe("2026-10-05T12:00:00.000Z");
    expect(pickView(data, new Date("2026-10-05T11:59:59Z")).state).toBe("open");
    const due = pickView(data, new Date("2026-10-05T12:00:00Z"));
    expect(due).toEqual({ state: "closed", round: "2026-09-29", last: { topic: profile.options.A, url: null } });
  });

  it("picks the first letter on a tie and no winner without picks", () => {
    expect(winnerOf({ A: 1, B: 3, C: 3 })).toBe("B");
    expect(winnerOf({ A: 0, B: 0, C: 0 })).toBeNull();
  });

  it("shows a closed round's last winner, with its post when there is one", () => {
    const closed: PickData = { ...data, open: false, history: [past({ winner: null, post_url: null }), past()].map((h) => parsePick({ ...profile, history: [h] })!.history[0]!) };
    expect(pickView(closed, before)).toEqual({
      state: "closed",
      round: "2026-09-29",
      last: { topic: "Topic two", url: "https://www.linkedin.com/feed/update/urn:li:share:1/" },
    });
    const noPost = parsePick({ ...profile, open: false, history: [past({ post_url: null })] })!;
    expect(pickView(noPost, before)).toMatchObject({ state: "closed", last: { topic: "Topic two", url: null } });
  });

  it("shows a closed round with no winner at all, and an open round past its end with no pick as the last winner", () => {
    const empty = parsePick({ ...profile, open: false, history: [] })!;
    expect(pickView(empty, before)).toEqual({ state: "closed", round: "2026-09-29", last: null });
    const noPicks = parsePick({ ...profile, picks: {}, history: [past()] })!;
    expect(pickView(noPicks, new Date("2026-10-06T00:00:00Z"))).toMatchObject({ state: "closed", last: { topic: "Topic two" } });
  });

  it("gives a different key to a different view only", () => {
    const a = pickView(data, before);
    expect(viewKey(a)).toBe(viewKey(pickView(parsePick(profile)!, before)));
    expect(viewKey(a)).not.toBe(viewKey(pickView(data, new Date("2026-10-06T00:00:00Z"))));
  });
});

describe("issue links", () => {
  it("builds the same pre-filled issue the profile README links to", () => {
    expect(issueUrl("A")).toBe("https://github.com/chrissgon/chrissgon/issues/new?template=pick.yml&title=pick%3A%20A");
    expect(issueUrl("C")).toBe("https://github.com/chrissgon/chrissgon/issues/new?template=pick.yml&title=pick%3A%20C");
  });
});

describe("texts", () => {
  const data = parsePick({ ...profile, history: [past()] })!;

  it("writes dates as the rest of the site does", () => {
    for (const lang of ["en", "pt"] as const) expect(formatDay("2026-10-05", lang)).toBe(formatDate("2026-10-05", lang));
  });

  it("writes the section's llms.txt part, EN and PT", () => {
    const en = pickMarkdown(pickView(data, before), "en");
    expect(en).toContain("## Pick the next post\n");
    expect(en).toContain(
      "This week's slot is **AI built in public**. Pick the topic I write next: one pick per GitHub account, which you can change until the round closes on Oct 5, 2026.",
    );
    expect(en).toContain(`- A: [${profile.options.A}](${issueUrl("A")})`);
    expect(en).toContain("Last round you picked **Topic two**. [I wrote it](https://www.linkedin.com/feed/update/urn:li:share:1/).");
    const pt = pickMarkdown(pickView(data, before), "pt");
    expect(pt).toContain("## Escolha o próximo post\n");
    expect(pt).toContain("**IA construída em público**");
    expect(pt).toContain("5 out. 2026");
    const closed = pickMarkdown(pickView({ ...data, open: false }, before), "en");
    expect(closed).toContain("The next round opens on a Monday. Until then, the last result is below.");
    expect(closed).not.toContain("issues/new");
    expect(pickMarkdown({ state: "closed", round: "2026-09-29", last: null }, "en")).toContain("The next round opens on a Monday.\n");
    expect(pickMarkdown({ state: "closed", round: "2026-09-29", last: { topic: "T", url: null } }, "en")).toContain("Last round you picked **T**. I'm writing it now.");
  });

  it("takes no second full stop after a topic that ends a sentence", () => {
    const view = { state: "closed", round: "2026-09-29", last: { topic: "What I did instead.", url: null } } as const;
    expect(pickMarkdown(view, "en")).toContain("Last round you picked **What I did instead.** I'm writing it now.");
    expect(pickMarkdown(view, "pt")).toContain("Na última rodada, vocês escolheram **What I did instead.** Estou escrevendo agora.");
  });

  it("escapes Markdown in a topic", () => {
    const view = pickView(parsePick({ ...profile, options: { ...profile.options, A: "[x](https://evil.example)" } })!, before);
    expect(pickMarkdown(view, "en")).toContain("- A: [\\[x\\](https://evil.example)](");
  });

  it("puts the section in llms.txt after Writing", () => {
    const view = pickView(data, before);
    const en = llmsText("en", { site, npm: null, pick: view });
    expect(en.indexOf("## Pick the next post")).toBeGreaterThan(en.indexOf("## Writing"));
    expect(en.indexOf("## Pick the next post")).toBeLessThan(en.indexOf("## Trajectory"));
    expect(llmsText("pt", { site, npm: null, pick: view })).toContain("## Escolha o próximo post");
    expect(llmsText("en", { site, npm: null, pick: null })).not.toContain("## Pick the next post");
  });

  it("passes the sensitive-topics lock: labels, the snapshot and the queued round", () => {
    const keys = Object.keys(labels).filter((k) => k.startsWith("pick"));
    expect(keys.length).toBeGreaterThanOrEqual(9);
    for (const k of keys) for (const lang of ["en", "pt"] as const) expect(matchTopics(labels[k as keyof typeof labels][lang], sensitiveTopics), k).toEqual([]);
    expect(tripsLock(pickSnapshot)).toBe(false);
    expect(tripsLock(parsePick(profile)!)).toBe(false);
    // The round queued for 2026-10-05 (the profile's data/pick-queue.json, read on 2026-09-30).
    const queued = parsePick({
      ...profile,
      pillar: "Tech in conversation",
      options: {
        A: "600+ hours of live coding: what it taught me about explaining",
        B: 'What Erick Wendel\'s "not seen, not remembered" changed for me',
        C: "Working in English every day: what nobody warned me about",
      },
    })!;
    expect(tripsLock(queued)).toBe(false);
  });

  it("stops a refreshed round whose texts trip the lock", () => {
    expect(tripsLock(parsePick({ ...profile, options: { ...profile.options, B: "Who should win the election?" } })!)).toBe(true);
    expect(tripsLock(parsePick({ ...profile, history: [past({ options: { A: "My family", B: "b", C: "c" } })] })!)).toBe(true);
  });
});
