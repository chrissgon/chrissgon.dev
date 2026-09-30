import type { APIRoute } from "astro";
import { readNpmCount } from "../../data/index.ts";
import { llmsText } from "../../lib/llms.ts";
import { siteUrl } from "../../lib/site.ts";

export const GET: APIRoute = ({ site }) =>
  new Response(llmsText("pt", { site: siteUrl(site), npm: readNpmCount() }), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
