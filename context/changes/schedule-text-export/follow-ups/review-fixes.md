# Follow-ups: poprawki z impl-review (S-07)

Źródło: `reviews/impl-review.md` (triage 2026-09-13). Wszystkie findings rozpatrzone.

| Finding | Decyzja | Zmiana |
|---------|---------|--------|
| F1 — fallback schowka bez `textarea.focus()` | FIXED | W `copyToClipboard` (ScheduleBoard.tsx) dodane `textarea.focus()` przed `textarea.select()` — `execCommand("copy")` wymaga sfokusowanego zaznaczenia (Safari/mobile). |
| F2 — wyścig kopiowanie ↔ nawigacja | FIXED | Przyciski Poprzedni/Następny dostały `disabled={navPending \|\| copyPending}` — brak „Skopiowano" z poprzedniego tygodnia po zmianie tygodnia. |
| F3 — `buildScheduleText` przy każdym renderze | SKIPPED | Niezauważalne przy skali MVP; `useMemo` dopiero przy wzroście liczby pracowników/zmian. |
| F4 — duplikacja `formatRange` | FIXED | `formatRange` przeniesione do wspólnego `src/lib/format.ts`; używane w `schedule-export.ts` i `ScheduleBoard.tsx` (zamiast dwóch lokalnych kopii). |

Bramka po zmianach: `npm run lint` (0 błędów), `npx astro check` (0 błędów), `npm run build` — zielone.
