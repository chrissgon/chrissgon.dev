// The browser side of src/components/CodeLines.astro: one line of code as a block span with a hanging indent
// past its own indentation and <wbr> where it may break (src/lib/code.ts; src/styles/site.css, pre .ln).
import { codeLines } from "../lib/code.ts";

/** The spans for a snippet, to put inside its <code> or <pre> with replaceChildren or append. */
export function codeLineNodes(text: string): HTMLSpanElement[] {
  return codeLines(text).map((l) => {
    const span = document.createElement("span");
    span.className = "ln";
    span.style.setProperty("--in", `${l.indent}ch`);
    l.pieces.forEach((p, i) => {
      if (i > 0) span.append(document.createElement("wbr"));
      span.append(p);
    });
    span.append("\n");
    return span;
  });
}
