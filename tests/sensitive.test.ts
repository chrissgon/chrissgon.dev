import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../scripts/check-sensitive.ts";
import { sensitiveTopics } from "../src/data/index.ts";
import { htmlToText, matchTopics, scanText } from "../src/lib/sensitive.ts";

/** A project root with the real keyword lists and one data file. */
function fixture(content: string, extra: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "sensitive-"));
  mkdirSync(join(root, "src/data"), { recursive: true });
  cpSync("src/data/sensitive-topics.json", join(root, "src/data/sensitive-topics.json"));
  cpSync("src/data/sensitive-exclude.json", join(root, "src/data/sensitive-exclude.json"));
  writeFileSync(join(root, "src/data/page.ts"), content);
  for (const [path, text] of Object.entries(extra)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe("check-sensitive (ADR-0002)", () => {
  it("fails on a planted keyword and names topic, keyword, file and line", () => {
    const r = run(["--data", "--root", fixture('export const a = "ok";\nexport const b = "Ask about my family";\n')], {});
    expect(r.code).toBe(1);
    expect(r.out).toEqual(['sensitive: familia "family" in src/data/page.ts:2']);
  });

  it("passes an exclude term of the public list", () => {
    const r = run(["--data", "--root", fixture('export const css = "font-family: Inter";\n')], {});
    expect(r.code).toBe(0);
    expect(r.out).toEqual([]);
  });

  it("passes this site's own exclude, but not the bare keyword", () => {
    expect(run(["--data", "--root", fixture('const a = "dentro de uma política";\n')], {}).code).toBe(0);
    expect(run(["--data", "--root", fixture('const a = "sobre política";\n')], {}).code).toBe(1);
  });

  it("matches whole words only", () => {
    expect(matchTopics("Christopher Gonçalves, goddd, JSON, Person", sensitiveTopics)).toEqual([]);
    expect(matchTopics("my Christian faith", sensitiveTopics).map((h) => h.topic)).toContain("fe");
  });

  it("says when no private terms are configured, and still passes", () => {
    const r = run(["--data", "--root", fixture('const a = "ok";\n')], {});
    expect(r.code).toBe(0);
    expect(r.err.join("\n")).toMatch(/private terms: none configured/);
  });

  it("reports private terms by number, never by text, from the env and the local file", () => {
    const root = fixture('const a = "worked at Planted Corp";\nconst b = "and Other Name";\n', {
      "docs/private-terms.txt": "# local list\nOther Name\n",
    });
    const r = run(["--data", "--root", root], { SENSITIVE_PRIVATE_TERMS: "Planted Corp" });
    expect(r.code).toBe(1);
    expect(r.out).toEqual(["private-term #1 in src/data/page.ts:1", "private-term #2 in src/data/page.ts:2"]);
    expect([...r.out, ...r.err].join("\n")).not.toMatch(/Planted|Other Name/);
  });

  it("passes on this repository's data", () => {
    expect(run(["--data"], {}).code).toBe(0);
  });

  it("keeps the public list identical to the copy recorded in the README", () => {
    const sha = createHash("sha256").update(readFileSync("src/data/sensitive-topics.json")).digest("hex");
    expect(readFileSync("README.md", "utf8")).toContain(sha);
  });
});

describe("htmlToText", () => {
  it("keeps visible text, text attributes and JSON-LD; drops scripts, styles and classes; keeps lines", () => {
    const html = [
      "<html><head><style>.family{}</style>",
      '<script>const family = 1;</script><script type="application/ld+json">{"name":"LD text"}</script>',
      '</head><body class="family"><img alt="Alt text" src="x.png">',
      "<p>Visible &amp; text</p></body></html>",
    ].join("\n");
    const text = htmlToText(html);
    expect(text).toContain("LD text");
    expect(text).toContain("Alt text");
    expect(text).toContain("Visible & text");
    expect(text).not.toMatch(/family/);
    expect(text.split("\n")).toHaveLength(4);
    expect(scanText("x.html", htmlToText('<p>a</p>\n<p title="your age">b</p>'), sensitiveTopics, [])).toEqual([
      { file: "x.html", line: 2, topic: "idade", match: "your age" },
    ]);
  });
});
