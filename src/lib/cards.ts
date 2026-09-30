// Generated project cards (site-content.md 4.1; design brief of the projects page): a pure SVG built from
// the data at build, with no external service and no request of its own. Inline in the page, decorative
// (the card's text is also in the page), so it is hidden from assistive technology.
import { t, type Lang } from "../data/index.ts";
import type { Project, WorkbenchCount } from "../data/schema.ts";
import { formatNumber, typeLabel } from "./format.ts";

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
const GAP = 30;
const PAD = 80;
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
// Brand colors (identity.md, dark mode): background, text, muted text, border.
const COLOR = { bg: "#000000", text: "#FFFFFF", muted: "#9CA3AF", dot: "#1F2937" };

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** A small deterministic hash (FNV-1a), so the same project always draws the same dots. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** The text lines of a project's card: its types, its stack, and for ai-workbench the counts read at build. */
export function cardLines(project: Project, lang: Lang, workbench: WorkbenchCount | null): string[] {
  const lines = [project.types.map((x) => typeLabel(x, lang)).join(" · ")];
  if (project.stack.length) lines.push(project.stack.join(", "));
  if (project.id === "ai-workbench" && workbench) {
    const n = (v: number) => formatNumber(v, lang);
    lines.push(
      `${n(workbench.skills)} ${t(lang, "cardSkills")} · ${n(workbench.agents)} ${t(lang, "cardAgents")} · ${n(workbench.adapters)} ${t(lang, "cardAdapters")}`,
    );
  }
  return lines;
}

/** The card as an SVG string: a field of brand dots, a lit band from the project's id, its name and lines. */
export function cardSvg(id: string, name: string, lines: string[], width = 320): string {
  const h = hash(id);
  const cols = Math.floor(CARD_WIDTH / GAP);
  const rows = Math.floor(CARD_HEIGHT / GAP);
  const phase = (h % 628) / 100;
  const freq = 0.15 + ((h >>> 10) % 20) / 100;
  const lit: string[] = [];
  for (let c = 0; c < cols; c++) {
    const r = Math.round(rows * 0.2 + Math.sin(c * freq + phase) * rows * 0.12);
    lit.push(`<circle cx="${c * GAP + GAP / 2}" cy="${r * GAP + GAP / 2}" r="4"/>`);
  }
  const size = Math.min(88, Math.floor((CARD_WIDTH - 2 * PAD) / (name.length * 0.6)));
  const text = lines
    .map((l, i) => `<text x="${PAD}" y="${400 + i * 52}" font-size="34" fill="${COLOR.muted}">${escapeXml(l)}</text>`)
    .join("");
  const height = Math.round((width * CARD_HEIGHT) / CARD_WIDTH);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" width="${width}" height="${height}" aria-hidden="true" focusable="false" data-card="${escapeXml(id)}">` +
    `<defs><pattern id="dots-${escapeXml(id)}" width="${GAP}" height="${GAP}" patternUnits="userSpaceOnUse"><circle cx="${GAP / 2}" cy="${GAP / 2}" r="2" fill="${COLOR.dot}"/></pattern></defs>` +
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${COLOR.bg}"/>` +
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#dots-${escapeXml(id)})"/>` +
    `<g fill="${COLOR.muted}">${lit.join("")}</g>` +
    `<g font-family="${MONO}"><text x="${PAD}" y="320" font-size="${size}" font-weight="700" fill="${COLOR.text}">${escapeXml(name)}</text>${text}</g>` +
    `</svg>`
  );
}

export function projectCardSvg(project: Project, lang: Lang, workbench: WorkbenchCount | null, width?: number): string {
  return cardSvg(project.id, project.name, cardLines(project, lang, workbench), width);
}
