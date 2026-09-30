/** The absolute site URL without a trailing slash, from Astro's `site` (ADR-0010). */
export function siteUrl(site: URL | undefined): string {
  if (!site) throw new Error("astro.config.mjs must set `site`");
  return site.href.replace(/\/$/, "");
}
