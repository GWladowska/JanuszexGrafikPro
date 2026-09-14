---
date: 2026-09-14T06:44:01Z
researcher: Kilo
git_commit: 8c82a06f6960e2748851df41340a4d49aacbea3a
branch: master
repository: GWladowska/JanuszexGrafikPro
topic: "Izolacja danych między właścicielami jako powtarzalny test (Etap 3, ryzyko #4)"
tags: [research, codebase, rls, pgtap, supabase, isolation, testing]
status: complete
last_updated: 2026-09-14
last_updated_by: Kilo
---

# Research: Izolacja danych między właścicielami jako powtarzalny test

**Date**: 2026-09-14T06:44:01Z
**Researcher**: Kilo
**Git Commit**: 8c82a06f6960e2748851df41340a4d49aacbea3a
**Branch**: master
**Repository**: GWladowska/JanuszexGrafikPro

## Research Question

Etap 3 z `context/foundation/test-plan.md` — „Izolacja danych jako powtarzalny test". Ryzyko **#4** (izolacja między właścicielami psuje się po zmianie polityk lub migracji — dziś sprawdzana tylko ręcznie). Typ testu: **database (pgTAP)**, uruchamiany jedną komendą, także w automacie.

Z §2 *Risk Response Guidance* #4 — co musi zostać udowodnione: konto drugiego właściciela nie odczyta i nie zapisze niczego z pierwszego lokalu, a test da się uruchomić jedną komendą (także w automacie). Założenia do podważenia: „zielone CI wystarcza, skoro nie sprawdza SQL" oraz „RLS działa, bo tak było przy tworzeniu schematu". Czego nie robić: jednorazowy skrypt „od święta" ani test tylko na odczyt bez próby zapisu.

## Summary

1. **Mechanizm pgTAP jest znany i dostępny, ale w tym repo nie istnieje.** `supabase test db` (CLI 2.117.0) uruchamia `pg_prove` w kontenerze na plikach zamontowanych rekurencyjnie z `supabase/tests/` (rozszerzenia `.sql` i `.pg`). CLI **sam włącza** rozszerzenie `pgtap` przed biegiem i **sam je wyłącza** po (stałe `ENABLE_PGTAP` / `DISABLE_PGTAP` w źródłach CLI). Każdy plik testowy jest wycofywany transakcją, więc fixtures wstawione do `auth.users` nie zostają w bazie.
2. **Istnieje kolizja, która wysadzi komendę.** `supabase test db` bierze **wszystkie** `*.sql` pod `supabase/tests/`, nie tylko `database/`. Obecny ręczny `supabase/tests/rls_isolation.sql` nie jest plikiem pgTAP (brak `plan()`/`finish()`), więc `pg_prove` zgłosi „No plan found in TAP output" i **cały przebieg padnie**. Etap 3 musi tę kwestię rozstrzygnąć (konwersja albo przeniesienie pliku).
3. **Powtarzalny test izolacji jest wykonalny na istniejącym schemacie bez nowych migracji.** Wzorzec z ręcznego skryptu (`set role authenticated` + `set request.jwt.claims`) działa też w pgTAP; trzeba tylko dobudować asercje, dodać brakujące tabele/operacje i zdjąć blokady triggerów przy fixture'ach.
4. **Luki obecnego ręcznego testu względem intencji #4:** brak jakiejkolwiek asercji dla `opening_hours` (polityka istnieje, nie jest sprawdzana), próba zapisu ograniczona do `INSERT` w `employees` (żadnego `UPDATE`/`DELETE`), brak kontroli pozytywnej („właściciel A *może* pisać do swojego"), brak asercji strukturalnych na istnienie polityk, oraz — co najważniejsze — uruchomienie ręczne, które nie jest jedną komendą i nie chodzi w automacie.
5. **Miejsce w CI jest gotowe:** w jobie `integration` po kroku `supabase db reset` (`.github/workflows/ci.yml:41`) wystarczy dodać `- run: supabase test db`. Bramki z `test-plan.md:92` („izolacja danych (pgTAP) — lokalnie + CI") zostaną wtedy domknięte.
6. **Ryzyko „local only" pozostaje realne:** test wstawia wiersze do `auth.users`, a CLI ma flagę `--linked` (na tę chwilę projekt zdalny jest podlinkowany: `supabase/.temp/project-ref` = `kppoavvnjxiixsyiytpd`). Test musi być jawnie udokumentowany jako lokalny/CI-owy i nigdy nie uruchamiany z `--linked`.

## Detailed Findings

### 1. Mechanika `supabase test db` (pgTAP) — zweryfikowana w dokumentacji i źródłach CLI

- CLI reference: *„Runs `pg_prove` in a container with unit test files volume mounted from `supabase/tests` directory. The test file can be suffixed by either `.sql` or `.pg` extension."* Przykładowa odpowiedź pokazuje pliki zagnieżdżone: `/tmp/supabase/tests/nested/order_test.pg`, `/tmp/supabase/tests/pet_test.sql` — czyli skan **rekurencyjny**, nie tylko `supabase/tests/database/`.
- Użycie: `supabase test db [path]... [flags]`; flagi `--db-url`, `--linked`, `--local`. Domyślnie bierze `supabase/tests`; można zawęzić ścieżką.
- *„Since each test is wrapped in its own transaction, it will be individually rolled back regardless of success or failure."* — fixtures nie przeciekają między plikami ani do bazy po przebiegu. Dzięki temu dozwolone jest wstawianie kont do `auth.users` (jak w obecnym skrypcie ręcznym).
- Pliki wykonywane **alfabetycznie**; dokumentacja pokazuje konwencję `000-setup-tests-hooks.sql`, jeśli potrzebny wspólny setup (supabase.com/docs/guides/local-development/testing/pgtap-extended).
- pgTAP jest włączany przez CLI, nie przez projekt: źródła `github.com/supabase/cli/internal/db/test` definiują `ENABLE_PGTAP = "create extension if not exists pgtap with schema extensions"` oraz `DISABLE_PGTAP = "drop extension if exists pgtap"`. Dlatego w dokumentacji Supabase pojawia się `NOTICE: extension "pgtap" already exists, skipping`, gdy plik testowy i tak robi `create extension`. Wniosek: plik **może** zawierać `create extension ... with schema extensions` (jest nieszkodliwy i samodokumentujący), ale nie musi.
- Dokumentowany wzorzec RLS w testach (oficjalne „Testing Overview"):
  ```sql
  begin;
  create extension if not exists pgtap with schema extensions;
  select plan(4);
  -- fixtures jako rola migracyjna (postgres) ...
  set local role authenticated;
  set local request.jwt.claim.sub = '<uuid>';
  select results_eq('select count(*) from todos', ARRAY[2::bigint], '...');
  select lives_ok($$ insert into todos ... $$, '...');
  select * from finish();
  rollback;
  ```
  W repo istnieje już analogiczny, sprawdzony mechanizm przełączania kontekstu: `supabase/tests/rls_isolation.sql:93-94` (`set role authenticated; set request.jwt.claims = '{"sub":"…"}';`).
- Uwaga kompatybilności: CLI potrafi rozwiązać funkcje pgTAP, gdy w trakcie asercji rola to `authenticated` (oficjalne przykłady RLS tak działają). Warto to potwierdzić w fazie implementacji — jeśli `plan/finish/results_eq` nie rozwiążą się po `set local role authenticated`, rozwiązaniem jest kwalifikowanie schematu (`extensions.results_eq(...)`) lub wracanie do roli `postgres` na czas asercji po wcześniejszym wykonaniu DML w bloku `lives_ok`.

### 2. Kolizja z istniejącym ręcznym skryptem (kluczowy blocker)

- `supabase/tests/` zawiera dokładnie jeden plik: `supabase/tests/rls_isolation.sql` (216 linii). Katalog `supabase/tests/database/` **nie istnieje**.
- Skrypt jest **ręczny**, nie pgTAP: brak `plan()`/`finish()`/`no_plan` (potwierdzone — zero wystąpień w repo), wyniki zbiera do `pg_temp.rls_results` (`rls_isolation.sql:34-46`), na końcu wypisuje tabelę werdyktów (`:208-216`). Nagłówek dokumentuje uruchomienie przez Studio SQL Editor, `psql`, albo `wsl -d Ubuntu -- docker exec -i supabase_db_10x-astro-starter psql ...` (`:7-12`); w oryginale pojawia się też `npx supabase` (`:7`), co jest sprzeczne z regułą repo (`lessons.md` — „Supabase CLI zawsze jako `supabase` z WSL, nigdy `npx supabase`").
- Ponieważ CLI skanuje **cały** `supabase/tests/` rekurencyjnie po `.sql`/`.pg`, ten plik zostanie podany do `pg_prove` i zakończy się błędem parsowania TAP („No plan found in TAP output"), przewracając przebieg. Potwierdzone w issue Supabase CLI (#4850, #1178) — plik bez TAP daje `Result: FAIL` i `error running container: exit 1`.
- Konsekwencja dla planu (do rozstrzygnięcia, patrz Open Questions): albo **konwersja** skryptu do pgTAP i usunięcie wersji ręcznej, albo **przeniesienie** go poza `supabase/tests/` (np. `supabase/manual/` lub `scripts/`). Rekomendacja researchu: konwersja (jeden artefakt prawdy, brak dryfu duplikatów — zbieżne z lekcją „Ekstrahuj zduplikowane helpery zanim się rozjadą"), z zachowaniem wiedzy o scenariuszach A–E w treści testu.

### 3. Mapa schematu i polityk RLS (oracle + powierzchnia testu)

Wszystkie 6 tabel domenowych ma włączone RLS i komplet polityk per operacja — `[20260912144543_domain_rls.sql:32-37](https://github.com/GWladowska/JanuszexGrafikPro/blob/8c82a06f6960e2748851df41340a4d49aacbea3a/supabase/migrations/20260912144543_domain_rls.sql#L32-L37)`.

| Tabela | Klucz biznesu | Polityki (select/insert/update/delete) | Wyrażenie |
|---|---|---|---|
| `businesses` | `owner_id` → `auth.users(id)` | `businesses_*_owner` | `owner_id = auth.uid()` |
| `opening_hours` | `business_id` (FK → businesses) | `opening_hours_*_owner` | `public.is_business_owner(business_id)` |
| `employees` | `business_id` (FK) | `employees_*_owner` | `public.is_business_owner(business_id)` |
| `availabilities` | `business_id` (tylko przez złożony FK `(business_id, employee_id)`) | `availabilities_*_owner` | `public.is_business_owner(business_id)` |
| `schedules` | `business_id` (FK) | `schedules_*_owner` | `public.is_business_owner(business_id)` |
| `assignments` | `business_id` (złożone FK do schedules i employees) | `assignments_*_owner` | `public.is_business_owner(business_id)` |

- Helper: `[20260912144543_domain_rls.sql:11-29](https://github.com/GWladowska/JanuszexGrafikPro/blob/8c82a06f6960e2748851df41340a4d49aacbea3a/supabase/migrations/20260912144543_domain_rls.sql#L11-L29)` — `stable security definer set search_path = ''`, `revoke all from public` + `grant execute to authenticated, anon`. Anon → `auth.uid()` = null → `false` → 0 wierszy (nie błąd).
- Jeden biznes na właściciela: `unique (owner_id)` (`20260912141307_domain_schema.sql:28`). Dzieci osiągają właściciela **tylko** przez `businesses.owner_id` — żadna tabela potomna nie ma FK do `auth.users`.
- Migracje **nie zawierają GRANT-ów** na tabele — uprawnienia `anon`/`authenticated` pochodzą z domyślnych ustawień platformy Supabase, nie z plików migracji. Warto o tym pamiętać, gdy test sprawdza brak dostępu.

### 4. Triggery i ograniczenia, które kształtują fixtures testu

Fixture musi przejść przez następujące bramki (wszystkie znalezione w migracjach):

| Ograniczenie / trigger | Tabela | Co wymusza | Plik |
|---|---|---|---|
| `unique (owner_id)` | businesses | dokładnie jeden biznes na konto | `20260912141307_domain_schema.sql:28` |
| CHECK ISO Monday | schedules | `week_start` musi być poniedziałkiem | `20260912141307_domain_schema.sql:104` |
| `trg_assignments_enforce_draft` (BEFORE I/U/D) | assignments | zapis tylko do grafiku o statusie `draft`; errcode `23000` | `20260913203855_enforce_draft_assignment_writes.sql:10-35` |
| `trg_availabilities_enforce_week` (BEFORE I/U/D) | availabilities | `work_date` ≥ bieżący tydzień **liczony w Europe/Warsaw**; brak `saved` grafiku na bieżący tydzień | `20260913212151_enforce_availability_week_writes.sql:7-61` |
| `excl_availabilities_no_overlap` | availabilities | brak nakładających się dostępności per pracownik/dzień | `20260913040000_no_overlap_availabilities.sql:14-19` |
| `uq_employees_business_identity` | employees | unikalne nazwisko/e-mail po normalizacji w obrębie biznesu | `20260913034936_no_duplicate_employees.sql:8-13` |
| `closes_at > opens_at`, `end_time > start_time`, `weekday between 1 and 7` | opening_hours / availabilities / assignments | poprawne zakresy czasowe | `20260912141307_domain_schema.sql:44,79,124` |

- **Strefa czasu:** trigger dostępności liczy tydzień jako `date_trunc('week', (now() at time zone 'Europe/Warsaw')::date)::date` (`20260913212151_...sql:12`). `seed.sql:24` ustawia `set timezone = 'Europe/Warsaw';` właśnie po to, by uniknąć rozjazdu w niedzielę 22:00–24:00 UTC (udokumentowana lekcja w `lessons.md`, wpis „Strefę reguły domenowej ustaw jawnie w sesji seeda"). Test pgTAP powinien zrobić to samo (`set local timezone = 'Europe/Warsaw';`) albo liczyć daty wyrażeniem triggera.
- **Sprzątanie:** kasowanie wiersza `assignments` z zapisanego grafiku jest blokowane przez trigger, a kasowanie dostępności z minionego tygodnia — przez trigger tygodnia. Oba triggery mają ścieżkę obejścia przy kaskadzie (`..._enforce_draft...sql:21`, `..._enforce_week...sql:20-24`). W pgTAP problem znika, bo cały plik jest wycofywany transakcją — fixtures nie wymagają ręcznego sprzątania.
- Rekomendacja researchu: fixture budować na **świeżych, stałych UUID** (własnych dla testu, nie z seeda) ze statusem `draft` dla grafiku, datami w bieżącym/`+7` tygodniu i własnym `opening_hours` dla obu biznesów.

### 5. Co pokrywa obecny ręczny skrypt, a czego brakuje

Scenariusze w `[supabase/tests/rls_isolation.sql](https://github.com/GWladowska/JanuszexGrafikPro/blob/8c82a06f6960e2748851df41340a4d49aacbea3a/supabase/tests/rls_isolation.sql)`:

- **A** (`:89-101`) — odczyt `businesses` jako A: dokładnie 1 wiersz, bez rekurencji RLS.
- **B** (`:103-115`) — A próbuje `INSERT` pracownika do biznesu B → `ODRZUCONY`.
- **C** (`:117-139`) — symetria: B widzi tylko B, B nie wstawi do A.
- **D** (`:141-167`) — A widzi wyłącznie swoje wiersze w `employees`, `availabilities`, `schedules`, `assignments` (po 1 z 2).
- **E** (`:169-199`) — `anon` → 0 wierszy w `businesses`, `employees`, `availabilities`, `schedules`, `assignments`.

Luki względem ryzyka #4 i intencji change („nie robić testu tylko na odczyt bez próby zapisu"):

| Luka | Dlaczego ma znaczenie |
|---|---|
| Brak `opening_hours` w scenariuszach B/D/E | Szósta tabela z polityką RLS jest całkowicie niepokryta |
| Zapis sprawdzany tylko `INSERT` w `employees` | Brak dowodu dla `UPDATE`/`DELETE` (A podmieniający/kasujący cudzy wiersz) i dla pozostałych 4 tabel potomnych |
| Brak kontroli pozytywnej | Test mógłby „przejść" także wtedy, gdy RLS blokuje *wszystko* — `count(*) = 1` nie odróżnia „widzę swoje" od „nie widzę nic, gdybym miał 2" bez kontroli „A widzi/pisze swoje" |
| Brak asercji strukturalnych | Nie łapie migracji, która usuwa politykę, ale zostawia RLS włączone (część scenariuszy behawioralnych może wtedy nadal przechodzić przez inny kanał) |
| Werdykt przez `pg_temp.rls_results` + ręczne czytanie kolumny `ok` | Orzekanie jest ręczne; `pg_prove` nie istnieje → brak automatu |
| Uruchomienie ręczne (Studio/psql/docker exec) | Nie jedna komenda; sprzeczne z celem Etapu 3 i z §5 quality gates |
| Nagłówek z `npx supabase` (`:7`) | Sprzeczny z regułą środowiskową repo (WSL, nigdy `npx`) |

### 6. Infrastruktura testowa i miejsce w CI

- Konwencje integration (do ponownego użycia myślowego, nie dosłownego): dwóch właścicieli = dwa niezależne konta (`setupOwnerWorld` w `test/integration/helpers.ts:287-311`), przełączanie kontekstu przez `{ user: { id: b.userId }, jar: b.jar }` przekazywane do `callHandler`; atak B na zasoby A kończy się 404 (`test/integration/ownership.test.ts:19-45`); klucz musi być **anon/publishable** (service_role omija RLS). Te testy pokrywają ryzyko #5 na poziomie API — pgTAP pokrywa warstwę niższą (polityki SQL), więc nie duplikuje, tylko domyka.
- Konfiguracje: `vitest.config.ts` (unit, `src/**/*.test.ts`) i `vitest.integration.config.ts` (integration, `test/integration/**/*.test.ts`, alias `astro:env/server` → stub). **Żadna** nie dotyczy pgTAP i tak ma zostać — `supabase test db` to osobny, równoległy bieg.
- `package.json`: brak skryptu dla `supabase test db`; istnieją `test`, `test:watch`, `test:integration`, `db:types` (`package.json:5-18`).
- Konsola: `[.github/workflows/ci.yml:28-48](https://github.com/GWladowska/JanuszexGrafikPro/blob/8c82a06f6960e2748851df41340a4d49aacbea3a/.github/workflows/ci.yml#L28-L48)` — job `integration` na `ubuntu-latest`, kroki: checkout → node 22 → `npm ci` → `supabase/setup-cli@v1` (wersja `latest`) → `supabase start` (`:40`) → `supabase db reset` (`:41`) → pobranie anon key (`:42-44`) → `npm run test:integration` (`:45`). **Naturalne miejsce na nowy krok to wiersz 42, tj. bezpośrednio po `supabase db reset`**, przed pobraniem klucza; pgTAP nie potrzebuje anon key ani `npm`. CI ma Docker, więc kontener `pg_prove` się uruchomi.
- Ryzyko: `version: latest` w `setup-cli` (`:39`) — zachowanie `supabase test db` może się zmienić między runami. Warto rozważyć przypięcie wersji przy okazji tego etapu (decyzja dla planu, nie wymóg).

### 7. Uruchamianie lokalnie — „jedna komenda"

- Reguła środowiskowa repo (`AGENTS.md`, `lessons.md`): **Docker i CLI Supabase wyłącznie z WSL** (`cd /mnt/c/Repositories/Own/JanuszexGrafikPro`), zwykłe `supabase`, **nigdy `npx supabase`**. `npm run …` (Vitest) z PowerShell.
- Jedna komenda lokalnie: `supabase test db` (z WSL, po `supabase start` + `supabase db reset`). W automacie: krok `- run: supabase test db` w jobie `integration`.
- **Uwaga o skrypcie npm:** dodanie `"test:db": "supabase test db"` do `package.json` będzie mylące/kruche — z PowerShell rozwiązuje się do binarki Windows (`node_modules/.bin/supabase`), a ta bez Dockera/na Windows nie zadziała; `npx` jest zakazane lekcją. Jeżeli etap ma dać „jedną komendę" także niedeveloperowi, jedyny spójny wariant to wrapper `wsl -d Ubuntu -- bash -lc "cd /mnt/c/Repositories/… && supabase test db"`. To decyzja do rozstrzygnięcia w planie (patrz Open Questions).
- **Bezpieczeństwo:** plik wstawia wiersze do `auth.users` → **LOCAL/CI ONLY**. Nie wolno uruchamiać z `--linked` ani na projekcie zdalnym. Projekt zdalny jest lokalnie podlinkowany (`supabase/.temp/project-ref` = `kppoavvnjxiixsyiytpd`), więc pokusa `--linked` istnieje. Zalecenie: jawny komentarz nagłówkowy + (opcjonalnie) asercja `current_setting('is_superuser')` / obecność lokalnego stacku, plus wpis w `test-plan.md` §6.5. Ostateczny guard do decyzji w planie.

### 8. Oracle (skąd wiadomo, że asercje są słuszne)

- `[prd.md:140-145](https://github.com/GWladowska/JanuszexGrafikPro/blob/8c82a06f6960e2748851df41340a4d49aacbea3a/context/foundation/prd.md#L140-L145)` — Access Control: „Izolacja danych: każdy właściciel widzi i zarządza wyłącznie danymi swojego biznesu. Jeden biznes = dokładnie jeden właściciel"; „Niezalogowany użytkownik … dane dostępne tylko po zalogowaniu".
- `prd.md:28` i `:152` — MVP zakłada jeden biznes na konto, brak współdzielenia (uzasadnia `unique (owner_id)` i brak ról współdzielonych).
- `prd.md:22` — skalowalność to „kwestia izolacji danych między biznesami" (ryzyko #4 jest wprost nazwane jako oś produktu).
- `context/foundation/test-plan.md:30` — wiersz ryzyka #4: dowód „przyszłej zmiany polityk lub migracji", źródło „`archive/2026-09-12-domain-schema-rls` — CI nie sprawdza SQL, a test jest ręczny".
- Asercje mają być pisane ręcznie jako literały (konwencja repo: „oczekiwania pisz ręcznie jako literały — nigdy z produkcyjnych funkcji", `test-plan.md:128`), a nie wyliczane z polityk produkcyjnych.

## Code References

- `supabase/tests/rls_isolation.sql:1-216` — ręczny test izolacji; wzorzec dwóch właścicieli i przełączania roli; do konwersji/przeniesienia.
- `supabase/tests/rls_isolation.sql:53-57` — wstawianie dwóch kont do `auth.users` ze stałymi UUID; `:59-87` — fixture biznesów i tabel potomnych; `:93-94,121-122,146-147` — `set role authenticated` + `set request.jwt.claims`; `:169-199` — scenariusz anon.
- `supabase/migrations/20260912144543_domain_rls.sql:11-29` — helper `is_business_owner` (security definer, pusty `search_path`, granty).
- `supabase/migrations/20260912144543_domain_rls.sql:32-37` — RLS włączone na wszystkich 6 tabelach; `:40-145` — pełny zestaw polityk per operacja.
- `supabase/migrations/20260912141307_domain_schema.sql:22-29,38-48,56-64,72-84,97-107,116-131` — definicje tabel i kluczy; `:24` FK `owner_id` → `auth.users`; `:28` `unique (owner_id)`; `:104` CHECK ISO Monday.
- `supabase/migrations/20260913203855_enforce_draft_assignment_writes.sql:10-35` — trigger draft-only na `assignments`.
- `supabase/migrations/20260913212151_enforce_availability_week_writes.sql:7-61` — trigger tygodnia (Europe/Warsaw) na `availabilities`.
- `supabase/migrations/20260913040000_no_overlap_availabilities.sql:10-19` — `btree_gist` + exclusion na nakładki.
- `supabase/migrations/20260913034936_no_duplicate_employees.sql:8-13` — unikalność pracownika w biznesie.
- `supabase/seed.sql:24` — `set timezone = 'Europe/Warsaw';`; `:49,91` — stałe UUID seeda (do unikania kolizji).
- `supabase/config.toml:27-36` — port DB 54322 i `major_version = 17`; brak jakiejkolwiek konfiguracji pgTAP (CLI nie wymaga).
- `.github/workflows/ci.yml:28-48` — job `integration`; `:40` `supabase start`, `:41` `supabase db reset`, `:45` `npm run test:integration`.
- `package.json:5-18` — skrypty (brak `test:db`); `:57` — `supabase ^2.117.0`.
- `test/integration/helpers.ts:51-81,100-126,287-311` — dwa konta, `callHandler`, `setupOwnerWorld` (kontekst dla ryzyka #5, nie do bezpośredniego użycia w SQL).
- `context/foundation/test-plan.md:30,39-47,57,70,92,134-136` — ryzyko #4, guidance, wiersz Etapu 3, stack i bramki, stub §6.5.
- `context/archive/2026-09-12-domain-schema-rls/plan.md:135-166,268,340` — decyzja o ręcznym teście i świadomym wykluczeniu pgTAP.
- `context/archive/2026-09-14-testing-server-side-rules/plan.md:81-84,322-323` — jawne odłożenie pgTAP i przypadku triggera do Etapu 3.
- `context/foundation/lessons.md` — wpisy: Supabase CLI tylko z WSL, strefa w sesji seeda, lekcja o duplikatach helperów.
- `supabase/.temp/project-ref` — `kppoavvnjxiixsyiytpd` (projekt zdalny podlinkowany → ryzyko `--linked`).

### Permalinki GitHub (commit `8c82a06`)

- `supabase/tests/rls_isolation.sql` — https://github.com/GWladowska/JanuszexGrafikPro/blob/8c82a06f6960e2748851df41340a4d49aacbea3a/supabase/tests/rls_isolation.sql
- `supabase/migrations/20260912144543_domain_rls.sql` — https://github.com/GWladowska/JanuszexGrafikPro/blob/8c82a06f6960e2748851df41340a4d49aacbea3a/supabase/migrations/20260912144543_domain_rls.sql
- `supabase/migrations/20260912141307_domain_schema.sql` — https://github.com/GWladowska/JanuszexGrafikPro/blob/8c82a06f6960e2748851df41340a4d49aacbea3a/supabase/migrations/20260912141307_domain_schema.sql
- `.github/workflows/ci.yml` — https://github.com/GWladowska/JanuszexGrafikPro/blob/8c82a06f6960e2748851df41340a4d49aacbea3a/.github/workflows/ci.yml
- `context/foundation/test-plan.md` — https://github.com/GWladowska/JanuszexGrafikPro/blob/8c82a06f6960e2748851df41340a4d49aacbea3a/context/foundation/test-plan.md

## Architecture Insights

- **RLS jest jedyną granicą izolacji**, bo klucz API jest publiczny (anon/publishable). Filtr `business_id` w kodzie aplikacji nie jest barierą — barierą są polityki SQL. To uzasadnia test na poziomie bazy (pgTAP), a nie tylko API (Vitest), i pokrywa dokładnie ten scenariusz, którego testy integracyjne nie widzą: *„RLS działa, bo tak było przy tworzeniu schematu"* podważa się migracją/usunięciem polityki, którą wyłapie dopiero asercja strukturalna lub behawioralna w `supabase test db`.
- **Podział warstw testów jest celowy i nie nakłada się:** unit (Vitest, czysta logika) → integration (Vitest, handlery + realny Supabase, ryzyko #5) → database (pgTAP, polityki SQL, ryzyko #4). Etap 3 ma domknąć trzecią warstwę i wpiąć ją w CI.
- **Transakcyjny rollback pg_prove jest kluczową właściwością projektową:** znosi potrzebę idempotencji i sprzątania (inaczej niż ręczny skrypt, który musiał używać `on conflict do nothing` i temp-tabeli), a jednocześnie pozwala wstawiać konta do `auth.users` bez trwałego zanieczyszczania bazy.
- **Trigger domenowy jest częścią kontraktu izolacji, nie tłem:** fixture musi respektować draft-only i tygodniową bramkę strefową, inaczej test pada z powodu `23000`, a nie z powodu regresji RLS. To źródło fałszywych czerwonych i zarazem powód, by strefę ustawić jawnie (`Europe/Warsaw`) jak w seedzie.

## Historical Context (from prior changes)

- `context/archive/2026-09-12-domain-schema-rls/plan.md:135-166` — świadoma decyzja: „weryfikacja RLS jest opisana jako powtarzalne zapytania SQL uruchamiane ręcznie", „bez runnera testów (pgTAP jest celowo wykluczony)".
- `context/archive/2026-09-12-domain-schema-rls/reviews/plan-review.md:26-34` — finding F1: po archiwizacji zmiany przyszłe modyfikacje polityk nie mają powtarzalnej regresji; fix = commit ręcznego SQL-a, „no test runner required".
- `context/archive/2026-09-12-domain-schema-rls/plan-brief.md:60-61` — ryzyka wprost: „Brak runnera testów: izolację RLS weryfikujemy ręcznymi zapytaniami SQL, więc regresję łatwo przeoczyć", „Zielone CI nie sprawdza SQL migracji".
- `context/archive/2026-09-14-testing-server-side-rules/plan.md:81-84` — „Testów izolacji RLS (pgTAP) — Faza 3 planu testów; tu izolacja jest dowodzona przez odpowiedzi API (404/401) na realnej bazie."
- `context/archive/2026-09-14-testing-server-side-rules/plan.md:322-323` — przypadek „bieżący tydzień z zapisanym grafikiem" jest nieosiągalny przez API → „dowodzi go trigger → Faza 3 (pgTAP)".
- `context/archive/2026-09-14-testing-server-side-rules/research.md:242-246` — „Filtr `business_id` w kodzie to nie granica bezpieczeństwa — granicą jest RLS; test izolacji ma sens tylko przeciw realnej bazie."
- `context/archive/2026-09-14-testing-server-side-rules/plan-brief.md:72` — „Klucz w CI musi być anon/publishable — użycie `service_role` pomija RLS i testy izolacji kłamią."
- `context/foundation/lessons.md` — „Archiwizuj zmianę test-planu dopiero po `/10x-test-plan` i `/10x-new` następnej fazy" (kolejność życia rolloutem wciąż obowiązuje).

## Related Research

- `context/archive/2026-09-14-testing-server-side-rules/research.md` — poprzedni etap (ryzyko #5, `is_business_owner`, dwaj właściciele, odłożenie pgTAP).
- `context/archive/2026-09-14-testing-core-logic/research.md` — etap 1 (czysta logika, brak warstwy DB).
- `context/archive/2026-09-12-domain-schema-rls/plan.md` — powstanie schematu, polityk i ręcznego testu.

## Open Questions

1. **Los `supabase/tests/rls_isolation.sql`** — konwersja do pgTAP i usunięcie wersji ręcznej, czy przeniesienie poza `supabase/tests/` (żeby `supabase test db` nie skanował)? Bez rozstrzygnięcia komenda w CI padnie. Rekomendacja researchu: konwersja (jeden artefakt, brak dryfu).
2. **„Jedna komenda" lokalnie na Windows** — czy wystarczy udokumentowane `supabase test db` z WSL, czy dodać skrypt npm z wrapperem `wsl -d Ubuntu -- bash -lc "cd /mnt/c/... && supabase test db"`? Sam `"test:db": "supabase test db"` w `package.json` jest kruchy (binarka Windows bez Dockera, `npx` zakazane).
3. **Zakres prób zapisu** — czy pokryć `INSERT` + `UPDATE` + `DELETE` na wszystkich 6 tabelach, czy „INSERT z cudzym `business_id`" + „UPDATE/DELETE zwraca 0 wierszy" na tabelach potomnych + `businesses`? Ile asercji to sensowny koszt × sygnał?
4. **Asercje strukturalne** — czy dodać `policies_are` / `has_policy` dla każdej z 6 tabel (łapie usunięcie polityki mimo włączonego RLS), czy polegać na asercjach behawioralnych? Rekomendacja: oba, bo podważają wprost założenie „RLS działa, bo tak było przy tworzeniu schematu".
5. **Kontrola pozytywna** — potwierdzenie, że właściciel *może* odczytać i zapisać własne dane (bez tego test izolacji może przejść przy całkowicie zablokowanym dostępie).
6. **Guard „local only"** — czy wystarczy komentarz nagłówkowy + dokumentacja, czy dodać wykrywalną asercję (np. na obecność lokalnego stacku), skoro CLI ma flagę `--linked`, a projekt zdalny jest podlinkowany.
7. **Rozwiązywanie funkcji pgTAP pod `role = authenticated`** — potwierdzić w implementacji, czy `plan/finish/results_eq`/`throws_ok` są widoczne po `set local role authenticated`, czy trzeba kwalifikacji schematu `extensions.…`.
8. **Jeden plik czy plik + shared setup `000-…`** — czy współdzielony fixture dwóch światów trzymać w jednym pliku testowym (prostsze, rollback per plik), czy wydzielić setup alfabetycznie pierwszy (skalowalne na kolejne etapy).
9. **Przypięcie wersji CLI w CI** — `supabase/setup-cli@v1` z `version: latest` (`ci.yml:39`) jest niedeterministyczne; czy przy okazji Etapu 3 przypiąć wersję.
