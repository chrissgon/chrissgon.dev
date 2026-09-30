# chrissgon.dev

Christopher Gonçalves's personal site. Static pages for people (EN at `/`, PT at `/pt/`) and a surface for AI agents (`/llms.txt`, `/pt/llms.txt`, schema.org JSON-LD, sitemap), all generated from one typed data module. Built with [Astro](https://astro.build) and [Perfect UI](https://perfectui.dev), no Tailwind.

Status: foundation. The pages render the data without a visual design yet; the design and the dot portrait come in later pull requests. The read-only MCP server answers at `/api/mcp` (see below).

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

`npm run build` runs, in order: `scripts/fetch-npm.ts` (npm downloads) and `scripts/fetch-workbench.ts` (the ai-workbench skill, agent and adapter counts, from one unauthenticated GET of its git tree on the GitHub API), each with a committed snapshot as fallback and a warning when the API is unreachable; the sensitive-topics check of `src/data/`; `scripts/check-images.ts`; `astro build`; then the sensitive-topics check and `scripts/check-dist.ts` over `dist/`.

## Checks of the build

- **Images** (`scripts/check-images.ts`): every post cover and project image file exists and is not empty; a missing one fails the build naming the post or project. A project without its own image uses a card generated at build from its data (`src/lib/cards.ts`, inline SVG).
- **dist** (`scripts/check-dist.ts`): every page loads the Perfect UI stylesheet and the home page uses `pui-btn`; no Tailwind file, word, `--tw-` variable or utility class; at most one `<canvas>` per page; the first render of `/` and `/pt/` weighs at most 150 KB (HTML, stylesheets, scripts and their imports, preloads, eager images and every font the CSS declares; gzip for text; the lazy portrait video excluded); both `llms.txt` have an H1, a link and 50 characters; the home pages carry the JSON-LD Person. The weight report goes to stderr.
- **Lighthouse** (`scripts/lighthouse.ts`, CI job `lighthouse`): Lighthouse 13.5.0 on `dist/` served locally, mobile profile, median of 3 runs: performance at least 90 and agentic browsing 100 on `/` and `/pt/`. Reports land in `lighthouse-report/` (git-ignored) and in the job summary.

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

The npm count and the ai-workbench counts are read at build; their fallbacks are `src/data/npm-snapshot.json` and `src/data/workbench-snapshot.json` (`npm run data:npm -- --update-snapshot`, `npm run data:workbench -- --update-snapshot`). A snapshot older than 35 days is not shown.

## MCP server

A read-only [MCP](https://modelcontextprotocol.io) server at `/api/mcp`: a Netlify Function (`netlify/functions/mcp.mts`) with the tools in `src/mcp/server.ts`. Stateless Streamable HTTP with JSON responses; POST only (anything else gets 405).

| Tool | Input | Returns |
|------|-------|---------|
| `get_profile` | `lang` (`"en"` default, or `"pt"`) | name, handle, job title, label, About, profiles |
| `list_products` | `lang` | products with summary, license, languages and last month's npm downloads |
| `list_posts` | `limit` 1 to 50 (default 10), `lang` | posts, newest first |

Every tool is read-only and reads only `src/data/`; inputs are strict, so an unknown field or an out-of-range value is rejected, and a tool that does not exist answers `Tool <name> not found`. Netlify blocks more than 30 requests per 60 s per IP with a 429 (`config.rateLimit` in the function). Try it: `npx -y @modelcontextprotocol/inspector@2.8.0 --cli http://localhost:8888/api/mcp --transport http --method tools/list`.

## Sensitive-topics check

`scripts/check-sensitive.ts` fails the build when a keyword of a sensitive topic appears in the data or in the built site. The keyword list `src/data/sensitive-topics.json` is a verbatim copy of the owner's brand profile list; its sha256 is recorded here and checked by a test:

`b276beb45e0e4edac053284938ab8caae9205b8c8d63c1c264c3865bb5dda6fc`

A false positive in this site's texts goes to `src/data/sensitive-exclude.json` with a reason; a topic is never switched off. Private terms, which must never be committed, are read from the `SENSITIVE_PRIVATE_TERMS` environment variable (a repository secret in CI) and from the local, git-ignored `docs/private-terms.txt`, one term per line. Without either, the check says so and runs the public list only.

## Security

See [SECURITY.md](SECURITY.md). Enable the pre-commit hook once per clone: `git config core.hooksPath .githooks`.
