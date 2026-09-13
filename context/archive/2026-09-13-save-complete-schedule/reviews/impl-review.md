<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Zapis kompletnego grafiku (S-06)

- **Plan**: context/changes/save-complete-schedule/plan.md
- **Scope**: wszystkie fazy (1–3)
- **Date**: 2026-09-13
- **Verdict**: APPROVED (2 minor warnings, 0 critical)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Grounding

Zakres: 9 plików = 5 źródłowych + 4 kontekstowe, dokładnie jak w planie. Drift: 5/5 MATCH, brak MISSING/DRIFT/EXTRA. Kryteria automatyczne: `astro sync` ✓, `lint` 0 errors ✓, `astro check` 0 errors ✓, `build` ✓. Manualne 3.5–3.10 `[x]` (SHA `ce74db3`), potwierdzone przez użytkownika.

## Findings

### F1 — Bramka blokad i zapis nie są atomowe (wyścig danych)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/schedules/index.ts:245-260
- **Detail**: `findScheduleBlockers` liczy blokady, a `saveSchedule` zapisuje w osobnym zapytaniu. Zmiana dodana między odczytem a UPDATE mogłaby wejść do zapisanego grafiku. Guard `.eq("status","draft")` chroni przed podwójnym zapisem, nie przed zapisem-z-dziurą. Ryzyko pomijalne przy jednym właścicielu; już udokumentowane i świadomie zaakceptowane w planie (`## Critical Implementation Details`).
- **Fix**: Zaakceptować zgodnie z planem (bez zmian) lub, gdyby doszła wielodostępność, przenieść walidację + przejście do jednej transakcji/RPC. Rekomendacja: zaakceptować (już zapisane w planie).
- **Decision**: ACCEPTED — świadomie zaakceptowane ryzyko (single-owner MVP); bez zmian w kodzie, domknięcie dopiero przy wielodostępności.

### F2 — Zapis przypisań nie jest atomowy względem statusu grafiku

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/schedules/assignments.ts:89-91,198-200,281-283
- **Detail**: Handlery przypisań czytają status grafiku („draft?"), a potem zapisują bez warunku na statusie. S-06 czyni to osiągalnym: jednoczesny zapis w drugiej karcie między odczytem a zapisem → przypisanie trafia do zapisanego grafiku. Wzorzec istniał wcześniej, ale dopiero teraz „saved" jest realnym stanem.
- **Fix A ⭐ Recommended**: Trigger `BEFORE INSERT/UPDATE/DELETE` na `assignments`, odrzucający zapis, gdy rodzic nie jest `draft`.
  - Strength: Jeden punkt, invariant wymuszony w bazie — pokrywa wszystkie trzy handlery i przyszłe ścieżki.
  - Tradeoff: Migracja + trigger; trzeba zmapować błąd Postgresa na 409.
  - Confidence: MEDIUM — wzorzec triggera już jest w repo (`set_updated_at`), ale mapowanie kodu błędu trzeba dodać.
  - Blind spot: Nie sprawdzono, czy Postgrest zwraca stabilny kod dla `RAISE EXCEPTION` (wymaga weryfikacji przy implementacji).
- **Fix B**: Optymistyczny guard — ponowny odczyt statusu i zapis warunkowy w każdym z trzech handlerów.
  - Strength: Bez migracji.
  - Tradeoff: Powtórzony w 3 miejscach i nadal nie w pełni atomowy.
  - Confidence: LOW — okno czasowe się zmniejsza, nie znika.
  - Blind spot: Brak.
- **Decision**: FIXED via Fix A (migracja `20260913203855_enforce_draft_assignment_writes.sql` + mapowanie `23000`→409 w POST/PUT/DELETE `assignments.ts`)

### F3 — Sierota: draft zostaje, gdy insert przypisań zawiedzie

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/schedule.ts:124-163
- **Detail**: `createScheduleWithAssignments` wstawia grafik, potem przypisania; błąd insertu przypisań zostawia osierocony draft (POST zwraca wtedy 409 aż do ręcznego DELETE). Problem istnieje od S-04, poza zakresem S-06 — odnotowany tylko dlatego, że plik jest w zmianie.
- **Fix**: Świadomie pominąć (poza zakresem) albo zapisać jako follow-up.
- **Decision**: FIXED — `createScheduleWithAssignments` usuwa utworzony grafik, gdy insert przypisań zawiedzie (sprzątanie, bez osieroconego draftu).

### F4 — `findScheduleBlockers` liczone przy każdym renderze (także keystroke)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/schedules/ScheduleBoard.tsx:536-542
- **Detail**: O(n²) po przypisaniach, liczone przy każdym renderze (również na każdy znak w formularzu). Przy ~5 pracownikach i ≤ ~15 zmianach/tydzień to sub-milisekundowe — bez znaczenia dla main_goal=speed.
- **Fix**: Zostawić; rozważyć `useMemo` dopiero przy wzroście skali.
- **Decision**: SKIPPED — przy obecnej skali bez znaczenia; `useMemo` dopiero przy wzroście.
