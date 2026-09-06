# Repository Guidelines

JanuszexGrafikPro is an Astro 6 full-SSR web app (React 19 islands, Tailwind 4, Supabase auth, shadcn/ui) for café shift-scheduling, deployed to Cloudflare Workers. All tooling is npm-based; source lives in `src/`.

## Hard Rules

- No Next.js directives (`"use client"`); interactivity is handled by `@astrojs/react` islands.
- Build class strings with `cn()` from @src/lib/utils.ts (clsx + tailwind-merge). Never concatenate `className` manually.
- Use React `.tsx` only where interactivity is needed; static UI belongs in `.astro`.
- Extract React hooks to `src/components/hooks/`; shared services/helpers to `src/lib/` (or `src/lib/services/`); shared types to `src/types.ts`.
- Server secrets come from `astro:env/server` (`SUPABASE_URL`, `SUPABASE_KEY` in @astro.config.mjs) and are optional — `createClient()` in @src/lib/supabase.ts returns `null` when unset, so always guard on it.

## Commands

- `npm run dev` — dev server on Cloudflare workerd (start local Supabase first with `npx supabase start`; requires Docker)
- `npm run build` — production SSR build (`@astrojs/cloudflare`)
- `npm run preview` — preview the production build
- `npm run lint` / `npm run lint:fix` — ESLint with strict type-checked rules
- `npm run format` — Prettier (astro + tailwind plugins)
- Deploy — `npx wrangler deploy` (requires `wrangler` auth)

Pre-commit: husky + lint-staged auto-runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

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

No test runner is configured. The CI gate is `npx astro sync` + `npm run lint` + `npm run build` (@.github/workflows/ci.yml).

## Commits & PRs

History uses single-line Polish messages naming the executed command and artifacts produced (e.g. "Egzekucja `/10x-shape`, stworzenie pliku `shape-notes.md`"). CI runs on push/PR to `master`.

## Security, Config & CI

Copy @.env.example to `.env` (Node) or `.dev.vars` (Cloudflare local dev); both are gitignored. Never commit real secrets. The CI build step needs repo secrets `SUPABASE_URL` and `SUPABASE_KEY` (@.github/workflows/ci.yml).