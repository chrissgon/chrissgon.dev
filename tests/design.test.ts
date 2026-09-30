// Logic behind design direction A: the numbers count-up, the dates of the writing page, the view-as-agent
// readings (parts of llms.txt), the perfectui-live showcase and the label blocks.
import { describe, expect, it } from "vitest";
import { approved, provisional } from "../src/data/labels.ts";
import { countLabel, formatDate, splitFigure, splitProducts } from "../src/lib/format.ts";
import { products, profile } from "../src/data/index.ts";
import { COUNT_MS, STAGGER_MS, easeOut, frame, parseFigure, progressAt } from "../src/lib/countup.ts";
import { LLMS_PARTS, llmsParts, llmsText } from "../src/lib/llms.ts";
import { MODAL_EXAMPLE, SHOWCASE_IDS, productButtons, showcase } from "../src/lib/showcase.ts";
import { resolveStats } from "../src/lib/stats.ts";

const site = "https://chrissgon.dev";
const npm = { downloads: 1014, start: "2026-08-30", end: "2026-09-28", package: "@chrissgon/perfectui" as const };
const workbench = { skills: 47, agents: 4, adapters: 3, tree: "18b585ba0b82409c9bc59d4f4a385c6a5bb6abe3", date: "2026-09-30" };

describe("numbers count-up", () => {
  it.each([
    ["1,014", "en", 1014, 0],
    ["1.014", "pt", 1014, 0],
    ["3.7 kB", "en", 3.7, 1],
    ["3,7 kB", "pt", 3.7, 1],
    ["600+ hours", "en", 600, 0],
    ["600+ horas", "pt", 600, 0],
    ["47", "en", 47, 0],
  ] as const)("reads %s (%s)", (text, lang, value, decimals) => {
    const f = parseFigure(text, lang)!;
    expect(f.value).toBe(value);
    expect(f.decimals).toBe(decimals);
    expect(frame(f, 1)).toBe(text);
  });

  it("starts at zero with the figure's own format and never overshoots", () => {
    expect(frame(parseFigure("1,014", "en")!, 0)).toBe("0");
    expect(frame(parseFigure("3,7 kB", "pt")!, 0)).toBe("0,0 kB");
    expect(frame(parseFigure("600+ hours", "en")!, 0.5)).toMatch(/^\d{3}\+ hours$/);
    const f = parseFigure("1.014", "pt")!;
    for (let p = 0; p <= 1; p += 0.05) expect(Number(frame(f, p).replace(".", ""))).toBeLessThanOrEqual(1014);
  });

  it("leaves a text without a number alone", () => {
    expect(parseFigure("n/a", "en")).toBeNull();
  });

  it("counts for 1.8 s per number, each cell 150 ms after the one before", () => {
    expect(COUNT_MS).toBe(1800);
    expect(STAGGER_MS).toBe(150);
    expect(progressAt(0, 0)).toBe(0);
    expect(progressAt(900, 0)).toBe(0.5);
    expect(progressAt(1800, 0)).toBe(1);
    expect(progressAt(5000, 0)).toBe(1);
    expect(progressAt(150, 1)).toBe(0);
    expect(progressAt(100, 3)).toBe(0);
    expect(progressAt(450 + 900, 3)).toBe(0.5);
    expect(progressAt(450 + 1800, 3)).toBe(1);
  });

  it("eases out: fast start, slow finish", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    // The last fifth of the time covers under 1 % of the way, so the final digits are seen settling.
    expect(1 - easeOut(0.8)).toBeLessThan(0.01);
    for (let p = 0; p < 1; p += 0.01) expect(easeOut(p + 0.01)).toBeGreaterThanOrEqual(easeOut(p));
  });

  it.each([
    ["1,014", "en", /^(\d|[1-9]\d{1,2}|1,0\d\d)$/],
    ["1.014", "pt", /^(\d|[1-9]\d{1,2}|1\.0\d\d)$/],
    ["3.7", "en", /^\d\.\d$/],
    ["3,7", "pt", /^\d,\d$/],
    ["600+", "en", /^\d{1,3}\+$/],
    ["48", "pt", /^\d{1,2}$/],
  ] as const)("keeps the %s (%s) format at every frame and ends exactly on it", (text, lang, shape) => {
    const f = parseFigure(text, lang)!;
    for (let t = 0; t <= 2400; t += 16) {
      const p = progressAt(t, 3);
      const shown = frame(f, p);
      expect(shown).toMatch(shape);
      if (p >= 1) expect(shown).toBe(text);
    }
    expect(frame(f, progressAt(COUNT_MS + 3 * STAGGER_MS, 3))).toBe(text);
  });

  it("shows the decimals counting: 3,7 in PT passes through tenths", () => {
    const f = parseFigure("3,7", "pt")!;
    const seen = new Set<string>();
    for (let t = 0; t <= COUNT_MS; t += 16) seen.add(frame(f, progressAt(t, 0)));
    expect(seen.size).toBeGreaterThanOrEqual(20);
    expect(seen).toContain("0,0");
    expect(seen).toContain("3,7");
  });
});

describe("dates and counts of the writing page", () => {
  it("writes Sep 29, 2026 in EN and 29 set. 2026 in PT (site-writing.md)", () => {
    expect(formatDate("2026-09-29", "en")).toBe("Sep 29, 2026");
    expect(formatDate("2026-09-29", "pt")).toBe("29 set. 2026");
    expect(formatDate("2022-11-04", "en")).toBe("Nov 4, 2022");
  });

  it("uses the singular for one", () => {
    expect(countLabel(1, "en", "comment", "comments")).toBe("1 comment");
    expect(countLabel(10, "pt", "comment", "comments")).toBe("10 comentários");
    expect(countLabel(1, "pt", "reaction", "reactions")).toBe("1 reação");
  });
});

describe("view as agent: each region reads its part of llms.txt", () => {
  for (const lang of ["en", "pt"] as const) {
    const parts = llmsParts(lang, { site, npm, workbench });
    const text = llmsText(lang, { site, npm, workbench });

    it(`${lang}: the parts, in order, are llms.txt`, () => {
      expect(LLMS_PARTS.map((p) => parts[p]).join("\n")).toBe(text);
      for (const p of LLMS_PARTS) expect(text).toContain(parts[p]);
    });

    it(`${lang}: every region part starts with its heading and holds no markup`, () => {
      expect(parts.head.startsWith("# Christopher Gonçalves\n")).toBe(true);
      for (const p of LLMS_PARTS.filter((x) => x !== "head")) expect(parts[p]).toMatch(/^## \S/);
      for (const p of LLMS_PARTS) expect(parts[p]).not.toMatch(/<[a-z]/i);
    });

    it(`${lang}: the numbers part lists every figure shown on the page`, () => {
      for (const s of resolveStats(lang, { npm, workbench })) expect(parts.numbers).toContain(`- ${s.value}: ${s.label}`);
    });
  }

  it("the PT numbers use PT figures", () => {
    const pt = llmsParts("pt", { site, npm, workbench }).numbers;
    expect(pt).toContain("- 1.014: downloads no npm no último mês");
    expect(pt).toContain("- 3,7 kB: Perfect UI, gzip, sem dependências");
    expect(pt).toContain("- 600+ horas: de live coding com público");
  });
});

describe("perfectui-live showcase", () => {
  const stats = resolveStats("en", { npm, workbench });
  const items = showcase("en", site, stats);

  it("has the five tabs in order", () => {
    expect(items.map((i) => i.id)).toEqual([...SHOWCASE_IDS]);
    expect(items.map((i) => i.name)).toEqual(["Button", "Card", "Modal", "Switch", "Table"]);
  });

  it("shows the hero's own buttons, the design system's modal verbatim and the approved switch label", () => {
    expect(items[0]!.html).toBe(productButtons());
    expect(items[0]!.html).toContain('<a class="pui-btn pui-solid pui-theme" href="https://perfectui.dev">Perfect UI</a>');
    expect(items[2]!.html).toBe(MODAL_EXAMPLE);
    expect(MODAL_EXAMPLE).toContain('<dialog class="pui-modal" id="notify" closedby="any" aria-labelledby="notify-title">');
    expect(items[3]!.html).toBe('<label><input type="checkbox" class="pui-switch"> view as agent</label>');
    expect(showcase("pt", site, stats)[3]!.html).toContain("ver como agente");
  });

  it("builds the table from the numbers strip and the card from the approved labels", () => {
    for (const s of stats) expect(items[4]!.html).toContain(`<tr><td>${s.value}</td><td>${s.label}</td></tr>`);
    expect(items[1]!.html).toContain("Connect your agent to this site");
    expect(items[1]!.html).toContain(`<code>${site}/api/mcp</code>`);
    expect(showcase("pt", site, stats)[1]!.html).toContain("Conecte seu agente a este site");
  });
});

describe("labels", () => {
  it("holds the 24 labels approved on 2026-09-30 in the approved block", () => {
    const moved = [
      "about", "products", "numbers", "trajectory", "proofs", "education", "profiles", "latestWriting", "allWriting",
      "allProjects", "byType", "byStatus", "byStack", "before", "now", "noPosts", "sourcePending", "cardSkills",
      "cardAgents", "cardAdapters", "langName", "otherLang", "portraitAlt", "homeDescription",
    ];
    expect(moved).toHaveLength(24);
    for (const k of moved) expect(Object.keys(approved)).toContain(k);
    for (const k of moved) expect(Object.keys(provisional)).not.toContain(k);
  });

  it("keeps a key in one block only", () => {
    const both = Object.keys(approved).filter((k) => k in provisional);
    expect(both).toEqual([]);
  });
});

describe("Claude Design home", () => {
  const names = products.map((p) => p.name);

  it("puts the two product buttons inside the approved label, EN and PT", () => {
    expect(splitProducts(profile.label.en[2], names)).toEqual([
      { text: "Creator of " },
      { product: "Perfect UI" },
      { text: " & " },
      { product: "ai-workbench" },
    ]);
    expect(splitProducts(profile.label.pt[2], names)).toEqual([
      { text: "Criador da " },
      { product: "Perfect UI" },
      { text: " e do " },
      { product: "ai-workbench" },
    ]);
  });

  it("keeps a label without product names as one text", () => {
    expect(splitProducts("Building tech that serves people", names)).toEqual([{ text: "Building tech that serves people" }]);
  });

  it("splits each figure of the numbers strip into number and unit", () => {
    expect(splitFigure("3.7 kB")).toEqual(["3.7", "kB"]);
    expect(splitFigure("3,7 kB")).toEqual(["3,7", "kB"]);
    expect(splitFigure("600+ hours")).toEqual(["600+", "hours"]);
    expect(splitFigure("1,014")).toEqual(["1,014", ""]);
    expect(splitFigure("n/a")).toEqual(["n/a", ""]);
  });

  it("the split number still counts up to itself", () => {
    for (const [text, lang] of [["3.7", "en"], ["600+", "en"], ["1.014", "pt"]] as const) {
      const f = parseFigure(text, lang)!;
      expect(frame(f, 1)).toBe(text);
    }
  });
});
