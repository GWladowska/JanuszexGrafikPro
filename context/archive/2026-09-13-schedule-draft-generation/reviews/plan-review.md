<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Generowanie draftu grafiku z dostępności i widok dziur (S-04)

- **Plan**: context/changes/schedule-draft-generation/plan.md
- **Mode**: Deep
- **Date**: 2026-09-13
- **Verdict**: REVISE
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

14/14 paths ✓, 6/6 symbols ✓, brief↔plan ✓. Deep: seed ↔ scenariusz B odtworzony 1:1 pod algorytm sweep ✓; schemat (złożone FK, unikat `(business_id, week_start)`, CHECK poniedziałku, enum statusu, trigger `updated_at`) potwierdzony w `20260912141307_domain_schema.sql:97-140`; wszystkie referencje linii (availabilities/index.astro:28-29, :53-55, AvailabilityManager.tsx:388-416, dashboard.astro:64-84, employees/index.ts:74, database.types.ts:37-87/226-260) ✓; brak istniejącego kodu `/schedules` (blast radius czysty).

## Findings

### F1 — Scenariusze manualne C.2 i E.3: błędne oczekiwania

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Testing Strategy → C.2 i E.3 (Progress 3.6, 3.8)
- **Detail**: C.2 oczekuje „select znika (pula dla Marii pusta)" po zamianie Anny→Maria (Wt 08:00–16:00). Ale seed.sql:119/122: Anna i Maria są dostępne wt 08:00–16:00, więc dla zmiany Marii pula = {Anna} — select zostaje i pokazuje Annę. Własne uzasadnienie planu („Anna i Maria to jedynie dostępne") przeczy wnioskowi „pula pusta"; zdanie „dla Anny dostępna jest tylko…" urwane. Tester zobaczy fałszywą awarię poprawnego kodu. E.3 każe generować draft drugi raz (po E.2 przycisk zablokowany) i sprawdza klipowanie na przedziale 10:00–14:00 w środku 09:00–17:00 — nic nie klipuje (klipowanie realnie testuje B: Piotr 12:00–20:00 → 16:00–18:00).
- **Fix**: W C.2 oczekuj: select pozostaje i pokazuje Annę (opcjonalnie zamiana z powrotem — mocniejszy test); usuń urwane zdanie. W E skreśl krok 3 (E.2 już weryfikuje stany), zostaj przypisanie dziur 09:00–10:00 / 14:00–17:00.
- **Decision**: FIXED (Fix in plan)

### F2 — PUT nie ma w kontrakcie fazy 1 funkcji „pobierz przypisanie ze statusem"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §2 (kontrakt serwisu) ↔ Phase 2 PUT
- **Detail**: PUT musi znaleźć przypisanie po ID w obrębie biznesu (404), sprawdzić status jego grafiku (409 dla saved) i znać jego datę/godziny do isFullyCovered. Kontrakt serwisu ma tylko getAssignments(scheduleId) i updateAssignmentEmployee — brak funkcji pobierającej pojedyncze przypisanie z dołączonym statusem grafiku.
- **Fix**: Dodaj do fazy 1: getAssignmentWithSchedule(supabase, businessId, assignmentId) → wiersz assignments + status schedules.
- **Decision**: FIXED (Fix in plan)

### F3 — Scalanie przedziałów dostępności nie jest wyspecyfikowane

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1 (generator, isFullyCovered)
- **Detail**: Schemat jawnie dopuszcza wiele wpisów dostępności na dzień („przerwy", domain_schema.sql:71; constraint z S-03 dopuszcza przedziały nienachodzące). Jeśli isFullyCovered sprawdzi tylko „istnieje jeden przedział zawierający całą zmianę", odrzuci poprawną zamianę dla pracownika z dwoma wpisami 08–12 i 12–16. Żaden scenariusz E2E tego nie wykryje (seed ma po jednym przedziale na osobę/dzień).
- **Fix**: Jedno zdanie w kontrakcie fazy 1: przed sweepem i sprawdzaniem pokrycia scal przedziały pracownika na dany dzień w sumę przedziałów.
- **Decision**: FIXED (Fix in plan)

### F4 — createScheduleWithAssignments: błąd batcha zostawia pusty draft

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2 — createScheduleWithAssignments
- **Detail**: Insert schedules, potem batch assignments; gdy batch padnie (mało prawdopodobne — FK i czasy pochodzą ze zwalidowanych dostępności), zostaje pusty draft, a POST zwraca 409. Ścieżka ratunkowa („Usuń draft") istnieje w tej zmianie, ale plan tego nie zaznacza.
- **Fix**: Dopisz w Critical Implementation Details: brak transakcji jest świadomy; przy błędzie batcha ratunkiem jest „Usuń draft".
- **Decision**: FIXED (Fix in plan)

### F5 — GET ?week= bez walidacji w kontrakcie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — GET
- **Detail**: POST/DELETE mają parseWeekStart; GET nie. Nieprawidłowa data poleci do PostgREST i wróci jako generyczny błąd serwera zamiast 400.
- **Fix**: W kontrakcie GET dopisz: parse `week` przez parseWeekStart → 400 przy błędzie.
- **Decision**: FIXED (Fix in plan)
