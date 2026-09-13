# Follow-ups: poprawki z impl-review (S-06)

Źródło: `reviews/impl-review.md` (triage 2026-09-13). Wszystkie findings rozpatrzone.

| Finding | Decyzja | Zmiana |
|---------|---------|--------|
| F1 — bramka blokad i zapis nie są atomowe | ACCEPTED | Świadomie zaakceptowany wyścig danych przy zapisie (single-owner MVP); bez zmian w kodzie, domknięcie dopiero przy wielodostępności. |
| F2 — zapis przypisań nie jest atomowy względem statusu | FIXED (Fix A) | Migracja `20260913203855_enforce_draft_assignment_writes.sql`: trigger `trg_assignments_enforce_draft` (`BEFORE INSERT/UPDATE/DELETE` na `assignments`) odrzuca zapis, gdy grafik nie jest `draft`; w `src/pages/api/schedules/assignments.ts` mapowanie kodu `23000` → 409 `ERROR_SAVED_SCHEDULE` w POST/PUT/DELETE. |
| F3 — sierota: draft zostaje przy błędzie insertu przypisań | FIXED | `createScheduleWithAssignments` usuwa utworzony wiersz grafiku, gdy insert przypisań zawiedzie. |
| F4 — `findScheduleBlockers` liczone przy każdym renderze | SKIPPED | Przy obecnej skali bez znaczenia; `useMemo` dopiero przy wzroście liczby pracowników/zmian. |

Bramka po zmianach: `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build` — zielone.

Do wykonania poza commitem:
- Lokalnie: `supabase db reset` (z WSL), by trigger z F2 znalazł się w bazie.
- Produkcja: `supabase link` + `supabase db push` po mergu na `master` (ręcznie, wg konwencji repo).
