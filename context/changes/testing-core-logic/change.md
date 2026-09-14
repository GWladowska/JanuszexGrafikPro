---
change_id: testing-core-logic
title: Testing core logic
status: implementing
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

Poza zakresem planu, odkryte przy weryfikacji manualnej Fazy 2:

- `supabase/seed.sql` — dodane `set timezone = 'Europe/Warsaw';` na początku pliku. Seed liczył tydzień przez `date_trunc('week', now())` w strefie sesji kontenera (UTC), a trigger `trg_availabilities_enforce_week` liczy go w `Europe/Warsaw` (`supabase/migrations/20260913212151_enforce_availability_week_writes.sql:12`). W niedzielę 22:00–24:00 UTC oba tygodnie się rozjeżdżają o 7 dni i `supabase db reset` pada na `23000`. Naprawa jednolinijkowa, żeby odblokować scenariusze manualne; kandydat na `/10x-lesson`.

Ograniczenie przyjęte świadomie w Fazie 2:

- Pusta lista dostępności (`availabilities: []`) przechodzi walidację, bo jest nie do odróżnienia od legalnego stanu „nowy tydzień, właściciel nie wpisał jeszcze dostępności". Skutek: wygenerowanie draftu na tygodniu bez dostępności daje `201` z pustym grafikiem (0 przypisań). Cichego **zapisu** nie ma — `computeHoles` liczy dziury z godzin otwarcia, więc bramka zwraca `400` „Grafik nie jest kompletny". Otwarte pozostają: cichy **pusty ekran** oraz klasa regresji „filtr `business_id` się rozjechał → zapytanie zwraca `[]` bez błędu" (por. `context/archive/2026-09-13-schedule-editing-collisions/plan.md:17`). Kandydat na `/10x-lesson` i osobną zmianę (stan pusty w UI zamiast pustej siatki).
