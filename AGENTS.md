# chrissgon.dev

Christopher Gonçalves's personal site: static Astro pages in EN (at the root) and PT (under /pt/), plus `llms.txt` and schema.org JSON-LD for AI agents, all generated from one typed data module. Status: foundation, without the visual design (see `README.md`).

## Architecture

The design and its decision records are kept locally by the owner, outside this repository (`docs/` is git-ignored). What holds here:

- `src/data/` is the only source of facts (profile, products, projects, posts, trajectory, lab, stats, labels). `src/data/index.ts` validates everything with the zod schemas in `src/data/schema.ts`; pages, `src/lib/llms.ts` and `src/lib/jsonld.ts` import from it and never hard-code a fact.
- Static output, no adapter (`astro.config.mjs`); i18n with EN unprefixed and PT under /pt/; `site` comes from the `URL` environment variable, else `https://chrissgon.dev`.
- One view per page in `src/views/`, used by the EN page in `src/pages/` and the PT page in `src/pages/pt/`.
- Text endpoints: `src/pages/llms.txt.ts`, `src/pages/pt/llms.txt.ts`, `src/pages/robots.txt.ts`. Sitemap: `@astrojs/sitemap`.
- Read-only MCP server: `netlify/functions/mcp.mts` at `/api/mcp` (route and rate limit in its `config`), tools in `src/mcp/server.ts`, reading only `src/data/`. Every tool stays read-only with a strict input schema; `tests/mcp.test.ts` covers the protocol, each tool, unknown data (EDGE-1) and injected instructions (EDGE-3). Local run: `netlify dev --offline --framework '#static' --dir dist` after `npm run build` (`astro dev` does not serve functions).
- Netlify builds and publishes (`netlify.toml`); this repository's CI never deploys.

## Commands

| Task | Command | Notes |
|------|---------|-------|
| Install | `npm ci` | from `package-lock.json` |
| Develop | `npm run dev` | |
| Type-check | `npm run typecheck` | `astro check` and `tsc --noEmit` |
| Test | `npm test` | vitest, `tests/*.test.ts` |
| Build | `npm run build` | npm count, sensitive check of `src/data/`, `astro build`, sensitive check of `dist/` |
| Secret scan | `npm run secrets` | add `-- --history` for every commit |
| npm snapshot | `npm run data:npm -- --update-snapshot` | refreshes `src/data/npm-snapshot.json` |

## Conventions

- TypeScript strict (`tsconfig.json` extends Astro's strict preset, plus `noUncheckedIndexedAccess`).
- Texts shown on the site are copied verbatim from the owner's approved content. Never write, translate or "improve" a public text on your own; a missing text is an open question for the owner. Labels not yet approved live in the `provisional` block of `src/data/labels.ts`.
- Nothing about employers, clients, family, age, income, politics, exact location, leadership or job seeking goes into any file. The sensitive-topics check enforces the keyword part; a false positive goes to `src/data/sensitive-exclude.json` with a reason, never by editing `src/data/sensitive-topics.json`.
- Code, comments and repository documents are in English.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`), signed.

## Testing

- vitest; tests live in `tests/`. Cover the data schemas, the sensitive-topics check, the generated `llms.txt` and JSON-LD, and the MCP tools whenever they change.

## Security

- Credentials never enter the repository. `.env` and `.env.*` are git-ignored; private sensitive terms come from `SENSITIVE_PRIVATE_TERMS` or the local, git-ignored file docs/private-terms.txt.
- Enable the pre-commit hook once per clone: `git config core.hooksPath .githooks`. It runs the secret scan, types, tests and the build. Never skip it.
- Report vulnerabilities as described in `SECURITY.md`.

## Working rules

- `main` is protected: every change goes through a branch and a pull request, merged by squash only when the `secrets` and `build` checks are green. No force push, no rule changes, no bypass.
- Nothing is published outside GitHub from this repository by an agent: Netlify and DNS changes are the owner's.
