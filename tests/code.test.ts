import { describe, expect, it } from "vitest";
import { breakPoints, codeLines, urlBreaks } from "../src/lib/code.ts";

describe("code that wraps", () => {
  it("keeps each line with its indentation, in ch", () => {
    expect(codeLines('<div class="pui-card">\n  <table>\n\t<tr>\n\n</div>\n')).toEqual([
      { text: '<div class="pui-card">', indent: 0, pieces: ['<div class="pui-card">'] },
      { text: "  <table>", indent: 2, pieces: ["  <table>"] },
      { text: "\t<tr>", indent: 2, pieces: ["\t<tr>"] },
      { text: "", indent: 0, pieces: [""] },
      { text: "</div>", indent: 0, pieces: ["</div>"] },
    ]);
  });

  it("cuts a URL after the scheme, before / . ? # and after a hyphen run, and joins back to the URL", () => {
    const url = "https://deploy-preview--chrissgon.netlify.app/api/mcp?x=1#y";
    const pieces = urlBreaks(url);
    expect(pieces).toEqual(["https://", "deploy-", "preview--", "chrissgon", ".netlify", ".app", "/api", "/mcp", "?x=1", "#y"]);
    expect(pieces.join("")).toBe(url);
    expect(urlBreaks("https://chrissgon.dev/api/mcp")).toEqual(["https://", "chrissgon", ".dev", "/api", "/mcp"]);
    expect(urlBreaks("npm i @chrissgon/perfectui").join("")).toBe("npm i @chrissgon/perfectui");
  });
});

describe("code break points", () => {
  it("breaks JSON after its commas and a URL inside a line, and joins back to the line", () => {
    const line = 'POST https://chrissgon.dev/api/mcp {"jsonrpc":"2.0","id":1}';
    const pieces = breakPoints(line);
    expect(pieces.join("")).toBe(line);
    expect(pieces).toEqual(["POST https://", "chrissgon", ".dev", "/api", '/mcp {"jsonrpc":"2.0",', '"id":1}']);
    expect(breakPoints("a, b")).toEqual(["a, b"]);
    expect(breakPoints("")).toEqual([""]);
  });

  it("gives each code line its pieces", () => {
    expect(codeLines('{"a":1,"b":2}')[0]!.pieces).toEqual(['{"a":1,', '"b":2}']);
  });
});
