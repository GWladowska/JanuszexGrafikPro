# Testy integracyjne reguł serwerowych — Plan Brief

> Pełny plan: `context/changes/testing-server-side-rules/plan.md`
> Research: `context/changes/testing-server-side-rules/research.md`

## What & Why

Faza 2 planu testów: udowodnić, że reguły po stronie serwera działają **niezależnie od interfejsu**.
Serwer musi odrzucać niekompletny/kolizyjny zapis grafiku z komunikatem, co blokuje (#1),
poprawnie decydować o tygodniu i zamrożeniu w strefie Europe/Warsaw (#3), odrzucać żądania
z cudzym identyfikatorem zasobu i bez zalogowania (#5), oraz trzymać wspólny kształt odpowiedzi
między trasami, żeby zmiana jednego pomocnika nie zepsuła innej ścieżki (#6).

## Starting Point

Z Fazy 1 istnieje runner Vitest (99 testów jednostkowych czystej logiki — bez bazy). Trasy API
są czyste i bezpośrednio wywoływalne; jedyną przeszkodą jest wirtualny moduł `astro:env/server`
(do zasymulowania). Lokalny Supabase (`supabase start` z WSL) ma seed z kontem właściciela,
ale daty w seedzie zależą od daty resetu — więc testy zależne od czasu budują własne fixture'y
przez API.

## Desired End State

Po zakończeniu: `npm run test:integration` działa na lokalnym Supabase i dowodzi czterech ryzyk;
CI ma osobny job z bazą (ubuntu + Docker); cookbook §6.4 i ledger §8 w planie testów opisują,
jak dodawać kolejne testy integracyjne.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Złącze uruchamiania | Bezpośrednie wywołanie handlerów (Seam A), bez `vitest-pool-workers` | Najtańsze, dowodzi wszystkich 4 ryzyk; middleware i tak nie chroni `/api/**` | Plan |
| Backend testowy | Realny lokalny Supabase | Jedyna droga do sygnału izolacji RLS (sedno #5) i triggerów | Plan |
| Zegar w testach | Fake timery (przeszłość) dla zamrożenia grafików; realny czas dla dostępności i zapisu | Trigger SQL dostępności liczy prawdziwe `now()`; tokeny JWT wymagają czasu w przeszłości | Plan |
| Zakres #6 | Trasy JSON (schedules, assignments, availabilities, employees, business) bez auth | Auth nie używa `http.ts`; pinowanie jego angielskiego komunikatu to pinowanie błędu | Plan |
| Dryf helperów | Tylko pinowanie testami, bez naprawy produkcyjnej | Zmiana ma czysty cel (dowód ryzyk); naprawa to osobna zmiana | Plan |
| GET tygodnia bez grafiku | Przypięty `200 { schedule: null }` | Obecne zamierzone zachowanie; zmiana to osobna decyzja produktowa | Research |

## Scope

**W zakresie:** harness integracyjny (config, stub, helpery), suity dla #1/#3/#5/#6, job CI z bazą,
cookbook §6.4 + ledger §8, AGENTS.md.

**Poza zakresem:** `@cloudflare/vitest-pool-workers`, trasy auth, naprawa dryfu helperów, zmiany
kontraktów produkcyjnych (asymetria PATCH save, `200 { schedule: null }`), testy pgTAP (Faza 3),
wymuszanie bramek w ochronie gałęzi (Faza 4).

## Architecture / Approach

Testy wołają **handlery API bezpośrednio** z atrapą kontekstu (Request z ciasteczkiem sesji,
`locals.user`, cookies), przez osobny `vitest.integration.config.ts` z aliasem `astro:env/server`
na stub czytający env. Klient Supabase jest realny — sesję zdobywamy prawdziwym
`signInWithPassword`, a świat budujemy przez prawdziwe API (rejestracja właściciela, biznes,
godziny, pracownicy, dostępności, grafiki). Dzięki temu RLS działa jak w produkcji.

## Phases at a Glance

| Faza | Dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Harness | Config, stub, skrypt, helpery, test-dymny | Okablowanie ciasteczek sesji / aliasu |
| 2. Bramka zapisu (#1) | 400 z `blockers`, 409 konfliktów, 401 bez sesji | Fixture „kompletnego" grafiku |
| 3. Zamrożenie (#3) | 409 na datach granicznych, asymetria zapisu, dostępności | Fake timery vs prawdziwy zegar triggera |
| 4. Uprawnienia (#5) | Cudzy ID → 404, niezalogowany → 401, brak mutacji | Dwa właściciele bez wzajemnych przecieków |
| 5. Wspólny kształt (#6) | Tabela kontraktów 401/400/404/409 na trasach JSON | Kompletność tabeli (bez auth) |
| 6. CI + dokumentacja | Job `integration` z bazą, §6.4, §8, AGENTS.md | Supabase w CI (Docker, klucz anon) |

**Wymagania wstępne:** lokalny Supabase działający z WSL (`supabase start`, `supabase db reset`);
Node 22; **Szacowany nakład:** ~6 sesji po 1 fazie.

## Open Risks & Assumptions

- Klucz w CI musi być **anon/publishable** — użycie `service_role` pomija RLS i testy izolacji kłamią.
- `supabase start` w CI pobiera obrazy Docker (2–5 min) — job dłuższy, ale osobny.
- Fake timery w przeszłości zakładają, że `exp` tokena JWT (realny zegar GoTrue) jest późniejszy
  niż mockowany czas — prawdziwe przy datach marca 2026.
- Przypadek „dostępność w bieżącym tygodniu z zapisanym grafikiem" jest nieosiągalny przez API —
  zostaje dla Fazy 3 (trigger, pgTAP).

## Success Criteria (Summary)

- `npm run test:integration` zielone lokalnie i w CI na realnej bazie; raport pozwala wskazać
  test dla każdego z ryzyk #1/#3/#5/#6.
- Cudzy ID i niezalogowane żądanie nie zmieniają danych; niekompletny zapis nie przechodzi.
- `npm test` (jednostki) nadal działa bez bazy; żaden test nie zależy od dzisiejszej daty
  ani strefy maszyny.
