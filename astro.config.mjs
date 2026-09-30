// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// ADR-0005: static output, no adapter. ADR-0010: EN at /, PT at /pt, `site` from Netlify's URL.
export default defineConfig({
  site: process.env.URL ?? "https://chrissgon.dev",
  output: "static",
  // Pages are folders (/projects/index.html); every page URL ends with "/", as in the sitemap.
  trailingSlash: "always",
  i18n: {
    locales: ["en", "pt"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      i18n: { defaultLocale: "en", locales: { en: "en", pt: "pt-BR" } },
    }),
  ],
});
