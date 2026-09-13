<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Schemat domeny z migracjami i RLS

- **Plan**: `context/changes/domain-schema-rls/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-12
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING (1 finding) |
| Plan Completeness | WARNING (1 finding) |

## Grounding

13/13 paths verified, 8/8 symbols verified, brief↔plan consistent. Progress contract: 4/4 phases matched, all SC↔Progress steps aligned.

## Findings

### F1 — RLS isolation tests have no committed, repeatable artifact

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Testing Strategy → Integration Tests (Phase 2)
- **Detail**: RLS is the sole data-isolation mechanism (public API key). The plan described isolation test scenarios in prose only — no committed file. Once the change is archived, future changes modifying RLS policies have no repeatable regression check.
- **Fix**: Commit the SQL test scenarios as `supabase/tests/rls_isolation.sql`, with the two-user setup and assertions from the Integration Tests section. Run manually after db reset — no test runner required.
- **Decision**: FIXED — Added `supabase/tests/rls_isolation.sql` as Phase 2 change item §2, success criterion 2.4a, Progress step 2.4a, and updated Testing Strategy to reference the committed file.

### F2 — db:types redirect risks committing an empty types file

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Changes Required §1 (db:types script)
- **Detail**: Shell redirect `>` on Windows (cmd.exe) creates the output file even when the command fails. If the local stack is down, `database.types.ts` is created empty and could be committed. Success criteria 3.1 said "generates" but didn't validate the file content.
- **Fix**: Add validation to success criteria 3.1: verify `database.types.ts` contains `export interface Database` and table names before committing.
- **Decision**: FIXED — Added success criterion 3.1a and Progress step 3.1a validating the file contains `export interface Database` and domain table names.

### F3 — is_business_owner granted only to authenticated; anon errors

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — RLS Contract (permissions)
- **Detail**: Plan granted execute on `is_business_owner` only to `authenticated`. When `anon` queries a domain table, the RLS policy calls `is_business_owner`, which errors (anon can't execute the function) instead of returning 0 rows. Standard Supabase pattern grants execute to both `anon` and `authenticated` — `auth.uid()` returns null for anon, function returns false, 0 rows.
- **Fix**: Grant execute to both `anon` and `authenticated`.
- **Decision**: FIXED — Updated Phase 2 RLS contract to `grant execute ... to authenticated, anon` with explanation that `auth.uid()` returns null for anon. Updated permissions note accordingly.
