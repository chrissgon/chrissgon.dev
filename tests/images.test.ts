import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../scripts/check-images.ts";
import { pngSize } from "../scripts/check-dist.ts";
import { OG_HEIGHT, OG_WIDTH, ogImagePath } from "../src/lib/og.ts";
import { posts, projects } from "../src/data/index.ts";
import { missingImages } from "../src/lib/image-check.ts";

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

/**
 * Metadata that could carry a location, a device or a name: EXIF, XMP, IPTC, PNG text chunks and the C2PA
 * manifest (the caBX chunk) of a design-tool export.
 */
function metadataIn(file: string): string[] {
  const b = readFileSync(file);
  const found: string[] = [];
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    for (let i = 8; i < b.length; ) {
      const len = b.readUInt32BE(i);
      const type = b.toString("latin1", i + 4, i + 8);
      if (["eXIf", "tEXt", "iTXt", "zTXt", "tIME", "caBX"].includes(type)) found.push(`png ${type}`);
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

  it("in public/ (icons, share images) carry no metadata, and SVGs no <metadata> element", () => {
    const files = walk("public");
    const images = files.filter((f) => /\.(png|ico|jpe?g|webp)$/.test(f));
    expect(images).toEqual(expect.arrayContaining(["public/favicon.ico", "public/apple-touch-icon.png", "public/og/og-en.png"]));
    for (const f of images) expect(metadataIn(f), f).toEqual([]);
    for (const f of files.filter((x) => x.endsWith(".svg"))) expect(readFileSync(f, "utf8"), f).not.toMatch(/<metadata\b/i);
  });

  it("include a share image per language, 1200 x 630 and under 100 KB", () => {
    for (const lang of ["en", "pt"] as const) {
      const b = readFileSync(join("public", ogImagePath(lang)));
      expect(pngSize(b)).toEqual({ width: OG_WIDTH, height: OG_HEIGHT });
      expect(b.length).toBeLessThan(100 * 1024);
    }
  });
});
