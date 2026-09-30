// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";

// ADR-0005: static output, no adapter. ADR-0010: EN at /, PT at /pt, `site` from Netlify's URL.
// ADR-0006: fonts self-hosted through the Fonts API (Fontsource, latin subset, WOFF2); the build downloads
// them and serves them from /_astro/fonts/ (https://docs.astro.build/en/guides/fonts/, read 2026-09-30).
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
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Inter",
      cssVariable: "--font-sans",
      weights: [400, 600, 800],
      styles: ["normal"],
      subsets: ["latin"],
      formats: ["woff2"],
      fallbacks: ["sans-serif"],
    },
    {
      provider: fontProviders.fontsource(),
      name: "JetBrains Mono",
      cssVariable: "--font-mono",
      weights: [400, 600],
      styles: ["normal"],
      subsets: ["latin"],
      formats: ["woff2"],
      fallbacks: ["monospace"],
    },
  ],
  integrations: [
    sitemap({
      i18n: { defaultLocale: "en", locales: { en: "en", pt: "pt-BR" } },
    }),
  ],
});
