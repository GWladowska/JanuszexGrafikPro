<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Zapis kompletnego grafiku (S-06)

- **Plan**: context/changes/save-complete-schedule/plan.md
- **Mode**: Deep
- **Date**: 2026-09-13
- **Verdict**: SOUND (po triage: wszystkie findings FIXED)
- **Findings**: 1 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

7/7 paths ✓ (`schedule-generation.ts`, `schedule.ts`, `http.ts`, `api/schedules/index.ts`, `ScheduleBoard.tsx`, `api.ts`, `useApiErrorState.ts`); 5/5 symbols ✓ (`computeHoles`, `isFullyCovered`, `findUncoveredRanges`, `findSelfOverlaps`, `isWithinOpeningHours`); 3 nowe symbole nieobecne zgodnie z planem (`findScheduleBlockers`, `saveSchedule`, `unlockSchedule`); brak `PATCH` w `api/schedules/*.ts` (zgodnie z planem); brief↔plan ✓. `docs/reference/contract-surfaces.md` nie istnieje — check pominięty.

## Findings

### F1 — Progress↔Phase: fazy 1 i 2 mają Manual bez wpisów w Progress

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 i Phase 2 → `#### Manual Verification:` vs `## Progress`
- **Detail**: Fazy 1 i 2 mają w Success Criteria blok `#### Manual Verification:` z bulletem-placeholderem („warstwa czysta i serwis weryfikowane scenariuszami E2E w fazie 3"), ale `## Progress` nie ma dla nich podsekcji `#### Manual`. Kontrakt z `references/progress-format.md` wymaga, by każdy bullet Success Criteria miał odpowiadający wpis `- [ ] N.M`.
- **Fix**: Usuń `#### Manual Verification:` z faz 1 i 2 — weryfikacja manualna E2E i tak należy do fazy 3 (tak jak zrobił to plan S-05).
- **Decision**: FIXED (usunięte `#### Manual Verification:` z faz 1 i 2)

### F2 — Każda wypełniona dziura = kolizja; brak scenariusza na korektę dostępności

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Overview / Desired End State / Testing Strategy A–D
- **Detail**: `generateDraft` tworzy dziurę dokładnie tam, gdzie żadna dostępność nie sięga (`schedule-generation.ts:106-137`), a dzień bez żadnej dostępności w ogóle nie wchodzi do pętli (`:163-169`) → `computeHoles` daje całodzienną dziurę. Wniosek: ręczne obsadzenie dowolnej dziury ZAWSZE daje `findUncoveredRanges` niepuste, czyli kolizję, którą nowa bramka blokuje. To dokładnie proces opisany przez użytkownika („obsadź → kolizja → zadzwoń → wydłuż dostępność → flaga znika → zapis"), ale plan tego sprzężenia nie odnotowuje, a żaden scenariusz A–D przez tę ścieżkę nie przechodzi. Scenariusz A usuwa kolizję przez „Zamień na…" (krok B.6), nie przez edycję dostępności.
- **Fix**: Dodaj scenariusz E2E na ścieżkę dostępności (świeże konto): obsadź dziurę niedostępną osobą → flaga „Poza dostępnością" → przejdź do /availabilities i wydłuż tej osobie dostępność na ten dzień → wróć na /schedules → flaga znika → przycisk zapisu aktywny → zapis przechodzi. Dopisz 1 zdanie w Overview, że jedynym sposobem obsadzenia dziury bez kolizji jest rozszerzenie dostępności pracownika.
  - Strength: Pokrywa ścieżkę wskazaną przez użytkownika jako główną; wyjaśnia, dlaczego wygenerowany draft z dziurami nie da się zapisać bez korekty dostępności.
  - Tradeoff: Jeden dodatkowy scenariusz i jedno zdanie opisu.
  - Confidence: HIGH — zachowanie generatora potwierdzone w kodzie.
  - Blind spot: Scenariusz wymaga przejścia przez dwie strony, więc jest dłuższy niż pozostałe.
- **Decision**: FIXED (zdanie w Overview o korekcie dostępności + scenariusz E + pozycja Progress 3.9)

### F3 — Bramka kompletności ma własny, drobny TOCTOU (guard tylko statusu)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 pkt 2 / Phase 2 pkt 2
- **Detail**: Warunkowy `UPDATE ... WHERE status = 'draft'` zamyka wyścig na statusie, ale nie na danych: przypisanie dodane między odczytem (godziny/dostępności/przypisania pod bramkę) a `UPDATE` mogłoby wejść do zapisanego grafiku mimo kolizji/dziury. Przy jednym właścicielu i braku równoległych edycji ryzyko jest pomijalne.
- **Fix**: Dopisz jedno zdanie w `## Critical Implementation Details`, że to świadomie zaakceptowane ryzyko (single-owner MVP), ewentualnie z opcją ponownego sprawdzenia blokad po `UPDATE`.
- **Decision**: FIXED (dodany bullet o zaakceptowanym wyścigu na danych)

### F4 — Gałąź UI prezentująca `serverBlockers` jest nieosiągalna z UI

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 pkt 1 / Desired End State pkt 5
- **Detail**: Przycisk jest wyszarzony, gdy są blokady, więc 400 z `blockers` dociera tylko przez obejście (konsola) — a Desired End State obiecuje, że „UI potrafi ją pokazać". Żaden scenariusz nie weryfikuje tego renderu, więc to kryterium jest w praktyce niepotwierdzalne z UI (scenariusz D sprawdza tylko odpowiedź API).
- **Fix**: Zdecyduj — albo (a) oznacz gałąź jako czysto obronną i usuń obietnicę UI z Desired End State, albo (b) dopisz krok weryfikacji renderu (np. chwilowe zdjęcie `disabled` w dev-tools i klik, by zobaczyć listę blokad z serwera).
- **Decision**: FIXED via Fix A (scenariusz F — nieświeże dane klienta → serwer 400 z listą blokad, UI ją pokazuje; Progress 3.10)
