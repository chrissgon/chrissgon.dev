// Code that wraps instead of scrolling sideways (src/styles/site.css, "code wraps"). Pure helpers for the
// components that print code (src/components/CodeLines.astro, src/scripts/code-lines.ts): the lines of a snippet
// with their indentation, for a hanging indent on wrapped lines, and the points where a line may break besides
// its spaces (inside a URL, after a comma in JSON), so a long token does not break at an arbitrary letter.

export interface CodeLine {
  /** The line as written, leading spaces included, without its newline. */
  text: string;
  /** Its leading spaces (a tab counts as 2), in ch: continuation lines start 2 ch past it. */
  indent: number;
  /** The line cut where it may break besides its spaces (joined with <wbr>); joined, they are the line. */
  pieces: string[];
}

/** A snippet's lines, each with its indentation and break points. A trailing newline adds no empty line. */
export function codeLines(text: string): CodeLine[] {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  return lines.map((line) => {
    const lead = /^[ \t]*/.exec(line)![0];
    return { text: line, indent: [...lead].reduce((n, c) => n + (c === "\t" ? 2 : 1), 0), pieces: breakPoints(line) };
  });
}

/**
 * A code line cut where it may break besides its spaces: inside each URL as urlBreaks does, and after a comma
 * that has no space after it (JSON such as {"id":1,"method":"tools/list"}). Joined, the pieces are the line.
 */
export function breakPoints(line: string): string[] {
  const out: string[] = [];
  for (const part of line.split(/(https?:\/\/[^\s"'<>]+)/)) {
    if (!part) continue;
    const pieces = /^https?:\/\//.test(part) ? urlBreaks(part) : part.split(/(?<=,)(?=\S)/);
    // Where a URL meets the text around it is not a break point: glue the first piece to the one before.
    if (out.length) out[out.length - 1] += pieces.shift() ?? "";
    out.push(...pieces);
  }
  return out.length ? out : [""];
}

/**
 * A URL cut where a line may break (joined with <wbr>, so copying gives the URL back): after "://", before
 * each "/", "." and "?" or "#" that follows, and after each run of "-". Joined, the pieces are the URL.
 */
export function urlBreaks(url: string): string[] {
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(url)?.[0] ?? "";
  const rest = url.slice(scheme.length);
  const pieces = rest.split(/(?=[/.?#])|(?<=-)(?=[^-])/).filter(Boolean);
  if (scheme) pieces.unshift(scheme);
  return pieces;
}
