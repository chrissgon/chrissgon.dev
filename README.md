# chrissgon.dev

Christopher Gonçalves's personal site. Static pages for people (EN at `/`, PT at `/pt/`) and a surface for AI agents (`/llms.txt`, `/pt/llms.txt`, schema.org JSON-LD, sitemap), all generated from one typed data module. Built with [Astro](https://astro.build) and [Perfect UI](https://perfectui.dev), no Tailwind.

Status: design direction A, "Estrutura à mostra" (chosen by the owner on 2026-09-30), refined by the owner's Claude Design home (2026-09-30): every section is a cell of a visible frame with corner markers, a mono caption naming the Perfect UI classes that build it and, on the home page, a numbered index; a real `pui-switch` "view as agent" in the header of every page turns every region into its llms.txt reading, with CSS only. The home hero carries the dot portrait (poster only until the clips exist); the fonts are self-hosted. The read-only MCP server answers at `/api/mcp` (see below).

## Commands

Node 22.12 or newer (`.nvmrc`), npm.

| Task | Command |
|------|---------|
| Install | `npm ci` |
| Develop | `npm run dev` |
| Type-check | `npm run typecheck` |
| Test | `npm test` |
| Build | `npm run build` |
| Lighthouse | `npm run lighthouse` (after a build; needs Chrome) |
| Secret scan | `npm run secrets` |
| MCP server locally | `npm run build`, then `netlify dev --offline --framework '#static' --dir dist` (the site and `/api/mcp` on port 8888) |
| Portrait check (after a build) | `npm run check:portrait` (add `-- --with-synthetic-clips` to check the video path; needs ffmpeg) |
| Layout check (after a build) | `npm run check:layout`: no horizontal scroll on any page at 15 widths from 320 to 1920 px, and every grid of bordered cells closed |
| Share images (after a build) | `npm run og:image`: redraws `public/og/og-en.png` and `og-pt.png`; commit them |

`npm run build` runs, in order: `scripts/fetch-npm.ts` (npm downloads) and `scripts/fetch-workbench.ts` (the ai-workbench skill, agent and adapter counts, from one unauthenticated GET of its git tree on the GitHub API), each with a committed snapshot as fallback and a warning when the API is unreachable; the sensitive-topics check of `src/data/`; `scripts/check-images.ts`; `astro build`; then the sensitive-topics check and `scripts/check-dist.ts` over `dist/`.

## Checks of the build

- **Images** (`scripts/check-images.ts`): every post cover and project image file exists and is not empty; a missing one fails the build naming the post or project. A project without its own image uses a cover drawn at build from its data in the brand's dots (`src/components/ProjectVisual.astro`, one drawing per project listed in `src/lib/project-visuals.ts`; a test fails when a generated project has none).
- **dist** (`scripts/check-dist.ts`): every page loads the Perfect UI stylesheet and the home page uses `pui-btn`; no Tailwind file, word in code (stylesheets, scripts, a page's `<style>` and `<script>`; a project's text may name Tailwind as its stack), `--tw-` variable or utility class; at most one `<canvas>` per page; the first render of `/` and `/pt/` weighs at most 150 KB (HTML, stylesheets, scripts and their imports, preloads, eager images and every font the CSS declares; gzip for text; the lazy portrait video excluded); both `llms.txt` have an H1, a link and 50 characters; the home pages carry the JSON-LD Person; every page links `favicon.ico`, `favicon.svg`, `apple-touch-icon.png` and `site.webmanifest`, and carries `og:image` and `twitter:image`, each pointing to a file in `dist/` (the share image an absolute URL on the site's origin, a PNG of the declared `og:image:width` and `og:image:height`, with an alt); the manifest has a name, a short name, a start URL and icons that exist; no SVG file or inline SVG carries a `<metadata>` element; `netlify.toml` serves `/site.webmanifest` as `application/manifest+json` (Netlify's default for it is `application/octet-stream`). Icons and share images are not first-render bytes; the header's inline symbol is. The weight report goes to stderr.
- **Lighthouse** (`scripts/lighthouse.ts`, CI job `lighthouse`): Lighthouse 13.5.0 on `dist/` served locally, mobile profile, one discarded warm-up run per page then the median of 5 runs: performance at least 90 and agentic browsing 100 on `/` and `/pt/`. Reports land in `lighthouse-report/` (git-ignored) and in the job summary.

## Logo, icons and share images

The logo is 4a from the owner's brand export (a white C with a floating bar in `#07b6f0`, and the wordmark "chrissgon"). The site ships only what it uses, each file with the export's C2PA metadata removed (the `<metadata>` element of SVGs, the `caBX` chunk of PNGs; the drawing and the pixels unchanged):

- `public/`: `favicon.ico` (16, 32, 48), `favicon.svg`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` and `site.webmanifest`, linked from `src/layouts/Base.astro`. Keep these paths: search engines show a favicon only from a stable URL.
- The header's brand link starts with the symbol as inline SVG (`.brand-mark`, `aria-hidden`); when the header row, which holds the "view as agent" switch on every page, leaves the link too little room (a container query on `.brand`), it shows the symbol alone and the domain stays the link's accessible name. Below 900 px the header has two rows: the brand, the switch and EN / PT, then the navigation.
- `public/og/og-en.png` and `og-pt.png` (1200 x 630): drawn by `scripts/og-image.ts` from `scripts/og-image/lockup.svg` and `profile.label` over the page's dot grid, in the build's own Inter. Redraw them with `npm run og:image` after a build whenever the label or the logo changes, and commit them. A test keeps them 1200 x 630 and under 100 KB, and every image in `public/` free of metadata.

## Data

Everything the site says lives in `src/data/` and is validated with zod on import (`src/data/schema.ts`); an undeclared field fails the build. Pages, `llms.txt` and JSON-LD all read the same objects.

| File | Holds |
|------|-------|
| `profile.ts` | name, label, about, profiles |
| `products.ts` | Perfect UI and ai-workbench |
| `projects.ts` | projects with type, status and stack |
| `posts.json` | posts, newest first, with a cover in `src/assets/posts/` |
| `trajectory.ts` | timeline by years and roles, proofs |
| `lab.ts` | experiments |
| `stats.ts` | the numbers strip |
| `npm-snapshot.json`, `workbench-snapshot.json` | fallbacks of the counts read at build |
| `labels.ts` | interface labels in EN and PT |

To add a post: add its cover to `src/assets/posts/` (without EXIF, GPS or other metadata; a test checks), add an entry at the top of `src/data/posts.json` with its LinkedIn `url`, open a pull request.

The npm count and the ai-workbench counts are read at build; their fallbacks are `src/data/npm-snapshot.json` and `src/data/workbench-snapshot.json` (`npm run data:npm -- --update-snapshot`, `npm run data:workbench -- --update-snapshot`). A snapshot older than 35 days is not shown. The "Pick the next post" round is read at build from the owner's GitHub profile, with `src/data/pick-snapshot.json` as its fallback (`npm run data:pick -- --update-snapshot`), and refreshed in the page once the section comes near.

## MCP server

A read-only [MCP](https://modelcontextprotocol.io) server at `/api/mcp`: a Netlify Function (`netlify/functions/mcp.mts`) with the tools in `src/mcp/server.ts`. Stateless Streamable HTTP with JSON responses; POST only (anything else gets 405).

| Tool | Input | Returns |
|------|-------|---------|
| `get_profile` | `lang` (`"en"` default, or `"pt"`) | name, handle, job title, label, About, profiles |
| `list_products` | `lang` | products with summary, license, languages and last month's npm downloads |
| `list_posts` | `limit` 1 to 50 (default 10), `lang` | posts, newest first |

Every tool is read-only and reads only `src/data/`; inputs are strict, so an unknown field or an out-of-range value is rejected, and a tool that does not exist answers `Tool <name> not found`. Netlify blocks more than 30 requests per 60 s per IP with a 429 (`config.rateLimit` in the function). Try it: `npx -y @modelcontextprotocol/inspector@2.8.0 --cli http://localhost:8888/api/mcp --transport http --method tools/list`.

## Portrait

The home hero shows a portrait drawn in dots on one `<canvas>` (`src/components/Portrait.astro`, renderer in `src/lib/portrait/`, no dependencies). The dot grid `src/assets/portrait/portrait.json` is inlined in the page, so the first render needs no request; the clips load after the page's `load` event. With reduced motion or Save-Data the poster stays still and no video is requested; without JavaScript, `public/portrait/portrait-fallback.webp` shows the same dots. Only derived files are committed: the dot grid, the fallback and the encoded clips, never a source photo or source video.

The clips (`public/portrait/portrait-{loop,greet}.{webm,mp4}`) are offered only when their files exist at build time. To make them from the generated videos (kept outside this repository):

```sh
scripts/encode-portrait.sh --in <folder with loop.mp4 and greet.mp4> --first-frame /tmp/first.png   # choose the crop box on it
scripts/encode-portrait.sh --in <folder> --crop X,Y,W --poster-script <path to portrait.py>
```

The script crops, denoises and scales to twice the dot grid, encodes VP9 and H.264 in parallel, remakes the poster from the loop's first frame (with `--poster-script`), and checks that each format pair is 150 KB or less and that the loop wrap and the joins between clips are no larger than the largest step inside the clips. `--help` lists every option; `--self-test` runs it on synthetic clips. The tone of the poster (`--gamma`, `--floor`, `--equalize`) must match `src/lib/portrait/config.ts`. `scripts/portrait-fallback.py` redraws the no-JavaScript WebP from the dot grid (`uv run -q --with pillow scripts/portrait-fallback.py`).

## Fonts

Inter (400, 600, 800) and JetBrains Mono (400, 600) are self-hosted through Astro's Fonts API with the Fontsource provider, `latin` subset, WOFF2 (`astro.config.mjs`); the build downloads them into `/_astro/fonts/`. Only Inter 400 and 800, used by the first screen, are preloaded (`src/layouts/Base.astro`). No font is loaded from a third party.

## Sensitive-topics check

`scripts/check-sensitive.ts` fails the build when a keyword of a sensitive topic appears in the data or in the built site. The keyword list `src/data/sensitive-topics.json` is a verbatim copy of the owner's brand profile list; its sha256 is recorded here and checked by a test:

`b276beb45e0e4edac053284938ab8caae9205b8c8d63c1c264c3865bb5dda6fc`

A false positive in this site's texts goes to `src/data/sensitive-exclude.json` with a reason; a topic is never switched off. Private terms, which must never be committed, are read from the `SENSITIVE_PRIVATE_TERMS` environment variable (a repository secret in CI) and from the local, git-ignored `docs/private-terms.txt`, one term per line. Without either, the check says so and runs the public list only.

## Security

See [SECURITY.md](SECURITY.md). The git hooks (`.husky/`: the pre-commit checks and the commit message convention) are installed by `npm install`; nothing to enable by hand.
