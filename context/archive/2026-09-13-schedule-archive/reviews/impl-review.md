<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Archiwum zapisanych grafików (S-08)

- **Plan**: context/changes/schedule-archive/plan.md
- **Scope**: wszystkie 4 fazy
- **Date**: 2026-09-13
- **Verdict**: APPROVED (po triage — wszystkie findings naprawione)
- **Findings**: 0 critical, 2 warnings, 3 observations (wszystkie FIXED)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Grounding

Kryteria automatyczne na HEAD: `supabase db reset` ✓, `npx astro sync` ✓, `npx astro check` (0 błędów) ✓, `npm run lint` (0 błędów, 1 wcześniej istniejące ostrzeżenie) ✓, `npm run build` ✓. Zmienione pliki (15 kodu/infra) wszystkie z planu — brak nieplanowanych. Manual: 4.11 potwierdzone dowodem z bazy (insert na minioną datę → SQLSTATE 23000); 4.6–4.10 potwierdzone przez użytkownika.

## Findings

### F1 — Trigger blokuje kaskadowe kasowanie pracownika

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260913212151_enforce_availability_week_writes.sql:19-41
- **Detail**: Trigger bezwarunkowo odrzuca każdy DELETE dostępności z minionego tygodnia — także kasowanie kaskadowe. `availabilities.employee_id` ma `on delete cascade` (supabase/migrations/20260912141307_domain_schema.sql:83), więc usunięcie pracownika kasuje jego wpisy, a trigger przerywa całą operację. Potwierdzone empirycznie: `delete from public.employees` dla pracownika z jedną minioną dostępnością → `ERROR: Nie można zmieniać dostępności w minionych tygodniach`. W produkcji dotknie usuwania pracowników i biznesu po ~tygodniu używania. Siostrzany trigger S-06 ma obejście na kaskadę (brak rodzica → przepuść), ten go nie ma.
- **Fix A ⭐ Recommended**: dodać guard „brak rodzica" przed sprawdzaniem tygodni
  - Strength: Lustrzane do `enforce_draft_assignment_writes` (S-06); odblokowuje kaskady bez osłabiania reguły (API i tak sprawdza biznes/tydzień).
  - Tradeoff: Trzeba dodać warunek dla employee i business (i ewentualnie employee_id NULL), czyli 3–5 linii PL/pgSQL.
  - Confidence: HIGH — wzorzec już działa w repo.
  - Blind spot: Nie sprawdzono, czy S-06 sam nie blokuje usuwania pracownika z przypisaniami w zapisanym grafiku (osobny, wcześniejszy temat).
- **Decision**: FIXED (Fix A)

### F2 — `23000` z triggera nie mapowane na 409

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/availabilities/index.ts:169-175, 242-251, 292-298
- **Detail**: API dostępności mapuje tylko `23P01` i `PGRST116`. Gdy trigger złapie wyścig (grafik zapisany między bramką a zapisem), zwraca SQLSTATE `23000`, który wpada w `ERROR_SERVER` 500 zamiast zamierzonego 409. Wzorzec repo (`src/pages/api/schedules/assignments.ts:127-129,247-249,296-298`) mapuje `23000`.
- **Fix**: w POST/PUT/DELETE dodać `if (result.error.code === "23000") return jsonResponse({ error: ERROR_AVAILABILITY_WEEK_FROZEN }, 409);`
- **Decision**: FIXED

### F3 — Pudełka „Dziura" renderują się dla zapisanego grafiku

- **Severity**: ○ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/schedules/ScheduleBoard.tsx:909-936
- **Detail**: Flagi kolizji są już ukryte dla zapisanego grafiku (`isDraft`), ale pudełka „Dziura" renderują się bezwarunkowo (tylko „Obsadź" jest `isDraft`). Dla przyszłego zapisanego tygodnia dziury liczą się z bieżących godzin (snapshot ignorowany poza archiwum), więc po zmianie godzin zapisany grafik może pokazać czerwone „Dziury" bez akcji.
- **Fix**: renderować `dayHoles` tylko gdy `isDraft` (spójne z flagami).
- **Decision**: FIXED

### F4 — Cichy fallback dla uszkodzonego snapshotu

- **Severity**: ○ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/schedule-archive.ts:26-31
- **Detail**: `resolveOpeningHours` przy niepoprawnym (np. częściowo uszkodzonym) snapshotcie cicho pokazuje bieżące godziny jako „historyczne". Pusty snapshot `[]` jest poprawny i nie robi fallbacku, ale uszkodzony już tak.
- **Fix**: dodać `console.warn` przy fallbacku (tylko gdy `snapshot !== null`).
- **Decision**: FIXED

### F5 — `validateShiftTimes` używa bieżących godzin zamiast `weekOpeningHours`

- **Severity**: ○ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/schedules/ScheduleBoard.tsx:413, 453
- **Detail**: Kanoniczne dla tygodnia są `weekOpeningHours`, a walidacja edycji dostaje surowe `openingHours`. Dziś równoważne (edycja tylko dla draftów), ale po odblokowaniu draft zachowuje nieaktualny snapshot — latentna pułapka dla przyszłego kodu.
- **Fix**: przekazać `weekOpeningHours` do obu wywołań `validateShiftTimes`.
- **Decision**: FIXED

## Poza znaleziskami (świadome)

- Brak bramki zamrożenia na ścieżce `PATCH status:"saved"` — zgodne z decyzją Q2 (dokończenie draftu w zamrożonym tygodniu).
- Zachowanie `opening_hours_snapshot` przy odblokowaniu (nie jest kasowany) i nadpisywanie przy ponownym zapisie — celowe.
- Stany `currentWeekSaved`/`currentWeekStart` w UI mogą być nieświeże przy długo otwartej karcie — serwerowa bramka i trigger są backstopem (fail-safe).
