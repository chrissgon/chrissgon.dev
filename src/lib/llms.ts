// /llms.txt and /pt/llms.txt, generated from the data module (ADR-0001; https://llmstxt.org/).
import { lab, posts, postTitle, products, profile, projects, t, trajectory, type Lang } from "../data/index.ts";
import type { NpmCount } from "../data/schema.ts";
import { MCP_PATH, MCP_TOOLS } from "../mcp/tools.ts";
import { formatNumber, formatPeriod, localePath, statusLabel, typeLabel } from "./format.ts";

export interface LlmsOptions {
  /** Absolute site URL without a trailing slash, e.g. https://chrissgon.dev */
  site: string;
  npm: NpmCount | null;
}

const WORDS = {
  en: { downloads: "downloads from", to: "to", code: "Code", license: "License", type: "Type", stack: "Stack", languages: "Languages", pages: "Pages", home: "Home", other: "Português (llms.txt)" },
  pt: { downloads: "downloads de", to: "a", code: "Código", license: "Licença", type: "Tipo", stack: "Stack", languages: "Idiomas", pages: "Páginas", home: "Início", other: "English (llms.txt)" },
} as const;

export function llmsText(lang: Lang, { site, npm }: LlmsOptions): string {
  const w = WORDS[lang];
  const url = (path: string) => `${site}${localePath(lang, path)}`;
  const out: string[] = [];

  out.push(`# ${profile.name}`, "", `> ${profile.label[lang].join(" · ")}`, "");
  out.push(...profile.about[lang].flatMap((p) => [p, ""]));
  for (const p of profile.profiles) out.push(`- [${p.network}](${p.url}): ${p.handle}`);
  out.push("");

  out.push(`## ${t(lang, "products")}`, "");
  for (const p of products) {
    const parts = [`- [${p.name}](${p.url}): ${p.summary[lang]}`, `${w.code}: ${p.codeRepository}.`];
    if (p.npm) {
      const count = npm ? ` (${formatNumber(npm.downloads, lang)} ${w.downloads} ${npm.start} ${w.to} ${npm.end})` : "";
      parts.push(`npm: ${p.npm}${count}.`);
    }
    parts.push(`${w.license}: ${p.license}.`);
    out.push(parts.join(" "));
  }
  out.push("");

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

  out.push(`## ${t(lang, "navWriting")}`, "");
  for (const p of posts) {
    const title = postTitle(p, lang);
    const name = p.url ? `[${title}](${p.url})` : title;
    out.push(`- ${name} (${p.date}; ${w.languages}: ${p.lang.map((l) => l.toUpperCase()).join(", ")})`);
  }
  out.push("");

  out.push(`## ${t(lang, "trajectory")}`, "");
  for (const e of trajectory.entries) {
    out.push(`- ${formatPeriod(e, lang)}${e.role ? `, ${e.role}` : ""}: ${e.focus[lang]}`);
  }
  if (trajectory.education) out.push(`- ${t(lang, "education")}: ${trajectory.education[lang]}`);
  out.push("", `### ${t(lang, "proofs")}`, "");
  for (const p of trajectory.proofs) out.push(`- ${p[lang] ?? p.en}`);
  out.push("");

  out.push(`## ${t(lang, "navLab")}`, "");
  for (const x of lab) {
    const state = x.source ? `${w.code}: ${x.source}` : statusLabel("in-progress", lang);
    out.push(`- ${x.id}: ${x.description[lang]} (${state})`);
  }
  out.push("");

  // The read-only MCP server (ADR-0004), as in the approved prototype's "For agents" section.
  out.push(`## ${t(lang, "navAgents")}`, "");
  out.push(`- [${t(lang, "connectAgent")}](${site}${MCP_PATH}): MCP, Streamable HTTP, POST (${MCP_TOOLS.join(", ")})`);
  out.push("");

  out.push(`## ${w.pages}`, "");
  out.push(`- [${w.home}](${url("/")})`);
  out.push(`- [${t(lang, "navProjects")}](${url("/projects")})`);
  out.push(`- [${t(lang, "navWriting")}](${url("/writing")})`);
  out.push(`- [${t(lang, "navLab")}](${url("/lab")})`);
  out.push(`- [${w.other}](${site}${lang === "en" ? "/pt/llms.txt" : "/llms.txt"})`);
  out.push("");
  return out.join("\n");
}
