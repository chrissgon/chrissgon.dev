import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lab, posts, products, profile, projects, stats, trajectory } from "../src/data/index.ts";
import { isStale, readNpmCount } from "../src/data/npm.ts";
import { Posts, Profile, Project, parseData } from "../src/data/schema.ts";
import rawProfile from "../src/data/profile.ts";
import rawPosts from "../src/data/posts.json" with { type: "json" };

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

  it("rejects a field the schema does not declare (EDGE-1)", () => {
    expect(() => parseData(Profile, { ...rawProfile, employer: "x" }, "profile.ts")).toThrow(/Unrecognized key/);
  });

  it("rejects duplicate post ids and posts out of order, accepts an empty list", () => {
    expect(() => parseData(Posts, [post, post], "posts.json")).toThrow(/duplicate post id/);
    expect(() => parseData(Posts, [rawPosts[7], rawPosts[0]], "posts.json")).toThrow(/newest first/);
    expect(parseData(Posts, [], "posts.json")).toEqual([]);
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
