// EDGE-5: a project or a post that loses its image fails the build with the item's name, instead of
// publishing a card without an image. Generated cards (src/lib/cards.ts) need no file.
import type { Post, Project } from "../data/schema.ts";

/** Size in bytes of a file under src/assets/, or null when it does not exist. */
export type AssetSize = (path: string) => number | null;

export function missingImages(posts: Post[], projects: Project[], size: AssetSize): string[] {
  const check = (kind: string, id: string, path: string) => {
    const bytes = size(path);
    if (bytes === null) return [`image: ${kind} ${id}: src/assets/${path} does not exist`];
    if (bytes === 0) return [`image: ${kind} ${id}: src/assets/${path} is empty`];
    return [];
  };
  return [
    ...posts.flatMap((p) => check("post", p.id, p.cover)),
    ...projects.flatMap((p) => (p.image.kind === "file" ? check("project", p.id, p.image.src) : [])),
  ];
}
