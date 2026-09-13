# Testing Core Logic — Plan Brief

> Full plan: `context/changes/testing-core-logic/plan.md`
> Research: `context/changes/testing-core-logic/research.md`

## What & Why

Projekt nie ma żadnego runnera testów, a najważniejsza reguła domenowa — „każda godzina otwarcia
musi mieć obsadę" — nie jest przez nic sprawdzana. Jednocześnie znany incydent pokazał, że gdy
do czystej logiki trafi zły kształt danych, aplikacja **milczy i pokazuje pusty grafik**, a bramka
zapisu przepuszcza go jako kompletny. Ten plan uruchamia Vitest, pokrywa czystą logikę grafiku,
czasu i tekstu oraz domyka produkcyjnie lukę ze złym kształtem danych.

Realizuje Fazę 1 z `context/foundation/test-plan.md:55` — ryzyka #2, #3, #7 i część #1.

## Starting Point

W repo nie ma `vitest`, plików `*.test.ts`, configu, skryptu `test` ani kroku testowego w CI.
Docelowe moduły (`week.ts`, `schedule-generation.ts`, `schedule-export.ts`, `schedule-validation.ts`)
są jednak **całkowicie czyste** — framework importują wyłącznie jako `import type`, więc testy nie
potrzebują DOM-u, mocków ani runtime'u Workers. Alias `@/*` istnieje dziś tylko w `tsconfig.json:8-11`.
Trasa API ma już wzorzec walidacji (`parseWeekStartField` → `400 + fieldErrors`), a bramka zapisu
liczy blokady z tych samych danych, które mogły być wadliwe.

## Desired End State

`npm test` przechodzi na świeżym klonie bez żadnej konfiguracji środowiska ani bazy.
CI uruchamia `npx astro check` i `npm test` obok `sync`/`lint`/`build`. Czysta logika grafiku,
tygodnia i eksportu tekstu jest pokryta testami przypinającymi kontrakty z PRD. A gdy na granicę
API trafi zły kształt danych, odpowiedź to `500` i zapis **nie dochodzi do skutku** — zamiast
cichego pustego grafiku.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Uruchomienie runnera | Własny `vitest.config.ts` + jawny `resolve.alias` | Nie wiąże runnera z wewnętrznym API Astro ani nie dociąga pluginu Tailwind | Plan |
| Wersja runnera | `vitest@^4` | Astro 6.3.1 sam developuje się na `vitest ^4.1.0` obok `vite ^7.3.2` | Research |
| Lokalizacja testów | Obok modułu, `*.test.ts` | `tsconfig.json:3` już to łapie, importy przez `@/` bez zmian | Plan |
| Przypinanie „dzisiaj" | Jawne argumenty `now`/`reference` | Zero magii, w pełni deterministyczne, używa parametrów istniejących w `week.ts` | Plan |
| Semantyka dziur | Tylko produkcyjna (`computeHoles` przez `findScheduleBlockers`) | `generateDraft.holes` jest martwe produkcyjnie — zielony test dawałby fałszywe bezpieczeństwo | Research |
| Zły kształt danych | Domknięcie produkcyjnie: walidacja + `500` | Sam test nie naprawia luki; dziś taki grafik zapisuje się jako kompletny | Plan |
| Miejsce walidacji | Czyste parsery w `schedule-validation.ts`, wołane na granicy API | Zgodne z istniejącym wzorcem, nie rusza sygnatur czystych funkcji ani islandy | Plan |
| Status przy złym kształcie | `500 ERROR_SERVER` | To awaria naszego pipeline'u, nie błąd właściciela — zero nowych komunikatów i zmian w UI | Plan |
| Asercje formatu | Dokładne literały (`Pn … – Nd …`) | Najsilniejszy sygnał na regresję formatu widoczną dla pracownika; Node 22 z pełnym ICU jest przypięty | Plan |
| Bramka CI | `npm test` + `npx astro check` już w Fazie 1 | Runner, którego nikt nie uruchamia w automacie, nie złapie klasy regresji, po którą powstał | Plan |

## Scope

**In scope:** instalacja i konfiguracja Vitest; skrypty `test`/`test:watch`/`check`; kroki CI;
aktualizacja `AGENTS.md`; parsery walidacji kształtu + wywołania w GET/POST/PATCH; testy jednostkowe
`week.ts`, `schedule-export.ts`, `schedule-generation.ts`, `schedule-validation.ts`;
aktualizacja cookbooka §6 planu testów.

**Out of scope:** testy integracyjne na Workers i pgTAP (Fazy 2–3 planu testów); e2e, testy wizualne
i multimodalne; wymuszenie bramek w branch protection (Faza 4); refaktor duplikatu mapowania
`DraftPiece`; zmiany sygnatur czystych funkcji; zmiany semantyki `ERROR_SCHEDULE_INCOMPLETE` i UI;
fake timers; progi pokrycia.

## Architecture / Approach

Cztery fazy o wymuszonej kolejności. **Faza 1** wprowadza harness (runner + config + CI) i kończy się
testem-dymnym — nic nie rusza w produkcji. **Faza 2** to jedyna zmiana produkcyjna: czyste parsery
kształtu w `schedule-validation.ts` wołane w trasie API między pobraniem danych z bazy a wywołaniem
czystej logiki; porażka → `500`, brak zapisu. **Fazy 3 i 4** to już wyłącznie testy istniejącego,
czystego kodu — najpierw czas i tekst, na końcu grafik (największa suita, sedno ryzyka #2).

```
Faza 1: npm test / CI  ──►  Faza 2: walidacja granicy (prod)  ──►  Faza 3: czas + tekst  ──►  Faza 4: grafik
         (harness)                  (zamyka lukę #2)                  (ryzyka #3, #7)          (ryzyka #2, #1)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness | Vitest + config + skrypty + CI + test-dymny | Alias `@/*` nie rozwiąże się poza TS; ESLint zacznie typować pliki testowe |
| 2. Walidacja granicy | Czyste parsery + wywołania w GET/POST/PATCH → `500` | Walidacja wstawiona **za** czystą logiką zamiast przed nią — luka zostaje |
| 3. Czas i tekst | `week.test.ts`, `schedule-export.test.ts` | Asercje na literały zależne od ICU; `nextMonday` dla poniedziałku |
| 4. Grafik | `schedule-generation.test.ts` | Pomylenie dwóch semantyk dziur; testowanie martwej ścieżki `generateDraft.holes` |

**Prerequisites:** Node 22.14.0 (`.nvmrc`); dostęp do npm; lokalny Supabase + Docker (WSL) tylko dla
manualnych scenariuszy A i B z Fazy 2 — fazy 1, 3 i 4 działają bez bazy.
**Estimated effort:** ~2–3 sesje; Faza 1 niewielka, Faza 2 średnia (zmiana produkcyjna), Fazy 3–4
to głównie pisanie testów.

## Open Risks & Assumptions

- **Różnica ICU między Node a workerd.** Testy asertują literały pl-PL renderowane przez pełne ICU
  Node 22. Produkcja renderuje ten sam tekst w workerd; zgodność nie została zweryfikowana empirycznie
  (`research.md:§Pułapki`). Jeśli się rozjedzie, testy przejdą, a użytkownik zobaczy inny format.
- **`@types/node` jest zależnością przechodnią**, nie zadeklarowaną (`package-lock.json:3293`).
  Jeśli w przyszłości zniknie z drzewa, `vitest.config.ts` używający `node:url` przestanie się typować.
- **ESLint `strictTypeChecked` na plikach testowych.** Może zgłosić idiomy asercji na `unknown`;
  plan przewiduje wąski blok `files` dla testów zamiast globalnego wyłączania reguł.
- **Nowe kroki CI nie blokują merge'a bez ochrony gałęzi** — dopóki Faza 4 planu testów nie wymusi
  ich w GitHubie, czerwone testy nie zatrzymają publikacji przez Workers Builds.
- **Założenie: kształt danych psuje się w mapowaniu, nie w bazie.** Gdyby regresja dotyczyła samych
  ograniczeń DB, walidacja runtime w trasie jej nie zastąpi — to obszar Fazy 3 planu testów (pgTAP).

## Success Criteria (Summary)

- `npm test`, `npm run check`, `npm run lint` i `npm run build` przechodzą na świeżym klonie bez bazy.
- CI pokazuje nowe kroki i jest zielone; scenariusz manualny generowania i zapisu grafiku działa jak przed zmianą.
- Zły kształt danych kończy się `500` i brakiem zapisu, a raport `npm test` pozwala wskazać test dla każdego z ryzyk #1 (serwer), #2, #3 i #7.
