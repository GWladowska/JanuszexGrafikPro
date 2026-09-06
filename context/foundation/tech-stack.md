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

## Why this stack

JanuszexGrafikPro is a web-app for a single café owner assembling weekly shifts from ~5 employees' availability, with opening-hours coverage as the core rule. The must-have features are e-mail+password auth, one business per owner, employees and availability CRUD, and a schedule-draft flow with visible holes and collision warnings. Standard path: (web-app, js) resolves to the 10x Astro Starter (Astro + Supabase + Cloudflare), the vetted default for this cell. Supabase delivers auth (FR-001/FR-002) and Postgres persistence out of the box; TypeScript with Zod at the boundaries keeps contracts explicit and agent-friendly; Cloudflare Pages is the starter's default deploy target. The 1-week MVP timeline and medium scale favor the battle-tested, batteries-included starter over a hand-assembled stack — zero infrastructure decisions to make. CI runs on GitHub Actions with auto-deploy on merge to main, matching the starter's standard shape.
