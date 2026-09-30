import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lab, labels, posts, products, profile, projects, stats, trajectory } from "../src/data/index.ts";
import { isStale, readNpmCount } from "../src/data/npm.ts";
import { Posts, Profile, Project, Trajectory, parseData } from "../src/data/schema.ts";
import rawTrajectory from "../src/data/trajectory.ts";
import rawProfile from "../src/data/profile.ts";
import rawPosts from "../src/data/posts.json" with { type: "json" };
import { DRAWN_PROJECTS } from "../src/lib/project-visuals.ts";

const post = rawPosts[0]!;

describe("data module", () => {
  it("validates every entity on import", () => {
    expect(profile.name).toBe("Christopher Gonçalves");
    expect(products.map((p) => p.id)).toEqual(["perfectui", "ai-workbench"]);
    expect(projects.filter((p) => p.status === "ready")).toHaveLength(6);
    expect(projects.filter((p) => p.status === "in-progress")).toHaveLength(4);
    expect(posts).toHaveLength(8);
    expect(trajectory.entries.length).toBeGreaterThan(0);
    expect(lab).toHaveLength(5);
    expect(stats).toHaveLength(4);
  });

  it("keeps the approved label verbatim when its parts are joined", () => {
    expect(profile.label.en.join(" · ")).toBe(
      "Tech enthusiast & Senior Software Engineer · Building tech that serves people · Creator of Perfect UI & ai-workbench",
    );
    expect(profile.label.pt.join(" · ")).toBe(
      "Entusiasta de tecnologia e Engenheiro de Software Sênior · Construindo tecnologia que serve as pessoas · Criador da Perfect UI e do ai-workbench",
    );
  });

  it("has the approved About: paragraphs 1 and 2 verbatim, then the 600+ hours paragraph", () => {
    expect(profile.about.en).toHaveLength(3);
    expect(profile.about.pt).toHaveLength(3);
    expect(profile.about.en[0]).toBe(
      "I build tech that serves people, and I talk about how I build it. I grew up in a favela in São Paulo's north zone and met my first computer at 6 or 7. I haven't stopped learning since.",
    );
    expect(profile.about.pt[1]).toBe(
      "Hoje sou engenheiro de software sênior, com mais de 6 anos entregando frontends em produção, e continuo empolgado como no primeiro dia.",
    );
    expect(profile.about.en[2]).toMatch(/^I've done 600\+ hours/);
  });

  it("has every proof in EN and PT and rejects a proof without PT", () => {
    for (const p of trajectory.proofs) expect(p.pt.length).toBeGreaterThan(0);
    expect(trajectory.proofs.at(-1)).toEqual({ en: "600+ hours of live coding", pt: "600+ horas de live coding" });
    const bad = { ...rawTrajectory, proofs: [{ en: "only EN" }] };
    expect(() => parseData(Trajectory, bad, "trajectory.ts")).toThrow(/proofs\.0\.pt/);
  });

  it("has the approved PT label for the llms.txt link", () => {
    expect(labels.readLlms).toEqual({ en: "Read the llms.txt", pt: "Leia o llms.txt" });
  });

  it("rejects a field the schema does not declare (EDGE-1)", () => {
    expect(() => parseData(Profile, { ...rawProfile, employer: "x" }, "profile.ts")).toThrow(/Unrecognized key/);
  });

  it("rejects duplicate post ids and posts out of order, accepts an empty list", () => {
    expect(() => parseData(Posts, [post, post], "posts.json")).toThrow(/duplicate post id/);
    expect(() => parseData(Posts, [rawPosts[7], rawPosts[0]], "posts.json")).toThrow(/newest first/);
    expect(parseData(Posts, [], "posts.json")).toEqual([]);
  });

  it("requires a LinkedIn link on every post", () => {
    for (const p of posts) expect(p.url).toMatch(/^https:\/\/(www|pt)\.linkedin\.com\/posts\/chrissgon_/);
    const { url: _url, ...withoutUrl } = post;
    expect(() => parseData(Posts, [withoutUrl], "posts.json")).toThrow(/url/);
  });

  it("rejects a post link outside LinkedIn and a language without a title", () => {
    expect(() => parseData(Posts, [{ ...post, url: "https://example.com/p" }], "posts.json")).toThrow(/linkedin/);
    expect(() => parseData(Posts, [{ ...post, title: { en: "Only EN" } }], "posts.json")).toThrow(/title/);
  });

  it("keeps projects in progress without links and ready projects with one", () => {
    const base = projects.find((p) => p.status === "in-progress")!;
    expect(() => parseData(Project, { ...base, links: [{ label: "x", url: "https://example.com" }] }, "projects.ts")).toThrow(
      /in progress has no link/,
    );
    const ready = projects.find((p) => p.status === "ready")!;
    expect(() => parseData(Project, { ...ready, links: [] }, "projects.ts")).toThrow(/ready project needs/);
  });

  it("gives every project an image file or a generated card, never a pending one (EDGE-5)", () => {
    for (const p of projects) expect(["file", "generated"]).toContain(p.image.kind);
    const ready = projects.find((p) => p.status === "ready")!;
    expect(() => parseData(Project, { ...ready, image: { kind: "pending", note: "x" } }, "projects.ts")).toThrow(/image/);
    const { image: _image, ...withoutImage } = ready;
    expect(() => parseData(Project, withoutImage, "projects.ts")).toThrow(/image/);
    const byId = Object.fromEntries(projects.map((p) => [p.id, p.image]));
    expect(byId["perfectui"]).toEqual({ kind: "file", src: "projects/perfectui.webp" });
    expect(byId["goddd"]).toEqual({ kind: "file", src: "projects/goddd.png" });
    expect(byId["doc-git-patterns"]).toEqual({ kind: "file", src: "projects/doc-git-patterns.png" });
    expect(byId["ai-workbench"]).toEqual({ kind: "generated" });
    expect(byId["doc-github-workflow"]).toEqual({ kind: "generated" });
  });

  it("draws a cover for every generated project, in the brand's colours only, with no placeholder", () => {
    const generated = projects.filter((p) => p.image.kind === "generated").map((p) => p.id);
    expect([...DRAWN_PROJECTS].sort()).toEqual([...generated].sort());
    const visual = readFileSync(new URL("../src/components/ProjectVisual.astro", import.meta.url), "utf8");
    // Each drawing but the fallback pipeline (doc-github-workflow) has its own branch.
    for (const id of DRAWN_PROJECTS.filter((x) => x !== "doc-github-workflow" && x !== "ai-workbench")) {
      expect(visual).toContain(`id === "${id}"`);
    }
    expect(visual).toContain('aria-hidden="true"');
    for (const [c] of visual.matchAll(/#[0-9A-Fa-f]{6}\b/g)) expect(["#FFFFFF", "#374151"]).toContain(c.toUpperCase());
    expect(visual).not.toMatch(/07B6F0|pui-theme|gradient|shadow|<image|<img|cover ·/i);
  });

  it("points every cover and project image at a file in src/assets (EDGE-5)", () => {
    const paths = [
      ...posts.map((p) => p.cover),
      ...projects.flatMap((p) => (p.image?.kind === "file" ? [p.image.src] : [])),
    ];
    for (const p of paths) expect(existsSync(join("src/assets", p)), p).toBe(true);
  });
});

describe("npm count (ADR-0003)", () => {
  const count = { downloads: 1014, start: "2026-08-30", end: "2026-09-28", package: "@chrissgon/perfectui" as const };

  it("is stale after 35 days", () => {
    expect(isStale(count, new Date("2026-10-30T00:00:00Z"))).toBe(false);
    expect(isStale(count, new Date("2026-11-03T00:00:00Z"))).toBe(true);
  });

  it("falls back to the snapshot and omits a stale number", () => {
    const root = mkdtempSync(join(tmpdir(), "npm-"));
    expect(readNpmCount({ root, today: new Date("2026-09-30T00:00:00Z") })?.downloads).toBe(1014);
    expect(readNpmCount({ root, today: new Date("2027-01-01T00:00:00Z") })).toBeNull();
  });

  it("prefers the file written at build", () => {
    const root = mkdtempSync(join(tmpdir(), "npm-"));
    mkdirSync(join(root, "src/data/generated"), { recursive: true });
    writeFileSync(join(root, "src/data/generated/npm.json"), JSON.stringify({ ...count, downloads: 2000, end: "2026-09-29" }));
    expect(readNpmCount({ root, today: new Date("2026-09-30T00:00:00Z") })?.downloads).toBe(2000);
  });
});
