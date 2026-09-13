<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Dostępności pracowników (S-03)

- **Plan**: `context/changes/availability-management/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-13
- **Verdict**: REVISE (poprawki dokumentowe; po fixach → SOUND)
- **Findings**: 0 critical  2 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

12/12 paths ✓ (7 istniejących + 5 nowych poprawnie nieistniejących), 5/5 symbols ✓ (`getBusinessForOwner` business.ts:31, `parseTime` business-validation.ts:51, `ServiceResult` types.ts, `availabilities` database.types.ts:88, `PROTECTED_ROUTES` middleware.ts:4), brief↔plan ✓ (1 dryf → F1). Sub-agent (deep): `normalizeTime` potwierdzony (business.ts:19-21), typy Row/Insert kompletne (database.types.ts:88-118), edycje additive (3 importerów `@/lib/http`; middleware array literal, zero konfliktów tras; dashboard bez konsumentów treści), zero kolizji nazw `availabilit*` w src/ (poza typami), seed: 8 dostępności na tydzień bieżący (seed.sql:107-117).

## Findings

### F1 — Dryf wewnętrzny: „archiwum w Parked" vs nowy slice S-08

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis (plan.md:18)
- **Detail**: Plan twierdzi, że archiwum grafików „jest wpisane do Parked w roadmapie" — decyzja z sesji przeniosła je do slice S-08 `schedule-archive` (References, plan.md:227, już poprawne). Implementer dostanie sprzeczny obraz z roadmapą.
- **Fix**: Zaktualizować plan.md:18 — „przyszłe archiwum grafików to slice S-08 schedule-archive w roadmapie, reżytuje wzorzec nawigacji tygodniowej z tego slice'a".
- **Decision**: FIXED

### F2 — FormField dla type="date"/"time": brak precedensu, jest gotowy wzorzec [color-scheme:dark]

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Current State Analysis (plan.md:16) + Phase 3, change 3
- **Detail**: `FormField` obsłuży wartości controlled input, ale w repo nie ma żadnego `<select>` ani natywnego date/time inputa. Jedyny precedens stylowania inputów czasu w ciemnym motywie to `timeInputClass` z `[color-scheme:dark]` (OpeningHoursEditor.tsx:10-11). Bez `[color-scheme:dark]` natywne pickery renderują się jasne na ciemnym tle — wygląd „zepsuty", wykryty dopiero w E2E.
- **Fix**: W planie (Phase 3, change 3) doprecyzować: daty/godziny/select stylowane wg precedensu `timeInputClass` z `[color-scheme:dark]` (OpeningHoursEditor.tsx:10-11), nie gołym FormField.
- **Decision**: FIXED

### F3 — Helpery tygodnia: obietnica bez lokalizacji pliku

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 (change 2 i 3)
- **Detail**: Plan wymaga `defaultWeekStart` (SSR) i arytmetyki ±7 dni, ale nie nazywa pliku. Weryfikacja: zero helperów dat/tygodni w repo (jedyny hit: EmployeeManager.tsx:315, ad-hoc). AGENTS.md: helpery wspólne → `src/lib/`; S-04 i S-08 będą je reużywać.
- **Fix**: Nazwać lokalizację — np. `src/lib/week.ts` (`nextMonday`, `addDays`, `formatWeekLabel`) w Phase 3.
- **Decision**: FIXED

### F4 — Mapowanie wierszy: precedens to `normalizeTime`, nie `parseTime`

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Key Discoveries (plan.md:28) + Critical Details (plan.md:55)
- **Detail**: Plan każe ucinać sekundy „reużyciem parseTime" — zadziała (parseTime przyjmuje "HH:MM(:SS)"), ale kod już rozwiązuje dokładnie tę pracę helperem `normalizeTime` (`value.slice(0,5)`, business.ts:19-21, prywatny) w warstwie serwisu — właściwy precedens: normalizacja odczytu DB = serwis, nie parser walidacyjny.
- **Fix**: Wskazać `normalizeTime` (business.ts:19-21) jako precedens: wyeksportować z business.ts lub przenieść do wspólnego modułu; `parseTime` zostaje do walidacji wejścia.
- **Decision**: FIXED

### F5 — Krok E2E 12: seed siedzi w bieżącym tygodniu, nie w kolejnym

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Manual Testing Steps (plan.md:215)
- **Detail**: Seed wstawia dostępności na tydzień bieżący (`date_trunc('week', now())`, seed.sql:107-117), a domyślny widok to tydzień kolejny — tester na koncie seeda zobaczy same „—" zanim kliknie ‹.
- **Fix**: Dopisać do kroku 12: „nawiguj ‹ do bieżącego tygodnia (dostępności z seeda tam siedzą)" — przy okazji testuje nawigację.
- **Decision**: FIXED (podejście użytkownika: zamiast dopisku w E2E — seed rozszerzony o tygodnie: poprzedni, bieżący i następny; plan.md: Current State seed-bullet, Phase 3 change 6 „Seed: dostępności na trzy tygodnie", krok E2E 12 przepisany, Progress +3.12)
