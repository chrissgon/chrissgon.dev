// The numbers strip counts up to each figure when it enters the screen (site-home.md, region 4 motion): a
// pure parser of the figure as shown ("1,014", "1.014", "3.7 kB", "3,7 kB", "600+ hours", "43") and a frame
// function the page script calls with the progress 0..1. The final frame is always the figure itself.

export interface Figure {
  prefix: string;
  value: number;
  decimals: number;
  suffix: string;
  /** The decimal and thousands separators of the page's language. */
  decimal: "." | ",";
  group: "," | ".";
}

/** Read the first number of a figure; null when there is none. */
export function parseFigure(text: string, lang: "en" | "pt"): Figure | null {
  const decimal = lang === "pt" ? "," : ".";
  const group = lang === "pt" ? "." : ",";
  const esc = (c: string) => `\\${c}`;
  const m = new RegExp(`^(\\D*?)(\\d{1,3}(?:${esc(group)}\\d{3})+|\\d+)(?:${esc(decimal)}(\\d+))?(.*)$`, "s").exec(text);
  if (!m) return null;
  const whole = m[2]!.split(group).join("");
  const frac = m[3] ?? "";
  return {
    prefix: m[1]!,
    value: Number(frac ? `${whole}.${frac}` : whole),
    decimals: frac.length,
    suffix: m[4]!,
    decimal,
    group,
  };
}

/** Ease-out cubic: fast start, gentle stop. */
export const easeOut = (p: number) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;

/** The figure at progress p (0..1); p >= 1 gives exactly the original text's number. */
export function frame(f: Figure, p: number): string {
  const v = p >= 1 ? f.value : f.value * easeOut(p);
  const fixed = v.toFixed(f.decimals);
  const [int, dec] = fixed.split(".");
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, f.group);
  return `${f.prefix}${grouped}${dec ? f.decimal + dec : ""}${f.suffix}`;
}
