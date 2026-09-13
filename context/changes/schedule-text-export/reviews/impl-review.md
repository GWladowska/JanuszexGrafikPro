<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Tekstowy widok grafiku do skopiowania (S-07)

- **Plan**: context/changes/schedule-text-export/plan.md
- **Scope**: wszystkie fazy (1–2)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical | 0 warnings | 4 observations

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

3/3 plików źródłowych z planu obecne ✓, 6/6 symboli ✓ (`weekdayLong`, `WEEKDAY_LONG`, `buildScheduleDays`, `buildScheduleText`, `copyToClipboard`, `submitCopy`), zakres zmian = 7 plików (3 źródłowe + 4 kontekstowe) zgodny z planem, drift: MATCH na wszystkich pozycjach faz 1–2. Weryfikacja automatyczna na zamrożonym kodzie: `npx astro sync` ✓, `npm run lint` 0 błędów (1 wcześniej istniejące ostrzeżenie `no-console` w `schedules/index.astro`), `npx astro check` 0 błędów, `npm run build` ✓. Manualne 2.5–2.11 potwierdzone przez użytkownika („Wszystko działa"). Uwaga: „zero przypisań → wszystkie dni nieczynne" działa w zakresie z planu (tydzień w pełni zamknięty = brak godzin otwarcia); otwarty dzień bez zmian jest nieosiągalny w zapisanym grafiku (dziura blokuje zapis).

## Findings

### F1 — Fallback schowka bez `textarea.focus()`

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/components/schedules/ScheduleBoard.tsx:173
- **Detail**: Ścieżka awaryjna robi `textarea.select()`, ale nie `textarea.focus()`. W części przeglądarek (Safari/mobile) `document.execCommand("copy")` zawodzi bez zaznaczenia w sfokusowanym polu — czyli dokładnie ten fallback bywa bezużyteczny tam, gdzie jest potrzebny.
- **Fix**: Dodaj `textarea.focus()` przed `textarea.select()`.
- **Decision**: FIXED — `textarea.focus()` przed `textarea.select()` w `copyToClipboard`

### F2 — Wyścig kopiowanie ↔ nawigacja: nieaktualny feedback

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/components/schedules/ScheduleBoard.tsx:612-632 vs :297-323
- **Detail**: Przyciski nawigacji blokują tylko `navPending`, nie `copyPending`. Klik „Następny" w trakcie kopiowania wyczyści feedback (przez `closeEditingForms`), ale niedokończone kopiowanie może potem ustawić „Skopiowano" nad nowym tygodniem. Skopiowana treść jest poprawna — nieaktualny jest wyłącznie komunikat.
- **Fix**: Dołóż `copyPending` do warunku `disabled` przycisków Poprzedni/Następny (`navPending || copyPending`).
- **Decision**: FIXED — `disabled={navPending || copyPending}` na obu przyciskach nawigacji

### F3 — `buildScheduleText` przeliczane przy każdym renderze

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: src/components/schedules/ScheduleBoard.tsx:593-600
- **Detail**: Dwa warianty tekstu liczone przy każdym renderze zapisanego grafiku (~7 dni × filtr ~15 zmian + składanie stringów ≈ 100 operacji). Niezauważalne przy skali MVP; `findScheduleBlockers` robi to samo od S-06.
- **Fix**: Bez zmian teraz; ewentualny `useMemo` dopiero przy wzroście skali.
- **Decision**: SKIPPED — niezauważalne przy skali MVP; `useMemo` przy wzroście

### F4 — Duplikacja `formatRange` i fallbacku „—"

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/schedule-export.ts:22,65
- **Detail**: `formatRange` i stała „—" powtarzają identyczne lokalne helpery z `ScheduleBoard.tsx:154-156`. Trywialne, bez wpływu na działanie.
- **Fix**: Zostawić lub przenieść do wspólnego helpera `src/lib/` przy okazji kolejnej zmiany w tych plikach.
- **Decision**: FIXED — `formatRange` przeniesione do `src/lib/format.ts`, używane w `schedule-export.ts` i `ScheduleBoard.tsx`
