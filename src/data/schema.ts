// Schemas of every public fact the site shows (ADR-0001). Every object is strict: a field that is not
// declared here (employer, location, birthDate...) fails the build with "Unrecognized key" (EDGE-1).
import { z } from "zod";

export const LANGS = ["en", "pt"] as const;
export type Lang = (typeof LANGS)[number];

const https = z.url({ protocol: /^https$/ });
const isoDate = z.iso.date();
const text = z.string().trim().min(1);

/** A text in both languages. */
export const Localized = z.strictObject({ en: text, pt: text });
export type Localized = z.infer<typeof Localized>;

export const Profile = z.strictObject({
  name: z.literal("Christopher Gonçalves"),
  handle: z.literal("chrissgon"),
  /** The site's own domain, shown as its name in the header and the footer. */
  domain: z.literal("chrissgon.dev"),
  jobTitle: text,
  /** The approved label, split on " · " into its three parts. */
  label: z.strictObject({
    en: z.tuple([text, text, text]),
    pt: z.tuple([text, text, text]),
  }),
  /** Paragraphs of the approved "About"; at least one per language. */
  about: z.strictObject({ en: z.array(text).min(1), pt: z.array(text).min(1) }),
  liveCodingHours: z.int().positive(),
  profiles: z
    .array(
      z.strictObject({
        network: z.enum(["GitHub", "LinkedIn", "npm"]),
        handle: text,
        url: https,
      }),
    )
    .length(3),
});
export type Profile = z.infer<typeof Profile>;

export const Product = z.strictObject({
  id: z.enum(["perfectui", "ai-workbench"]),
  name: text,
  url: https,
  codeRepository: https.refine((u) => u.startsWith("https://github.com/chrissgon/"), {
    message: "codeRepository must be a chrissgon repository on GitHub",
  }),
  npm: z.literal("@chrissgon/perfectui").optional(),
  license: z.literal("MIT"),
  programmingLanguage: z.array(text).min(1),
  summary: Localized,
});
export type Product = z.infer<typeof Product>;

export const PROJECT_TYPES = ["ai-agents", "web-ui", "docs-architecture"] as const;
export const PROJECT_STATUSES = ["ready", "in-progress"] as const;

/**
 * A project image: a file under src/assets/, or a card the site generates at build from the data
 * (src/components/ProjectVisual.astro, one drawing per project listed in src/lib/project-visuals.ts). There is no
 * "pending" image: a missing file fails the build (EDGE-5).
 */
export const ProjectImage = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("file"), src: z.string().regex(/^projects\/[a-z0-9-]+\.(png|jpg|webp)$/) }),
  z.strictObject({ kind: z.literal("generated") }),
]);

export const Project = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: text,
    types: z.array(z.enum(PROJECT_TYPES)).min(1),
    status: z.enum(PROJECT_STATUSES),
    stack: z.array(text),
    summary: Localized,
    image: ProjectImage,
    links: z.array(z.strictObject({ label: text, url: https })),
  })
  .refine((p) => p.status === "ready" || p.links.every((l) => /^https:\/\/github\.com\/chrissgon\/[\w.-]+$/.test(l.url)), {
    message: "a project in progress links only to its public repository, once it exists (site-content.md 4.2)",
  })
  .refine((p) => p.status === "in-progress" || (p.links.length > 0 && p.stack.length > 0), {
    message: "a ready project needs a link and a stack",
  });
export type Project = z.infer<typeof Project>;

export const Post = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9-]+$/),
    /** Card title per language of the post, verbatim from site-content.md. */
    title: z.strictObject({ en: text.optional(), pt: text.optional() }),
    date: isoDate,
    lang: z.array(z.enum(LANGS)).min(1).max(2),
    cover: z.string().regex(/^posts\/[a-z0-9-]+\.(png|jpg|webp)$/),
    /** Where the 4:5 crop of the cover is anchored, so the post's subject stays in view (src/lib/covers.ts):
     * an edge, the centre (the default), or "entropy", the image service's crop around the most detailed region,
     * for a subject away from every edge and from the centre. */
    coverFocus: z.enum(["left", "center", "right", "entropy"]).optional(),
    /** Canonical link to the post on LinkedIn (site-content.md section 5). */
    url: https.refine((u) => /^https:\/\/(www\.|pt\.)?linkedin\.com\//.test(u), { message: "url must be on linkedin.com" }),
    /** Comments and reactions from the post's public JSON-LD (interactionStatistic), and the day they were read. */
    stats: z.strictObject({ comments: z.int().nonnegative(), reactions: z.int().nonnegative(), read: isoDate }).optional(),
  })
  .refine((p) => p.lang.every((l) => p.title[l] !== undefined), {
    message: "every language of the post needs a title",
  });
export type Post = z.infer<typeof Post>;

/** Posts: unique ids, newest first. An empty list is valid. */
export const Posts = z
  .array(Post)
  .superRefine((posts, ctx) => {
    const seen = new Set<string>();
    for (const p of posts) {
      if (seen.has(p.id)) ctx.addIssue({ code: "custom", message: `duplicate post id ${p.id}` });
      seen.add(p.id);
    }
    for (let i = 1; i < posts.length; i++) {
      if (posts[i]!.date > posts[i - 1]!.date) {
        ctx.addIssue({ code: "custom", message: `posts must be newest first: ${posts[i]!.id}` });
      }
    }
  });

export const TrajectoryEntry = z.strictObject({
  /** Years, never a birth year: `from` absent means "before `to`"; `to` null means "now"; both absent and null mean just "Now". */
  from: z.int().min(2000).optional(),
  to: z.int().min(2000).nullable(),
  role: text.nullable(),
  focus: Localized,
});
export type TrajectoryEntry = z.infer<typeof TrajectoryEntry>;

export const Trajectory = z.strictObject({
  entries: z.array(TrajectoryEntry).min(1),
  /** Measured proofs, kept apart because the source does not say which role each came from. */
  proofs: z.array(Localized),
  education: Localized.optional(),
});
export type Trajectory = z.infer<typeof Trajectory>;

/** One checked eval result of an ai-workbench skill: the score of a model with and without the skill. */
export const EvalRun = z.strictObject({
  skill: z.string().regex(/^[a-z0-9-]+$/),
  iteration: z.int().positive(),
  model: text,
  /** The model's role in the eval, e.g. "floor model" / "modelo floor". */
  role: Localized,
  withSkill: z.number().min(0).max(1),
  withoutSkill: z.number().min(0).max(1),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const LabItem = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** The day the experiment first ran (design briefs, site-lab.md). */
  date: isoDate,
  description: Localized,
  /** Link to the code in this repository; absent until the experiment is built here. */
  source: https.optional(),
  /** workbench-evals only: the checked runs it shows. */
  runs: z.array(EvalRun).optional(),
});
export type LabItem = z.infer<typeof LabItem>;

export const NpmCount = z.strictObject({
  downloads: z.int().nonnegative(),
  start: isoDate,
  end: isoDate,
  package: z.literal("@chrissgon/perfectui"),
});
export type NpmCount = z.infer<typeof NpmCount>;

/** Counts read from the chrissgon/ai-workbench tree on GitHub at build (scripts/fetch-workbench.ts). */
export const WorkbenchCount = z.strictObject({
  skills: z.int().positive(),
  agents: z.int().nonnegative(),
  adapters: z.int().nonnegative(),
  /** Skills per name prefix (`eng-`, `design-`...), in the tree's order; absent in older snapshots. */
  prefixes: z.record(z.string().regex(/^[a-z]+$/), z.int().positive()).optional(),
  /** Agent names (agents/<name>.md); absent in older snapshots. */
  agentNames: z.array(z.string().regex(/^[a-z0-9-]+$/)).optional(),
  /** The git tree the counts were read from. */
  tree: z.string().regex(/^[0-9a-f]{40}$/),
  /** The day the tree was read (UTC). */
  date: isoDate,
});
export type WorkbenchCount = z.infer<typeof WorkbenchCount>;

export const Stat = z.strictObject({
  id: z.enum(["npm-downloads", "perfectui-size", "live-coding", "workbench-skills"]),
  /** The figure as shown, per language when it differs; null means "read at build" (the npm count, the ai-workbench skill count). */
  value: z.union([text, Localized]).nullable(),
  label: Localized,
  source: text,
});
export type Stat = z.infer<typeof Stat>;

export const SensitiveTopics = z.strictObject({
  action: text,
  topics: z.record(
    z.string(),
    z.strictObject({ keywords: z.array(text).min(1), exclude: z.array(text) }),
  ),
});
export type SensitiveTopics = z.infer<typeof SensitiveTopics>;

/**
 * False positives found in this site's own texts, added to a topic's `exclude` at check time. Kept apart
 * from sensitive-topics.json so that file stays a verbatim copy of the brand profile's list.
 */
export const SensitiveExclude = z.record(
  z.string(),
  z.array(z.strictObject({ phrase: text, reason: text })).min(1),
);
export type SensitiveExclude = z.infer<typeof SensitiveExclude>;

/** Parse a value and turn a zod error into the build message `data: <file> <path>: <error>`. */
export function parseData<T>(schema: z.ZodType<T>, value: unknown, file: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `data: ${file} ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(lines.join("\n"));
  }
  return result.data;
}
