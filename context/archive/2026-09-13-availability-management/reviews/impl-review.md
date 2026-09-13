<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Dostępności pracowników (S-03)

- **Plan**: `context/changes/availability-management/plan.md`
- **Scope**: Full plan (3/3 faz; commits 1f48aca → b2f0c4b → 88e4d80 → epilog be8314a)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical  1 warning  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Grounding / Success Criteria

Automated: `npx astro sync` ✓, `npm run lint` ✓, `npm run build` ✓ (ponownie uruchomione 2026-09-13). Manual 3.4–3.12: `- [x]`, potwierdzone przez użytkownika (E2E na koncie seeda i świeżym koncie). Plan Adherence: MATCH na wszystkich 12 plikach (sub-agent drift detection), zero MISSING, zero intent-level DRIFT. Sprostowania: nawigacja tygodniowa jest w kontrakcie islandy (plan.md Phase 3 change 3) — nie scope creep; walidacja UUID `employeeId` (index.ts:75-81) = zgodne doprecyzowanie sekwencji błędów; roadmap.md w commicie 1f48aca = user-approved w rytuale (Stage all).

## Findings

### F1 — TOCTOU: reguła nakładania tylko w aplikacji, bez backstopu w bazie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/availabilities/index.ts:222-228 + src/lib/services/availability.ts:102-129
- **Detail**: findOverlappingAvailability i createAvailability to osobne round-tripy — dwa jednoczesne requesty (double-submit, druga karta) mogą oba przejść check i wstawić nachodzące wiersze. Mitygacje: jeden właściciel na biznes, SubmitButton disabled podczas pending. Świadoma decyzja z planu (Critical Details + NOT Doing: „bez exclusion constraint w bazie"), zanotowana w plan-review jako zaakceptowany tradeoff.
- **Fix**: Dodać exclusion constraint btree_gist na (employee_id, work_date, timerange(start_time, end_time)) — zamyka wyścig na poziomie bazy.
  - Strength: Niezmiennik domenowy chroniony przez Postgresa, jak RLS i FK.
  - Tradeoff: Migracja + ręczny `supabase db push` (human-gate wg deploy-plan) — wykracza poza „zero migracji" planu.
  - Confidence: HIGH — standardowy wzorzec dla przedziałów czasowych.
  - Blind spot: Wymaga re-testu E2E (409 z bazy vs z aplikacji).
- **Decision**: FIXED (migracja `supabase/migrations/20260913040000_no_overlap_availabilities.sql` + mapowanie `23P01` → 409 w POST/PUT; aplikacyjny pre-check zostaje; wymaga ręcznego `supabase db push` z WSL + re-testu nakładania)

### F2 — Stary komentarz nagłówka seed.sql

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence (doc drift)
- **Location**: supabase/seed.sql:15
- **Detail**: Nagłówek pliku mówi „dostępności na bieżący tydzień", a blok od :107 rozsiewa 3 tygodnie (komentarz bloku zaktualizowany, nagłówek nie).
- **Fix**: Dopasować komentarz nagłówka do stanu faktycznego.
- **Decision**: FIXED (nagłówek seed.sql: „dostępności na trzy tygodnie (poprzedni, bieżący i następny)")

### F3 — Comparator sortowania dnia nie jest strict weak ordering

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/availabilities/AvailabilityManager.tsx:307
- **Detail**: `(a.start_time < b.start_time ? -1 : 1)` zwraca 1 przy równych godzinach — bez znaczenia funkcjonalnego (wyświetlanie), ale mylące dla czytających.
- **Fix**: Zwracać 0 przy równości (albo `localeCompare`).
- **Decision**: FIXED (sort przez `a.start_time.localeCompare(b.start_time)`)

### F4 — Dwa nieograniczone fetchy przy skali MVP

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: src/lib/services/availability.ts:22-27 + src/pages/api/availabilities/index.ts:115-119
- **Detail**: getAvailabilities pobiera wszystkie wiersze biznesu bez granicy dat, resolveEmployeeMembership pobiera pełną listę pracowników pod .some() — 4 round-tripy na POST. Uzgodnione w planie (Performance Considerations, ~5 pracowników).
- **Fix**: Bez akcji teraz; przy pierwszym horizonie dat dodać filtr work_date, a membership zwęzić do `select("id").eq("id", employeeId).limit(1)`.
- **Decision**: FIXED (częściowo — membership zwężone do `getEmployeeById` z `limit(1)`; `getAvailabilities` celowo bez granicy dat: wolna nawigacja ‹ › + auto-przełączenie wymagają pełnej historii w islandzie; filtr wraca przy S-04 / horizonie danych — zapisane w planie Addendum)
