// Images referenced by the data module ("posts/<file>", "projects/<file>"), resolved from src/assets/.
import type { ImageMetadata } from "astro";

const files = import.meta.glob<{ default: ImageMetadata }>("/src/assets/**/*.{png,jpg,webp}", { eager: true });

export function image(path: string): ImageMetadata {
  const found = files[`/src/assets/${path}`];
  if (!found) throw new Error(`image: src/assets/${path} does not exist`);
  return found.default;
}
