---
bootstrapped_at: 2026-09-06T18:42:13Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: januszex-grafik-pro
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Frontmatter (verbatim from `context/foundation/tech-stack.md`):

```yaml
---
starter_id: 10x-astro-starter
package_manager: npm
project_name: januszex-grafik-pro
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---
```

Body (`## Why this stack`, verbatim):

> JanuszexGrafikPro is a web-app for a single café owner assembling weekly shifts from ~5 employees' availability, with opening-hours coverage as the core rule. The must-have features are e-mail+password auth, one business per owner, employees and availability CRUD, and a schedule-draft flow with visible holes and collision warnings. Standard path: (web-app, js) resolves to the 10x Astro Starter (Astro + Supabase + Cloudflare), the vetted default for this cell. Supabase delivers auth (FR-001/FR-002) and Postgres persistence out of the box; TypeScript with Zod at the boundaries keeps contracts explicit and agent-friendly; Cloudflare Pages is the starter's default deploy target. The 1-week MVP timeline and medium scale favor the battle-tested, batteries-included starter over a hand-assembled stack — zero infrastructure decisions to make. CI runs on GitHub Actions with auto-deploy on merge to main, matching the starter's standard shape.

## Pre-scaffold verification

| Signal             | Value                                         | Severity | Notes                                         |
| ------------------ | --------------------------------------------- | -------- | --------------------------------------------- |
| npm package        | not run                                       | —        | cmd_template starts with `git clone`; npm step skipped |
| GitHub repo        | przeprogramowani/10x-astro-starter last pushed 2026-08-22T21:44:30Z | fresh | from card.docs_url; queried via public GitHub API (gh CLI not installed on this host) |

No stale signals. Scaffold proceeded without warning.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 48 scaffold-authored files (`.github/`, `.husky/`, `.vscode/`, `public/`, `src/`, `supabase/` subtrees plus 11 root files) — node_modules installed in-scaffold and moved as a unit (~31,470 files)
**Conflicts (.scaffold siblings)**: README.md.scaffold
**.gitignore handling**: append-merged (cwd lines kept in order, scaffold lines de-duped and appended under `# from 10x-astro-starter`)
**.bootstrap-scaffold cleanup**: deleted

Notes:
- Cloned `.git/` was deleted before move-up; no upstream history leaked. The existing cwd `.git/` was untouched.
- `context/` preserved verbatim; scaffold contained no `context/` paths to drop.
- npm install emitted allow-scripts warnings for 5 packages (esbuild, sharp, supabase, workerd, esbuild@0.27.3) whose postinstall scripts were not auto-approved; install still exited 0. These may need `npm approve-scripts` before those platform-binary packages fully function.
- README.md pre-existed in cwd; the starter's copy landed at `README.md.scaffold` for diffing.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 1 CRITICAL, 14 HIGH, 7 MODERATE, 3 LOW
**Direct vs transitive**: of the 25 findings, 3 are direct dependencies (astro — HIGH; supabase — MODERATE; wrangler — MODERATE); the remaining 22 are transitive. Direct breakdown: 0 CRITICAL / 1 HIGH / 2 MODERATE / 0 LOW.

#### CRITICAL findings

- **tar** (transitive): node-tar PAX size override on GNU long-name/long-link headers → tar parser interpretation differential (file smuggling); node-tar process crash via PAX numeric path type confusion. Fix via upstream bump.

#### HIGH findings

- **astro** (direct): XSS via unescaped attribute names in spread props (`renderHTMLElement`, incomplete fix for CVE-2026-54298), plus additional spread-attribute XSS advisories. Directly actionable: bump astro.
- **brace-expansion** (transitive): DoS via exponential-time expansion of consecutive non-expanding `{}` groups.
- **browserslist** (transitive): unbounded memory growth / OOM via distinct query results; crash / prototype write via untrusted `browserslist-stats.json`.
- **devalue** (transitive): Svelte devalue DoS via sparse array deserialization.
- **fast-uri** (transitive): host confusion via literal backslash authority delimiter; SSRF vectors.
- **js-yaml** (transitive): quadratic-complexity DoS in merge-key handling via repeated aliases.
- **miniflare** (transitive): via sharp, undici, ws.
- **nanoid** (transitive): non-secure generators can loop indefinitely with negative/zero size.
- **postcss** (transitive): incomplete fix of GHSA-6g55-p6wh-862q; path traversal in previous source-map auto-loading.
- **sharp** (transitive): inherited libvips vulnerabilities CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591.
- **svgo** (transitive): `removeScripts` plugin leaves some executable scripts intact.
- **undici** (transitive): TLS cert-validation bypass via dropped `requestTls` in SOCKS5 ProxyAgent; HTTP header injection via Set-Cookie percent-decoding; WebSocket client issues.
- **vite** (transitive): NTLMv2 hash disclosure via `launch-editor` UNC path handling on Windows; `server.fs.deny` bypass on Windows alternate paths. (Windows host — worth attention.)
- **ws** (transitive): uninitialized memory disclosure; memory-exhaustion DoS from tiny fragments.

#### MODERATE findings

- **@astrojs/language-server** (transitive): via volar-service-yaml.
- **@cloudflare/vite-plugin** (transitive): via miniflare, wrangler, ws.
- **supabase** (direct): via tar.
- **volar-service-yaml** (transitive): via yaml-language-server.
- **wrangler** (direct): via esbuild, miniflare.
- **yaml** (transitive): stack overflow via deeply nested YAML collections.
- **yaml-language-server** (transitive): via yaml.

#### LOW / INFO findings

- **@babel/core** (transitive): arbitrary file read via `sourceMappingURL` comment.
- **esbuild** (transitive): arbitrary file read when running the dev server on Windows.
- **postcss-selector-parser** (transitive): DoS through uncontrolled AST recursion.

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ---------------------------------- |
| bootstrapper_confidence    | first-class                        |
| quality_override           | false                              |
| path_taken                 | standard                           |
| self_check_answers         | null                               |
| team_size                  | solo                               |
| deployment_target          | cloudflare-pages                   |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | true                               |
| has_payments               | false                              |
| has_realtime               | false                              |
| has_ai                     | false                              |
| has_background_jobs        | false                              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
