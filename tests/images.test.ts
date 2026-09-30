import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../scripts/check-images.ts";
import { posts, projects } from "../src/data/index.ts";
import { cardLines, cardSvg, projectCardSvg } from "../src/lib/cards.ts";
import { missingImages } from "../src/lib/image-check.ts";

const count = { skills: 43, agents: 3, adapters: 2, tree: "65bd78bb22151671f01de139f5f4c449d293cda8", date: "2026-09-30" };

describe("missing images fail the build with the item's name (EDGE-5)", () => {
  it("names the post and the project whose file is missing or empty", () => {
    const post = posts[0]!;
    const project = projects.find((p) => p.image.kind === "file")!;
    const size = (path: string) => (path === post.cover ? null : path.startsWith("projects/") ? 0 : 100);
    expect(missingImages([post], [project], size)).toEqual([
      `image: post ${post.id}: src/assets/${post.cover} does not exist`,
      `image: project ${project.id}: src/assets/${project.image.kind === "file" ? project.image.src : ""} is empty`,
    ]);
  });

  it("needs no file for a generated card", () => {
    const generated = projects.filter((p) => p.image.kind === "generated");
    expect(missingImages([], generated, () => null)).toEqual([]);
  });

  it("passes on this repository and fails on a root without the assets", () => {
    expect(run([])).toEqual({ code: 0, out: [] });
    const r = run(["--root", "/nonexistent-root"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("image: project goddd: src/assets/projects/goddd.png does not exist");
    expect(r.out).toHaveLength(posts.length + projects.filter((p) => p.image.kind === "file").length);
  });
});

/** Metadata that could carry a location, a device or a name: EXIF, XMP, IPTC and PNG text chunks. */
function metadataIn(file: string): string[] {
  const b = readFileSync(file);
  const found: string[] = [];
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    for (let i = 8; i < b.length; ) {
      const len = b.readUInt32BE(i);
      const type = b.toString("latin1", i + 4, i + 8);
      if (["eXIf", "tEXt", "iTXt", "zTXt", "tIME"].includes(type)) found.push(`png ${type}`);
      i += 12 + len;
    }
  } else if (b.toString("latin1", 0, 4) === "RIFF") {
    for (let i = 12; i < b.length; ) {
      const type = b.toString("latin1", i, i + 4);
      const len = b.readUInt32LE(i + 4);
      if (type === "EXIF" || type === "XMP ") found.push(`webp ${type}`);
      i += 8 + len + (len & 1);
    }
  }
  const text = b.toString("latin1");
  for (const marker of ["Exif\0\0", "http://ns.adobe.com/xap/", "GPSLatitude", "Photoshop 3.0"]) {
    if (text.includes(marker)) found.push(marker.replace(/\0/g, ""));
  }
  return found;
}

describe("committed images", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

  it("carry no EXIF, GPS, XMP or text metadata", () => {
    const files = walk("src/assets").filter((f) => /\.(png|jpe?g|webp)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(metadataIn(f), f).toEqual([]);
  });
});

describe("generated project cards", () => {
  const workbench = projects.find((p) => p.id === "ai-workbench")!;
  const flow = projects.find((p) => p.id === "doc-github-workflow")!;

  it("are an SVG built from the data, hidden from assistive technology, with a reserved ratio", () => {
    const svg = projectCardSvg(workbench, "en", count);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="320" height="168"')).toBe(true);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain(">ai-workbench</text>");
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });

  it("show the ai-workbench counts read at build, in the page's language", () => {
    expect(cardLines(workbench, "en", count)).toEqual(["AI & agents", "Python, Shell", "43 skills · 3 agents · 2 adapters"]);
    expect(cardLines(workbench, "pt", count)).toEqual(["IA e agentes", "Python, Shell", "43 skills · 3 agentes · 2 adaptadores"]);
    expect(cardLines(workbench, "en", null)).toEqual(["AI & agents", "Python, Shell"]);
    expect(cardLines(flow, "pt", count)).toEqual(["Documentação e arquitetura", "Go"]);
  });

  it("escape text and draw the same dots for the same project", () => {
    expect(cardSvg("x", "a<b & c", ['"quoted"'])).toContain("a&lt;b &amp; c</text>");
    expect(cardSvg("x", "a<b & c", ['"quoted"'])).toContain("&quot;quoted&quot;");
    expect(projectCardSvg(flow, "en", null)).toBe(projectCardSvg(flow, "en", null));
    expect(cardSvg("one", "n", [])).not.toBe(cardSvg("two", "n", []).replaceAll("two", "one"));
  });
});
