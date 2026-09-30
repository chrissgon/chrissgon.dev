# chrissgon.dev

Christopher Gonçalves's personal site: static Astro pages in EN (at the root) and PT (under /pt/), plus `llms.txt` and schema.org JSON-LD for AI agents, all generated from one typed data module. Status: design direction A "Estrutura à mostra" (see `README.md`).

## Architecture

The design and its decision records are kept locally by the owner, outside this repository (`docs/` is git-ignored). What holds here:

- `src/data/` is the only source of facts (profile, products, projects, posts, trajectory, lab, stats, labels). `src/data/index.ts` validates everything with the zod schemas in `src/data/schema.ts`; pages, `src/lib/llms.ts` and `src/lib/jsonld.ts` import from it and never hard-code a fact.
- Static output, no adapter (`astro.config.mjs`); i18n with EN unprefixed and PT under /pt/; `site` comes from the `URL` environment variable, else `https://chrissgon.dev`.
- One view per page in `src/views/`, used by the EN page in `src/pages/` and the PT page in `src/pages/pt/`.
- Text endpoints: `src/pages/llms.txt.ts`, `src/pages/pt/llms.txt.ts`, `src/pages/robots.txt.ts`. Sitemap: `@astrojs/sitemap`.
- Read-only MCP server: `netlify/functions/mcp.mts` at `/api/mcp` (route and rate limit in its `config`), tools in `src/mcp/server.ts`, reading only `src/data/`. Every tool stays read-only with a strict input schema; `tests/mcp.test.ts` covers the protocol, each tool, unknown data (EDGE-1) and injected instructions (EDGE-3). Local run: `netlify dev --offline --framework '#static' --dir dist` after `npm run build` (`astro dev` does not serve functions).
- Netlify builds and publishes (`netlify.toml`); this repository's CI never deploys.
- The portrait island (`src/components/Portrait.astro`) mounts `src/lib/portrait/` on a canvas: pure parts (`levels.ts`, `grid.ts`, `gating.ts`, `colors.ts`, `bands.ts`) are unit-tested, `mount.ts` holds the DOM. Clips are offered only when their files exist in `public/portrait/` at build time.
- Design direction A, refined by the owner's Claude Design home (2026-09-30): `src/styles/site.css` (frame, cells, corner markers, captions and numbered indexes, filter chips, the view-as-agent rules) plus one component per repeated piece in `src/components/` (`Cell`, `AgentSwitch`, `AgentText`, `Showcase`, `CopyField`, cards). The project filters (`src/scripts/filters.ts` over `src/lib/filters.ts`) run on the projects page and in the home page's projects section. Colours are Perfect UI's dark tokens only, one blue element per viewport, no gradients or shadows (the radial-gradient images are dot patterns). "view as agent" is CSS only (`[data-agent-scope]:has(.agent-toggle:checked)`); each region's reading is its part of llms.txt (`llmsParts` in `src/lib/llms.ts`). Small enhancements live in `src/scripts/site.ts` (tabs, copy, reveal on scroll, count-up) and `src/scripts/filters.ts`, and everything reads and works without JavaScript.
- Post covers are 9:16 portraits cropped at build (`src/components/PostCard.astro`): `src/lib/covers.ts` gives the largest 9:16 crop a source holds and srcset widths never above it (the image service does not enlarge); each post's `coverFocus` in `src/data/posts.json` anchors the crop. The home page's posts row scrolls sideways below 1024 px; the writing page is a grid of 4, 3 or 2 columns.
- Fonts come from Astro's Fonts API (`fonts` in `astro.config.mjs`, `<Font>` in `src/layouts/Base.astro`); never add a third-party font link.

## Commands

| Task | Command | Notes |
|------|---------|-------|
| Install | `npm ci` | from `package-lock.json` |
| Develop | `npm run dev` | |
| Type-check | `npm run typecheck` | `astro check` and `tsc --noEmit` |
| Test | `npm test` | vitest, `tests/*.test.ts` |
| Build | `npm run build` | npm and ai-workbench counts, sensitive check of `src/data/`, image check, `astro build`, sensitive check and `check-dist` of `dist/` |
| Lighthouse | `npm run lighthouse` | after a build; Lighthouse 13.5.0 mobile, 1 discarded warm-up then the median of 5 runs per page, performance >= 90, agentic browsing = 100 |
| Secret scan | `npm run secrets` | add `-- --history` for every commit |
| Portrait check | `npm run check:portrait` | after a build; Playwright Chromium; `-- --with-synthetic-clips` needs ffmpeg |
| Layout check | `npm run check:layout` | after a build; Playwright Chromium (`-- --channel chrome` for an installed Chrome, as CI does); every page at 15 widths from 320 to 1920 px, no horizontal scroll |
| Portrait clips | `scripts/encode-portrait.sh --help` | ffmpeg; `--self-test` on synthetic clips |
| npm snapshot | `npm run data:npm -- --update-snapshot` | refreshes `src/data/npm-snapshot.json` |
| ai-workbench snapshot | `npm run data:workbench -- --update-snapshot` | refreshes `src/data/workbench-snapshot.json` |

## Conventions

- TypeScript strict (`tsconfig.json` extends Astro's strict preset, plus `noUncheckedIndexedAccess`).
- Texts shown on the site are copied verbatim from the owner's approved content. Never write, translate or "improve" a public text on your own; a missing text is an open question for the owner. Labels not yet approved live in the `provisional` block of `src/data/labels.ts`.
- Nothing about employers, clients, family, age, income, politics, exact location, leadership or job seeking goes into any file. The sensitive-topics check enforces the keyword part; a false positive goes to `src/data/sensitive-exclude.json` with a reason, never by editing `src/data/sensitive-topics.json`.
- Code, comments and repository documents are in English.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`), signed.

## Testing

- vitest; tests live in `tests/`. Cover the data schemas, the sensitive-topics check, the generated `llms.txt`, JSON-LD and project cards, the MCP tools, the cover crop (`src/lib/covers.ts`), the build checks (`check-images`, `check-dist`, the Lighthouse gate) and the pure portrait functions (`src/lib/portrait/`) whenever they change.
- Images committed under `src/assets/` carry no EXIF, GPS, XMP or text metadata (`tests/images.test.ts`).
- `npm run check:portrait` (Playwright) checks the built home pages: canvas drawn, no video request without clips, with reduced motion or Save-Data, no console errors, no-JS fallback, the pointer pushing dots and the poster coming back exactly; when the build carries the real clips (`public/portrait/portrait-loop.*`), the video path and no long task while the clip plays at CPU x8, with the pointer check run under Save-Data; `-- --with-synthetic-clips` adds the same video checks on synthetic clips (loop and greeting). Run it after changing the portrait or the layout around it.
- `npm run check:layout` (Playwright, also in CI's `build` job on the runner's Chrome) loads every page, EN and PT, as loaded, with "view as agent" on and with each lab experiment opened, at 320, 360, 375, 390, 414, 600, 768, 820, 1024, 1100, 1186, 1280, 1366, 1440 and 1920 px with scrollbars drawn, and fails when the page is wider than the viewport, naming the elements that stick out. Anything wide (code, chip rows, tables) wraps or scrolls inside its own box; never hide the page's overflow to pass it.
- Never commit a source photo or source video of the owner: only the dot grid, the fallback WebP and the encoded clips.

## Security

- Credentials never enter the repository. `.env` and `.env.*` are git-ignored; private sensitive terms come from `SENSITIVE_PRIVATE_TERMS` or the local, git-ignored file docs/private-terms.txt.
- Enable the pre-commit hook once per clone: `git config core.hooksPath .githooks`. It runs the secret scan, types, tests and the build. Never skip it.
- Report vulnerabilities as described in `SECURITY.md`.

## Working rules

- `main` is protected: every change goes through a branch and a pull request, merged by squash only when the required checks `secrets`, `build` and `lighthouse` are green. No force push, no rule changes, no bypass.
- Nothing is published outside GitHub from this repository by an agent: Netlify and DNS changes are the owner's.
