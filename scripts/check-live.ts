// Check the site that is live: the pages, the text endpoints and the MCP endpoint answer as expected.
// Read-only: three GET requests and one MCP tools/list call.
//
// Usage: tsx scripts/check-live.ts [--url https://chrissgon.dev]
// Findings go to stdout; exit 0 when everything answers as expected, 1 otherwise.
import { MCP_PATH, MCP_TOOLS } from "../src/mcp/tools.ts";

const TIMEOUT_MS = 20_000;

interface Page { path: string; type: string; has: string }
const PAGES: Page[] = [
  { path: "/", type: "text/html", has: '<html lang="en"' },
  { path: "/pt/", type: "text/html", has: '<html lang="pt' },
  { path: "/llms.txt", type: "text/plain", has: "# " },
];

export async function run(argv: string[], get: typeof fetch = fetch): Promise<{ code: number; out: string[] }> {
  if (argv.includes("--help")) return { code: 0, out: ["Usage: tsx scripts/check-live.ts [--url https://chrissgon.dev]"] };
  const urlIdx = argv.indexOf("--url");
  const base = (urlIdx >= 0 ? (argv[urlIdx + 1] ?? "") : "https://chrissgon.dev").replace(/\/$/, "");
  const out: string[] = [];
  const request = async (path: string, init?: RequestInit) => {
    try {
      return await get(base + path, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
    } catch (error) {
      out.push(`${path}: no answer (${(error as Error).message})`);
      return null;
    }
  };
  for (const page of PAGES) {
    const res = await request(page.path);
    if (!res) continue;
    const type = res.headers.get("content-type") ?? "";
    const body = await res.text();
    if (res.status !== 200) out.push(`${page.path}: HTTP ${res.status}, expected 200`);
    else if (!type.startsWith(page.type)) out.push(`${page.path}: content type "${type}", expected ${page.type}`);
    else if (!body.includes(page.has)) out.push(`${page.path}: the answer does not contain ${JSON.stringify(page.has)}`);
  }
  const mcp = await request(MCP_PATH, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  if (mcp) {
    const text = await mcp.text();
    if (mcp.status !== 200) out.push(`${MCP_PATH}: HTTP ${mcp.status}, expected 200`);
    else {
      // The answer is JSON, or one JSON message in an event stream ("data: {...}").
      const json = text.trimStart().startsWith("{") ? text : (text.split("\n").find((l) => l.startsWith("data:"))?.slice(5) ?? "");
      let names: string[] = [];
      try {
        names = ((JSON.parse(json) as { result?: { tools?: { name: string }[] } }).result?.tools ?? []).map((t) => t.name).sort();
      } catch {
        out.push(`${MCP_PATH}: the answer is not JSON`);
      }
      const want = [...MCP_TOOLS].sort();
      if (names.join() !== want.join()) out.push(`${MCP_PATH}: tools ${names.join(", ") || "(none)"}, expected ${want.join(", ")}`);
    }
  }
  return { code: out.length ? 1 : 0, out };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { code, out } = await run(process.argv.slice(2));
  for (const line of out) console.log(line);
  console.error(code ? `check-live: ${out.length} problem(s)` : "check-live: the live site answers as expected");
  process.exit(code);
}
