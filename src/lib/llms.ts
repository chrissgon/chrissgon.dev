// /llms.txt and /pt/llms.txt, generated from the data module (ADR-0001; https://llmstxt.org/).
import { lab, posts, postTitle, products, profile, projects, stats, t, trajectory, type Lang } from "../data/index.ts";
import { resolveStats } from "./stats.ts";
import type { NpmCount, WorkbenchCount } from "../data/schema.ts";
import { MCP_PATH, MCP_TOOLS } from "../mcp/tools.ts";
import { formatNumber, formatPeriod, localePath, statusLabel, typeLabel } from "./format.ts";
import { readPickView } from "../data/pick.ts";
import { pickMarkdown, type PickView } from "./pick.ts";

export interface LlmsOptions {
  /** Absolute site URL without a trailing slash, e.g. https://chrissgon.dev */
  site: string;
  npm: NpmCount | null;
  /** The ai-workbench counts read at build; absent or null leaves the skill count out. */
  workbench?: WorkbenchCount | null;
  /** The "Pick the next post" round; absent reads the build's (src/data/pick.ts), null leaves the part empty. */
  pick?: PickView | null;
}

const WORDS = {
  en: { downloads: "downloads from", to: "to", code: "Code", license: "License", type: "Type", stack: "Stack", languages: "Languages", pages: "Pages", home: "Home", other: "Português (llms.txt)" },
  pt: { downloads: "downloads de", to: "a", code: "Código", license: "Licença", type: "Tipo", stack: "Stack", languages: "Idiomas", pages: "Páginas", home: "Início", other: "English (llms.txt)" },
} as const;

/** The parts of llms.txt, in order. The home page shows each region's part when "view as agent" is on. */
export const LLMS_PARTS = ["head", "numbers", "about", "products", "projects", "writing", "pick", "trajectory", "lab", "agents", "pages"] as const;
export type LlmsPart = (typeof LLMS_PARTS)[number];

export function llmsParts(lang: Lang, { site, npm, workbench, pick }: LlmsOptions): Record<LlmsPart, string> {
  const w = WORDS[lang];
  const url = (path: string) => `${site}${localePath(lang, path)}`;
  const parts = {} as Record<LlmsPart, string>;
  let out: string[] = [];
  const end = (part: LlmsPart) => {
    parts[part] = out.join("\n");
    out = [];
  };

  out.push(`# ${profile.name}`, "", `> ${profile.label[lang].join(" · ")}`, "");
  for (const p of profile.profiles) out.push(`- [${p.network}](${p.url}): ${p.handle}`);
  out.push("");
  end("head");

  const shown = resolveStats(lang, { npm, workbench: workbench ?? null });
  out.push(`## ${t(lang, "numbers")}`, "");
  for (const s of shown) out.push(`- ${s.value}: ${s.label}${s.period ? ` (${s.period.start} ${w.to} ${s.period.end})` : ""}`);
  out.push("");
  end("numbers");

  out.push(`## ${t(lang, "about")}`, "");
  out.push(...profile.about[lang].flatMap((p) => [p, ""]));
  end("about");

  out.push(`## ${t(lang, "products")}`, "");
  for (const p of products) {
    const bits = [`- [${p.name}](${p.url}): ${p.summary[lang]}`, `${w.code}: ${p.codeRepository}.`];
    if (p.npm) {
      const count = npm ? ` (${formatNumber(npm.downloads, lang)} ${w.downloads} ${npm.start} ${w.to} ${npm.end})` : "";
      bits.push(`npm: ${p.npm}${count}.`);
    }
    const skills = stats.find((s) => s.id === "workbench-skills");
    if (p.id === "ai-workbench" && workbench && skills) {
      bits.push(`${formatNumber(workbench.skills, lang)} ${skills.label[lang]}.`);
    }
    bits.push(`${w.license}: ${p.license}.`);
    out.push(bits.join(" "));
  }
  out.push("");
  end("products");

  out.push(`## ${t(lang, "navProjects")}`, "");
  for (const status of ["ready", "in-progress"] as const) {
    const list = projects.filter((p) => p.status === status);
    if (!list.length) continue;
    out.push(`### ${statusLabel(status, lang)}`, "");
    for (const p of list) {
      const name = p.links[0] ? `[${p.name}](${p.links[0].url})` : p.name;
      const meta = [`${w.type}: ${p.types.map((x) => typeLabel(x, lang)).join(", ")}`];
      if (p.stack.length) meta.push(`${w.stack}: ${p.stack.join(", ")}`);
      out.push(`- ${name}: ${p.summary[lang]} (${meta.join("; ")})`);
    }
    out.push("");
  }

  end("projects");

  out.push(`## ${t(lang, "navWriting")}`, "");
  for (const p of posts) {
    const title = postTitle(p, lang);
    out.push(`- [${title}](${p.url}) (${p.date}; ${w.languages}: ${p.lang.map((l) => l.toUpperCase()).join(", ")})`);
  }
  out.push("");
  end("writing");

  const round = pick === undefined ? readPickView() : pick;
  if (round) out.push(pickMarkdown(round, lang));
  end("pick");

  out.push(`## ${t(lang, "trajectory")}`, "");
  for (const e of trajectory.entries) {
    out.push(`- ${formatPeriod(e, lang)}${e.role ? `, ${e.role}` : ""}: ${e.focus[lang]}`);
  }
  if (trajectory.education) out.push(`- ${t(lang, "education")}: ${trajectory.education[lang]}`);
  out.push("", `### ${t(lang, "proofs")}`, "");
  for (const p of trajectory.proofs) out.push(`- ${p[lang]}`);
  out.push("");
  end("trajectory");

  out.push(`## ${t(lang, "navLab")}`, "");
  for (const x of lab) {
    const state = x.source ? `${w.code}: ${x.source}` : statusLabel("in-progress", lang);
    out.push(`- ${x.id}: ${x.description[lang]} (${state})`);
  }
  out.push("");
  end("lab");

  // The read-only MCP server (ADR-0004), as in the approved prototype's "For agents" section.
  out.push(`## ${t(lang, "navAgents")}`, "");
  out.push(`- [${t(lang, "connectAgent")}](${site}${MCP_PATH}): MCP, Streamable HTTP, POST (${MCP_TOOLS.join(", ")})`);
  out.push("");
  end("agents");

  out.push(`## ${w.pages}`, "");
  out.push(`- [${w.home}](${url("/")})`);
  out.push(`- [${t(lang, "navProjects")}](${url("/projects")})`);
  out.push(`- [${t(lang, "navWriting")}](${url("/writing")})`);
  out.push(`- [${t(lang, "navLab")}](${url("/lab")})`);
  out.push(`- [${w.other}](${site}${lang === "en" ? "/pt/llms.txt" : "/llms.txt"})`);
  out.push("");
  end("pages");
  return parts;
}

export function llmsText(lang: Lang, options: LlmsOptions): string {
  const parts = llmsParts(lang, options);
  return LLMS_PARTS.map((p) => parts[p]).join("\n");
}
