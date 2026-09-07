---
project: januszex-grafik-pro
researched_at: 2026-09-07
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: typescript
  framework: astro
  runtime: cloudflare-workers
---

## Recommendation

**Deploy on Cloudflare Workers — Workers Free plan ($0/mo), auto-deploy via Cloudflare's native Git integration (Workers Builds).**

The project is already wired for Cloudflare end-to-end: the 10x-astro-starter ships the `@astrojs/cloudflare` v13 adapter (Workers target — v13 dropped Pages support), `wrangler` v4, a `wrangler.jsonc` with the Workers + Static Assets entrypoint, and `astro:env/server` secret wiring. That makes Cloudflare the only candidate with **zero adapter or CLI migration work**. The cost decision is now explicit: the **Workers Free plan costs $0/mo** and its caps (100,000 requests/day, 10ms CPU per invocation, unlimited static-asset serving) comfortably cover an MVP used by a handful of cafés — no paid tier is required at this scale. Auto-deploy is handled by **Workers Builds**, Cloudflare's own Git integration (GitHub account already connected): every push to `master` triggers a build and deploy on Cloudflare's side — no GitHub Actions workflow needed. The app is request/response only, single-region, with Supabase external, so none of the tradeoffs that favor container/edge/co-located platforms apply.

## Platform Comparison

All six candidates support Astro 6 full-SSR (serverless via official Astro adapters; containers via `@astrojs/node` standalone), and no hard filters applied: the interview ruled out persistent connections (Q1 = No), so no platform was dropped for being serverless-only. The cost answer (Q2 = minimize cost) was applied as a soft weight — platforms whose *viable* tier requires payment (Fly.io, Railway, Render's non-spin-down tier) are penalized, while Cloudflare and Vercel's genuinely free tiers are favored. This reinforces the ordering below rather than changing it, because Cloudflare additionally requires zero migration and already has the Git connection.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare (Workers + Static Assets) | Pass | Pass | Pass | Pass | Pass | 10 |
| Vercel | Pass | Pass | Pass | Pass | Partial (beta) | 9 |
| Render | Pass | Pass | Pass | Partial | Pass | 9 |
| Netlify | Partial | Pass | Pass | Partial | Pass | 8 |
| Fly.io | Pass | Pass | Pass | Partial | Partial (experimental) | 8 |
| Railway | Partial | Pass | Pass | Partial | Pass | 8 |

**Cloudflare** — `wrangler deploy` / `wrangler rollback` / `wrangler tail` cover the whole ops loop; `nodejs_compat` is already enabled so Node-API gaps are reduced; docs ship as llms.txt + markdown + GitHub MDX; managed remote MCP servers are GA; Workers + Static Assets is the current canonical model for full-stack Astro (Pages is frozen for new features). Auto-deploy comes from **Workers Builds** — native Git integration (GitHub/GitLab) that rebuilds and redeploys on push to the production branch, with optional PR preview URLs. The only real cost is the runtime reality: workerd, not Node, and a 10ms CPU ceiling per request on the Free plan.

**Vercel** — the closest serverless alternative: same request/response shape and a genuinely free Hobby tier (~free at 10k–100k requests), first-class CLI rollback/logs, markdown docs, and `@astrojs/vercel` is GA. Scored second because its MCP server is still Public Beta and adopting it means swapping the installed Cloudflare adapter plus reworking the env/secret flow — real iteration cost for a one-week MVP, for no cost advantage over a $0 Cloudflare plan.

**Render** — the best container-based fallback, but the cost weight hurts it: the free tier spins down after 15 minutes (unacceptable for a live demo), so the viable tier is paid ($7/mo Starter). Also requires the `@astrojs/node` standalone adapter, manual `render.yaml`/`NODE_VERSION` setup, and rollback is not a first-class CLI primitive.

**Netlify** — solid credit-based free tier and a GA MCP server, but rollback has no dedicated CLI command (dashboard/API only), SSR runs as a single AWS-Lambda-backed Function locked to a single region (Ohio on Free) with notable cold starts, and the free tier hard-stops (project pause) when credits run out. Dropped to the bottom half on agent-operability.

**Fly.io** — full persistent-process support and excellent markdown docs, but there is **no free tier for new orgs** (~$6–12/mo for one shared-cpu-1x, two machines by default), rollback has no dedicated command (image redeploy), and its MCP support is experimental. More machine than this request/response MVP needs, at a price the cost decision rules out.

**Railway** — great DX and GA docs/MCP, but the viable tier is paid (~$5–22/mo for an always-on Node service), rollback is dashboard-only, and Railpack doesn't auto-serve Astro SSR — needs `@astrojs/node` standalone plus an explicit start command.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Why it won: it is the only shortlisted platform where **no deployment decision remains and the cost is $0** — the adapter, CLI, config, and env pattern are already installed and CI-verified (`npx astro sync` + `npm run build`). Every criterion passes, agent-operability is best-in-class (wrangler covers deploy/rollback/logs, docs are llms.txt-native, MCP GA), and auto-deploy is the platform's own Workers Builds Git integration pointed at `master` — the GitHub connection is already made. The minimize-cost answer maps directly: free tier with zero stack surgery.

#### 2. Vercel

Why it scored second: it reproduces the same serverless mental model with a free Hobby tier and strong CLI (deploy/rollback/logs), so it is the natural escape hatch if workerd becomes a blocker. The gap is friction: swapping `@astrojs/cloudflare` → `@astrojs/vercel`, relocating the build-time secret flow to Vercel env, and accepting a beta MCP — all avoidable costs given Cloudflare already works for free.

#### 3. Render

Why it scored third: it is the best fixed-price container target if the team ever wants Node-runtime fidelity (full process semantics, predictable billing). The gap vs. the top two is real: its always-on tier is paid, and it requires the `@astrojs/node` standalone adapter, manual service/health/`NODE_VERSION` config, and rollback that isn't a CLI primitive — heavier operational scaffolding for an MVP that needs none of it.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. `@astrojs/cloudflare` runs on **workerd**, not Node — any Node-only dependency in the Supabase/auth path or a future library breaks at deploy time, and known workerd prerender pitfalls (blocked `sharp`/`satori`/`fs`, withastro/astro #15684, #16553, #17346) can surface mid-build.
2. The **Free plan's 10ms CPU ceiling per invocation** is the sharpest constraint: an SSR render doing a Supabase round-trip plus template work can approach or exceed it, and requests over 100,000/day are rejected (error 1027) — no overage billing, just hard failure at the cap.
3. `astro:env/server` secrets are **baked in at build time**, and with Workers Builds that means they must be set as *build* variables (Settings → Build), not runtime secrets — a `wrangler secret put` alone will not change what the deployed Worker uses. Rotation = edit build variable + push a commit.
4. **Auto-deploy on every push to `master` has no CI gate** unless one is added: a commit merged straight to master deploys immediately; the existing `ci.yml` (astro sync + lint + build) only runs as a quality signal on PRs.
5. Cloudflare **froze Pages** and the `tech-stack.md` hand-off still records `deployment_target: cloudflare-pages`, while `@astrojs/cloudflare` v13+ no longer targets Pages at all. Anyone following the old hand-off literally walks into a deprecated path.

### Pre-Mortem — How This Could Fail

The café schedule MVP shipped on the Workers Free plan with Workers Builds auto-deploying master. Month one was fine: pushes rebuilt instantly, the dashboard showed near-zero usage, and the cost was a round zero. Then a growth push added fifty cafés in a month. SSR requests that once rendered in 4ms CPU now rendered in 15, and the 10ms ceiling started returning 1027 errors at peak hours — the team had estimated by requests, not CPU-milliseconds, and the free plan's daily cap became a hard wall with no overage billing to soften it. Rotating a leaked Supabase key turned into a puzzle: the value lived in a build variable, not runtime, so a plain `wrangler secret put` did nothing, and only a dashboard edit plus a fresh commit actually rotated it. With no gate on the auto-deploy branch, one careless merge straight to master shipped a page that referenced an unset build variable. Meanwhile the stale "Pages" note in the hand-off sent a contributor down the frozen integration path for two days. The team that chose Cloudflare for "free and zero decisions" spent month three moving to the $5 plan and wiring preview environments — against a pipeline they'd automated before understanding its costs.

### Unknown Unknowns

- **Free-plan CPU is a hard error, not a bill**: over the 10ms/invocation or 100k/day limits the Worker returns 1027 errors — there is no "run anyway and charge me" path on Free. Load tests should watch CPU-ms, not just response codes.
- **Workers Builds secrets are build-scoped**: with `astro:env/server`, the correct home for `SUPABASE_URL`/`SUPABASE_KEY` is *build variables and secrets* under Settings → Build, not the runtime Variables & Secrets screen (unless the code moves to a `cloudflare:workers` runtime-env bridge later).
- **Push-to-deploy means the branch IS the deploy pipeline**: Workers Builds has no built-in lint/test gate — branch protection in GitHub (required checks from the existing `ci.yml`) is what prevents a red commit from reaching master and auto-deploying.
- **Custom domains must live in a Cloudflare zone**: you can't point an arbitrary external-registrar domain at a Worker without moving DNS to Cloudflare — a hidden step when the café owner later wants a branded URL.
- **Version drift between the hand-off and the shipped adapter**: `tech-stack.md` says `cloudflare-pages`; the installed `@astrojs/cloudflare` v13 targets Workers and `wrangler pages publish` is gone in wrangler v4. The recorded hand-off text is stale even though the code is correct.

## Operational Story

- **Preview deploys**: Workers Builds (Git integration) auto-builds and deploys the production branch on every push — connect the repo under Worker → Settings → Builds → Connect, pick branch `master`, build command `npm run build`, deploy command `npx wrangler deploy`. Optionally enable *non-production branch builds*: pushes to other branches then run `wrangler versions upload` and produce preview URLs with a GitHub PR status comment. No GitHub Actions deploy workflow is needed.
- **Secrets**: because the app reads `astro:env/server`, the deployed values are fixed at build time. Set `SUPABASE_URL` (text) and `SUPABASE_KEY` (secret) under Worker → Settings → Build → **Build variables and secrets** so Cloudflare's build sees them. Runtime *Variables & Secrets* are only needed if the code later switches to a `cloudflare:workers` runtime-env bridge. Locally, `.dev.vars` serves `npm run dev`. Rotation = edit build variables + push a commit to trigger rebuild.
- **Rollback**: `wrangler rollback` (deploys the previous version; wrangler v4) or the dashboard Version History → Rollback — covers the last 100 versions, revert in under a minute. It only reverts code: a Supabase migration shipped in the bad deploy must be fixed by hand in the DB.
- **Approval**: human-only — creating the Workers project (`wrangler login`/dashboard account), connecting the Git repo to the Worker, first production deploy, rotating Supabase credentials, and any Supabase schema changes (no automated migrations in MVP). An agent may run `wrangler deploy`/`wrangler tail` unattended once the account token is scoped to this project; pushing to `master` is the automated path.
- **Logs**: `wrangler tail` streams live runtime logs for the deployed Worker; Workers Builds pipeline logs live in the dashboard under Deployments → View build history (also surfaced as GitHub check runs / PR comments). Read-only access for an agent via a project-scoped `wrangler` API token.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free-plan 10ms CPU ceiling per SSR invocation exceeded | Devil's advocate | M | M | Measure CPU-ms in `wrangler tail` + dashboard analytics after first real users; keep SSR pages lean (heavy rendering client-side); fallback is the $5/mo Standard plan, which needs no code change |
| Free-plan 100k requests/day hard cap (error 1027) | Devil's advocate | L | M | Expected MVP traffic is far below the cap; monitor dashboard request counts; if a real café cluster appears, reassess tier |
| Node-only dependency breaks on workerd at runtime/deploy | Devil's advocate | M | H | Keep deps to platform-agnostic libs; run `wrangler dev` against every new dependency; CI build already catches workerd-prerender issues |
| Secrets baked at build time — rotation requires dashboard edit + redeploy | Devil's advocate / Unknown unknowns | H | M | Document rotation = change Build variables (Settings → Build) + push a commit; revisit a `cloudflare:workers` env bridge only if Supabase keys churn frequently |
| Push-to-deploy with no CI gate ships broken code to prod | Devil's advocate / Unknown unknowns | M | M | Keep the existing `ci.yml` (astro sync + lint + build) as a required check in GitHub branch protection for `master` |
| `tech-stack.md` says `cloudflare-pages`; shipped adapter targets Workers | Devil's advocate / Unknown unknowns | H | L | Code is already correct (wrangler.jsonc uses Workers entrypoint); amend the hand-off text on next doc pass so no future agent follows the stale label |
| Bad deploy + Supabase migration = manual DB rollback | Pre-mortem | L | H | No automated migrations in MVP; run schema changes against a staging Supabase project first; keep destructive DDL human-gated |
| Rollback window limited to 100 versions | Research finding | L | L | Redeploy old build artifact for older rollbacks; not a real constraint at MVP velocity |
| workerd timezone/locale differs from Node assumptions | Pre-mortem | M | H | Unit-test date logic with explicit `Intl` locales; verify a sample rendered week in `wrangler dev` before first live schedule |
| Pages-deprecation confusion for future contributors | Unknown unknowns | H | L | Add one line to AGENTS.md: "deploy target is Cloudflare Workers via @astrojs/cloudflare; Pages is frozen" |

## Getting Started

Verified against the installed versions: Astro `6.3.1`, `@astrojs/cloudflare` `13.5.0`, `wrangler` `4.90.0` (see `package.json`). This repo deploys via the Workers + Static Assets model with Workers Builds — no `wrangler pages` commands (removed in wrangler v4).

1. **Authenticate**: run `npx wrangler login` once to authorize the Workers account (opens a browser; the token is stored in `%USERPROFILE%\.wrangler`).
2. **Set a real project name**: edit `wrangler.jsonc` — change `"name": "10x-astro-starter"` to `"name": "januszex-grafik-pro"` (the workers.dev subdomain derives from it).
3. **First manual deploy** (creates the Worker and its free `januszex-grafik-pro.workers.dev` URL): ensure `SUPABASE_URL`/`SUPABASE_KEY` are available to the build (create `.env` from `.env.example`), then run `npm run build` and `npx wrangler deploy`. `npm run dev` already runs the app on workerd with `.dev.vars` locally.
4. **Connect the repo for auto-deploy**: Cloudflare dashboard → Workers & Pages → `januszex-grafik-pro` → Settings → Builds → **Connect** → pick the GitHub repo, set branch to `master`, Build command `npm run build`, Deploy command `npx wrangler deploy` (defaults). The GitHub account is already connected — this links the specific repo to the Worker.
5. **Add build-time secrets**: under Settings → Build → **Build variables and secrets**, add `SUPABASE_URL` (text) and `SUPABASE_KEY` (secret) so Cloudflare's build bakes them into the Worker.
6. **Ship**: push to `master` — Workers Builds rebuilds and redeploys automatically. Optionally enable *non-production branch builds* for PR preview URLs, and require the existing `ci.yml` checks in GitHub branch protection so a red commit can't reach `master`.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- External CI/CD deploy pipeline (GitHub Actions deploy is intentionally replaced by Cloudflare Workers Builds)
- Production-scale architecture (multi-region, HA, DR)
