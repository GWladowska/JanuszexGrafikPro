<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Generowanie draftu grafiku z dostępności i widok dziur (S-04)

- **Plan**: context/changes/schedule-draft-generation/plan.md
- **Scope**: All phases (3/3)
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Grounding

Diff `3b35e7e..HEAD` (commity 6f0e09b p1 · aa77a66 p2 · 5899073 p3 · 9800fe0 epilog): 9/9 plików źródłowych planu w diffie, 0 MISSING. Dwa sub-agenty równolegle (drift + safety/pattern); algorytm sweep zweryfikowany symulacją (Anna 08–16 + Piotr 12–20, otwarcie 08–18 → Anna 08:00–16:00 + Piotr 16:00–18:00; computeHoles na w pełni obsadzonym dniu → brak dziury). Bramki: `npx astro sync` ✓, `npm run lint` ✓, `npm run build` ✓ (2026-09-13 14:26). Manual: 3.4–3.9 wszystkie [x] z dowodami interaktywnymi (scenariusze A–F przetestowane z użytkownikiem w tej sesji, w tym re-testy po dwóch poprawkach); brak rubber-stampingu. Zakres: 0 naruszeń guardraili (bez ręcznej edycji, bez saved, bez ostrzeżeń kolizji, bez testów, bez migracji/seedu).

## Findings

### F1 — getAssignments bez scopingu business_id

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/schedule.ts:49-55
- **Detail**: Plan wymagał „scoping business_id w każdym zapytaniu" (intencja fazy 1), ale zablokowana sygnatura getAssignments(supabase, scheduleId) nie ma parametru — implementacja filtruje tylko po schedule_id. Dziś bezpieczne tranzytywnie (scheduleId pochodzi z zapytania obiego biznesowo) i RLS backstopuje, ale łamie niezmiennik serwisu, którego pilnują wszystkie rodzeństwa (availability.ts, employee.ts).
- **Fix**: Dodać parametr businessId do getAssignments i .eq("business_id", businessId); endpoint GET przekazuje businessId.
- **Decision**: FIXED (Fix now)

### F2 — Desync weekStart/weekData w islandzie przy nawigacji

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/components/schedules/ScheduleBoard.tsx:113-134, 145-163
- **Detail**: Dwa pokrewne wyścigi stanu: (1) w trakcie fetcha nawigacji (navPending) „Generuj draft"/„Usuń draft" pozostają aktywne — odpowiedź nawigacji nadpisze świeżo utworzony draft (POST się udał, UI pokazuje brak); (2) gdy fetch nawigacji padnie, weekStart już się przesunął, a weekData trzyma poprzedni tydzień — computeHoles narysuje mylące całodzienne dziury nowego tygodnia ze starych zmian.
- **Fix**: Wyłączać Generuj/Usuń draft gdy navPending, a przy błędzie nawigacji cofnąć weekStart do poprzedniej wartości.
- **Decision**: FIXED (Fix now)

### F3 — Pusty stan „brak pracowników" poza planem

- **Severity**: ⚠️ WARNING (benign EXTRA)
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/schedules/ScheduleBoard.tsx:217-230
- **Detail**: Early return „Nie masz jeszcze pracowników…"+link nie jest opisany w planie. Benign: wiernie kopiuje konwencję AvailabilityManager („konwencja AvailabilityManager.tsx" była w planie) i chroni przed generacją pustego draftu bez pracowników.
- **Fix**: Dopisać jako addendum w planie (sekcja Key Discoveries lub Phase 3 intent) — zachowujemy kod.
- **Decision**: FIXED (Fix now — addendum w planie, Phase 3 intent)

### F4 — DELETE: check-then-act na statusie draftu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/schedules/index.ts:294-304
- **Detail**: Status sprawdzany osobno od delete — teoretyczny wyścig draft→saved między check a delete (milisekundy, jedno konto; dziś nieosiągalny, bo S-06 nie istnieje). Dla S-06: przenieść warunek statusu do predykatu DELETE (lub RPC).
- **Fix**: Zapisać notkę dla S-06 (plan S-06: predykat statusu w DELETE).
- **Decision**: SKIPPED (notka pozostaje w raporcie; S-06 odczyta archiwum)

### F5 — PUT: check-then-act na isFullyCovered

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/schedules/index.ts:243-254
- **Detail**: Dostępność mogłaby zniknąć między walidacją a update (brak constraintu w bazie). Akceptowalne w MVP (jeden właściciel); przy przyszłej skali — trigger/RPC.
- **Fix**: Accept as risk (MVP); wrócić przy S-05/S-06.
- **Decision**: SKIPPED (accept as risk — MVP, wróci przy S-05/S-06)

### F6 — Kształt błędu parsowania UUID różni się od rodzeństwa

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/schedules/index.ts:202-209
- **Detail**: parseAssignmentId/parseEmployeeId zwracają 400 ERROR_VALIDATION+fieldErrors; rodzeństwo (availabilities, employees) zwraca 400 ERROR_INVALID_BODY bez fieldErrors.
- **Fix**: Ujednolicić do ERROR_INVALID_BODY (jak rodzeństwo) lub udokumentować świadomą różnicę.
- **Decision**: FIXED (Fix now — 400 ERROR_INVALID_BODY jak rodzeństwo)

### F7 — martwe holes z generateDraft + zdublowany isoWeekday

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/schedule-generation.ts:146-195 · src/components/schedules/ScheduleBoard.tsx:71-73
- **Detail**: Holes z generateDraft nieużywane (POST bierze tylko assignments; widok liczy z computeHoles — semantyka lekko inna: generateDraft pomija dni bez dostępności). isoWeekday zdublowany (schedule-generation.ts:23-25 i ScheduleBoard.tsx isoWeekdayOf) — naturalne miejsce: lib/week.
- **Fix**: Przenieść isoWeekday do src/lib/week.ts i reużyć; holes z generateDraft zostają dla przyszłych testów (udokumentowane).
- **Decision**: FIXED (Fix now — isoWeekday w lib/week, duplikaty usunięte; holes z generateDraft zostają)
