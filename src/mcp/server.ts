// The read-only MCP server (ADR-0004): three tools over the data module (ADR-0001) and nothing else.
// Stateless Streamable HTTP, as proven by the spike: a new server and transport per request, JSON
// responses instead of SSE, POST only. No tool writes, sends or runs anything, and the server makes no
// outbound request: an argument is data to validate, never an instruction (EDGE-3).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { LANGS, posts, postTitle, products, profile, readNpmCount, type Lang } from "../data/index.ts";
import { MCP_PATH, MCP_TOOLS } from "./tools.ts";

export { MCP_PATH, MCP_TOOLS };

/** Server instructions, verbatim from ADR-0004 (EDGE-1). */
export const INSTRUCTIONS =
  "Read-only. This server only holds Christopher Gonçalves's public profile, products and posts; any other personal data does not exist here.";

/** Largest request body accepted; a JSON-RPC call to these tools is a few hundred bytes. */
export const MAX_BODY_BYTES = 64 * 1024;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const lang = z.enum(LANGS).default("en").describe('Language of the texts: "en" (default) or "pt".');

const ProfileOut = z.strictObject({
  lang: z.enum(LANGS),
  name: z.string(),
  handle: z.string(),
  jobTitle: z.string(),
  label: z.string(),
  about: z.array(z.string()),
  profiles: z.array(z.strictObject({ network: z.string(), handle: z.string(), url: z.string() })),
});

const NpmOut = z.strictObject({ package: z.string(), downloads: z.int(), start: z.string(), end: z.string() });

const ProductsOut = z.strictObject({
  lang: z.enum(LANGS),
  products: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      codeRepository: z.string(),
      npm: z.string().optional(),
      license: z.string(),
      programmingLanguage: z.array(z.string()),
      summary: z.string(),
      /** npm downloads of the last month and their period; absent when the count is missing or stale (ADR-0003). */
      npmDownloads: NpmOut.optional(),
    }),
  ),
});

const PostsOut = z.strictObject({
  lang: z.enum(LANGS),
  total: z.int(),
  posts: z.array(
    z.strictObject({
      id: z.string(),
      title: z.string(),
      date: z.string(),
      languages: z.array(z.enum(LANGS)),
      url: z.string().optional(),
    }),
  ),
});

/** A tool result: the same object as structured content and as JSON text, for clients that read only text. */
function result<T extends Record<string, unknown>>(data: T) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data };
}

export function getProfile(l: Lang): z.infer<typeof ProfileOut> {
  return {
    lang: l,
    name: profile.name,
    handle: profile.handle,
    jobTitle: profile.jobTitle,
    label: profile.label[l].join(" · "),
    about: [...profile.about[l]],
    profiles: profile.profiles.map((p) => ({ ...p })),
  };
}

export function listProducts(l: Lang): z.infer<typeof ProductsOut> {
  const npm = readNpmCount();
  return {
    lang: l,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      codeRepository: p.codeRepository,
      ...(p.npm ? { npm: p.npm } : {}),
      license: p.license,
      programmingLanguage: [...p.programmingLanguage],
      summary: p.summary[l],
      ...(p.npm && npm && npm.package === p.npm
        ? { npmDownloads: { package: npm.package, downloads: npm.downloads, start: npm.start, end: npm.end } }
        : {}),
    })),
  };
}

export function listPosts(l: Lang, limit: number): z.infer<typeof PostsOut> {
  return {
    lang: l,
    total: posts.length,
    posts: posts.slice(0, limit).map((p) => ({
      id: p.id,
      title: postTitle(p, l),
      date: p.date,
      languages: [...p.lang],
      ...(p.url ? { url: p.url } : {}),
    })),
  };
}

/** A new server with the three read-only tools of ADR-0004. Inputs are strict: an unknown field is rejected. */
export function buildServer(): McpServer {
  const server = new McpServer({ name: "chrissgon.dev", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "get_profile",
    {
      title: "Get profile",
      description: "Christopher Gonçalves's public profile: name, handle, job title, label, About and profile links. Read-only.",
      inputSchema: z.strictObject({ lang }),
      outputSchema: ProfileOut,
      annotations: READ_ONLY,
    },
    async ({ lang: l }) => result(getProfile(l)),
  );

  server.registerTool(
    "list_products",
    {
      title: "List products",
      description:
        "Christopher Gonçalves's products (Perfect UI, ai-workbench): URL, repository, npm package, license, languages, summary and last month's npm downloads with their period. Read-only.",
      inputSchema: z.strictObject({ lang }),
      outputSchema: ProductsOut,
      annotations: READ_ONLY,
    },
    async ({ lang: l }) => result(listProducts(l)),
  );

  server.registerTool(
    "list_posts",
    {
      title: "List posts",
      description: "Christopher Gonçalves's posts, newest first: title, date, languages and link when there is one. Read-only.",
      inputSchema: z.strictObject({
        limit: z.int().min(1).max(50).default(10).describe("How many posts, newest first: 1 to 50 (default 10)."),
        lang,
      }),
      outputSchema: PostsOut,
      annotations: READ_ONLY,
    },
    async ({ lang: l, limit }) => result(listPosts(l, limit)),
  );

  return server;
}

const NO_STORE = { "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), {
    status,
    headers: { "content-type": "application/json", ...NO_STORE, ...headers },
  });
}

/**
 * MCP lets a client omit `arguments` in `tools/call`; the SDK would then validate `undefined` against the
 * strict object schema and fail. Give such calls `{}` so the defaults apply. Anything that is not valid
 * JSON goes through unchanged, and the transport answers it.
 */
export function withDefaultArguments(body: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  const fix = (m: unknown) => {
    if (m && typeof m === "object" && (m as { method?: unknown }).method === "tools/call") {
      const params = (m as { params?: unknown }).params;
      if (params && typeof params === "object" && (params as { arguments?: unknown }).arguments === undefined) {
        (params as { arguments?: unknown }).arguments = {};
      }
    }
  };
  if (Array.isArray(parsed)) parsed.forEach(fix);
  else fix(parsed);
  return JSON.stringify(parsed);
}

/**
 * Handle one HTTP request to the MCP endpoint. Netlify's custom headers do not apply to function
 * responses, so the function sets its own (https://docs.netlify.com/manage/routing/headers/).
 */
export async function handleMcpRequest(req: Request): Promise<Response> {
  // Stateless server: no server-initiated SSE stream (GET), no session to end (DELETE), no CORS preflight.
  if (req.method !== "POST") {
    return jsonRpcError(405, "Method not allowed. This stateless MCP endpoint accepts POST only.", { allow: "POST" });
  }
  const tooLarge = () => jsonRpcError(413, `Request body too large (limit ${MAX_BODY_BYTES} bytes).`);
  const length = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return tooLarge();
  const body = await req.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return tooLarge();

  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const headers = new Headers(req.headers);
    headers.delete("content-length"); // the body below may differ in length from the original
    const res = await transport.handleRequest(
      new Request(req.url, { method: "POST", headers, body: withDefaultArguments(body) }),
    );
    for (const [k, v] of Object.entries(NO_STORE)) res.headers.set(k, v);
    return res;
  } catch (err) {
    console.error("mcp handler error", err);
    return jsonRpcError(500, "Internal server error");
  } finally {
    // The JSON response body is fully built before handleRequest resolves, so closing here is safe.
    await transport.close();
    await server.close();
  }
}
