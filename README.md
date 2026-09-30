# chrissgon.dev

Christopher Gonçalves's personal site. Static pages for people (EN at `/`, PT at `/pt/`) and a surface for AI agents (`/llms.txt`, `/pt/llms.txt`, schema.org JSON-LD, sitemap), all generated from one typed data module. Built with [Astro](https://astro.build) and [Perfect UI](https://perfectui.dev), no Tailwind.

Status: foundation. The pages render the data without a visual design yet; the design, the dot portrait and the Lighthouse checks come in later pull requests. The read-only MCP server answers at `/api/mcp` (see below).

## Commands

Node 22.12 or newer (`.nvmrc`), npm.

| Task | Command |
|------|---------|
| Install | `npm ci` |
| Develop | `npm run dev` |
| Type-check | `npm run typecheck` |
| Test | `npm test` |
| Build | `npm run build` |
| Secret scan | `npm run secrets` |
| MCP server locally | `npm run build`, then `netlify dev --offline --framework '#static' --dir dist` (the site and `/api/mcp` on port 8888) |

`npm run build` runs, in order: `scripts/fetch-npm.ts` (npm downloads, with a committed snapshot as fallback), the sensitive-topics check of `src/data/`, `astro build`, and the same check over `dist/`.

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
| `labels.ts` | interface labels in EN and PT |

To add a post: add its cover to `src/assets/posts/`, add an entry at the top of `src/data/posts.json`, open a pull request.

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
