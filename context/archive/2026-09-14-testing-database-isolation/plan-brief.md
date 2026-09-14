# Izolacja danych jako powtarzalny test (Etap 3) — Plan Brief

> Full plan: `context/changes/testing-database-isolation/plan.md`
> Research: `context/changes/testing-database-isolation/research.md`

## What & Why

Etap 3 planu testów: zamienić ręczną weryfikację izolacji danych w **automatyczny test bazy (pgTAP)**, który dowodzi, że konto drugiego właściciela nie odczyta i nie zapisze niczego z pierwszego lokalu. Dziś izolację sprawdza się ręcznie — zmiana polityki lub migracja może ją zepsuć, a CI tego nie zauważy. Etap pokrywa ryzyko **#4** i domyka lukę „CI nie sprawdza SQL".

## Starting Point

Istnieje ręczny skrypt `supabase/tests/rls_isolation.sql` (216 linii, scenariusze A–E), który **nie jest** plikiem pgTAP i przez to blokuje automatyczną komendę `supabase test db` (CLI pobiera rekurencyjnie wszystkie `.sql` z `supabase/tests/`). Schemat RLS, polityki i helper `is_business_owner` są gotowe od zmiany `domain-schema-rls`; brakuje wyłącznie warstwy uruchamialnej automatycznie.

## Desired End State

Z WSL komenda `supabase test db` (po `supabase start` + `supabase db reset`) kończy się `Result: PASS`, dowodząc dla każdej z 6 tabel: drugi właściciel nie widzi cudzych danych, nie doda cudzego (`42501`), nie zmieni i nie usunie cudzego (0 wierszy); właściciel **może** czytać i pisać swoje; `anon` widzi zero; polityki i ochrona wierszy nadal istnieją. Ten sam krok jest zielony w CI, a stary skrypt nie istnieje.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Los starego ręcznego skryptu | Zamiana na pgTAP i usunięcie starego | Automat pobiera wszystkie `.sql` z `supabase/tests/`, a dwie kopie scenariuszy rozjechałyby się (znana lekcja repo) | Plan |
| Szerokość prób zapisu | Pełna: dodaj/zmień/usuń w każdej z 6 tabel | Wprost domyka „nie tylko odczyt" i pokrywa każdą politykę osobno | Plan |
| Asercje strukturalne | `policies_are` ×6 + ochrona wierszy włączona ×6 | Łapie migrację usuwającą politykę, nawet gdy pojedyncze zachowanie wciąż wygląda dobrze | Plan |
| „Jedna komenda" lokalnie | Dokumentacja + `supabase test db` z WSL | Zgodne z regułą repo (Docker/CLI tylko z WSL), bez kruchych skryptów zależnych od nazwy dystrybucji | Plan |
| Zakres ryzyk | Tylko izolacja (#4) | Trzymanie jednego tematu na etap; odłożone testy triggerów zostają osobną luką | Plan |
| Ochrona „tylko lokalnie" | Komentarz nagłówkowy + dokumentacja | Twarda asercja „czy to produkcja?" jest zawodna i dawałaby fałszywe poczucie bezpieczeństwa | Plan |
| Sposób dowodu blokady zapisu | `throws_ok '42501'` (INSERT) + `results_ne … returning 1` (UPDATE/DELETE) | Zablokowana zmiana/usunięcie **nie** rzuca błędu — po cichu zmienia 0 wierszy, więc `lives_ok` byłoby fałszywym dowodem | Research |
| Dane ataków | Dobrane tak, by nie kolidowały z unikalnością/wykluczaniem | Inaczej test czerwienieje z powodu innego ograniczenia (`23505`) niż izolacja | Research |

## Scope

**In scope:**
- Nowy test `supabase/tests/database/rls_isolation.test.sql` (6 tabel × odczyt/dodaj/zmień/usuń, kontrola pozytywna, symetria, anon, stan polityk)
- Usunięcie `supabase/tests/rls_isolation.sql`
- Krok `supabase test db` w jobie `integration` w CI
- `AGENTS.md` + `test-plan.md` (§5 bramki, §6.5 cookbook, §8 ledger)

**Out of scope:**
- Testy triggerów SQL (draft-only, bramka tygodnia) — odłożone z Etapu 2, osobna luka
- Testy izolacji na poziomie API (już pokryte przez testy integracyjne, ryzyko #5)
- Zmiany schematu/polityk, nowe migracje
- Skrypt npm owijający WSL; przypięcie wersji CLI w CI; status wiersza §3 w test-plan.md (należy do orchestratora)

## Architecture / Approach

Jeden transakcyjny plik pgTAP: fixtures dwóch (plus trzecie konto jako cel ataku) budowane rolą uprzywilejowaną `postgres`, potem `set local role authenticated` + claim `sub` i macierz asercji na 6 tabelach, na końcu `rollback` (baza bez śladów). Lokalnie uruchamia to `supabase test db` z WSL; w CI ten sam krok w istniejącym jobie `integration`, po `supabase db reset`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Test pgTAP izolacji | Zielony test automatyczny lokalnie; stary skrypt usunięty | Fixtures muszą przejść triggery (draft, tydzień w Europe/Warsaw) i nie kolidować z unikalnością |
| 2. Automat + dokumentacja | Krok w CI, wpisy w AGENTS.md i test-plan.md | Zależność od Dockera/WSL lokalnie; `version: latest` CLI daje niedeterministyczne CI |

**Prerequisites:** lokalny Supabase uruchamiany z WSL (`supabase start`, `supabase db reset`); Docker w WSL; katalog `supabase/tests/database/` do utworzenia.
**Estimated effort:** ~2 sesje, 2 fazy.

## Open Risks & Assumptions

- W obrazie Supabase pgTAP to **1.2.0** (nie 1.3.4) — użyte asercje istnieją, ale warto potwierdzić `select extversion from pg_extension` w implementacji.
- Forma `auth.uid()` w lokalnym obrazie może czytać tylko jeden z dwóch GUC-ów claimu — plan ustawia oba, żeby być odpornym.
- Kolejność sprawdzeń przy `INSERT` (trigger → RLS → unikalność) jest subtelna; dane ataków dobrano tak, by kolizje nie wystąpiły (np. atak `businesses` celuje w konto bez biznesu).
- Jeśli funkcje pgTAP przestaną się rozwiązywać pod `role = authenticated`, fallback to kwalifikacja `extensions.` — decyzja implementacyjna, nie zmiana zakresu.

## Success Criteria (Summary)

- `supabase test db` z WSL jest zielony i **czerwienieje** po celowym usunięciu polityki.
- Job `integration` w CI wykonuje nowy krok i jest zielony przy niezmienionym jobie `ci`.
- Świeży czytelnik potrafi uruchomić test wyłącznie z `AGENTS.md` i §6.5 planu testów.
