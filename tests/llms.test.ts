import { describe, expect, it } from "vitest";
import { posts, sensitiveTopics } from "../src/data/index.ts";
import { localePath } from "../src/lib/format.ts";
import { assertPublishable, forbiddenFields, jsonLd } from "../src/lib/jsonld.ts";
import { pickSnapshot } from "../src/data/pick.ts";
import { llmsText } from "../src/lib/llms.ts";
import { pickView } from "../src/lib/pick.ts";
import { matchTopics, withLocalExcludes } from "../src/lib/sensitive.ts";
import exclude from "../src/data/sensitive-exclude.json" with { type: "json" };

const site = "https://chrissgon.dev";
const npm = { downloads: 1014, start: "2026-08-30", end: "2026-09-28", package: "@chrissgon/perfectui" as const };

describe("llms.txt (REQ-3)", () => {
  const en = llmsText("en", { site, npm });
  const pt = llmsText("pt", { site, npm });

  it("has an H1, the label, links and the sections an agent looks for", () => {
    expect(en.startsWith("# Christopher Gonçalves\n")).toBe(true);
    expect(en).toContain("\n> Tech enthusiast & Senior Software Engineer · ");
    expect(en).toMatch(/\[GitHub\]\(https:\/\/github\.com\/chrissgon\)/);
    for (const h of ["## Products", "## Projects", "## Writing", "## Trajectory", "## Lab"]) expect(en).toContain(`\n${h}\n`);
    expect(en).toContain(posts[0]!.title.en!);
    expect(en.length).toBeGreaterThan(50);
  });

  it("writes the PT reading with PT headings and texts", () => {
    expect(pt).toContain("\n> Entusiasta de tecnologia e Engenheiro de Software Sênior · ");
    for (const h of ["## Produtos", "## Projetos", "## Escrita"]) expect(pt).toContain(`\n${h}\n`);
    expect(pt).toContain("1.014 downloads de 2026-08-30 a 2026-09-28");
    expect(pt).toContain(`${site}/pt/projects/`);
  });

  it("announces the read-only MCP server with the approved label, in both languages (REQ-4)", () => {
    expect(en).toContain("\n## For agents\n");
    expect(en).toContain(`- [Connect your agent to this site](${site}/api/mcp): MCP, Streamable HTTP, POST (get_profile, list_products, list_posts)`);
    expect(pt).toContain("\n## Para agentes\n");
    expect(pt).toContain(`- [Conecte seu agente a este site](${site}/api/mcp)`);
    expect(en).toMatch(/- mcp-live: .*\(Code: https:\/\/github\.com\/chrissgon\/chrissgon\.dev\/blob\/main\/netlify\/functions\/mcp\.mts\)/);
  });

  it("gives each topic of the pick round its count of picks, in the file's language", () => {
    const pick = pickView(pickSnapshot, new Date("2026-10-01T10:00:00Z"));
    const lines = (text: string) => text.split("\n").filter((l) => /^- [ABC]: /.test(l)).map((l) => l.slice(l.lastIndexOf("(")));
    expect(lines(llmsText("en", { site, npm, pick }))).toEqual(["(1 pick)", "(0 picks)", "(0 picks)"]);
    expect(lines(llmsText("pt", { site, npm, pick }))).toEqual(["(1 escolha)", "(0 escolhas)", "(0 escolhas)"]);
  });

  it("shows the npm count only when there is one", () => {
    expect(en).toContain("1,014 downloads from 2026-08-30 to 2026-09-28");
    expect(llmsText("en", { site, npm: null })).not.toContain("downloads");
  });

  it("contains no sensitive topic", () => {
    const topics = withLocalExcludes(sensitiveTopics, exclude);
    expect(matchTopics(en, topics)).toEqual([]);
    expect(matchTopics(pt, topics)).toEqual([]);
  });

  it("is the same for the same data", () => {
    expect(llmsText("en", { site, npm })).toBe(en);
  });
});

describe("JSON-LD (REQ-5)", () => {
  const doc = jsonLd(site);

  it("has one Person and at least one SoftwareSourceCode by that person", () => {
    const types = doc["@graph"].map((n) => n["@type"]);
    expect(types.filter((t) => t === "Person")).toHaveLength(1);
    expect(types.filter((t) => t === "SoftwareSourceCode").length).toBeGreaterThanOrEqual(1);
    expect(forbiddenFields(doc)).toEqual([]);
  });

  it("flags a forbidden Person field", () => {
    const bad = { ...doc, "@graph": [{ ...doc["@graph"][0]!, worksFor: "x" }] } as unknown as typeof doc;
    expect(forbiddenFields(bad)).toEqual(["jsonld: forbidden field worksFor"]);
  });

  it("stops the build on a forbidden Person field and passes a clean document", () => {
    const bad = { ...doc, "@graph": [{ ...doc["@graph"][0]!, birthDate: "x" }] } as unknown as typeof doc;
    expect(() => assertPublishable(bad)).toThrow("jsonld: forbidden field birthDate");
    expect(assertPublishable(doc)).toBe(doc);
  });
});

describe("localePath (ADR-0010)", () => {
  it("puts EN at the root and PT under /pt/, with a trailing slash", () => {
    expect(localePath("en", "/")).toBe("/");
    expect(localePath("pt", "/")).toBe("/pt/");
    expect(localePath("en", "/projects")).toBe("/projects/");
    expect(localePath("pt", "/writing/")).toBe("/pt/writing/");
  });
});
