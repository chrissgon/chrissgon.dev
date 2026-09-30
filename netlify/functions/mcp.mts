// The read-only MCP server as a Netlify Function v2 (ADR-0004, ADR-0005). The tools and the handler live
// in src/mcp/server.ts, which reads the site's data module (ADR-0001).
import type { Config } from "@netlify/functions";
import { handleMcpRequest } from "../../src/mcp/server.ts";

export default handleMcpRequest;

export const config: Config = {
  path: "/api/mcp",
  // 30 requests per 60 s per IP and domain (state.md, 2026-09-29: credit-based Free plan). A blocked
  // request gets a 429 without invoking the function or using credits. Rate limits of functions are
  // set here, not in netlify.toml; `action` is left out, so the default (block) applies.
  // https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/ (accessed 2026-09-30)
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
