import type { APIRoute } from "astro";
import { siteUrl } from "../lib/site.ts";

// ADR-0010: every crawler and AI agent is welcome; the sitemap lists both languages.
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${siteUrl(site)}/sitemap-index.xml\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
