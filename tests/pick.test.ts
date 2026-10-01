import { afterEach, describe, expect, it, vi } from "vitest";
import { fromBody } from "../scripts/fetch-pick.ts";
import { pickSnapshot, readPick } from "../src/data/pick.ts";
import { labels, sensitiveTopics } from "../src/data/index.ts";
import { formatDate } from "../src/lib/format.ts";
import { llmsText } from "../src/lib/llms.ts";
import {
  closesAt,
  countText,
  formatDay,
  issueUrl,
  parsePick,
  pickMarkdown,
  pickView,
  safePostUrl,
  viewKey,
  winnerOf,
  type PickData,
  type PickView,
} from "../src/lib/pick.ts";
import { matchTopics } from "../src/lib/sensitive.ts";
import { refreshPick, tripsLock } from "../src/scripts/pick-refresh.ts";

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

  it("counts the accounts that picked each topic, from the hashed-id map only", () => {
    const view = pickView(data, before);
    expect(view.options.map((o) => o.count)).toEqual([2, 0, 1]);
    const none = pickView(parsePick({ ...profile, picks: {} })!, before);
    expect(none.options.map((o) => o.count)).toEqual([0, 0, 0]);
    // An issue's text is never a source: unknown fields are dropped before the view is built.
    const noisy = pickView(parsePick({ ...profile, issues: [{ title: "pick: B" }, { title: "pick: B" }] })!, before);
    expect(noisy.options.map((o) => o.count)).toEqual([2, 0, 1]);
  });

  it("closes the round at 12:00 UTC of its closing day and shows its result by the profile's rule", () => {
    expect(closesAt("2026-10-05").toISOString()).toBe("2026-10-05T12:00:00.000Z");
    expect(pickView(data, new Date("2026-10-05T11:59:59Z")).state).toBe("open");
    const due = pickView(data, new Date("2026-10-05T12:00:00Z"));
    expect(due).toEqual({
      state: "closed",
      round: "2026-09-29",
      options: [
        { letter: "A", topic: profile.options.A, count: 2 },
        { letter: "B", topic: profile.options.B, count: 0 },
        { letter: "C", topic: profile.options.C, count: 1 },
      ],
      last: { topic: profile.options.A, url: null },
    });
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
      // The final counts of the round the winner comes from, not of the round without one before it.
      options: [
        { letter: "A", topic: "Topic one", count: 1 },
        { letter: "B", topic: "Topic two", count: 4 },
        { letter: "C", topic: "Topic three", count: 2 },
      ],
      last: { topic: "Topic two", url: "https://www.linkedin.com/feed/update/urn:li:share:1/" },
    });
    const noPost = parsePick({ ...profile, open: false, history: [past({ post_url: null })] })!;
    expect(pickView(noPost, before)).toMatchObject({ state: "closed", last: { topic: "Topic two", url: null } });
  });

  it("shows a closed round with no winner at all, and an open round past its end with no pick as the last winner", () => {
    const empty = parsePick({ ...profile, open: false, history: [] })!;
    expect(pickView(empty, before)).toEqual({ state: "closed", round: "2026-09-29", options: [], last: null });
    const noPicks = parsePick({ ...profile, picks: {}, history: [past()] })!;
    const view = pickView(noPicks, new Date("2026-10-06T00:00:00Z"));
    expect(view).toMatchObject({ state: "closed", last: { topic: "Topic two" } });
    expect(view.options.map((o) => `${o.topic} ${o.count}`)).toEqual(["Topic one 1", "Topic two 4", "Topic three 2"]);
  });

  it("gives a different key to a different view only", () => {
    const a = pickView(data, before);
    expect(viewKey(a)).toBe(viewKey(pickView(parsePick(profile)!, before)));
    expect(viewKey(a)).not.toBe(viewKey(pickView(data, new Date("2026-10-06T00:00:00Z"))));
    // One more pick in the same round is a different view, so the page redraws the counts.
    expect(viewKey(a)).not.toBe(viewKey(pickView(parsePick({ ...profile, picks: { ...profile.picks, "00000000000000aa": "B" } })!, before)));
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
    expect(en).toContain(`- A: [${profile.options.A}](${issueUrl("A")}) (2 picks)\n- B: [${profile.options.B}](${issueUrl("B")}) (0 picks)\n- C: [${profile.options.C}](${issueUrl("C")}) (1 pick)\n`);
    expect(en).toContain("Last round you picked **Topic two**. [I wrote it](https://www.linkedin.com/feed/update/urn:li:share:1/).");
    const pt = pickMarkdown(pickView(data, before), "pt");
    expect(pt).toContain("## Escolha o próximo post\n");
    expect(pt).toContain("**IA construída em público**");
    expect(pt).toContain("5 out. 2026");
    expect(pt).toContain(`](${issueUrl("A")}) (2 escolhas)\n`);
    expect(pt).toContain(`](${issueUrl("B")}) (0 escolhas)\n`);
    expect(pt).toContain(`](${issueUrl("C")}) (1 escolha)\n`);
    const closed = pickMarkdown(pickView({ ...data, open: false }, before), "en");
    expect(closed).toContain("The next round opens on a Monday. Until then, the last result is below.");
    expect(closed).not.toContain("issues/new");
    // A closed round keeps the final counts of the last round, above its winner.
    expect(closed).toContain("below.\n\n- A: Topic one (1 pick)\n- B: Topic two (4 picks)\n- C: Topic three (2 picks)\n\nLast round you picked **Topic two**.");
    expect(pickMarkdown(pickView({ ...data, open: false }, before), "pt")).toContain("- A: Topic one (1 escolha)\n- B: Topic two (4 escolhas)\n");
    expect(pickMarkdown({ state: "closed", round: "2026-09-29", options: [], last: null }, "en")).toBe("## Pick the next post\n\nThe next round opens on a Monday.\n");
    expect(pickMarkdown({ state: "closed", round: "2026-09-29", options: [], last: { topic: "T", url: null } }, "en")).toContain("Last round you picked **T**. I'm writing it now.");
  });

  it("writes a count in the singular for one pick only, EN and PT", () => {
    expect([0, 1, 2, 11].map((n) => countText(n, "en"))).toEqual(["0 picks", "1 pick", "2 picks", "11 picks"]);
    expect([0, 1, 2, 11].map((n) => countText(n, "pt"))).toEqual(["0 escolhas", "1 escolha", "2 escolhas", "11 escolhas"]);
  });

  it("takes no second full stop after a topic that ends a sentence", () => {
    const view: PickView = { state: "closed", round: "2026-09-29", options: [], last: { topic: "What I did instead.", url: null } };
    expect(pickMarkdown(view, "en")).toContain("Last round you picked **What I did instead.** I'm writing it now.");
    expect(pickMarkdown(view, "pt")).toContain("Na última rodada, vocês escolheram **What I did instead.** Estou escrevendo agora.");
  });

  it("escapes Markdown in a topic", () => {
    const view = pickView(parsePick({ ...profile, options: { ...profile.options, A: "[x](https://evil.example)" } })!, before);
    expect(pickMarkdown(view, "en")).toContain("- A: [\\[x\\](https://evil.example)](");
    const closed = pickMarkdown(pickView(parsePick({ ...profile, open: false, history: [past({ options: { A: "[x](https://evil.example)", B: "b", C: "c" } })] })!, before), "en");
    expect(closed).toContain("- A: \\[x\\](https://evil.example) (1 pick)");
  });

  it("puts the section in llms.txt after Writing", () => {
    const view = pickView(data, before);
    const en = llmsText("en", { site, npm: null, pick: view });
    expect(en.indexOf("## Pick the next post")).toBeGreaterThan(en.indexOf("## Writing"));
    expect(en.indexOf("## Pick the next post")).toBeLessThan(en.indexOf("## Trajectory"));
    expect(llmsText("pt", { site, npm: null, pick: view })).toContain("## Escolha o próximo post");
    expect(llmsText("en", { site, npm: null, pick: null })).not.toContain("## Pick the next post");
    // The counts are in both files, each in its language.
    expect(en).toContain("(2 picks)");
    expect(llmsText("pt", { site, npm: null, pick: view })).toContain("(2 escolhas)");
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

// The page's refresh (src/scripts/pick-refresh.ts) on the smallest document it needs: elements that keep their
// class, attributes and children, so the test reads what a visitor would see.
class FakeEl {
  className = "";
  href = "";
  target = "";
  rel = "";
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  children: (FakeEl | string)[] = [];
  constructor(readonly tag: string) {}
  append(...c: (FakeEl | string)[]) {
    this.children.push(...c);
  }
  replaceChildren(...c: (FakeEl | string)[]) {
    this.children = c;
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  querySelector(sel: string): FakeEl | null {
    return this.all(sel.replace(/^\.|^\[|\]$/g, ""))[0] ?? null;
  }
  get textContent(): string {
    return this.children.map((c) => (typeof c === "string" ? c : c.textContent)).join("");
  }
  set textContent(v: string) {
    this.children = [v];
  }
  /** Descendants carrying a class (or, for the section's two hooks, that name as a class). */
  all(cls: string): FakeEl[] {
    return this.children.flatMap((c) => (typeof c === "string" ? [] : [...(c.className.split(" ").includes(cls) ? [c] : []), ...c.all(cls)]));
  }
}

describe("refreshPick", () => {
  const data = parsePick(profile)!;
  afterEach(() => vi.unstubAllGlobals());

  /** A section as the build left it for `built`, and a fetch answering with `body` (a string is sent as it is). */
  function page(built: PickData, body: unknown, lang = "en", ok = true) {
    const view = pickView(built, before);
    const section = new FakeEl("section");
    section.dataset = { pick: viewKey(view), round: view.round };
    const main = new FakeEl("div");
    main.className = "data-pick-body";
    main.append("as built");
    const reading = new FakeEl("pre");
    reading.className = "agent-text";
    section.append(main, reading);
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeEl(tag), documentElement: { lang } });
    const fetch = vi.fn(async () => {
      if (body instanceof Error) throw body;
      return { ok, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
    });
    vi.stubGlobal("fetch", fetch);
    const run = (now = before) => refreshPick(section as unknown as HTMLElement, now);
    return { run, main, reading, section, fetch };
  }
  const counts = (p: { main: FakeEl }) => p.main.all("pick-count").map((c) => `${c.className}: ${c.textContent}`);

  it("redraws the counts when the same round has new picks, singular and plural, EN and PT", async () => {
    const live = { ...profile, picks: { a1: "A", b1: "B", b2: "B", b3: "B" } };
    const en = page(data, live);
    await en.run();
    expect(en.fetch).toHaveBeenCalledOnce();
    expect(counts(en)).toEqual(["pick-count mono: 1 pick", "pick-count mono: 3 picks", "pick-count mono: 0 picks"]);
    expect(en.main.all("pick-topic").map((t) => t.textContent)).toEqual(Object.values(profile.options));
    expect(en.main.all("pui-btn").map((a) => a.href)).toEqual([issueUrl("A"), issueUrl("B"), issueUrl("C")]);
    expect(en.reading.textContent).toContain(`(${issueUrl("B")}) (3 picks)`);
    expect(en.section.dataset.pick).toBe(viewKey(pickView(parsePick(live)!, before)));
    const pt = page(data, live, "pt-BR");
    await pt.run();
    expect(counts(pt)).toEqual(["pick-count mono: 1 escolha", "pick-count mono: 3 escolhas", "pick-count mono: 0 escolhas"]);
    expect(pt.reading.textContent).toContain("(3 escolhas)");
  });

  it("leaves the build's section alone when nothing changed", async () => {
    const same = page(data, profile);
    await same.run();
    expect(same.main.textContent).toBe("as built");
  });

  it("keeps the build's counts when the live file fails, is malformed, too large, older or trips the lock", async () => {
    const bad: [unknown, boolean?][] = [
      [new Error("offline")],
      [{ ...profile, picks: { a1: "A" } }, false],
      ["{"],
      [" ".repeat(70_000)],
      [{ ...profile, picks: { a1: "D" } }],
      [{ ...profile, picks: ["A", "A"] }],
      [{ ...profile, picks: { a1: "A" }, options: { A: "a", B: "b" } }],
      [{ ...profile, picks: {}, round: "2026-09-22", closes: "2026-09-28" }],
      [{ ...profile, picks: {}, options: { ...profile.options, B: "Who should win the election?" } }],
    ];
    for (const [body, ok] of bad) {
      const p = page(data, body, "en", ok ?? true);
      await p.run();
      expect(p.main.textContent, JSON.stringify(body)).toBe("as built");
      expect(p.reading.textContent).toBe("");
      expect(p.section.dataset.pick).toBe(viewKey(pickView(data, before)));
    }
  });

  it("shows a closed round's final counts without pick links, and a new round's counts from zero", async () => {
    const closed = page(data, { ...profile, open: false, picks: {}, history: [past({ round: profile.round, options: profile.options, counts: { A: 1, B: 2, C: 0 } })] });
    await closed.run();
    expect(counts(closed)).toEqual(["pick-count mono: 1 pick", "pick-count mono: 2 picks", "pick-count mono: 0 picks"]);
    expect(closed.main.all("pui-btn")).toEqual([]);
    expect(closed.main.all("pick-last")[0]!.textContent).toBe(`Last round you picked ${profile.options.B} I wrote it.`);
    const next = page(data, { ...profile, round: "2026-10-06", closes: "2026-10-12", picks: {} });
    await next.run(new Date("2026-10-06T10:00:00Z"));
    expect(counts(next)).toEqual(["pick-count mono: 0 picks", "pick-count mono: 0 picks", "pick-count mono: 0 picks"]);
    expect(next.main.all("pui-btn")).toHaveLength(3);
    expect(next.section.dataset.round).toBe("2026-10-06");
  });
});
