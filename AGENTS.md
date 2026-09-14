# Repository Guidelines

JanuszexGrafikPro is an Astro 6 full-SSR web app (React 19 islands, Tailwind 4, Supabase auth, shadcn/ui) for café shift-scheduling, deployed to Cloudflare Workers. All tooling is npm-based; source lives in `src/`.

## Hard Rules

- No Next.js directives (`"use client"`); interactivity is handled by `@astrojs/react` islands.
- Build class strings with `cn()` from @src/lib/utils.ts (clsx + tailwind-merge). Never concatenate `className` manually.
- Use React `.tsx` only where interactivity is needed; static UI belongs in `.astro`.
- Extract React hooks to `src/components/hooks/`; shared services/helpers to `src/lib/` (or `src/lib/services/`); shared types to `src/types.ts`.
- Server secrets come from `astro:env/server` (`SUPABASE_URL`, `SUPABASE_KEY` in @astro.config.mjs) and are optional — `createClient()` in @src/lib/supabase.ts returns `null` when unset, so always guard on it.
- Wartości `SUPABASE_URL`/`SUPABASE_KEY` są czytane w **runtime** z bindingów Workera (`astro:env` → `env.SUPABASE_*`), nie są wypiekane w buildzie. Rotacja klucza = `wrangler secret put SUPABASE_KEY` (albo dashboard → Variables & Secrets) + redeploy. „Build variables" z panelu Builds **nie** trafiają do kodu.

## Commands

- **Środowisko:** Windows 11 (PowerShell) **bez Dockera** + WSL Ubuntu (tam Docker i Supabase CLI `~/bin/supabase`, na PATH jako `supabase`). Wszystko wymagające Dockera (lokalny Supabase) odpalaj **z WSL**, w katalogu projektu (`cd /mnt/c/Repositories/Own/JanuszexGrafikPro`). `npm run dev`/`build` odpalaj **z PowerShell** (Windows).
- All scripts (`dev`, `build`, `preview`, `lint`, `format`, `check`, `test`, `test:watch`, `test:integration`) are in @package.json.
- `npm run dev` runs on Cloudflare workerd — lokalny Supabase najpierw startuj **z WSL** (`supabase start`), a sam `npm run dev` wykonuj **z PowerShell** (Windows).
- Migrations (always from WSL, never `npx supabase` — fails in WSL on Windows-only binaries in node_modules, fails on Windows without Docker): `supabase migration new <nazwa>` (plik w `supabase/migrations/`), lokalnie `supabase db reset` (migracje + seed), na produkcję ręcznie `supabase link` + `supabase db push`. Seed (`supabase/seed.sql`) tylko lokalnie — nigdy na zdalnym projekcie.
- Refresh DB types: `npm run db:types` → `src/lib/database.types.ts` (committed, excluded from eslint/prettier).
- Deploy target = Cloudflare **Workers** przez `@astrojs/cloudflare` v13+ (Cloudflare Pages jest wycofywane — nie używać komend `wrangler pages`).
- Produkcję publikuje **Workers Builds** po mergu na `master` (`npm run build` + `npx wrangler deploy`). GitHub Actions to tylko quality gate — nigdy nie publikuje.
- Ręczny deploy: `npx wrangler deploy` (wymaga `wrangler` auth); cofnięcie: `npx wrangler rollback`.
- Pre-commit auto-runs `eslint --fix` + `prettier --write` via husky + lint-staged (see `lint-staged` in @package.json).

## Architecture & Auth Flow

- All routes are server-rendered by default (`output: "server"` in @astro.config.mjs).
- @src/middleware.ts runs on every request: resolves the user through the Supabase SSR client, attaches it to `context.locals.user`, and redirects unauthenticated visitors away from routes listed in `PROTECTED_ROUTES`.
- @src/lib/supabase.ts creates the cookie-based `@supabase/ssr` client from `astro:env/server`.
- Auth API: `src/pages/api/auth/{signin,signup,signout}.ts`; auth pages: `src/pages/auth/*.astro`; protected-page example: @src/pages/dashboard.astro.

## Project Structure

- `src/pages/` — file-based routes; API route handlers in `src/pages/api/`
- `src/components/` — `ui/` holds shadcn/ui (new-york); feature components in named subfolders (`auth/`)
- `src/lib/` — helpers, services, and the supabase client
- `src/layouts/`, `src/styles/` — layout and global styles
- `supabase/migrations/` — SQL migrations
- `context/` — 10x workflow artifacts (do not touch for feature work)

## Conventions

- Path alias `@/*` maps to `src/*` (@tsconfig.json).
- API routes export uppercase `GET`/`POST` handlers — @src/pages/api/auth/signup.ts is the reference shape.
- shadcn/ui: components live in `src/components/ui/`, new-york variant; install new ones with `npx shadcn@latest add [name]`.
- Migrations: `YYYYMMDDHHmmss_short_description.sql`; always enable RLS with granular per-operation, per-role policies on new tables.
- Node.js v22.14.0 (see @.nvmrc).

## Testing

Unit tests run on Vitest 4 in a Node environment (`vitest.config.ts`): `npm test` (single run) / `npm run test:watch` (local). Tests live **next to the module** as `src/**/*.test.ts` and import `describe`/`it`/`expect` **explicitly from `vitest`** — do not add test globals to `tsconfig.json` or ESLint.

Only pure, framework-free modules are unit-testable: `src/lib/week.ts`, `src/lib/format.ts`, `src/lib/services/{schedule-generation,schedule-validation,schedule-export}.ts`. Modules touching Supabase/Astro are import-safe (client is `import type`) but their DB functions need a mock — that is integration territory, not covered here.

Integration tests (server-side rules: save gate, freeze, permissions, response shapes) run on Vitest against the **real local Supabase**: `npm run test:integration` (separate `vitest.integration.config.ts` with an alias of `astro:env/server` to a stub in `test/integration/stubs/`). They need the local DB up: from WSL `supabase start` + `supabase db reset` (migrations + seed). Tests live in `test/integration/**/*.test.ts` and call route handlers directly via helpers in `test/integration/helpers.ts` — session cookies from `signUpOwner`/`signIn` in the request header are mandatory, otherwise RLS returns zero rows. `npm test` (unit) stays DB-free.

Database/RLS tests run on **pgTAP** via the Supabase CLI: `supabase test db` (from WSL, never `npx supabase`). They need the local stack up (`supabase start`; run `supabase db reset` first for a clean base) and locally no npm script wraps them. Tests live in `supabase/tests/database/**/*.test.sql`; `supabase test db` hands **every** `.sql`/`.pg` file under `supabase/tests/` (recursively) to `pg_prove`, so a non-pgTAP `.sql` anywhere there breaks the whole run. They insert fixture rows into `auth.users`, so they are **local/CI only** — never run with `--linked` or against a remote project. Reference: @supabase/tests/database/rls_isolation.test.sql.

CI (`.github/workflows/ci.yml`) runs `astro sync` → `lint` → `check` → `test` → `build` in the `ci` job, plus an `integration` job (ubuntu + Docker + Supabase CLI + `supabase test db` + `npm run test:integration`). It is a quality gate only — Workers Builds publishes after merge to `master`, so these checks must also be required in GitHub branch protection or a red change still ships.

## Commits & PRs

History uses single-line Polish messages naming the executed command and artifacts produced (e.g. "Egzekucja `/10x-shape`, stworzenie pliku `shape-notes.md`"). CI runs on push/PR to `master`.

## Security, Config & CI

Copy @.env.example to `.env` (Node) or `.dev.vars` (Cloudflare local dev); both are gitignored. Never commit real secrets. The CI build step needs repo secrets `SUPABASE_URL` and `SUPABASE_KEY` (@.github/workflows/ci.yml).