# Testy integracyjne reguł serwerowych (zapis, zamrożenie, uprawnienia) — Implementation Plan

## Overview

Zbudować warstwę testów integracyjnych dla reguł po stronie serwera i pokryć nią cztery ryzyka
z `context/foundation/test-plan.md` — **Faza 2** (§3, wiersz 2): **#1** (serwer odrzuca niekompletny/
kolizyjny zapis, a nie tylko przycisk), **#3** (decyzje tydzień/zamrożenie w strefie Europe/Warsaw),
**#5** (cudzy identyfikator zasobu i niezalogowane żądania nie zmieniają danych), **#6** (wspólny
kształt odpowiedzi nie rozjeżdża się między trasami). Testy wołają **bezpośrednio handlery API**
(Seam A) z atrapą kontekstu, łącząc się z **realnym lokalnym Supabase** — jedyną drogą do sygnału
izolacji RLS. Wpinamy je do CI w osobnym jobie z bazą uruchamianą w Dockerze.

## Current State Analysis

- Istnieje runner testów z Fazy 1: `vitest 4.1.11`, `vitest.config.ts` (alias `@`, env `node`,
  glob `src/**/*.test.ts`), 99 testów jednostkowych — czysta logika, **bez bazy danych**
  (kontrakt Fazy 1: „pełny zestaw na świeżym klonie nie wymaga bazy").
- Trasy API są jednolite i bezpośrednio wywoływalne: nazwane `GET`/`POST`/`PATCH`/`PUT`/`DELETE`
  przyjmujące `APIContext`, bez `platform`/`session`
  ([schedules/index.ts:45](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/schedules/index.ts#L45)).
- Jedyna przeszkoda importu handlera: wartość `astro:env/server` w
  [supabase.ts:3](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/supabase.ts#L3) —
  do zasymulowania aliasem w osobnym configu testów.
- Handlery tworzą klienta SSR z `request.headers` + `cookies`; serwisy filtrują po `business_id`,
  a RLS (6 tabel) jest realną granicą — **żądanie testowe musi nieść ciasteczko sesji**, inaczej
  zapytania są niezalogowane i wszystko zwraca 404/pusto.
- Lokalny Supabase: `supabase start` z WSL (AGENTS.md), `.dev.vars` zawiera
  `SUPABASE_URL=http://127.0.0.1:54321` i publishable anon key (`sb_publishable_…`). Seed: konto
  `owner@example.com / haslo12345` z biznesem, pracownikami i grafikami — ale **daty w seedzie
  zależą od prawdziwego `now()`**, więc nie nadaje się do testów z zamrożonym zegarem.
- `enable_signup = true`, `enable_confirmations = false` (config.toml) → test może rejestrować
  świeżych właścicieli przez API i logować się od razu.
- CI (`.github/workflows/ci.yml`) ma jeden job bez bazy; integracja dostanie osobny job z Dockerem.

### Key Discoveries:

- **Konflikt zegarów**: trigger dostępności `enforce_availability_week_writes` liczy
  `now() at time zone 'Europe/Warsaw'` w SQL — **prawdziwy** zegar. Fake timery aplikacji
  (przeszłość) i prawdziwy zegar triggera nie zgadzają się, więc dostępności testujemy na
  **realnym czasie**, a zamrożenie grafiku (bez triggera datowego) na **fake timerach**.
- **Ważność tokenów**: token JWT ma `exp` z realnego zegara GoTrue. Mockowany czas musi być
  **w przeszłości** względem teraz, inaczej klient SSR uzna token za wygasły. Daty graniczne
  integracyjne: przełom DST **2026-03-29/30** (przeszłość). DST październikowe (2026-10-25)
  zostaje w testach jednostkowych Fazy 1.
- **Ścieżka zapisu grafiku nie wymaga dostępności**: POST create tworzy draft bez bramki
  kompletności, a przypisania można tworzyć bez dostępności (kolizja „uncovered" liczy się
  dopiero przy zapisie). Dzięki temu testy bramki zapisu budują kompletne fixture'y przez API.
- **`saveSchedule`/`unlockSchedule`** to warunkowe UPDATE-y (`WHERE status='draft'/'saved'`)
  [schedule.ts:268-275](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/services/schedule.ts#L268) —
  konflikt zapisu = `PGRST116` → 409.
- **Zapisy na zapisanym grafiku** blokuje trigger `23000` → 409 `ERROR_SAVED_SCHEDULE`
  (backstop #1).
- PATCH save **celowo nie ma bramki zamrożenia** — asymetrię trzeba przypiąć testem
  (`schedule-archive/reviews/impl-review.md:83`).

## Desired End State

Po zakończeniu planu:

1. `npm run test:integration` uruchamia suity integracyjne na lokalnym Supabase i przechodzi
   na świeżym `supabase db reset`.
2. Testy dowodzą czterech ryzyk: #1 (400 z `blockers` zamiast zapisu), #3 (409 zamrożenia
   w strefie Europe/Warsaw na datach granicznych), #5 (cudzy ID → 404, niezalogowany → 401
   i zero mutacji), #6 (jednolity kształt odpowiedzi na trasach JSON).
3. CI ma osobny job `integration` (ubuntu + Docker + CLI Supabase) i jest **wymagany** jako
   bramka (zgodnie z `test-plan.md:91` — „wymagana po §3 Phase 2").
4. Cookbook `test-plan.md §6.4` i ledger §8 opisują, jak dodawać testy integracyjne.

**Weryfikacja końcowa**: `npm run test:integration` zielone lokalnie i w CI; `npm test`,
`npm run lint`, `npm run check`, `npm run build` zielone; scenariusz manualny E2E bez regresji.

## What We're NOT Doing

- **Złącza B (workers pool)** — nie instalujemy `@cloudflare/vitest-pool-workers`; decyzja
  (test-plan §4 zostaje opisany jako alternatywa, nie realizacja).
- **Naprawy dryfu helperów** — duplikaty w `employees/index.ts`, angielski komunikat
  `auth/signup.ts`, dwa `parseWorkDate` zostają; testy **pinują** dzisiejszy stan (decyzja).
- **Trasy auth** w testach #6 (publiczne, 302, nie używają `http.ts`).
- **Zmiany produkcyjne kontraktów** — GET week bez grafiku zostaje `200 { schedule: null }`;
  brak bramki zamrożenia na PATCH save zostaje (asymetria przypięta, nie naprawiona).
- **Testów izolacji RLS (pgTAP)** — Faza 3 planu testów; tu izolacja jest dowodzona przez
  odpowiedzi API (404/401) na realnej bazie.
- **Przypadku „dostępność w bieżącym tygodniu z zapisanym grafikiem"** — wymaga stanu
  nieosiągalnego przez API (POST create blokuje bieżący tydzień); to domena triggera → Faza 3.
- **Zmian w `vitest.config.ts` (jednostki)** — osobny `vitest.integration.config.ts`;
  `npm test` pozostaje bez bazy.
- **Statusów §3 w test-plan.md** — nimi zarządza `/10x-test-plan`.

## Implementation Approach

Sześć faz, w tej kolejności:

1. **Harness** — osobny config integracyjny (alias `astro:env/server` → stub), skrypt
   `test:integration`, helpery (ciasteczka sesji, rejestracja właścicieli, wywołanie handlerów,
   budowanie świata przez API), test-dymny (401 niezalogowany + 201 świeży właściciel).
2. **Ryzyko #1 — bramka zapisu** — realny czas, fixture w prawdziwym przyszłym tygodniu.
3. **Ryzyko #3 — zamrożenie** — fake timery (grafiki) + realny czas (dostępności).
4. **Ryzyko #5 — uprawnienia** — dwóch świeżych właścicieli; ataki cudzymi ID.
5. **Ryzyko #6 — wspólny kształt** — tabela kontraktów na trasach JSON (bez auth).
6. **CI + dokumentacja** — job z bazą, cookbook §6.4, ledger §8, AGENTS.md.

Kolejność wymuszona: bez harnessu nie ma jak uruchomić suit; CI ma sens dopiero, gdy suity
istnieją i przechodzą lokalnie.

## Critical Implementation Details

- **Ciasteczko sesji jest obowiązkowe.** Handler tworzy klienta SSR z `request.headers` —
  testowe `Request` musi nieść ciasteczko sesji uzyskane przez prawdziwe `signInWithPassword`
  (przez klienta SSR z adaptrem ciasteczek w teście). Samo `locals.user` nie wystarczy: bez
  tokena zapytania serwisowe idą niezalogowane, RLS zwraca 0 wierszy i wszystko wygląda jak 404.
- **Mockowany czas zawsze w przeszłości** (np. marzec 2026), bo token JWT ma `exp` z realnego
  zegara. Niedzielne okno 22:00–24:00 UTC testujemy na `2026-03-29T22:30:00Z` (Warszawa już
  w poniedziałku) — to jest dowód lekcji z `lessons.md:60-65`.
- **Fake timery tylko tam, gdzie nie ma triggera datowego.** Zamrożenie grafiku: OK (brak
  triggera na `schedules`). Dostępności: realny czas — trigger SQL i tak odrzuci realnie minione
  tygodnie, więc asercja 409 byłaby prawdziwa przypadkowo, a pozytywne ścieżki (przyszłość)
  niemożliwe przy mockowaniu w przeszłość.
- **Seed nie nadaje się do testów zależnych od czasu** (daty od `now()` przy resecie). Wszystkie
  fixture'y zależne od czasu budujemy przez API pod świeżo zarejestrowanymi właścicielami.
- **.dev.vars ładuje się tylko lokalnie** (`process.loadEnvFile` z guardem `existsSync` w configu);
  CI podaje `SUPABASE_URL`/`SUPABASE_KEY` jawnie na kroku testów. Klucz musi być **anon/publishable**
  (jak w `.dev.vars`), nigdy `service_role` — inaczej RLS jest pomijane i testy izolacji kłamią.
- **Oczekiwania pisane ręcznie, nie z produkcyjnych funkcji** (test-plan §2 #1): dziury/kolizje
  w asercjach to literały z fixture (ręcznie policzone), nie wynik `findScheduleBlockers`.

## Phase 1: Harness integracyjny — config, stub, skrypt, helpery, test-dymny

### Overview

Uruchomić testy integracyjne na realnym Supabase: osobny config Vitest, stub `astro:env/server`,
skrypt `test:integration`, wspólne helpery (ciasteczka, rejestracja właścicieli, wywołanie
handlerów, budowanie świata przez API) i dwa testy-dymne dowodzące okablowania: niezalogowane
żądanie → 401 oraz świeży właściciel tworzący biznes → 201.

### Changes Required:

#### 1. Konfiguracja runnera integracyjnego

**File**: `vitest.integration.config.ts` (nowy)

**Intent**: Osobny config, który nie miesza się z jednostkami (`npm test` bez bazy) i mapuje
`astro:env/server` na stub. Ładuje `.dev.vars` lokalnie, gdy plik istnieje.

**Contract**: `defineConfig` z `vitest/config`; na górze pliku `process.loadEnvFile(".dev.vars")`
osłonięte `existsSync`; `test.environment: "node"`; `test.include: ["test/integration/**/*.test.ts"]`;
`resolve.alias`: `"@"` → `./src` (jak w configu jednostek) oraz `"astro:env/server"` →
`./test/integration/stubs/astro-env-server.ts`.

#### 2. Stub `astro:env/server`

**File**: `test/integration/stubs/astro-env-server.ts` (nowy)

**Intent**: Zastąpić wirtualny moduł Astro w testach wartościami z `process.env` (załadowanego
z `.dev.vars` lokalnie lub z env CI).

**Contract**: Eksporty `SUPABASE_URL: string | undefined` i `SUPABASE_KEY: string | undefined`
wprost z `process.env` — sygnatura zgodna z deklaracją `.astro/env.d.ts`.

#### 3. Skrypt w manifestcie

**File**: `package.json`

**Intent**: Dodać wygodne wejście do suit integracyjnych, oddzielone od `npm test`.

**Contract**: `"test:integration": "vitest run --config vitest.integration.config.ts"`.
Bez zmian w pozostałych skryptach. `npm test` (jednostki) zostaje nietknięty.

#### 4. Wspólne helpery testowe

**File**: `test/integration/helpers.ts` (nowy)

**Intent**: Jedno miejsce na trzy rzeczy, które powtarzają się w każdej suicie: sesja+cookie,
wywołanie handlera z atrapą kontekstu, budowanie świata przez prawdziwe API.

**Contract**: Eksporty:
- `TestCookieJar` — adapter ciasteczek zgodny z `@supabase/ssr` (`getAll`, `setAll`) plus
  `toHeader(): string` składający nagłówek `Cookie`;
- `signIn(email, password)` — przez `createClient(new Request("http://test.local"), jar)` +
  `auth.signInWithPassword`; zwraca `{ userId, jar }`;
- `signUpOwner(prefix)` — unikalny e-mail (`<prefix>-<Date.now()>-...@example.com`),
  `auth.signUp` (bez potwierdzenia e-maila lokalnie) + `signIn`; zwraca `{ userId, jar }`;
- `callHandler(handler, { method, path, body?, user?, jar? })` — buduje realne `Request`
  (JSON w ciele, nagłówek `Cookie` z `jar`), atrapę `APIContext` (`locals: { user }`,
  `cookies: jar`, `url`, `redirect: stub`), woła handler i zwraca `Response`;
- `setupOwnerWorld(...)` — przez handlery API: biznes, godziny otwarcia, pracownik, dostępność,
  draft grafiku; zwraca utworzone ID; oraz `nextWeekStart(offsetDays)` liczące tydzień
  z `@/lib/week` (`currentWeekStart()` + `addDays`).

#### 5. Test-dymny

**File**: `test/integration/smoke.test.ts` (nowy)

**Intent**: Dowód, że okablowanie działa: trasa zwraca 401 bez sesji i 201 z sesją przez realną bazę.

**Contract**: (a) niezalogowany `POST /api/employees` (handler z `callHandler`, `user: null`) →
status 401, ciało z kluczem `error`; (b) `signUpOwner` + `callHandler` POST `/api/business`
`{ name }` → status 201, odpowiedź zawiera `business` z `id`. Jeśli baza jest niedostępna,
test ma się wywalić czytelnie (błąd połączenia), nie zielono.

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` przechodzi lokalnie przy uruchomionym `supabase start`
- `npm run lint` przechodzi
- `npm run check` przechodzi
- `npm test` (jednostki) nadal przechodzi bez bazy

#### Manual Verification:

- Raport `npm run test:integration` pokazuje oba testy-dymne (401 i 201)
- Przy zatrzymanym Supabase uruchomienie daje czytelny błąd połączenia (brak fałszywego zielonego)

**Implementation Note**: Po automatycznej weryfikacji pauza na manualne potwierdzenie przed Fazą 2.

---

## Phase 2: Ryzyko #1 — serwer odrzuca niekompletny/kolizyjny zapis

### Overview

Suita dowodząca, że bramka zapisu działa po stronie serwera niezależnie od UI: niekompletny lub
kolizyjny draft nie zapisze się (400 z listą blokad), konflikt zapisu i zapis na zapisanym grafiku
dają 409, a niezalogowany zapis nie zmienia danych. Fixture w **prawdziwym przyszłym tygodniu**,
realny czas.

### Changes Required:

#### 1. Suita bramki zapisu

**File**: `test/integration/schedule-save.test.ts` (nowy)

**Intent**: Przypiąć zachowanie PATCH `status:"saved"` dla kompletnego, niekompletnego,
kolizyjnego i już zapisanego grafiku — oczekiwania liczone ręcznie z fixture, nie z kodu.

**Contract**: Fixture przez `setupOwnerWorld`: świeży właściciel, godziny otwarcia
pn–pt `08:00–18:00`, pracownik z dostępnością `08:00–18:00` w dni pn–pt tygodnia
`week = currentWeekStart() + 7 dni`, draft utworzony przez POST `/api/schedules`. Przypadki:

- **Kompletny**: przypisania pokrywające całe okno pn–pt → PATCH saved → **200**,
  `schedule.status === "saved"`;
- **Dziura**: tylko poniedziałek przypisany → PATCH saved → **400**, `error` = stała
  `ERROR_SCHEDULE_INCOMPLETE` (import z `@/lib/http`), `blockers.holes` niepusty, a wpis dziury
  opisuje wtorek (ręcznie policzony literał `workDate`);
- **Kolizja „uncovered"**: przypisanie wykraczające poza dostępność pracownika → **400**,
  `blockers.collisions` niepusty z `kind: "uncovered"`;
- **Ponowny zapis** zapisanego grafiku → **409**, `error` = `ERROR_SAVED_SCHEDULE`;
- **Zapis na zapisanym grafiku** (POST/PUT `/api/schedules/assignments`) → **409**
  (trigger `23000` → mapowanie w `assignments.ts`);
- **Niezalogowany** PATCH saved → **401**, a stan grafiku pozostaje `draft`
  (weryfikacja przez zalogowany GET);
- **Zły kształt danych** → **500** z `ERROR_SERVER` (parsery z Fazy 1 — przypięcie granicy).

Oczekiwane komunikaty porównujemy przez **stałe z `@/lib/http`** (jedno źródło); wartości
strukturalne (daty, godziny blokad) to literały z fixture, **nie** wyniki `generateDraft`/
`findScheduleBlockers`.

### Success Criteria:

#### Automated Verification:

- Suita `schedule-save` przechodzi: `npm run test:integration`
- `npm run lint` przechodzi
- `npm run check` przechodzi

#### Manual Verification:

- Nazwy testów czytają się jak katalog ryzyka #1 (zapis niekompletny/kolizyjny → 400, konflikt → 409)

**Implementation Note**: Po automatycznej weryfikacji pauza na manualne potwierdzenie przed Fazą 3.

---

## Phase 3: Ryzyko #3 — tydzień i zamrożenie w Europe/Warsaw

### Overview

Dwie suity: grafiki na **fake timerach** z datami granicznymi (przełom DST i okno niedziela 22:30 UTC),
dostępności na **realnym czasie**. Dowodzą, że decyzja zamknięte/otwarte zależy od strefy
Europe/Warsaw, a nie od strefy maszyny, oraz pinują asymetrię: PATCH save nie ma bramki zamrożenia.

### Changes Required:

#### 1. Suita zamrożenia grafików

**File**: `test/integration/schedule-freeze.test.ts` (nowy)

**Intent**: Przypiąć decyzje `isFrozenWeek` na granicy tras POST create i PATCH unlock
z zamrożonym zegarem — bez zależności od „dzisiaj" i strefy maszyny.

**Contract**: `vi.useFakeTimers()` z `setSystemTime` przed budową klienta i wywołaniami;
wszystkie daty to literały **w przeszłości** (ważność tokenów). Przypadki:

- **Poniedziałek po DST**: now = `2026-03-30T08:00:00Z` → POST create dla tygodnia
  `2026-03-30` → **409** `ERROR_WEEK_FROZEN`; dla `2026-04-06` → **201**;
- **Okno niedziela 22:30 UTC** (lekcja `lessons.md:60-65`): now = `2026-03-29T22:30:00Z`
  (Warszawa = poniedziałek 00:30) → POST create dla `2026-03-30` → **409** mimo że UTC
  to jeszcze niedziela; dla `2026-04-06` → **201**;
- **Zwykły tydzień**: now = `2026-04-13T08:00:00Z` → `2026-04-13` → 409, `2026-04-20` → 201;
- **Asymetria zapisu**: draft na `2026-04-06` utworzony przy now = `2026-03-30`; po
  przestawieniu zegara na `2026-04-06T08:00:00Z` (tydzień bieżący): PATCH saved → **200**
  (brak bramki zamrożenia), a PATCH draft (odblokowanie zapisanego) → **409** `ERROR_WEEK_FROZEN`.

POST create nie wymaga dostępności — draft z pustą obsadą powstaje (201) i nie ma triggera
datowego na `schedules`.

#### 2. Suita zamrożenia dostępności

**File**: `test/integration/availability-freeze.test.ts` (nowy)

**Intent**: Przypiąć `resolveWeekGuard` na realnym zegarze — trigger SQL liczy prawdziwe `now()`,
więc mockowanie czasu w przeszłość dawałoby przypadkowe 409.

**Contract**: Realny czas; tygodnie liczone z `currentWeekStart()`. Dla świeżego właściciela
(z biznesem i pracownikiem):

- tydzień **miniony** (`currentWeekStart() − 7`): POST availability → **409**
  `ERROR_AVAILABILITY_WEEK_FROZEN`;
- tydzień **przyszły** (`currentWeekStart() + 7`): POST → **201**;
- tydzień **bieżący** (brak zapisanego grafiku): POST → **201**.

Przypadek „bieżący z zapisanym grafikiem" jest nieosiągalny przez API (POST create blokuje
bieżący tydzień) — dowodzi go trigger → Faza 3 (pgTAP).

### Success Criteria:

#### Automated Verification:

- Suity `schedule-freeze` i `availability-freeze` przechodzą: `npm run test:integration`
- `npm run lint` przechodzi
- `npm run check` przechodzi

#### Manual Verification:

- Raport pokazuje przypadki DST (2026-03-29/30) i okno niedziela 22:30 UTC — żaden test nie
  zależy od dzisiejszej daty ani od strefy maszyny

**Implementation Note**: Po automatycznej weryfikacji pauza na manualne potwierdzenie przed Fazą 4.

---

## Phase 4: Ryzyko #5 — cudzy zasób i niezalogowane żądanie

### Overview

Suita z **dwoma świeżymi właścicielami**: właściciel B wysyła żądania z identyfikatorami zasobów
właściciela A (pracownik, dostępność, przypisanie, tydzień grafiku) i dostaje 404; żądanie bez
zalogowania nie zmienia danych; szczęśliwa ścieżka B na własnych zasobach działa. Realny czas,
bez fake timerów.

### Changes Required:

#### 1. Suita własności

**File**: `test/integration/ownership.test.ts` (nowy)

**Intent**: Podważyć „skoro ekran tego nie pokazuje, nikt tego nie wyśle" — udowodnić, że
serwer odrzuca cudzy identyfikator i nie pozwala niezalogowanemu nic zmienić.

**Contract**: Fixture: właściciel A (świeży, `setupOwnerWorld` z grafikiem-draftem w przyszłym
tygodniu) i właściciel B (świeży, własny biznes i pracownik). Ataki B na zasoby A:

- PUT/DELETE `/api/employees` z `id` A → **404** `ERROR_EMPLOYEE_NOT_FOUND`;
- PUT/DELETE `/api/availabilities` z `id` A → **404** `ERROR_AVAILABILITY_NOT_FOUND`;
- POST `/api/schedules/assignments` z `employeeId` A (i tygodniem A) → **404**
  `ERROR_EMPLOYEE_NOT_FOUND`; PUT/DELETE `/api/schedules/assignments` z `assignmentId` A → **404**
  `ERROR_ASSIGNMENT_NOT_FOUND`;
- PATCH `/api/schedules` z `weekStart` A i `status: "saved"` → **404** `ERROR_SCHEDULE_NOT_FOUND`;
  DELETE z tygodniem A → **404**;
- GET `/api/schedules?week=<tydzień A>` jako B → **200 `{ schedule: null }`** (kontrakt
  przypięty — cudzy tydzień to pusty, nie 403/404);

Żądania **niezalogowane** (`user: null`):

- POST `/api/employees` → **401** `ERROR_UNAUTHORIZED`; weryfikacja braku mutacji:
  zalogowany GET A pokazuje **ten sam** stan (liczba pracowników bez zmian);

Ścieżka **szczęśliwa** (dowód, że izolacja nie jest blanket denial): B aktualizuje własnego
pracownika → **200**.

ID zasobów A zbieramy z odpowiedzi fixture'ów (`setupOwnerWorld`), nie hardcodujemy seeda.

### Success Criteria:

#### Automated Verification:

- Suita `ownership` przechodzi: `npm run test:integration`
- `npm run lint` przechodzi
- `npm run check` przechodzi

#### Manual Verification:

- Raport obejmuje trzy grupy: cudzy ID → 404, niezalogowany → 401 + brak mutacji, szczęśliwa
  ścieżka właściciela → 200

**Implementation Note**: Po automatycznej weryfikacji pauza na manualne potwierdzenie przed Fazą 5.

---

## Phase 5: Ryzyko #6 — wspólny kształt odpowiedzi na trasach JSON

### Overview

Suita kontraktowa przypinająca **kształt** odpowiedzi (status + klucz `error`, ewentualnie
`fieldErrors`) na trasach JSON, które dzielą helpery z `src/lib/http.ts` — tak, by zmiana
wspólnego pomocnika nie mogła cicho rozjechać jednej trasy. Trasy auth poza zakresem (decyzja).

### Changes Required:

#### 1. Suita wspólnego kształtu

**File**: `test/integration/response-shapes.test.ts` (nowy)

**Intent**: Tabela kontraktów (trasa × status × kształt) jako zabezpieczenie przed rozjazdem —
dokładnie ta klasa dryfu, którą `lessons.md:5-13` już raz udokumentowała.

**Contract**: Tabela przypadków pokrywająca trasy JSON (schedules, assignments, availabilities,
employees, business, opening-hours):

- **401 bez sesji** — każda trasa mutacji: status 401, ciało `{ error }` i `error` równe stałej
  `ERROR_UNAUTHORIZED` (import z `@/lib/http`);
- **400 z `fieldErrors`** — np. POST `/api/schedules` z `weekStart: "bogus"`: status 400,
  `error` = `ERROR_VALIDATION`, obecny klucz `fieldErrors.weekStart`;
- **404 z `error`** — mutacje z nieistniejącym ID (dowolny UUID): status 404 i obecny klucz
  `error`;
- **409 z `error`** — np. duplikat pracownika w jednym biznesie: status 409, `error` =
  `ERROR_DUPLICATE_EMPLOYEE`.

Asercje sprawdzają **kształt** (klucze) i **stałe** (jedno źródło komunikatów), nie kopiują
tekstów do testu. Iteracja po tabeli ma wskazać w raporcie, która trasa i status się rozjechały.

### Success Criteria:

#### Automated Verification:

- Suita `response-shapes` przechodzi: `npm run test:integration`
- `npm run lint` przechodzi
- `npm run check` przechodzi

#### Manual Verification:

- Tabela w teście obejmuje wszystkie trasy JSON (bez auth); nazwy przypadków czytają się jako
  „trasa × status" — po raporcie widać, co dokładnie jest pinowane

**Implementation Note**: Po automatycznej weryfikacji pauza na manualne potwierdzenie przed Fazą 6.

---

## Phase 6: CI z bazą + dokumentacja

### Overview

Wpiąć testy integracyjne do CI jako osobny job z uruchomionym Supabase (Docker na ubuntu),
wypełnić cookbook §6.4 i ledger §8 w planie testów oraz zaktualizować AGENTS.md. Job jest
bramką zgodnie z `test-plan.md:91` („wymagana po §3 Phase 2").

### Changes Required:

#### 1. Job integracyjny w CI

**File**: `.github/workflows/ci.yml`

**Intent**: Testy integracyjne działają w automacie na realnej bazie; czerwona zmiana ryzyk
#1/#3/#5/#6 nie przechodzi. Osobny job nie spowalnia szybkiego joba jakościowego.

**Contract**: Nowy job `integration` na `ubuntu-latest`: checkout → setup-node 22 + cache →
`npm ci` → instalacja CLI Supabase (akcja `supabase/setup-cli` lub `npx supabase` — na Linuxie
z Dockerem działa) → `supabase start` → `supabase db reset` (migracje + seed, lokalnie tylko)
→ `npm run test:integration` z env: `SUPABASE_URL: http://127.0.0.1:54321` i `SUPABASE_KEY`
wyciągnięty z `supabase status -o json` (**publishable anon key**, nie service_role — inaczej
RLS jest pomijane i testy izolacji kłamią). Kolejność kroków i bramka w ochronie gałęzi —
zgodnie z §5 planu testów (wymuszenie bramek to Faza 4 planu; tu tworzymy job, który ta faza
uczyni wymaganym).

#### 2. Cookbook planu testów

**File**: `context/foundation/test-plan.md`

**Intent**: Wypełnić placeholder §6.4 odpowiedzią na pytanie „jak dodać test integracyjny"
w tym projekcie.

**Contract**: §6.4 (`test-plan.md:125-127`) → lokalizacja (`test/integration/**/*.test.ts`),
komenda (`npm run test:integration`), wymóg działającego lokalnego Supabase (`supabase start`
z WSL + `supabase db reset`), wzorzec (`test/integration/helpers.ts`, test-dymny) oraz zasada
„realny czas dla dostępności, fake timery w przeszłości dla zamrożenia grafików". §3 (statusy)
i §6.1–6.3 pozostają nietknięte.

#### 3. Ledger świeżości planu testów

**File**: `context/foundation/test-plan.md`

**Intent**: Odnotować wdrożenie Etapu 2 w §8.

**Contract**: §8 (`test-plan.md:146-158`) — dopisany wpis: Etap 2 wdrożony, zmiana
`testing-server-side-rules`, suity integracyjne na realnym lokalnym Supabase, job `integration`
w CI; pozostaje Etap 3 (pgTAP) i Etap 4 (bramki).

#### 4. Dokumentacja projektu

**File**: `AGENTS.md`

**Intent**: Przyszły agent ma wiedzieć, że istnieje `npm run test:integration`, że wymaga
działającego lokalnego Supabase i że w CI działa osobny job.

**Contract**: Sekcja `## Testing` (AGENTS.md) — obok `npm test`/`test:watch` wymienione
`test:integration` z warunkiem `supabase start` (WSL) i wskazanie na `test/integration/`;
sekcja `## Commands` — nowy skrypt.

### Success Criteria:

#### Automated Verification:

- Job `integration` w CI przechodzi (zweryfikowane na PR do `master`)
- `npm run lint` i `npm run check` przechodzą
- Pełny zestaw lokalny przechodzi: `npm test` + `npm run test:integration`

#### Manual Verification:

- PR pokazuje zielony job `integration` obok szybkiego joba jakościowego
- Cookbook §6.4 i ledger §8 opisują proces zgodny z tym, co faktycznie działa

**Implementation Note**: Po automatycznej weryfikacji pauza na manualne potwierdzenie — weryfikacja
CI wymaga pusha PR, co robi człowiek.

---

## Testing Strategy

### Unit Tests:

Bez zmian. Istniejące suity Fazy 1 (week, format, schedule-generation, schedule-validation,
schedule-export) pozostają kontraktem czystej logiki; `npm test` nadal działa bez bazy.

### Integration Tests:

- `test/integration/smoke.test.ts` — okablowanie: 401 bez sesji, 201 z sesją.
- `test/integration/schedule-save.test.ts` — ryzyko #1: 400 z `blockers` (dziura/kolizja),
  409 konflikt zapisu i zapis na zapisanym grafiku, 401 bez sesji, 500 zły kształt.
- `test/integration/schedule-freeze.test.ts` + `availability-freeze.test.ts` — ryzyko #3:
  fake timery na datach granicznych (DST 2026-03-29/30, okno niedziela 22:30 UTC), asymetria
  PATCH save, realny czas dla dostępności.
- `test/integration/ownership.test.ts` — ryzyko #5: cudzy ID → 404, niezalogowany → 401
  i brak mutacji, szczęśliwa ścieżka właściciela.
- `test/integration/response-shapes.test.ts` — ryzyko #6: tabela kontraktów 401/400/404/409
  na trasach JSON (bez auth).

### Manual Testing Steps:

**Scenariusz A — suity przechodzą lokalnie**

1. Z WSL: `supabase start`, potem `supabase db reset` (migracje + seed).
2. Z PowerShell: `npm run test:integration`.
3. Oczekiwane: wszystkie suity zielone; raport pozwala wskazać test dla każdego z ryzyk
   #1 (serwer), #3, #5, #6.
4. Uruchom `npm test`. Oczekiwane: jednostki zielone **bez** uruchomionej bazy (kontrakt Fazy 1).

**Scenariusz B — niezalogowane żądanie nie zmienia danych**

1. Zatrzymaj/ignoruj sesję: wywołaj w suicie `callHandler` z `user: null` na POST pracownika.
2. Oczekiwane: 401; po zalogowaniu właściciela liczba pracowników bez zmian.

**Scenariusz C — CI**

1. Push gałęzi z tą zmianą; otwórz PR do `master`.
2. Oczekiwane: job `ci` (sync/lint/check/test/build) i job `integration` zielone.

## Performance Considerations

Bez wpływu na produkcję — to wyłącznie testy. Liczba żądań do lokalnego Supabase jest rzędu
dziesiątek na suity; czas wykonania poniżej minuty. Nie dodajemy pomiarów ani progów.

## Migration Notes

Brak migracji i zmian schematu — zmiana jest w całości po stronie testów i CI. Testy wymagają
lokalnego Supabase z **zastosowanymi migracjami i seedem** (`supabase db reset`); seed jest
lokalny i nigdy nie trafia na zdalny projekt (AGENTS.md). W CI baza powstaje od zera w jobie.

## References

- Research: `context/changes/testing-server-side-rules/research.md`
- Plan testów (Faza 2, ryzyka #1/#3/#5/#6, §4 stos, §5 bramki, §6.4 cookbook):
  `context/foundation/test-plan.md`
- Lekcja o oknie niedziela 22:00–24:00 UTC: `context/foundation/lessons.md:60-65`
- Lekcja o duplikatach helperów: `context/foundation/lessons.md:5-13`
- Kontrakt bramki zapisu: `context/archive/2026-09-13-save-complete-schedule/plan.md:150,164-169`
- Kontrakt zamrożenia i asymetria PATCH save:
  `context/archive/2026-09-13-schedule-archive/plan.md:192,337-352`, `reviews/impl-review.md:83`
- Konfiguracja runnera jednostek (wzorzec): `vitest.config.ts`
- Wspólne stałe i helpery: `src/lib/http.ts`, `src/lib/api.ts`

## Progress

> Konwencja: `- [ ]` do zrobienia, `- [x]` zrobione. Dopisz ` — <sha commita>` gdy krok ląduje.
> Nie zmieniaj nazw kroków.

### Phase 1: Harness integracyjny — config, stub, skrypt, helpery, test-dymny

#### Automated

- [x] 1.1 `npm run test:integration` przechodzi lokalnie przy uruchomionym `supabase start` — 1c1b8c4
- [x] 1.2 `npm run lint` przechodzi — 1c1b8c4
- [x] 1.3 `npm run check` przechodzi — 1c1b8c4
- [x] 1.4 `npm test` (jednostki) nadal przechodzi bez bazy — 1c1b8c4

#### Manual

- [x] 1.5 Raport `npm run test:integration` pokazuje oba testy-dymne (401 i 201) — 2b1ed58
- [x] 1.6 Przy zatrzymanym Supabase uruchomienie daje czytelny błąd połączenia (brak fałszywego zielonego) — 2b1ed58

### Phase 2: Ryzyko #1 — serwer odrzuca niekompletny/kolizyjny zapis

#### Automated

- [x] 2.1 Suita `schedule-save` przechodzi: `npm run test:integration` — f3c809d
- [x] 2.2 `npm run lint` przechodzi — f3c809d
- [x] 2.3 `npm run check` przechodzi — f3c809d

#### Manual

- [x] 2.4 Nazwy testów czytają się jak katalog ryzyka #1 (400 z blokadami, 409 konfliktów) — 2b1ed58

### Phase 3: Ryzyko #3 — tydzień i zamrożenie w Europe/Warsaw

#### Automated

- [x] 3.1 Suity `schedule-freeze` i `availability-freeze` przechodzą: `npm run test:integration` — 17a9cd5
- [x] 3.2 `npm run lint` przechodzi — 17a9cd5
- [x] 3.3 `npm run check` przechodzi — 17a9cd5

#### Manual

- [x] 3.4 Raport pokazuje przypadki DST (2026-03-29/30) i okno niedziela 22:30 UTC; żaden test
      nie zależy od dzisiejszej daty ani od strefy maszyny — 2b1ed58

### Phase 4: Ryzyko #5 — cudzy zasób i niezalogowane żądanie

#### Automated

- [x] 4.1 Suita `ownership` przechodzi: `npm run test:integration` — 381111b
- [x] 4.2 `npm run lint` przechodzi — 381111b
- [x] 4.3 `npm run check` przechodzi — 381111b

#### Manual

- [x] 4.4 Raport obejmuje: cudzy ID → 404, niezalogowany → 401 + brak mutacji, szczęśliwa ścieżka → 200 — 2b1ed58

### Phase 5: Ryzyko #6 — wspólny kształt odpowiedzi na trasach JSON

#### Automated

- [x] 5.1 Suita `response-shapes` przechodzi: `npm run test:integration` — ce82252
- [x] 5.2 `npm run lint` przechodzi — ce82252
- [x] 5.3 `npm run check` przechodzi — ce82252

#### Manual

- [x] 5.4 Tabela kontraktów obejmuje wszystkie trasy JSON (bez auth); raport wskazuje trasę × status — 2b1ed58

### Phase 6: CI z bazą + dokumentacja

#### Automated

- [x] 6.1 Job `integration` w CI przechodzi (zweryfikowane na PR do `master`)
- [x] 6.2 `npm run lint` i `npm run check` przechodzą — 2b1ed58
- [x] 6.3 Pełny zestaw lokalny przechodzi: `npm test` + `npm run test:integration` — 2b1ed58

#### Manual

- [x] 6.4 PR pokazuje zielony job `integration` obok szybkiego joba jakościowego
- [x] 6.5 Cookbook §6.4 i ledger §8 opisują proces zgodny z tym, co faktycznie działa
