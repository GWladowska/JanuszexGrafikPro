# Izolacja danych między właścicielami jako powtarzalny test (Etap 3) — Implementation Plan

## Overview

Zamieniamy ręczną weryfikację izolacji RLS w **automatyczny, powtarzalny test bazy** (`pgTAP`), który dowodzi, że konto drugiego właściciela nie odczyta i nie zapisze niczego z pierwszego lokalu. Test ma się uruchamiać **jedną komendą** (`supabase test db` z WSL) i **w automacie** (krok w CI). Etap pokrywa ryzyko **#4** z `context/foundation/test-plan.md` i domyka lukę „CI nie sprawdza SQL, a test jest ręczny".

## Current State Analysis

- **Istnieje ręczny skrypt, nie test.** `supabase/tests/rls_isolation.sql` (216 linii) wstawia dwóch właścicieli ze stałymi UUID, rozgrywa scenariusze A–E (odczyt, odrzucony `INSERT` pracownika, symetria, izolacja tabel potomnych, anon) i wypisuje werdykt do `pg_temp.rls_results`. Nie ma `plan()`/`finish()`, więc **nie jest plikiem pgTAP**.
- **Komenda automatyczna jest zablokowana.** `supabase test db` uruchamia `pg_prove` na plikach zamontowanych **rekurencyjnie z `supabase/tests/`** (`.sql` i `.pg`). Plik bez TAP daje `No plan found in TAP output` → `Result: FAIL` i przewraca cały przebieg. Dlatego dopóki ręczny skrypt leży w `supabase/tests/`, komenda nie może wejść do CI.
- **CLI sam zarządza rozszerzeniem.** Źródła Supabase CLI definiują `create extension if not exists pgtap with schema extensions` przed biegiem i `drop extension if exists pgtap` po. W pliku testowym `create extension …` jest nieszkodliwy (daje `NOTICE: already exists, skipping`) — zostawiamy go dla samodokumentacji.
- **Rollback zamiast sprzątania.** Każdy plik testowy jest wycofywany transakcją, więc fixtures w `auth.users` nie zostają w bazie i nie trzeba `on conflict` ani ręcznego kasowania.
- **RLS to jedyna granica.** Klucz API jest publiczny; polityki SQL na 6 tabelach (`businesses`, `opening_hours`, `employees`, `availabilities`, `schedules`, `assignments`) są realną ochroną. Dzieci idą przez `security definer` `public.is_business_owner(business_id)`, biznesy przez `owner_id = auth.uid()`.
- **Wzorzec przełączania właściciela jest sprawdzony** w repo: `set role authenticated` + claim `sub` (`supabase/tests/rls_isolation.sql:93-94`), a w pgTAP wersja `set local` (transakcyjna) jest tą samą mechaniką.
- **Blokady domenowe kształtują fixtures:** grafik musi być `draft` przy zapisie przypisań (`trg_assignments_enforce_draft`), dostępności muszą być w bieżącym/przyszłym tygodniu liczonym w `Europe/Warsaw` (`trg_availabilities_enforce_week`), `schedules.week_start` musi być poniedziałkiem ISO, a `businesses.owner_id` jest unikalne (jeden biznes na konto).
- **Brak jakiejkolwiek infrastruktury pgTAP:** katalog `supabase/tests/database/` nie istnieje, brak skryptu npm, brak wzmianki o `supabase test db` w CI. Miejsce w jobie `integration` (po `supabase db reset`) jest gotowe.
- **Ograniczenie API pgTAP:** w obrazie Supabase pgTAP jest w wersji **1.2.0**. Ma `policies_are`, `policy_cmd_is`, `throws_ok`, `results_ne`, `results_eq`, `is_empty`, `lives_ok`; **nie ma** asercji „RLS włączone" (to helper społecznościowy Basejump, nie rdzeń). Stan „zamków" sprawdzamy więc przez `policies_are` + zapytanie do katalogu `pg_class.relrowsecurity`.

## Desired End State

- `supabase test db` uruchomiony z WSL na czystej lokalnej bazie kończy się `All tests successful` / `Result: PASS` i **jednym plikiem** `supabase/tests/database/rls_isolation.test.sql`.
- Stary ręczny skrypt nie istnieje; jego scenariusze A–E mają odpowiedniki w nowym teście.
- Test dowodzi, dla **każdej z 6 tabel**: drugi właściciel nie widzi cudzych wierszy, nie doda cudzego (`42501`), nie zmieni i nie usunie cudzego (0 wierszy); właściciel **może** czytać i pisać swoje; `anon` widzi zero wierszy; polityki i ochrona wierszy nadal istnieją.
- Krok `supabase test db` w jobie `integration` w CI jest zielony; `AGENTS.md` i `test-plan.md` §6.5 opisują komendę i wzorzec.

**Weryfikacja końcowa:** z WSL `supabase db reset; supabase test db` → PASS; kontrola negatywna (usunięcie jednej polityki) → FAIL; job `integration` w PR wykonuje nowy krok i jest zielony.

### Key Discoveries:

- `supabase test db` skanuje **cały** `supabase/tests/` rekurencyjnie → stary skrypt musi zniknąć, nie wystarczy go „obok" zostawić (`context/changes/testing-database-isolation/research.md`, sekcja 1–2).
- Blokada `INSERT` przez politykę `WITH CHECK` to błąd SQLSTATE **`42501`** („new row violates row-level security policy for table …"); komunikat zależy od wersji i polityki, więc asertujemy **tylko kod**, nie treść.
- Zablokowana `UPDATE`/`DELETE` **nie rzuca błędu** — po cichu zmienia 0 wierszy. Dowodem jest `results_ne($$… returning 1$$, $$ values(1) $$)`, a **nie** `lives_ok` (które przeszłoby także przy zerze wierszy).
- Po `set local role authenticated` funkcje pgTAP rozwiązują się bez kwalifikacji (Supabase ustawia `search_path` roli `postgres` z `extensions`); fallback to `extensions.<funkcja>` lub jawne `set local search_path = public, extensions`.
- `auth.uid()` w nowszych buildach czyta **oba** GUC-y: `request.jwt.claim.sub` oraz JSON `request.jwt.claims->>'sub'`; w starych buildach lokalnych tylko pierwszy — ustawiamy oba.
- Kolejność sprawdzeń przy `INSERT` (trigger `BEFORE` → RLS `WITH CHECK` → unikalność) jest subtelna, dlatego dane ataków dobieramy tak, by **nie kolidowały** z unikalnością/ wykluczaniem (patrz Critical Implementation Details).
- Miejsce w CI: `.github/workflows/ci.yml:41` (`supabase db reset`) → nowy krok tuż po nim; pgTAP nie potrzebuje anon key ani `npm`.

## What We're NOT Doing

- **Nie dokładamy testów triggerów SQL** (draft-only dla przypisań, bramka tygodnia dla dostępności) — świadoma decyzja: Etap 3 trzyma się ryzyka #4; odłożone przypadki z Etapu 2 zostają luką do osobnego zaplanowania.
- Nie piszemy testów izolacji na poziomie API/tras — to już pokrywa `test/integration/ownership.test.ts` (ryzyko #5).
- Nie zmieniamy schematu ani polityk; **żadnych nowych migracji**.
- Nie dodajemy skryptu npm (`test:db`) owijającego WSL — decyzja: dokumentacja + komenda z WSL.
- Nie dodajemy twardej asercji „czy to produkcja?" — decyzja: komentarz nagłówkowy + dokumentacja.
- Nie przypinamy wersji Supabase CLI w CI (`version: latest` zostaje jak jest) — poza zakresem.
- Nie zmieniamy statusu wiersza §3 w `test-plan.md` — to robi orchestrator `/10x-test-plan`, nie ten etap (lekcja: nie archiwizować/nie wyprzedzać orchestratora).

## Implementation Approach

Jeden plik testu pgTAP w `supabase/tests/database/` buduje dwa niezależne światy właścicieli jako rola uprzywilejowana (postgres), a następnie przełącza kontekst na `authenticated` i rozgrywa pełną macierz: odczyt → dodanie → zmiana → usunięcie, dla każdej z 6 tabel, z kontrolą pozytywną i scenariuszem `anon`. Test jest transakcyjny (`begin; … rollback;`), więc nie zostawia śladów i można go uruchamiać wielokrotnie. Na końcu Etapu: stary ręczny skrypt znika, komenda trafia do CI i do dokumentacji.

Kolejność faz jest wymuszona: najpierw test musi być zielony lokalnie (i czerwony po celowym zepsuciu polityki), dopiero potem wpinamy go w CI — inaczej czerwony krok w CI nie daje sygnału o niczym.

## Critical Implementation Details

- **Strefa czasowa przed fixtures.** `set local timezone = 'Europe/Warsaw';` musi być ustawione **przed** wstawieniem dostępności, bo trigger liczy tydzień jako `date_trunc('week', (now() at time zone 'Europe/Warsaw')::date)::date`. Bez tego test czerwienieje w niedzielę 22:00–24:00 UTC (znany incydent z `lessons.md`).
- **Fixtures jako rola uprzywilejowana, ataki jako `authenticated`.** Wszystkie wiersze (konta w `auth.users`, biznesy, dane potomne) wstawiamy **przed** `set local role authenticated`; pgTAP CLI łączy się jako `postgres`, który omija RLS. Nie trzeba wstawiać wiersza do `auth.identities` — test nie loguje się hasłem, tylko ustawia claim.
- **Ataki nie mogą kolidować z ograniczeniami, inaczej dostaniemy inny błąd niż izolacja.** Reguły doboru danych atakujących (wszystkie celują w biznes B):
  - `businesses` — `INSERT` celuje w **trzecie konto C bez biznesu** (nie w B), żeby uniknąć kolizji z `unique (owner_id)`; wynik ma być deterministycznie `42501`, a nie `23505`.
  - `opening_hours` — inny `weekday` niż w fixtures (np. 3 zamiast 1), żeby nie trafić w `unique (business_id, weekday)`.
  - `employees` — inne, unikalne nazwisko/e-mail niż w fixtures (`uq_employees_business_identity`).
  - `availabilities` — **inna data** niż fixtures (a wciąż w bieżącym/przyszłym tygodniu), żeby nie trafić w `excl_availabilities_no_overlap`; `employee_id` musi należeć do B (złożony FK).
  - `schedules` — `week_start` = następny poniedziałek (`+7`), bo B ma już grafik na bieżący tydzień (`unique (business_id, week_start)`).
  - `assignments` — wskazuje grafik B o statusie `draft` i pracownika B (złożone FK); trigger draft przepuszcza, więc pierwszy blokuje RLS.
- **Kontrole pozytywne używają „wolnego" tygodnia.** Wstawienia „właściciel pisze swoje" celują w `week_start + 7` / inne dni, żeby nie kolidować z fixtures tego samego właściciela.
- **Zapis zablokowany asertujemy stylem zależnym od operacji.** `INSERT` cudzego → `throws_ok($$…$$, '42501', NULL, '…')` (trzeci argument `NULL` = nie porównujemy treści komunikatu). `UPDATE`/`DELETE` cudzego → `results_ne($$… returning 1$$, $$ values(1) $$, '…')`. `lives_ok` **nie** jest dowodem zablokowania zapisu.
- **`plan(N)` liczymy jawnie i utrzymujemy.** Asercji będzie kilkadziesiąt; `plan` musi zgadzać się z faktyczną liczbą, inaczej pgTAP zgłasza rozjazd (to celowe — łapie „test, który po cichu się nie wykonał"). Nad `plan` trzymamy jednolinijkowy rozkład `N = …`.
- **Rozwiązywanie funkcji pgTAP pod `role = authenticated`.** Domyślnie działa bez kwalifikacji. Jeśli któraś asercja zwróci błąd „function does not exist", użyć jednolicie `extensions.<funkcja>` (i `select * from extensions.finish()`).
- **Kontekst claimu ustawiamy podwójnie** (`set local request.jwt.claim.sub = '<uuid>'` oraz `set local request.jwt.claims = '{"sub":"<uuid>"}'`), żeby nie zależeć od konkretnej implementacji `auth.uid()` w obrazie lokalnym; po scenariuszu `anon` robimy `reset request.jwt.claims` i `reset request.jwt.claim.sub`.

## Phase 1: Test pgTAP izolacji + usunięcie ręcznego skryptu

### Overview

Powstaje automatyczny test pgTAP pokrywający ryzyko #4, a stary ręczny skrypt przestaje istnieć (jego scenariusze A–E przenosimy do nowego testu). Na koniec fazy `supabase test db` jest zielony lokalnie, a celowe zepsucie polityki czerwieni test.

### Changes Required:

#### 1. Nowy plik testu pgTAP

**File**: `supabase/tests/database/rls_isolation.test.sql` (nowy katalog `supabase/tests/database/`)

**Intent**: Jeden samodzielny, transakcyjny plik pgTAP, który buduje dwa światy właścicieli i dowodzi izolacji odczytu i zapisu na wszystkich 6 tabelach, wraz ze stanem polityk i scenariuszem anon. Nagłówek dokumentuje, że plik jest **tylko lokalny/CI** i nigdy nie wolno go uruchamiać z `--linked`.

**Contract**:
- Szkielet: `begin;` → `create extension if not exists pgtap with schema extensions;` → `set local timezone = 'Europe/Warsaw';` → `select plan(N);` (z jednolinijkowym rozkładem `N`) → … → `select * from extensions.finish();` → `rollback;`.
- Fixtures (jako `postgres`): dwa konta `auth.users` ze stałymi UUID (nie kolidującymi z UUID seeda `00000000-0000-4000-8000-…`), trzecie konto C tylko jako cel ataku `INSERT` na `businesses`, dwa `businesses`, oraz po jednym wierszu `opening_hours`, `employees`, `availabilities` (bieżący tydzień), `schedules` (`draft`, poniedziałek ISO bieżącego tygodnia), `assignments` (wskazujące draft).
- Asercje strukturalne (przed przełączeniem roli): dla każdej z 6 tabel `policies_are('public','<tabela>', ARRAY['<t>_select_owner','<t>_insert_owner','<t>_update_owner','<t>_delete_owner'], '…')` oraz po jednej asercji z zapytania do `pg_class`/`pg_namespace` na `relrowsecurity = true`.
- Asercje behawioralne (po `set local role authenticated` + ustawieniu claimów dla właściciela A): dla każdej z 6 tabel:
  - odczyt: `results_eq('select distinct <kolumna biznesu> from public.<tabela>', ARRAY['<uuid-A>'::uuid], '…')`, gdzie kolumną jest `owner_id` dla `businesses`, a `business_id` dla pozostałych;
  - dodanie cudzego: `throws_ok($$ insert … <biznes B> … $$, '42501', NULL, '…')`;
  - zmiana cudzego: `results_ne($$ update public.<tabela> set … where <klucz B> returning 1 $$, $$ values(1) $$, '…')`;
  - usunięcie cudzego: `results_ne($$ delete from public.<tabela> where <klucz B> returning 1 $$, $$ values(1) $$, '…')`.
- Kontrola pozytywna: dla każdej z 6 tabel `lives_ok($$ insert … <własne A> … $$, '…')` (dane z „wolnego" tygodnia/dnia), plus jedna reprezentatywna zmiana i jedno usunięcie własnego wiersza (`results_eq($$ … returning 1 $$, $$ values(1) $$)`).
- Symetria: co najmniej jeden odczyt jako właściciel B dowodzący, że widzi wyłącznie biznes B.
- Anon: `set local role anon;` + `reset claimów`, następnie `is_empty('select 1 from public.<tabela>', '…')` dla 6 tabel.

#### 2. Usunięcie starego ręcznego skryptu

**File**: `supabase/tests/rls_isolation.sql` (do usunięcia)

**Intent**: Skrypt nie jest plikiem pgTAP i psuje `supabase test db`; jego scenariusze A–E są już pokryte (i rozszerzone) w nowym pliku. Instrukcja uruchomienia z nagłówka trafia do dokumentacji w Fazie 2.

**Contract**: plik przestaje istnieć; `supabase/tests/` zawiera wyłącznie `database/rls_isolation.test.sql`.

### Success Criteria:

#### Automated Verification:

- Nowy plik istnieje, stary nie istnieje; `supabase/tests/` zawiera dokładnie jeden plik `.sql`
- Z WSL, po `supabase start` + `supabase db reset`: `supabase test db` → `All tests successful` / `Result: PASS`
- Drugie uruchomienie `supabase test db` bez resetu bazy również → `Result: PASS` (dowód rollbacku)
- Liczba asercji zgadza się z `plan(N)` (rozjazd = FAIL, nie ignorujemy)

#### Manual Verification:

- Kontrola negatywna („test testu"): ręcznie usuń w lokalnej bazie jedną politykę (np. `employees_select_owner`) i uruchom `supabase test db` → test jest **czerwony**; po `supabase db reset` wraca do zielonego
- Przegląd pliku: każdy scenariusz A–E ze starego skryptu ma odpowiednik w nowym teście (odczyt, dodanie, zmiana/usunięcie, symetria, anon)
- Nagłówek pliku jasno mówi „LOCAL/CI ONLY — nigdy na zdalnym projekcie"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Automat (CI) + dokumentacja

### Overview

Komenda trafia do CI w jobie `integration`, a wiedza o uruchomieniu i wzorcu — do `AGENTS.md` i do cookbooku planu testów. Po fazie każdy (i każdy agent) potrafi uruchomić test wyłącznie na podstawie dokumentacji.

### Changes Required:

#### 1. Krok pgTAP w CI

**File**: `.github/workflows/ci.yml`

**Intent**: Wpiąć `supabase test db` w istniejący job `integration`, w którym lokalny Supabase już działa — tak, by czerwona zmiana w politykach blokowała merge.

**Contract**: dokładnie jeden nowy krok `- run: supabase test db` w jobie `integration`, umieszczony **bezpośrednio po** `- run: supabase db reset` (obecnie linia 41) i **przed** krokiem „Get Supabase anon key". Krok nie potrzebuje `env`, `npm` ani klucza API.

#### 2. Dokumentacja dla agentów i ludzi

**File**: `AGENTS.md`

**Intent**: Dopisać komendę testu bazy do sekcji poleceń/testów, żeby przyszła sesja agenta wiedziała, że istnieje warstwa pgTAP i jak ją uruchomić.

**Contract**: wzmianka w częściach Commands/Testing: plik testu w `supabase/tests/database/`, uruchomienie `supabase test db` **z WSL** (Docker + CLI, nigdy `npx supabase`), wymaga wcześniej `supabase start` + `supabase db reset`; testy wstawiają fikcyjne konta → **tylko lokalnie/CI**.

#### 3. Cookbook i ledger w planie testów

**File**: `context/foundation/test-plan.md`

**Intent**: Uzupełnić §6.5 realnym wzorcem „jak dodać test izolacji bazy" (faza właśnie się wdrożyła) oraz odnotować wdrożenie Etapu 3 w ledgerze i bramkach.

**Contract**:
- `§6.5 Adding a database / RLS isolation test` — zastąpić `TBD` opisem: lokalizacja `supabase/tests/database/*.test.sql`, uruchomienie `supabase test db` z WSL, wymagany lokalny stack; wzorzec referencyjny `rls_isolation.test.sql`; zasady (`throws_ok '42501'` dla `INSERT`, `results_ne … returning 1` dla `UPDATE`/`DELETE`, fixtures przed przełączeniem roli, `set local timezone = 'Europe/Warsaw'`, `plan(N)`); „czego nie robić" (`lives_ok` jako dowód blokady, pliki nie-pgTAP w `supabase/tests/`).
- `§5 Quality Gates` — wiersz „izolacja danych (pgTAP)" zaktualizować, że bramka działa lokalnie + w CI.
- `§8 Freshness Ledger` — dopisać wpis wdrożenia Etapu 3 (data, zmiana `testing-database-isolation`, zakres: izolacja odczyt/zapis ×6 tabel + polityki + anon; CI: krok w jobie `integration`).
- **NIE** zmieniać statusu wiersza §3 — aktualizuje go orchestrator `/10x-test-plan`.

### Success Criteria:

#### Automated Verification:

- `git diff --stat` obejmuje wyłącznie `.github/workflows/ci.yml`, `AGENTS.md`, `context/foundation/test-plan.md` — bez zmian w `src/` i `supabase/migrations/`
- Plik workflow zawiera krok `supabase test db` w jobie `integration` bezpośrednio po `supabase db reset` (weryfikacja strukturą/odczytem YAML)
- Lokalnie (symulacja kroku CI z WSL): `supabase db reset` + `supabase test db` → `Result: PASS`

#### Manual Verification:

- Po wypchnięciu gałęzi i otwarciu PR job `integration` w GitHub Actions wykonuje nowy krok i jest zielony; job `ci` działa bez zmian
- Świeży czytelnik uruchamia test wyłącznie na podstawie `AGENTS.md` i §6.5 (bez zaglądania do tego planu)
- Wpis w ledgerze i bramkach zgadza się ze stanem faktycznym (komenda istnieje, test przechodzi)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

Nie dotyczy — Etap 3 nie zmienia czystej logiki ani kodu aplikacji; pokrycie jednostkowe i integracyjne pozostaje bez zmian.

### Integration Tests:

- Istniejące `npm run test:integration` (ryzyko #5, API) musi przechodzić bez zmian — Etap 3 nie dotyka tras ani handlerów.

### Manual Testing Steps:

1. Z WSL w katalogu projektu: `supabase start`, następnie `supabase db reset`, następnie `supabase test db` — oczekiwane `All tests successful` i `Result: PASS`.
2. Uruchom `supabase test db` drugi raz bez resetu — oczekiwane nadal `PASS` (dowód, że test nie zostawia śladów w bazie).
3. Kontrola negatywna: w Supabase Studio (`http://localhost:54323`) albo `psql` usuń jedną politykę, np. `drop policy employees_select_owner on public.employees;`, i uruchom `supabase test db` — oczekiwane `FAIL` z komunikatem wskazującym brakującą politykę i/lub wyciek odczytu. Następnie `supabase db reset` przywraca stan i test znów jest zielony.
4. Otwórz PR do `master`; w zakładce Actions sprawdź job `integration` — nowy krok `supabase test db` musi być zielony, a job `ci` bez zmian.

## Performance Considerations

Nie dotyczy. Test wstawia kilkanaście wierszy w jednej transakcji i wycofuje je; czas przebiegu jest rzędu sekund, a w CI dochodzi tylko jeden krok do istniejącego joba.

## Migration Notes

Brak migracji — schemat i polityki pozostają nietknięte. Jedyna zmiana po stronie plików bazy to **usunięcie** starego ręcznego skryptu z `supabase/tests/` i dodanie pliku w `supabase/tests/database/`. Nie wymaga to `supabase db push` ani zmian na projekcie zdalnym; `supabase db reset` odtwarza bazę lokalną z migracji i seeda.

## References

- Related research: `context/changes/testing-database-isolation/research.md`
- Plan testów (ryzyko #4, Etap 3, §6.5): `context/foundation/test-plan.md:30,39-47,57,70,92,134-136`
- Stary ręczny test (do usunięcia): `supabase/tests/rls_isolation.sql`
- Polityki RLS i helper: `supabase/migrations/20260912144543_domain_rls.sql:11-145`
- Schemat domeny: `supabase/migrations/20260912141307_domain_schema.sql:22-131`
- Triggery (draft / tydzień): `supabase/migrations/20260913203855_enforce_draft_assignment_writes.sql:10-35`, `supabase/migrations/20260913212151_enforce_availability_week_writes.sql:7-61`
- Miejsce w CI: `.github/workflows/ci.yml:28-48`
- Konwencje uruchamiania testów: `AGENTS.md` (WSL, nigdy `npx supabase`), `context/foundation/lessons.md`
- Odłożenie pgTAP z Etapu 2: `context/archive/2026-09-14-testing-server-side-rules/plan.md:81-84,322-323`
- Ręczny test jako decyzja historyczna: `context/archive/2026-09-12-domain-schema-rls/plan.md:135-166`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test pgTAP izolacji + usunięcie ręcznego skryptu

#### Automated

- [x] 1.1 Nowy `supabase/tests/database/rls_isolation.test.sql` istnieje, stary `supabase/tests/rls_isolation.sql` usunięty; `supabase/tests/` zawiera dokładnie jeden plik `.sql`
- [x] 1.2 Z WSL na czystej bazie (`supabase db reset`): `supabase test db` → `All tests successful` / `Result: PASS`
- [x] 1.3 Drugie `supabase test db` bez resetu → `Result: PASS` (dowód rollbacku/braku śladów)
- [x] 1.4 Liczba asercji zgadza się z `plan(N)` (brak rozjazdu plan vs wykonane)

#### Manual

- [x] 1.5 Kontrola negatywna: usunięcie jednej polityki lokalnie → test CZERWONY; po `supabase db reset` → ZIELONY
- [x] 1.6 Przegląd: scenariusze A–E starego skryptu mają odpowiedniki w nowym teście
- [x] 1.7 Nagłówek pliku zawiera jawne ostrzeżenie „LOCAL/CI ONLY — nigdy na zdalnym projekcie"

### Phase 2: Automat (CI) + dokumentacja

#### Automated

- [ ] 2.1 `git diff --stat` obejmuje wyłącznie `.github/workflows/ci.yml`, `AGENTS.md`, `context/foundation/test-plan.md`
- [ ] 2.2 Workflow zawiera krok `supabase test db` w jobie `integration` bezpośrednio po `supabase db reset`
- [ ] 2.3 Z WSL: `supabase db reset` + `supabase test db` (symulacja kroku CI) → `Result: PASS`

#### Manual

- [ ] 2.4 PR do `master`: job `integration` wykonuje nowy krok i jest zielony; job `ci` bez zmian
- [ ] 2.5 Świeży czytelnik uruchamia test wyłącznie na podstawie `AGENTS.md` i §6.5 test-planu
- [ ] 2.6 Wpis w §5/§8 test-planu zgadza się ze stanem faktycznym (komenda istnieje, test przechodzi)
