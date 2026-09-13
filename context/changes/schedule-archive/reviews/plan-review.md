<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Archiwum zapisanych grafików (S-08)

- **Plan**: context/changes/schedule-archive/plan.md
- **Mode**: Deep
- **Date**: 2026-09-13
- **Verdict**: SOUND (po triage — wszystkie findings naprawione)
- **Findings**: 1 critical, 1 warning, 1 observation (wszystkie FIXED)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

8/8 istniejących ścieżek ✓ (nowa `src/lib/services/schedule-archive.ts` zadeklarowana; `docs/reference/contract-surfaces.md` nie istnieje → pominięto), symbole istniejące obecne ✓, nowe symbole nieobecne zgodnie z planem ✓, brief↔plan ✓.

## Findings

### F1 — Phase 2: 4 kryteria manualne, 3 pozycje w Progress

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 → `#### Manual Verification:` vs `## Progress`
- **Detail**: Phase 2 ma cztery kryteria manualne, ale `## Progress` tylko trzy (2.5, 2.6, 2.7) — kryterium „zapis zapisuje niepusty snapshot” i „ponowny zapis nadpisuje kopię” scalono w 2.7. Kontrakt Progress (`references/progress-format.md`) wymaga pozycji 1:1 z kryteriami, a `/10x-implement` odhacza pozycje per krok — scalenie gubi osobne potwierdzenie nadpisania kopii przy ponownym zapisie.
- **Fix**: rozbić 2.7 na dwie pozycje — 2.7 „Zapis grafiku zapisuje niepusty `opening_hours_snapshot`” i 2.8 „Ponowny zapis po odblokowaniu nadpisuje kopię godzin nowymi wartościami”.
- **Decision**: FIXED

### F2 — Flagi kolizji w archiwum liczone z bieżących dostępności

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — widok archiwum (i scenariusz A)
- **Detail**: Plan każe dla zamrożonego zapisanego tygodnia liczyć godziny z kopii, ale żółte/„dziurowe” flagi nadal powstają z bieżących `weekData.availabilities` (`ScheduleBoard.tsx:700-710`) i renderują się bezwarunkowo (`:874-887`). Dostępności na minione daty są edytowalne (`availability-validation.ts` sprawdza tylko format daty — brak ograniczenia do przyszłości), więc usunięcie/edycja dostępności po zapisie pokaże w archiwum flagi na grafiku, który przy zapisie był poprawny. Plan łagodzi to tylko wyrównaniem fixture (plan.md:116), co w testach maskuje problem.
- **Fix**: renderować flagi „poza dostępnością”/„nakładka” tylko gdy `isDraft` (zapisany grafik jest z definicji bez kolizji — bramka zapisu to gwarantuje).
  - Strength: Spójne z regułą „saved = zwalidowany”; usuwa fałszywe ostrzeżenia także w przyszłych zapisanych tygodniach.
  - Tradeoff: Ukrywa sygnał dryfu, gdyby dane dostępności rozjechały się po zapisie (rzadkie, akceptowalne).
  - Confidence: HIGH — `saveSchedule` odrzuca braki, więc zapisany grafik nie ma kolizji.
  - Blind spot: Czy w UI zapisanego tygodnia flagi pełnią dziś jakąkolwiek rolę — nie sprawdzano.
- **Decision**: FIXED

### F3 — Granica zamrożenia liczona raz przy ładowaniu

- **Severity**: ○ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — prop `currentWeekStart`
- **Detail**: `isFrozen` bierze się z propa policzonego przy ładowaniu strony. Karta otwarta przez noc z poniedziałku na wtorek zachowa starą granicę i pokaże aktywne akcje dla właśnie zamrożonego tygodnia; serwer i tak odrzuci je 409, więc ryzyko zapisu nie istnieje — to tylko nieświeży UI.
- **Fix**: dopisać w „Critical Implementation Details” jedno zdanie, że granica jest liczona przy ładowaniu, a prawdziwą bramką pozostaje serwer.
- **Decision**: FIXED
