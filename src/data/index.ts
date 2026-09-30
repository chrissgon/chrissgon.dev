// The one data module (ADR-0001). Pages, llms.txt, JSON-LD and, later, the MCP server import from here.
// Everything is validated on import, so invalid data breaks the build and the tests.
import { z } from "zod";
import {
  LabItem,
  Localized,
  Posts,
  Product,
  Profile,
  Project,
  SensitiveTopics,
  Stat,
  Trajectory,
  parseData,
  type Lang,
} from "./schema.ts";
import rawProfile from "./profile.ts";
import rawProducts from "./products.ts";
import rawProjects from "./projects.ts";
import rawPosts from "./posts.json" with { type: "json" };
import rawTrajectory from "./trajectory.ts";
import rawLab from "./lab.ts";
import rawStats from "./stats.ts";
import rawLabels from "./labels.ts";
import rawTopics from "./sensitive-topics.json" with { type: "json" };

export const profile = parseData(Profile, rawProfile, "src/data/profile.ts");
export const products = parseData(z.array(Product), rawProducts, "src/data/products.ts");
export const projects = parseData(z.array(Project), rawProjects, "src/data/projects.ts");
export const posts = parseData(Posts, rawPosts, "src/data/posts.json");
export const trajectory = parseData(Trajectory, rawTrajectory, "src/data/trajectory.ts");
export const lab = parseData(z.array(LabItem), rawLab, "src/data/lab.ts");
export const stats = parseData(z.array(Stat), rawStats, "src/data/stats.ts");
export const labels = parseData(z.record(z.string(), Localized), rawLabels, "src/data/labels.ts") as Record<
  keyof typeof rawLabels,
  Localized
>;
export const sensitiveTopics = parseData(SensitiveTopics, rawTopics, "src/data/sensitive-topics.json");

export type LabelKey = keyof typeof rawLabels;
export const t = (lang: Lang, key: LabelKey): string => labels[key][lang];

/** The post title in the page's language, else in the post's own language. */
export function postTitle(post: (typeof posts)[number], lang: Lang): string {
  return post.title[lang] ?? post.title[post.lang[0]!]!;
}

export { LANGS, type Lang } from "./schema.ts";
export { readNpmCount } from "./npm.ts";
