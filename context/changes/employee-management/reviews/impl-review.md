<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Zarządzanie pracownikami biznesu (S-02)

- **Plan**: `context/changes/employee-management/plan.md`
- **Scope**: Fazy 1–3 z 3 (pełny plan)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 5 observations
- **Commits**: 9a079d4 (p1), 5dea812 (p2), c0c77ee (p3), 3e41fcd (epilogue)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS — 8/8 zaplanowanych zmian MATCH (drift-review subagent) |
| Scope Discipline | PASS — diff 9a079d4^..HEAD zawiera dokładnie 11 plików z planu; „What We're NOT Doing" respektowane |
| Safety & Quality | PASS — IDOR (getBusinessForOwner + filtr business_id + RLS), XSS, injection, CSRF, auth: czyste |
| Architecture | PASS |
| Pattern Consistency | PASS — endpointy/serwis/islanda zgodne 1:1 ze wzorcem S-01; helpery z src/lib/http.ts reuse (lessons.md rule) |
| Success Criteria | PASS — `npx astro sync` / `npm run lint` / `npm run build` OK (2026-09-13); testy ręczne potwierdzone przez użytkownika |

## Findings

### F1 — Data dodania może migotać przy strefach czasowych

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — poprawka oczywista, jedna linia
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/components/employees/EmployeeManager.tsx:428
- **Detail**: `new Date(employee.created_at).toLocaleDateString("pl-PL")` bez strefy — SSR w Workerze (UTC) może wyrenderować inny dzień niż przeglądarka tuż po północy; drobna pomyłka hydratacji React 19, samoregująca.
- **Fix**: dodać `{ timeZone: "Europe/Warsaw" }` do `toLocaleDateString`.
- **Decision**: FIXED (Fix now, 2026-09-13)

### F2 — Podwójne kliknięcie „To inna osoba" może wysłać 2 żądania

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — poprawka oczywista, jedna linia
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/components/employees/EmployeeManager.tsx:64-70
- **Detail**: Przycisk potwierdzenia duplikatu nie ma `disabled` podczas wysyłania (przyciski usuwania mają); dwuklik → dwa równoległe POST-y → dwa identyczne wpisy.
- **Fix**: `disabled={addPending}` na przycisku potwierdzenia duplikatu.
- **Decision**: FIXED (Fix now, 2026-09-13 — prop `disabled` w DuplicateWarning + `addPending`/`editPending` w użyciach)

### F3 — Kolejność błędów 404/400 inna niż w endpointach biznesu

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/employees/index.ts:52-75 (vs src/pages/api/business/index.ts:75-86)
- **Detail**: W api/business walidacja pól (400) biegnie przed lookupem biznesu (404); tutaj `parseEmployeeInput` jest po `resolveRequestContext`. Kosmetyczna niespójność kontraktu (obie ścieżki tylko dla zalogowanych właścicieli).
- **Fix**: (opcjonalnie) przenieść walidację pól przed lookup biznesu.
- **Decision**: FIXED (Fix now, 2026-09-13 — resolveRequestContext bez lookupu biznesu + helper resolveBusinessId; walidacja 400 przed 404)

### F4 — Wyścig przy równoczesnym dodaniu duplikatu (TOCTOU)

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — zaakceptowane decyzją „duplikaty dozwolone z ostrzeżeniem"
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/pages/api/employees/index.ts:107-115; src/lib/services/employee.ts:82-104
- **Detail**: Check-then-insert bez DB unikalnego indeksu na (business_id, name, contact_email) — świadome (ostrzeżenie zamiast blokady); najgorszy skutek to dozwolony duplikat. Przy twardszej polityce: partial unique index + mapowanie 23505 → 409 (wzorzec: api/business/index.ts:50).
- **Decision**: FIXED (Fix now, 2026-09-13 — decyzja użytkownika zmieniona podczas triage: twarda blokada duplikatów. Migracja `supabase/migrations/20260913034936_no_duplicate_employees.sql` (unikalny indeks); endpointy mapują 23505 → 409; usunięte findDuplicateEmployee, flaga confirmDuplicate i panel ostrzegawczy; wymaga `npx supabase db push` + lokalnie `npx supabase db reset`)

### F5 — ServiceResult wędruje z services/business.ts

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — działa dziś; przypomnienie na przyszłość
- **Dimension**: Architecture
- **Location**: src/lib/services/employee.ts:3
- **Detail**: `ServiceResult` importowany z services/business.ts. Przy dwóch serwisach OK; przy trzecim wynieść do src/lib/services/types.ts.
- **Decision**: FIXED (Fix now, 2026-09-13 — `ServiceResult` wyniesiony do `src/lib/services/types.ts`; business.ts re-eksportuje dla zgodności)

## Zaufane decyzje (nie-findings)

Brak testera (deadline), duplikaty dozwolone z miękkim ostrzeżeniem, contact_email wymagany tylko na poziomie aplikacji, porównywanie duplikatów w JS (~5 pracowników), CSRF: SameSite=Lax (ryzyko zaakceptowane w S-01).

## Clean checklist (bez wyników)

IDOR dwuwarstwowy (service filtr business_id + RLS `employees_*_owner`); PGRST116 → generyczny 404 bez wycieku informacji; React/Astro escapują; supabase-js parametryzacja + regex UUID na id; 401 gate w handlerach + redirect strony + PROTECTED_ROUTES; wszystkie fetch-e z `.catch(() => null)` i `void`-guardami; kaskadowe usuwanie ostrzeżone w UI dwuetapowym potwierdzeniem; endpointy JSON-only (CSRF-safe przy Lax).
