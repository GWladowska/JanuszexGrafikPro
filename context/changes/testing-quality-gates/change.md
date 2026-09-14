---
change_id: testing-quality-gates
title: Bramki jakości w automacie (test-plan rollout Phase 4)
status: implemented
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "Bramki jakości w automacie".
Risks covered: wszystkie (#1–#7). Test types planned: gates.
Risk response intent:

- #1: niekompletny/kolizyjny zapis grafiku jest odrzucany przez serwer, a komunikat mówi, co blokuje.
- #2: logika zwraca dokładnie oczekiwane zmiany i dziury; złe/pominięte dane widać jako błąd, nie jako pusty ekran.
- #3: daty graniczne dają właściwy tydzień i właściwą decyzję zamknięte/otwarte w Europe/Warsaw.
- #4: drugi właściciel nic nie odczyta ani nie zapisze; test izolacji działa jedną komendą i w automacie.
- #5: żądanie z cudzym identyfikatorem zasobu jest odrzucane; brak logowania nie zmienia danych.
- #6: po zmianie wspólnego pomocnika kluczowe odpowiedzi pozostają takie same na kilku ścieżkach.
- #7: tekst grafiku ma dni w kolejności, zmiany posortowane, dni nieczynne obecne, brak znaczników w wariancie plain.
  Gate set to enforce: lint, `npx astro check`, unit, integration, pgTAP (`supabase test db`), build — plus realne wymuszenie w ochronie gałęzi, żeby czerwona zmiana nie trafiła na produkcję.
