// Fail the build when a post cover or a project image is missing or empty (EDGE-5), naming the item.
//
// Usage: tsx scripts/check-images.ts [--root <dir>]
// Findings go to stdout; exit 0 when every image exists, 1 otherwise.
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { posts, projects } from "../src/data/index.ts";
import { missingImages } from "../src/lib/image-check.ts";

export function run(argv: string[]): { code: number; out: string[] } {
  if (argv.includes("--help")) return { code: 0, out: ["Usage: tsx scripts/check-images.ts [--root <dir>]"] };
  const rootIdx = argv.indexOf("--root");
  const root = resolve(rootIdx >= 0 ? (argv[rootIdx + 1] ?? ".") : ".");
  const size = (path: string) => {
    const file = join(root, "src/assets", path);
    return existsSync(file) ? statSync(file).size : null;
  };
  const out = missingImages(posts, projects, size);
  return { code: out.length ? 1 : 0, out };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { code, out } = run(process.argv.slice(2));
  for (const line of out) console.log(line);
  console.error(code ? `check-images: ${out.length} missing image(s)` : "check-images: every post and project has its image");
  process.exit(code);
}
