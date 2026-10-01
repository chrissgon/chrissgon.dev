import { describe, expect, it } from "vitest";
import { run } from "../scripts/check-live.ts";
import { MCP_TOOLS } from "../src/mcp/tools.ts";

// The live-site check (.github/workflows/live.yml), against a fake site: no network.
const site = (over: Record<string, Response> = {}) =>
  (async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    const pages: Record<string, () => Response> = {
      "/": () => new Response('<!doctype html><html lang="en">', { headers: { "content-type": "text/html; charset=utf-8" } }),
      "/pt/": () => new Response('<!doctype html><html lang="pt-BR">', { headers: { "content-type": "text/html" } }),
      "/llms.txt": () => new Response("# Name\n", { headers: { "content-type": "text/plain; charset=utf-8" } }),
      "/api/mcp": () => Response.json({ jsonrpc: "2.0", id: 1, result: { tools: MCP_TOOLS.map((name) => ({ name })) } }),
    };
    return over[path] ?? pages[path]?.() ?? new Response("", { status: 404 });
  }) as typeof fetch;

describe("check-live", () => {
  it("passes when the pages, llms.txt and the MCP tools answer as expected", async () => {
    expect(await run(["--url", "https://site.example/"], site())).toEqual({ code: 0, out: [] });
  });

  it("names a page that answers with an error, and a missing MCP tool", async () => {
    const { code, out } = await run(
      ["--url", "https://site.example"],
      site({
        "/pt/": new Response("", { status: 500 }),
        "/api/mcp": Response.json({ result: { tools: [{ name: "get_profile" }] } }),
      }),
    );
    expect(code).toBe(1);
    expect(out).toEqual(["/pt/: HTTP 500, expected 200", expect.stringMatching(/^\/api\/mcp: tools get_profile, expected /)]);
  });

  it("names a wrong content type and a site that does not answer", async () => {
    const wrong = await run([], site({ "/llms.txt": new Response("# x", { headers: { "content-type": "text/html" } }) }));
    expect(wrong.out).toEqual(['/llms.txt: content type "text/html", expected text/plain']);
    const down = await run([], (async () => { throw new Error("offline"); }) as typeof fetch);
    expect(down.code).toBe(1);
    expect(down.out).toHaveLength(4);
  });

  it("prints its usage", async () => {
    expect((await run(["--help"])).out[0]).toMatch(/--url/);
  });
});
