<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Biznes i godziny otwarcia (S-01)

- **Plan**: context/changes/business-opening-hours/plan.md
- **Scope**: Full plan — Phase 1–3 of 3
- **Date**: 2026-09-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: [0 critical] [3 warnings] [7 observations]

## Verdicts

| Dimension | Verdict |
|-----------|---------
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Success criteria evidence

- `npx astro sync` — pass
- `npm run lint` — pass (exit 0)
- `npm run build` — pass (server built in 10.15s)
- Manual E2E items (3.4–3.7) recorded in Progress with SHAs — accepted as executed.

## Plan adherence summary

Every planned function, status code, redirect, and the delete-after-upsert ordering exists as specified — no MISSING items, no material scope creep. Minor additive EXTRAs: duplicate-weekday server validation, `parseTime`/type-guard exports, `savedTimes` editor UX, „Zapisano" indicators, defensive auth guards in setup.astro — all consistent with plan intent.

## Findings

### F1 — DB error conflated with "no business" on all three pages

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:19-21 (also index.astro:20-22, setup.astro:17-20)
- **Detail**: `if (!businessResult.data) redirect(...)` treats a transient Supabase failure (`data === null` on error, business.ts:37-39) as "business not set up". An existing owner gets bounced to setup and, on submit, hits 409 „Masz już swój biznes". Dashboard also swallows hours errors: dashboard.astro:25 renders every day "Zamknięte" on fetch failure.
- **Fix A ⭐ Recommended**: Branch on `businessResult.error !== null` first — render an error/retry state (or 500) — and only treat `data === null` as "not set up". Apply to all three pages; dashboard hours error gets an explicit fallback line instead of silent all-closed.
  - Strength: Correct semantics at all three gates; prevents the 409 dead-end.
  - Tradeoff: A few extra lines per page; needs a small error-state markup decision.
  - Confidence: HIGH — `ServiceResult` makes the distinction mechanical.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — error-first gate on dashboard.astro / business/index.astro / business/setup.astro + shared `DbErrorState.astro` + explicit hours-failure fallback on dashboard and business edit. lint + build pass. (2026-09-13)

### F2 — createBusiness non-atomic: committed business + failed hours → 409 loop

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/business.ts:59-82
- **Detail**: Plan accepted non-atomicity for *week saves* (idempotent), but createBusiness is a different case: insert commits, then `upsertOpeningWeek` fails → 500 (index.ts:65-69) while the business row persists. Retry → 409; user must navigate to /business to finish.
- **Fix A ⭐ Recommended**: Map 23505-after-hours-failure to 409 with „Masz już swój biznes" (existing handler at index.ts:66-68 already does this) — recovery is then a natural /business redirect. Log the hours failure server-side.
  - Strength: Reuses existing 409 branch; zero schema/RPC work.
  - Tradeoff: Hours from the failed create are silently absent (user re-enters on /business).
  - Confidence: HIGH — handler branch already exists.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix differently — light variant chosen over RPC by user). 409 in BusinessSetupForm redirects to `/business?prefill=<entered hours>`; business/index.astro validates the param with `parseOpeningWeek`, prefills BusinessHoursForm and shows a "check & save" banner. Hours entered by the user are never lost; retry is one click ("Zapisz tydzień"). lint + build pass. (2026-09-13)

### F3 — HTTP helpers + error constants duplicated across endpoint files, already drifting

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/business/index.ts:15-32, opening-hours.ts:13-30
- **Detail**: `readJsonBody`, `jsonResponse` and 6 error-message constants copy-pasted between endpoints and already diverge (`ERROR_NOT_CONFIGURED` is English, the rest Polish). AGENTS.md mandates shared helpers in `src/lib/`.
- **Fix**: Extract to `src/lib/http.ts` before a third endpoint copies it.
- **Decision**: FIXED + ACCEPTED-AS-RULE: „Ekstrahuj zduplikowane helpery endpointów do src/lib/ zanim się rozjadą". Helpery i stały błędów wyekstrahowane do `src/lib/http.ts`; oba endpointy importują. `ERROR_NOT_CONFIGURED` ujednolicony na polski. lint + build pass. (2026-09-13)

### F4 — ApiErrorBody/applyServerError triplicated in islands

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: BusinessSetupForm.tsx:13-40, BusinessNameForm.tsx:11-39, BusinessHoursForm.tsx:12-39
- **Detail**: Same error-mapping logic in three forms with drifting behavior (name-form clears serverError on field errors, others don't). AGENTS.md routes shared React logic to `src/components/hooks/`.
- **Fix**: Extract `useApiErrorState()` hook.
- **Decision**: FIXED (Fix) — hook extracted to `src/components/hooks/useApiErrorState.ts` (shared `applyApiError`, `serverError`/`fieldErrors` state, `ERROR_SERVER`/`ERROR_NETWORK` constants); all three forms consume it. Name-form behavior unified with the other two (banner shows generic validation message when server field errors exist). lint + build pass. (2026-09-13)

### F5 — Dead `businessId` prop in BusinessNameForm

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/business/BusinessNameForm.tsx:16-21
- **Detail**: Interface requires `businessId` (passed from index.astro:36 per plan) but the component never uses it — the endpoint resolves the business from the session.
- **Fix**: Drop the prop from interface and call site.
- **Decision**: FIXED (Fix) — prop removed from `BusinessNameFormProps` and from the call site in `src/pages/business/index.astro`. lint + build pass. (2026-09-13)

### F6 — Two unplanned files in the diff (both benign)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:72-74, src/lib/supabase.ts
- **Detail**: `eslint.config.js` disables `no-misused-promises` for .astro (documented parser-crash workaround) and `supabase.ts` gains `<Database, "public">` typing. Neither in the plan; neither changes behavior.
- **Fix**: Append a one-line addendum to plan.md noting both as incidental enablement changes.
- **Decision**: FIXED (Fix) — addenda section appended to plan.md. (2026-09-13)

### F7 — upsertOpeningWeek always ends with a full-week select

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/business.ts:131-139
- **Detail**: Create path costs up to 4 round trips (insert + upsert + delete + select); week save stays within the plan's 1–3 budget.
- **Fix (optional)**: Use `returning: "representation"` on the upsert.
- **Decision**: SKIPPED — micro-optimization of a once-per-business/once-per-week operation; regression risk in proven service logic outweighs saving 1 round trip.

### F8 — Week-save is a patch, not a replace, for raw API callers

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: opening-hours.ts:48-61, business-validation.ts:76-106
- **Detail**: Omitted weekdays are neither upserted nor deleted (only explicit `closed: true` deletes) — fine for the UI, which always sends all 7, but a raw caller can't close a day by omission. Payload array length is uncapped.
- **Fix**: Treat missing weekdays as closed (or document patch semantics) and cap input at 7 entries.
- **Decision**: FIXED (Fix 1 — full replace) — `upsertOpeningWeek` now deletes weekdays absent from the payload (missing = closed, matching HTTP PUT semantics). `WEEKDAYS` moved to `src/lib/services/business-validation.ts` and re-exported from `src/components/business/opening-hours.ts` (lib must not import from components). Note: payload length is effectively capped by the existing duplicate-weekday rejection in `parseOpeningWeek`. lint + build pass. (2026-09-13)

### F9 — CSRF protection rests on SameSite=Lax alone

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/business/index.ts, opening-hours.ts
- **Detail**: No CSRF tokens on cookie-authenticated POST/PUT. Lax blocks cross-site POST fetch, so MVP-acceptable — noting it as the only layer.
- **Fix**: None now; revisit if cookie config changes.
- **Decision**: ACCEPTED (as MVP risk) — SameSite=Lax is the single CSRF layer; revisit if cookie configuration changes (e.g. SameSite=None) or cross-origin callers appear.

### F10 — eslint disable is global to .astro, not per-file

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: eslint.config.js:72-74
- **Detail**: The workaround disables a real safety rule for every .astro file.
- **Fix**: Revisit on astro-eslint-parser upgrade; consider inline disables.
- **Decision**: ACCEPTED (known workaround) — revisit on astro-eslint-parser upgrade; consider inline disables then.
