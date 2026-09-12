# Schemat domeny z migracjami i RLS — Plan implementacji

## Overview

Fundament danych dla JanuszexGrafikPro (roadmap F‑01): pełny schemat domeny — biznes, godziny otwarcia, pracownicy, dostępności, grafiki i przypisania zmian — wraz z migracjami, regułami RLS izolującymi dane per właściciel, generowanymi typami, danymi startowymi do pracy lokalnej oraz wdrożeniem migracji na projekt Supabase.

Plan dostarcza **wyłącznie warstwę danych**. Logika domenowa (generowanie draftu, liczenie dziur, ostrzeżenia o kolizjach) należy do kolejnych kroków roadmapy (S‑03…S‑06) i celowo jest tutaj nieobecna.

## Current State Analysis

- `supabase/migrations/` **nie istnieje** — repo nie ma ani jednej migracji; `supabase/config.toml` ma włączone migracje (`[db.migrations] enabled = true`) i seed (`sql_paths = ["./seed.sql"]`), ale plik `supabase/seed.sql` również nie istnieje.
- Baza docelowa to Postgres 17 (`supabase/config.toml:36`).
- Logowanie działa na kluczu publicznym (publishable/anon) przez `@supabase/ssr` (`src/lib/supabase.ts:5`). Skoro klucz jest publiczny, **izolacja danych opiera się wyłącznie na RLS**, a nie na ukrywaniu klucza.
- Uwierzytelnianie jest gotowe: strony `/auth/*`, API `src/pages/api/auth/*.ts`, middleware ustawiający `context.locals.user` i chroniący `PROTECTED_ROUTES` (`src/middleware.ts:4`). Konta trafiają do `auth.users`.
- Brak generowanych typów bazy, brak `src/types.ts`, brak `src/lib/services/`, brak jakiegokolwiek runnera testów. Brama jakości w CI to `npx astro sync` + `npm run lint` + `npm run build`.
- Supabase CLI dostępne przez `npx supabase` (2.98.2). Rozruch bazy lokalnej wymaga Dockera (`npx supabase start`). **Projekt zdalny nie jest podłączony** (brak `supabase/.temp/project-ref`), więc wysłanie migracji wymaga ręcznego `supabase link`.
- Zgodnie z `context/foundation/infrastructure.md` (Operational Story / Risk Register) zmiany schematu są **ręcznie zatwierdzane przez człowieka** i nie ma automatycznych migracji w MVP.

### Key Discoveries

- `src/lib/supabase.ts:6` zwraca `null`, gdy brak `SUPABASE_URL`/`SUPABASE_KEY` — każdy przyszły kod danych musi to obsługiwać (wzorzec z `src/pages/api/auth/signup.ts:10`).
- Reguły ESLint używają `includeIgnoreFile('.gitignore')` (`eslint.config.js:12,72`), a pre‑commit puszcza `eslint --fix` na plikach `.ts` (`package.json:60`). Wygenerowany plik typów musi być jawnie wyłączony z lintowania, inaczej będzie się formatował przy każdym commicie.
- `supabase/.gitignore` ignoruje tylko `.branches` i `.temp` — katalog `migrations/` i `seed.sql` będą śledzone przez git (dobrze).
- Kontrakt `## Progress` (`references/progress-format.md`) wymaga dokładnie jednej sekcji `## Progress`, nagłówków `### Phase N:` zgodnych z `## Phase N:` i kroków w formacie `- [ ] N.M <tytuł>`.

## Desired End State

Po ukończeniu planu:

- Istnieją dwie migracje w `supabase/migrations/`: schemat domeny oraz reguły RLS. `npx supabase db reset` stosuje je na czysto i odtwarza całą bazę.
- Schemat zawiera tabele `businesses`, `opening_hours`, `employees`, `availabilities`, `schedules`, `assignments` oraz typ `schedule_status`, z ograniczeniami integralności i spójnym `business_id` wymuszanym kluczami złożonymi.
- RLS jest włączone na wszystkich tabelach; właściciel widzi i modyfikuje wyłącznie dane swojego biznesu, a wstawienie wiersza z cudzym `business_id` jest odrzucane przez bazę.
- `src/lib/database.types.ts` jest wygenerowany i zacommitowany; `npm run db:types` odświeża go jednym poleceniem.
- `supabase/seed.sql` tworzy lokalnie gotowe konto właściciela oraz przykładową kawiarnię (godziny otwarcia, 5 pracowników, dostępności, grafik szkic), dzięki czemu kolejne kroki można klikać od razu.
- Migracje są zastosowane na zdalnym projekcie Supabase.

Weryfikacja końcowa: `npx supabase db reset` przechodzi, logowanie kontem z seeda działa lokalnie, zapytania SQL na dwóch kontach potwierdzają izolację, a `npx supabase migration list --linked` pokazuje zgodność wersji lokalnej i zdalnej.

## What We're NOT Doing

- **Logika domenowa** — generowanie draftu, liczenie pokrycia/dziur, oznaczanie kolizji z niedostępnością (to S‑04 i S‑05).
- **Walidacja kolizji w bazie** — świadoma decyzja: nakładanie się zmian i kolizje z dostępnością są sygnalizowane w aplikacji, nie blokowane w bazie.
- **Warstwa usług i typy domenowe** — brak `src/lib/services/`, brak ręcznych typów w `src/types.ts` (poza generowanymi).
- **Historia wersji grafików** — jeden grafik na biznes i tydzień; brak kopii przy ponownym zapisie.
- **UI** — żadnych ekranów, formularzy ani komponentów.
- **Automatyczne migracje w CI** — wdrożenie na zdalną bazę pozostaje ręczne; seed nigdy nie idzie na produkcję.
- **pgTAP / runner testów bazy** — weryfikacja RLS jest opisana jako powtarzalne zapytania SQL uruchamiane ręcznie.

## Implementation Approach

Pracę dzielimy na cztery fazy, każda dająca sprawdzalny efekt: (1) migracja schematu, (2) migracja RLS, (3) typy + seed + narzędzia, (4) ręczne wdrożenie na zdalny projekt. Schemat powstaje w oparciu o łańcuch relacyjny Właściciel → Biznes → Pracownik → Dostępność oraz Grafik → Przypisania, a `business_id` jest dodatkowo niesiony na każdej tabeli jako skrót do właściciela, spięty **kluczami obcymi złożonymi**, żeby baza sama pilnowała spójności — bez triggerów i bez polegania na kodzie aplikacji.

Model czasu: czas lokalny (Polska), bez stref — kolumny typu `time` plus `date`. Dzień tygodnia jako ISO 1–7 (1 = poniedziałek). Godziny otwarcia: jeden ciągły przedział na dzień; brak wiersza = dzień zamknięty.

## Critical Implementation Details

- **Funkcja RLS musi być `security definer` z `set search_path = ''`.** Polityki tabel potomnych sprawdzają przynależność przez funkcję odczytującą `public.businesses`. Bez `security definer` polityka na `businesses` rekrutowałaby się przy ocenie polityk potomnych; `security definer` (właścicielem jest rola migracyjna, która omija RLS jako właściciel tabeli) przerywa tę rekurencję. Wszystkie obiekty wewnątrz funkcji kwalifikujemy schematem (`public.businesses`, `auth.uid()`), a `search_path` ustawiamy na pusty.
- **Spójność `business_id` przez klucz złożony.** `employees` i `schedules` dostają `unique (business_id, id)`; `availabilities` wskazuje `(business_id, employee_id) → employees(business_id, id)`, a `assignments` odpowiednio na `schedules(business_id, id)` i `employees(business_id, id)`. Dzięki temu wiersz z `business_id` niezgodnym z rodzicem jest odrzucany na poziomie bazy. Bez tego `business_id` mógłby „udawać" cudzy biznes w polityce RLS.
- **`auth.users` jest tylko celem klucza obcego.** Do izolacji używamy `auth.uid()`; nie odczytujemy `auth.users` w politykach ani przez API. Nie tworzymy tabeli właściciela — jedno źródło prawdy.
- **Seed tylko lokalnie.** `seed.sql` wstawia do `auth.users` i `auth.identities` (hasło przez `crypt(..., gen_salt('bf'))`, `email_confirmed_at = now()`, puste łańcuchy — nie NULL — w kolumnach tokenów, oraz towarzyszący wiersz `auth.identities` z `provider = 'email'` i `provider_id = id::text`). Ten zapis wolno uruchamiać wyłącznie na lokalnym stacku (`db reset`); na zdalnym projekcie tworzy nieodwracalnie zepsuty stan. Plik musi mieć wyraźny komentarz ostrzegawczy na górze.
- **Wygenerowany plik typów wyłączony z lintowania/prettiera.** `src/lib/database.types.ts` dopisujemy do ignorowanych w `eslint.config.js` oraz do nowego `.prettierignore`, żeby generator nie walczył z pre‑commit hookiem.
- **Kolejność w `assignments` nie tworzy ograniczenia nakładania się zmian.** To celowe (decyzja: ostrzeżenia w aplikacji). Nie dodajemy `exclusion constraint` ani unikalności `(employee_id, work_date, start_time)`.
- **`gen_random_uuid()` jest wbudowane w Postgres 13+** — nie wymaga rozszerzenia `pgcrypto` w migracji. `pgcrypto` jest potrzebne wyłącznie w seedzie do `crypt()`/`gen_salt()` (lokalnie preinstalowane).

## Phase 1: Migracja schematu domeny

### Overview

Utworzenie pierwszej migracji zakładającej typ `schedule_status`, sześć tabel domenowych, wszystkie ograniczenia integralności, indeksy oraz trigger `updated_at`.

### Changes Required:

#### 1. Nowa migracja schematu

**Plik**: `supabase/migrations/<YYYYMMDDHHmmss>_domain_schema.sql` (utworzony przez `npx supabase migration new domain_schema`)

**Zamiar**: Zdefiniować pełny schemat domeny w jednej migracji, tak aby `npx supabase db reset` odtworzył bazę od zera.

**Kontrakt**:

- Typ wyliczeniowy `public.schedule_status` o wartościach `'draft'`, `'saved'`.
- Funkcja `public.set_updated_at()` (`trigger`, `plpgsql`) ustawiająca `updated_at = now()` przed aktualizacją; podpięta triggerem do każdej tabeli.
- Tabele (wszystkie z `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`):

  | Tabela | Kluczowe kolumny i ograniczenia |
  |---|---|
  | `businesses` | `owner_id uuid not null references auth.users(id) on delete cascade`; `name text not null`; `unique (owner_id)` — jeden biznes na właściciela w v1 |
  | `opening_hours` | `business_id uuid not null references businesses(id) on delete cascade`; `weekday smallint not null check (weekday between 1 and 7)` (ISO, 1 = poniedziałek); `opens_at time not null`; `closes_at time not null`; `check (closes_at > opens_at)`; `unique (business_id, weekday)` — jeden ciągły przedział na dzień; brak wiersza = dzień zamknięty |
  | `employees` | `business_id uuid not null references businesses(id) on delete cascade`; `name text not null`; `contact_email text null` (kontakt, nie konto); `unique (business_id, id)` — cel kluczy złożonych |
  | `availabilities` | `business_id uuid not null`; `employee_id uuid not null`; `work_date date not null`; `start_time time not null`; `end_time time not null`; `check (end_time > start_time)`; `foreign key (business_id, employee_id) references employees(business_id, id) on delete cascade`; wiele wierszy na dzień dozwolone (przerwy); indeksy `(employee_id, work_date)` i `(business_id, work_date)` |
  | `schedules` | `business_id uuid not null references businesses(id) on delete cascade`; `week_start date not null`; `check (extract(isodow from week_start) = 1)` — poniedziałek; `status schedule_status not null default 'draft'`; `unique (business_id, week_start)` — jeden grafik na tydzień; `unique (business_id, id)` |
  | `assignments` | `business_id uuid not null`; `schedule_id uuid not null`; `employee_id uuid not null`; `work_date date not null`; `start_time time not null`; `end_time time not null`; `check (end_time > start_time)`; `foreign key (business_id, schedule_id) references schedules(business_id, id) on delete cascade`; `foreign key (business_id, employee_id) references employees(business_id, id) on delete cascade`; indeksy `(schedule_id, work_date)` i `(employee_id, work_date)`; **brak** ograniczenia nakładania się zmian (decyzja: ostrzeżenia w aplikacji) |

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` stosuje migrację bez błędów na czystej bazie
- Tabele `businesses`, `opening_hours`, `employees`, `availabilities`, `schedules`, `assignments` oraz typ `schedule_status` istnieją
- Ograniczenia działają: `closes_at <= opens_at`, `end_time <= start_time` oraz `weekday` poza 1–7 są odrzucane; drugi wiersz godzin dla tego samego dnia jest odrzucany
- `week_start` inny niż poniedziałek jest odrzucany
- Spójność `business_id`: wstawienie dostępności lub przypisania z `business_id` innym niż biznes pracownika/grafiku jest odrzucane
- `npx astro sync` + `npm run lint` + `npm run build` przechodzą

#### Manual Verification:

- Przegląd schematu w Supabase Studio (tabele, kolumny, klucze, indeksy, wartości domyślne) odpowiada modelowi opisanemu wyżej

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się po potwierdzenie ręczne, zanim przejdziesz do fazy 2.

---

## Phase 2: Migracja reguł RLS

### Overview

Druga migracja włącza RLS na wszystkich tabelach i zakłada polityki pozwalające właścicielowi wyłącznie na własne dane — dla każdej operacji osobno.

### Changes Required:

#### 1. Nowa migracja RLS

**Plik**: `supabase/migrations/<YYYYMMDDHHmmss>_domain_rls.sql` (utworzony przez `npx supabase migration new domain_rls`)

**Zamiar**: Zabezpieczyć każdą tabelę domenową tak, aby dane jednego właściciela były niedostępne dla innego — nawet przy publicznym kluczu API.

**Kontrakt**:

- Funkcja `public.is_business_owner(target_business_id uuid) returns boolean`, `language sql`, `stable`, `security definer`, `set search_path = ''`; zwraca `true`, gdy istnieje `public.businesses` o danym `id` i `owner_id = auth.uid()`. `revoke all ... from public; grant execute ... to authenticated, anon` — `auth.uid()` zwraca `null` dla `anon`, więc funkcja zwraca `false` i zapytania `anon` otrzymują 0 wierszy zamiast błędu braku uprawnień do funkcji.
- `alter table ... enable row level security` na wszystkich sześciu tabelach.
- Polityki dla `businesses` (cztery operacje): `select using (owner_id = auth.uid())`, `insert with check (owner_id = auth.uid())`, `update using/with check (owner_id = auth.uid())`, `delete using (owner_id = auth.uid())`.
- Polityki dla `opening_hours`, `employees`, `availabilities`, `schedules`, `assignments` (cztery operacje każda), wszystkie oparte na `public.is_business_owner(business_id)` — `select`/`delete` w `using`, `insert`/`update` w `with check` (a `update` również w `using`).
- Uprawnienia: rola `authenticated` i `anon` mogą wykonywać operacje na tabelach (Supabase nadaje je domyślnie); `anon` otrzymuje 0 wierszy we wszystkich tabelach domenowych, bo `is_business_owner` zwraca `false` gdy `auth.uid()` jest `null`.

#### 2. Powtarzalny test izolacji RLS

**Plik**: `supabase/tests/rls_isolation.sql`

**Zamiar**: Zapisać scenariusze izolacji RLS jako commitowany plik SQL, aby przyszłe zmiany polityk miały powtarzalną regresję — bez runnera testów (pgTAP jest celowo wykluczony).

**Kontrakt**: Plik uruchamiany ręcznie po `npx supabase db reset` w `psql` lub Studio. Zawiera:
- Nagłówek z komentarzem: instrukcja uruchomienia (`psql -p 54322 -d postgres -f supabase/tests/rls_isolation.sql` po `supabase start`).
- Setup: wstawienie drugiego właściciela i biznesu (poza seedem) z ustalonymi UUID.
- Scenariusz A — izolacja odczytu: `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid-A>"}';` → `select * from businesses` zwraca wyłącznie biznes A.
- Scenariusz B — odrzucenie wstawienia z cudzym `business_id`: `insert into employees (business_id, name) values ('<uuid-B-business>', 'spy')` → odrzucone.
- Scenariusz C — symetria: powtórz dla użytkownika B.
- Scenariusz D — brak dostępu do `availabilities`, `schedules`, `assignments` drugiego użytkownika.
- Każdy scenariusz kończy się asercją w formie komentarza z oczekiwanym wynikiem (np. `-- expected: 0 rows` / `-- expected: ERROR`).

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` stosuje migrację RLS bez błędów
- `relrowsecurity = true` dla wszystkich sześciu tabel
- Scenariusz SQL na dwóch użytkownikach (dwa `auth.uid()`): zapytania użytkownika A nie zwracają wierszy użytkownika B w żadnej tabeli
- Wstawienie wiersza z `business_id` należącym do innego użytkownika jest odrzucane
- `supabase/tests/rls_isolation.sql` istnieje i uruchomienie ręczne potwierdza wszystkie scenariusze izolacji
- `npx astro sync` + `npm run lint` + `npm run build` przechodzą

#### Manual Verification:

- Zapytanie do `businesses` jako zalogowany użytkownik zwraca tylko jego wiersz i nie powoduje rekurencji RLS
- Test w Supabase Studio / SQL na dwóch kontach potwierdza brak dostępu do cudzych danych

**Implementation Note**: Zatrzymaj się po weryfikacji automatycznej i potwierdź ręcznie działanie izolacji, zanim przejdziesz do fazy 3.

---

## Phase 3: Typy, seed i narzędzia

### Overview

Generowane typy bazy trafiają do repo, skrypt npm je odświeża, a `seed.sql` daje lokalnie gotowe konto i dane do testów.

### Changes Required:

#### 1. Skrypt generowania typów

**Plik**: `package.json`

**Zamiar**: Jedno polecenie odświeżające typy bazy do pliku śledzonego przez git.

**Kontrakt**: Nowy skrypt `"db:types": "supabase gen types typescript --local > src/lib/database.types.ts"`. Uwaga na Windows: przekierowanie `>` działa w skryptach npm (cmd).

#### 2. Wygenerowany plik typów + wyłączenie z lintowania

**Pliki**: `src/lib/database.types.ts`, `eslint.config.js`, `.prettierignore`

**Zamiar**: Zacommitować typy, żeby CI i inne maszyny ich nie generowały, oraz wyłączyć plik z lintowania/prettiera, by generator nie walczył z pre‑commit hookiem.

**Kontrakt**: `src/lib/database.types.ts` z `npm run db:types`; nowy wpis `ignores` w `eslint.config.js` oraz nowy plik `.prettierignore` zawierający tę ścieżkę.

#### 3. Dane startowe

**Plik**: `supabase/seed.sql`

**Zamiar**: Po `npx supabase db reset` mieć lokalnie konto właściciela oraz przykładową kawiarnię, żeby kolejne kroki testować bez ręcznego wpisywania.

**Kontrakt** (nagłówek pliku musi zawierać wyraźne ostrzeżenie „LOCAL ONLY — nie uruchamiać na zdalnym projekcie”):

- Konto w `auth.users` ze stałym UUID, `encrypted_password = crypt('<hasło>', gen_salt('bf'))`, `email_confirmed_at = now()`, `aud = role = 'authenticated'`, puste łańcuchy w kolumnach tokenów, `raw_app_meta_data = '{"provider":"email","providers":["email"]}'`; następnie powiązany wiersz `auth.identities` (`provider = 'email'`, `provider_id = id::text`, `identity_data = jsonb_build_object('sub', id::text, 'email', email)`).
- Jeden `businesses` wskazujący na to konto; godziny otwarcia dla siedmiu dni (jeden dzień celowo pominięty jako zamknięty, żeby było z czego robić „dziurę”); pięciu pracowników; dostępności na bieżący tydzień liczone od `date_trunc('week', now())::date`; jeden `schedules` w statusie `draft` z kilkoma `assignments`.
- Poświadczenia testowe opisane w komentarzu na górze pliku (np. `owner@example.com` / `haslo12345`).

#### 4. Dokumentacja workflow migracji

**Plik**: `AGENTS.md`

**Zamiar**: Zapisać jednolinijkowy workflow, żeby kolejne kroki i przyszli agenci wiedzieli, jak powstają migracje i jak trafiają na produkcję.

**Kontrakt**: Dopisek w sekcji Commands/Architecture: tworzenie migracji `npx supabase migration new`, lokalnie `npx supabase db reset`, na produkcję ręcznie `npx supabase link` + `npx supabase db push`; seed tylko lokalnie.

### Success Criteria:

#### Automated Verification:

- `npm run db:types` generuje `src/lib/database.types.ts` i plik zawiera typy tabel domenowych
- Wygenerowany plik zawiera `export interface Database` oraz nazwy tabel domenowych (walidacja przed commitem — pusty plik oznacza błąd generacji, np. niedziałający lokalny stack)
- `npx supabase db reset` wykonuje `seed.sql` bez błędów
- Seed tworzy konto oraz komplet danych (kontrola liczbą wierszy w tabelach domenowych)
- `npx astro sync` + `npm run lint` + `npm run build` przechodzą z zacommitowanym plikiem typów

#### Manual Verification:

- Logowanie w aplikacji lokalnej (`/auth/signin`) kontem z seeda przechodzi i `/dashboard` pokazuje e‑mail właściciela
- Dane z seeda są widoczne w Supabase Studio i spójne z modelem (godziny, pracownicy, dostępności, grafik)

**Implementation Note**: Zatrzymaj się po weryfikacji automatycznej i potwierdź ręcznie logowanie oraz dane z seeda, zanim przejdziesz do fazy 4.

---

## Phase 4: Wdrożenie na Supabase (ręczne)

### Overview

Zastosowanie migracji na zdalnym projekcie Supabase. Kroki na produkcji są wykonywane przez człowieka; agent może przygotować komendy i zweryfikować wynik.

### Changes Required:

#### 1. Podłączenie i wysłanie migracji

**Plik**: brak zmian w kodzie — operacje na zdalnym projekcie

**Zamiar**: Przenieść schemat i RLS na produkcyjną bazę, tak aby kolejne kroki roadmapy miały działający backend.

**Kontrakt**: `npx supabase link --project-ref <ref>` (krok człowieka, wymaga dostępu do projektu), następnie `npx supabase db push` stosuje wyłącznie nowe migracje. `db push` **nie uruchamia** seeda — plik seed pozostaje lokalny.

### Success Criteria:

#### Automated Verification:

- `npx supabase migration list --linked` pokazuje te same wersje migracji lokalnie i zdalnie

#### Manual Verification:

- `npx supabase link` wykonany na właściwym projekcie produkcyjnym
- `npx supabase db push` zakończony bez błędów
- Smoke test w Supabase Studio: sześć tabel i włączone RLS na zdalnej bazie
- Potwierdzone, że seed nie został uruchomiony na produkcji

**Implementation Note**: Ta faza jest z natury człowiek‑gated — nie wykonuj `db push` bez wyraźnej zgody.

---

## Testing Strategy

Nie ma runnera testów w projekcie, więc weryfikacja jest podzielona na powtarzalne polecenia i ręczne scenariusze SQL.

### Unit Tests:

Brak — warstwa danych nie ma logiki w kodzie aplikacji. Zamiast tego weryfikujemy ograniczenia i RLS zapytaniami SQL.

### Integration Tests:

Scenariusz izolacji zapisany jako commitowany plik `supabase/tests/rls_isolation.sql` (uruchamiany ręcznie po `npx supabase db reset`, w `psql` lub Supabase Studio):

1. Ustaw kontekst użytkownika A: `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid-A>"}';`
2. Sprawdź, że `select * from businesses` zwraca wyłącznie biznes A, a wiersze B są niewidoczne.
3. Spróbuj wstawić `employees` z `business_id` biznesu B — operacja musi zostać odrzucona.
4. Powtórz dla B i potwierdź symetrię.
5. Sprawdź, że jako użytkownik A nie da się odczytać `availabilities`, `schedules` ani `assignments` użytkownika B.

### Manual Testing Steps:

1. `npx supabase start`, następnie `npx supabase db reset` — cała baza odtwarza się z migracji i seeda bez błędów.
2. `npm run dev` i logowanie kontem z seeda → `/dashboard`.
3. W Supabase Studio obejrzyj schemat, RLS i dane seeda.
4. Po wdrożeniu: sprawdź `npx supabase migration list --linked` i obecność tabel/RLS na produkcji.

## Performance Considerations

- Indeksy na kluczach obcych i kolumnach filtrowania (`business_id`, `employee_id`, `schedule_id`, `work_date`) są w schemacie; przy skali MVP (jeden lokal, ~5 pracowników) to w zupełności wystarcza.
- Funkcja `public.is_business_owner` jest `stable`, więc Postgres może ją zoptymalizować w obrębie zapytania.
- Brak zapytań rekurencyjnych w RLS dzięki `security definer` — polityki potomne nie odczytują tabeli `businesses` przez własne RLS.

## Migration Notes

- Migracje są addytywne — repo nie ma istniejących danych ani wcześniejszych migracji, więc nie ma danych do przenoszenia.
- `npx supabase db reset` jest **destrukcyjne dla bazy lokalnej** (drop + odtworzenie). Na produkcji `db push` stosuje tylko nowe migracje.
- Cofnięcie wdrożenia schematu na produkcji jest ręczne (brak automatycznego rollbacku DDL) — dlatego faza 4 jest człowiek‑gated.
- Gdyby ktoś przypadkiem uruchomił `seed.sql` na zdalnym projekcie, utworzy to konto w niedającym się czysto usunąć stanie; plik ma ostrzeżenie, a jego użycie poza `db reset` jest zabronione.

## References

- Roadmap: `context/foundation/roadmap.md` (F‑01)
- PRD: `context/foundation/prd.md` (Access Control, Business Logic; FR‑003…FR‑011)
- Infrastruktura: `context/foundation/infrastructure.md` (Operational Story, Risk Register — ręczne zmiany schematu)
- Klient Supabase: `src/lib/supabase.ts`, `src/middleware.ts`
- Konfiguracja lokalna: `supabase/config.toml`
- Kontrakt Progress: `.kilo/skills/10x-plan/references/progress-format.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Migracja schematu domeny

#### Automated

- [x] 1.1 `npx supabase db reset` stosuje migrację schematu bez błędów
- [x] 1.2 Tabele domenowe i typ `schedule_status` istnieją
- [x] 1.3 Ograniczenia CHECK i UNIQUE odrzucają niepoprawne godziny, weekday i duplikat dnia
- [x] 1.4 `week_start` inny niż poniedziałek jest odrzucany
- [x] 1.5 Klucze złożone odrzucają `business_id` niezgodny z pracownikiem/grafikiem
- [x] 1.6 `npx astro sync` + `npm run lint` + `npm run build` przechodzą

#### Manual

- [x] 1.7 Przegląd schematu w Supabase Studio zgodny z modelem

### Phase 2: Migracja reguł RLS

#### Automated

- [ ] 2.1 `npx supabase db reset` stosuje migrację RLS bez błędów
- [ ] 2.2 RLS włączone na wszystkich sześciu tabelach
- [ ] 2.3 Zapytania użytkownika A nie zwracają danych użytkownika B
- [ ] 2.4 Wstawienie wiersza z cudzym `business_id` jest odrzucane
- [ ] 2.4a `supabase/tests/rls_isolation.sql` istnieje i potwierdza scenariusze izolacji
- [ ] 2.5 `npx astro sync` + `npm run lint` + `npm run build` przechodzą

#### Manual

- [ ] 2.6 Zapytanie do `businesses` jako zalogowany użytkownik działa bez rekurencji RLS
- [ ] 2.7 Dwukontowy test w Studio potwierdza izolację

### Phase 3: Typy, seed i narzędzia

#### Automated

- [ ] 3.1 `npm run db:types` generuje `src/lib/database.types.ts`
- [ ] 3.1a Plik zawiera `export interface Database` i nazwy tabel domenowych (guard przed pustym plikiem)
- [ ] 3.2 `npx supabase db reset` wykonuje seed bez błędów
- [ ] 3.3 Seed tworzy konto i komplet danych
- [ ] 3.4 `npx astro sync` + `npm run lint` + `npm run build` przechodzą z typami

#### Manual

- [ ] 3.5 Logowanie kontem z seeda → `/dashboard` działa lokalnie
- [ ] 3.6 Dane z seeda widoczne i spójne w Studio

### Phase 4: Wdrożenie na Supabase (ręczne)

#### Automated

- [ ] 4.1 `npx supabase migration list --linked` pokazuje zgodność wersji

#### Manual

- [ ] 4.2 `npx supabase link` wykonany na projekcie produkcyjnym
- [ ] 4.3 `npx supabase db push` stosuje migracje na produkcji
- [ ] 4.4 Zdalna baza ma tabele i RLS (smoke test w Studio)
- [ ] 4.5 Potwierdzone, że seed nie trafił na produkcję
