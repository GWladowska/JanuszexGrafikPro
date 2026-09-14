# Testing Core Logic — Implementation Plan

## Overview

Uruchomić **Vitest** jako runner testów jednostkowych w projekcie i pokryć nim czystą logikę grafiku,
czasu oraz tekstu dla załogi. Jednocześnie domknąć produkcyjnie lukę ujawnioną przez incydent
S-04: gdy do czystej logiki trafi zły kształt danych, aplikacja dziś **milczy i pokazuje pusty
grafik** zamiast zgłosić błąd — a bramka zapisu przepuszcza taki grafik, bo blokady są liczone
z tych samych wadliwych danych.

Realizuje **Fazę 1** z `context/foundation/test-plan.md:55` (ryzyka #2, #3, #7 i część #1).

## Current State Analysis

- **Nie ma żadnego runnera testów.** Brak `vitest`/`jest`/`mocha`/`@cloudflare/vitest-pool-workers`
  w `package.json`, `package-lock.json` i `node_modules`; brak plików `*.test.ts`, brak configu,
  brak skryptu `test`, brak kroku testowego w CI (`.github/workflows/ci.yml:18-24`).
- **Cel Fazy 1 jest całkowicie czysty.** `src/lib/week.ts`, `src/lib/format.ts`,
  `src/lib/services/schedule-generation.ts`, `schedule-validation.ts`, `schedule-export.ts`
  importują framework wyłącznie jako `import type` (erased przez `verbatimModuleSyntax`).
  Dlatego wystarczy środowisko `node` — bez DOM-u, mocków i runtime'u Workers.
- **Alias `@/*` istnieje tylko w TypeScript** (`tsconfig.json:8-11`). `astro.config.mjs:17-19`
  nie ma `vite.resolve.alias`, a `vite-tsconfig-paths` nie jest zainstalowany. Runner musi
  zmapować alias sam.
- **`tsconfig.json:3` ma `include: ["**/*"]`**, więc `vitest.config.ts` i pliki `*.test.ts`
  są już w projekcie TS — tsconfig nie wymaga zmian.
- **ESLint typuje wszystko**: `baseConfig` (`eslint.config.js:18-42`) nie ma klucza `files`,
  a `parserOptions.projectService: true` (`:22`) — więc `vitest.config.ts` też będzie typowany.
- **Istnieje gotowy wzorzec walidacji do naśladowania**: `parseWeekStartField`
  (`src/pages/api/schedules/index.ts:30-36`) zwraca `400 { error: ERROR_VALIDATION, fieldErrors }`.
- **Powierzchnia walidacji w `src/pages/api/schedules/index.ts`**: GET wywołuje fetchery na
  `:55-72` i odpowiada na `:74-81`; POST woła `generateDraft` na `:134-138`; PATCH woła
  `findScheduleBlockers` na `:251-261`. Bramka zapisu mapuje `DraftPiece` **inline** na `:254-259`
  — to druga kopia logiki `toDraftPiece` z islandy (`ScheduleBoard.tsx:149-151`).
- **`schedule-validation.ts` ma trzech importerów** (`ScheduleBoard.tsx:28`,
  `index.ts:27`, `assignments.ts:27-33`) i **żaden nie importuje typów** — nowe eksporty
  nikogo nie przesłonią. Moduł jest importowany także przez islandę, więc musi pozostać czysty.
- **Brak stałej błędu dla „serwer zwrócił złe dane"** — najbliższe to `ERROR_SERVER`
  (`src/lib/http.ts:25`).

### Key Discoveries:

- `getViteConfig` **istnieje** w `astro/config` (`node_modules/astro/dist/config/entrypoint.js:32`),
  ale świadomie z niego nie korzystamy — mamy własny `vitest.config.ts` z jawnym aliasem.
- Astro 6.3.1 sam developuje się na `vitest ^4.1.0` obok `vite ^7.3.2`
  (`node_modules/astro/package.json:204`), więc pin `vitest@^4` jest zgodny z wymuszonym
  override'em `vite: ^7.3.2` (`package.json:59`).
- Vitest w wersji 4 korzysta z `defineConfig` z `vitest/config`; domyślne środowisko to `node`,
  a domyślny glob obejmuje pliki obok modułów — nie trzeba rozszerzać `tsconfig`.
- Zapis grafiku jest samoodnoszący się: `findScheduleBlockers` liczy blokady z tych samych danych,
  które mogły być wadliwe (`src/pages/api/schedules/index.ts:251-264`), więc **zły kształt
  przechodzi jako sukces** — to jest dokładnie luka do zamknięcia.
- Zegar w `src/lib/week.ts:55,59,63` jest wstrzykiwalny, ale wszystkie produkcyjne wywołania pomijają
  argument (`index.ts:107,277`, `availability-guard.ts:13`). Dlatego testujemy `week.ts` jawnymi
  argumentami, a nie fake timers.

## Desired End State

Po zakończeniu planu:

1. `npm test` uruchamia zestaw testów jednostkowych i przechodzi na czystym klonie.
2. `npx astro check` i `npm test` są krokami CI obok `astro sync`, `lint` i `build`.
3. Czysta logika grafiku, tygodnia i eksportu tekstu jest pokryta testami przypinającymi
   kontrakty z `prd.md` i przypadki brzegowe wypisane w researchu.
4. Gdy do trasy API trafi zły kształt danych, odpowiedź to `500 { error: ERROR_SERVER }`,
   a zapis **nie dochodzi do skutku** — zamiast cichego pustego grafiku z zerem blokad.

**Weryfikacja końcowa**: `npm test`, `npm run check`, `npm run lint`, `npm run build` zielone;
CI zielone na PR; scenariusz manualny (logowanie → wygenerowanie draftu → zapis grafiku) bez regresji.

## What We're NOT Doing

- **Testów integracyjnych API na Workers** (`@cloudflare/vitest-pool-workers`) — to Faza 2 planu testów.
- **Testów bazy/RLS (pgTAP)** — Faza 3 planu testów.
- **Testów e2e/Playwright, testów wizualnych i multimodalnych** — §7 planu testów: świadomie poza zakresem.
- **Zmian w ochronie gałęzi GitHuba** — plan dokłada kroki do workflow, ale wymuszenie bramek
  w branch protection należy do Fazy 4 planu testów.
- **Refaktoru duplikatu mapowania** `DraftPiece` (`index.ts:254-259` vs `ScheduleBoard.tsx:149-151`)
  — zostawiamy jak jest; to kandydat na osobną zmianę.
- **Zmian sygnatur czystych funkcji** (`generateDraft`, `findScheduleBlockers`, `computeHoles`) —
  walidacja żyje na granicy, nie wewnątrz reguły domenowej.
- **Zmian semantyki `ERROR_SCHEDULE_INCOMPLETE` i renderowania blokad w UI** — bramka zapisu
  zachowuje się dokładnie tak jak dziś dla poprawnych danych.
- **Fake timers i testów regresji zegara w trasach API** — testujemy wstrzykiwalne argumenty.
- **Progów pokrycia (coverage thresholds)** — brak narzędzia pokrycia w Fazie 1.
- **Testu martwej ścieżki** `generateDraft.holes` — produkcyjnie działa `computeHoles`
  przez `findScheduleBlockers`; decyzja: pinujemy wyłącznie semantykę produkcyjną.

## Implementation Approach

Cztery fazy, w tej kolejności:

1. **Harness** — instalacja `vitest@^4`, `vitest.config.ts` z aliasem `@/*`, skrypty `test`/`test:watch`/`check`,
   kroki w CI, aktualizacja `AGENTS.md`, jeden test-dymny. Ta faza nie dotyka kodu produkcyjnego
   i kończy się dowodem, że okablowanie działa.
2. **Walidacja kształtu na granicy API** — jedyna zmiana produkcyjna. Czyste parsery w
   `schedule-validation.ts` (wzorzec `{ data, error }`), wołane w GET/POST/PATCH **przed** wejściem
   danych do czystej logiki; porażka → `500 { error: ERROR_SERVER }`. Testy parsowania w tej samej fazie.
3. **Czysta logika czasu i tekstu** — `week.test.ts` i `schedule-export.test.ts`.
4. **Czysta logika grafiku** — `schedule-generation.test.ts`, największa suita i sedno ryzyka #2/#1.

Kolejność jest wymuszona: fazy 2–4 nie mają jak uruchomić testów bez fazy 1, a walidacja (2) idzie
przed suitami (3–4), żeby testy istniały już pod nowym, ostrzejszym zachowaniem granicy.

## Critical Implementation Details

- **Alias trzeba zadeklarować w configu runnera albo każdy import `@/…` padnie.** To nie duplikacja
  w `astro.config.mjs` (tam go nie ma), tylko drugie miejsce po `tsconfig.json:8-11`. Rozwiązać przez
  `fileURLToPath(new URL("./src", import.meta.url))`, żeby działało niezależnie od `cwd`.
- **Testy importują `describe`/`it`/`expect` jawnie z `vitest`.** Nie dodajemy `types` do `tsconfig.json`
  ani globali w ESLint — jawne importy nie wymagają żadnej konfiguracji typów i nie ruszają tsconfig.
- **ESLint będzie typował `vitest.config.ts` i pliki testowe.** `baseConfig` nie ma klucza `files`
  (`eslint.config.js:18`), a obowiązuje `strictTypeChecked`. Jeśli testy zaczną łamać reguły typowane
  (np. asercje na `unknown`), dodać **wąski blok `files: ["**/*.test.ts", "vitest.config.ts"]`**
  w `eslint.config.js` z poluzowanymi regułami — nigdy nie wyłączać reguł globalnie.
- **Walidacja musi zwracać błąd zamiast przepuścić pusty draft.** Kolejność w trasie: pobierz dane →
  zwaliduj → dopiero potem czysta logika. Wywołanie `generateDraft`/`findScheduleBlockers` przed
  walidacją odtworzyłoby dokładnie ten błąd, który ta faza zamyka.
- **`schedule-validation.ts` jest w bundlu klienta** (`ScheduleBoard.tsx:28`). Nowe parsery muszą
  pozostać czyste — żadnych importów `@supabase/*` ani `astro:*` w tym pliku.

## Phase 1: Harness — runner, skrypty, CI, test-dymny

### Overview

Wprowadzić `vitest` jako runner testów jednostkowych, skonfigurować go tak, by rozumiał alias `@/*`
i nie wymagał zmian w `tsconfig.json`, dopisać skrypty i kroki CI oraz zaktualizować dokumentację
projektu. Faza kończy się zielonym testem-dymnym, który dowodzi, że import z `@/lib/...` działa
i że CI faktycznie uruchamia testy.

### Changes Required:

#### 1. Manifest — zależność i skrypty

**File**: `package.json`

**Intent**: Dodać runner jako devDependency i wygodne wejścia do niego, tak aby `npm test` był
jednoznacznym, nieinteraktywnym poleceniem dla agenta i CI.

**Contract**: `devDependencies.vitest` = `^4` (zgodność z `vite ^7.3.2` z override'u — Astro 6.3.1
sam używa `vitest ^4.1.0`). Trzy nowe wpisy w `scripts`:
`"test": "vitest run"`, `"test:watch": "vitest"`, `"check": "astro check"`.
Brak zmian w pozostałych skryptach i w bloku `overrides`.

#### 2. Konfiguracja runnera

**File**: `vitest.config.ts` (nowy, w katalogu głównym)

**Intent**: Sprawić, by Vitest rozumiał alias `@/*`, działał w środowisku Node (bez DOM-u) i obejmował
wyłącznie pliki testów w `src/`. Świadomie nie korzystamy z `getViteConfig()` z `astro/config`,
żeby nie wiązać runnera z wewnętrznym API Astro ani nie dociągać pluginu Tailwind.

**Contract**: `defineConfig` importowany z `vitest/config`; `test.environment` = `"node"`;
`test.include` = `["src/**/*.test.ts"]`; `resolve.alias["@"]` wskazujący absolutną ścieżkę do `./src`
wyprowadzoną z `import.meta.url`. Plik jest objęty `tsconfig.json` (`include: ["**/*"]`) i ESLint.

```ts
// Shape reference — alias absolutny, nie relatywny, żeby działał niezależnie od cwd.
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

#### 3. Test-dymny

**File**: `src/lib/format.test.ts` (nowy)

**Intent**: Jedna asercja na czystej funkcji istniejącego modułu — dowód, że alias `@/*` jest
rozwiązywany, że plik testowy jest wykrywany i że `describe`/`it`/`expect` z jawnego importu działają.

**Contract**: Import `formatRange` przez `@/lib/format` oraz `describe`/`it`/`expect` z `vitest`.
Asercja na dokładny wynik `"08:00 – 16:00"` (en-dash, `src/lib/format.ts:1-3`).

#### 4. Bramki w CI

**File**: `.github/workflows/ci.yml`

**Intent**: Dołożyć typecheck i testy jednostkowe do istniejącego potoku, tak aby czerwona zmiana
nie przechodziła. `npm test` i `astro check` są oznaczone w `test-plan.md:89-90` jako wymagane
od Fazy 1.

**Contract**: Dwa nowe kroki `- run:` wstawione **po** `- run: npm run lint` (linia 20) i **przed**
`- run: npm run build` (linia 21): `- run: npm run check` oraz `- run: npm test`. Kolejność: sync →
lint → check → test → build. Blok `env` przy `npm run build` (linie 22-24) zostaje bez zmian.
Blokada gałęzi po stronie GitHuba jest poza zakresem — należy do Fazy 4 planu testów.

#### 5. Dokumentacja projektu

**File**: `AGENTS.md`

**Intent**: Usunąć nieaktualne zdanie „No test runner is configured" i wpiąć nowe komendy w sekcję
komend, żeby przyszły agent nie szukał runnera po omacku.

**Contract**: Sekcja `## Testing` (`AGENTS.md:50-52`) przestaje twierdzić, że runnera nie ma;
wymienia `npm test`, `npm run test:watch`, `npm run check` i nową kolejność bramek CI.
Sekcja `## Commands` (`AGENTS.md:20-30`) wymienia trzy nowe skrypty.

#### 6. Cookbook planu testów

**File**: `context/foundation/test-plan.md`

**Intent**: Wypełnić §6.1 placeholder „TBD" konkretną odpowiedzią na pytanie „jak dodać test
jednostkowy w tym projekcie" — to jest produkt uboczny tej fazy.

**Contract**: §6.1 (`test-plan.md:103-105`) podaje lokalizację (`src/…/<moduł>.test.ts`, obok modułu),
konwencję nazw, komendę uruchomienia (`npm test`), oraz wskaźnik do `src/lib/format.test.ts` jako
wzorzec. §3 pozostaje nietknięty — statusami w §3 zarządza `/10x-test-plan`.

### Success Criteria:

#### Automated Verification:

- Instalacja rozwiązuje jedną wersję Vite 7.x: `npm ls vite` (bez duplikatów w drzewie)
- Testy jednostkowe przechodzą: `npm test`
- Typecheck przechodzi: `npm run check`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- `npm run test:watch` przeładowuje wynik po zapisaniu zmiany w pliku testowym
- CI na PR pokazuje nowe kroki `astro check` i `npm test`, całość zielona

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Walidacja kształtu na granicy API

### Overview

Zamknąć lukę, przez którą zły kształt danych daje cichy pusty grafik i przechodzi bramkę zapisu.
Dodać czyste parsery kształtu w `schedule-validation.ts` i wywołać je w trasie API **przed**
czystą logiką. Porażka walidacji → `500 { error: ERROR_SERVER }` i brak zapisu.

### Changes Required:

#### 1. Parsery kształtu

**File**: `src/lib/services/schedule-validation.ts`

**Intent**: Dodać czyste funkcje sprawdzające całe kształty wejść grafiku (nie pojedyncze pola),
wzorowane na istniejącym `ScheduleFieldParseResult` (`:3`), ale dla całych list. Mają one wykrywać
sytuację, w której mapowanie snake_case → camelCase w warstwie serwisowej przestało działać.

**Contract**: Nowy typ `ScheduleInputParseResult<T> = { data: T; error: null } | { data: null; error: string }`
oraz pięć funkcji zwracających ten typ:

- `parseScheduleEmployees(raw)` → `{ id: string; name: string }[]` — `id` jako UUID, `name` jako niepusty string.
- `parseScheduleOpeningHours(raw)` → `DraftInput["openingHours"]` — `weekday` całkowity 1–7, `opensAt`/`closesAt` w `HH:MM`, `opensAt < closesAt`.
- `parseScheduleAvailabilities(raw)` → `DraftInput["availabilities"]` — `employeeId` UUID, `workDate` realna data, `startTime`/`endTime` w `HH:MM`, `startTime < endTime`.
- `parseScheduleAssignmentRows(raw)` → tablica wierszy snake_case z kluczami `employee_id`, `work_date`, `start_time`, `end_time` (kształt, który GET wysyła do islandy).
- `parseScheduleDraftPieces(raw)` → `DraftPiece[]` (kształt camelCase, na który PATCH mapuje wiersze bazy).

Funkcje **muszą** ponownie użyć istniejących wzorców i logiki z tego pliku (`WEEK_START_PATTERN` `:5`,
`UUID_PATTERN` `:6`, `TIME_PATTERN` `:7` oraz round-trip walidacji daty z `parseWorkDate` `:58-62`),
zamiast wprowadzać nowe regexe. Plik pozostaje czysty — bez importów `@supabase/*`/`astro:*`.
Nazwy nie mogą kolidować z istniejącymi eksportami (`parseWeekStart`, `parseAssignmentId`,
`parseEmployeeId`, `parseShiftTime`, `parseWorkDate`, `ScheduleFieldParseResult`).

#### 2. Wywołania walidacji w trasie

**File**: `src/pages/api/schedules/index.ts`

**Intent**: Sprawdzić kształt danych **między** pobraniem z bazy a wywołaniem czystej logiki.
Wcześniej dane te szły prosto do `generateDraft`/`findScheduleBlockers`, więc błąd mapowania
stawał się pustym grafkiem i zerem blokad.

**Contract**: Trzy miejsca wstawienia, każde zwraca `jsonResponse({ error: ERROR_SERVER }, 500)`:

- **GET** — po `getAvailabilitiesForWeek` (`:60-63`) i `getAssignments` (`:69-72`), przed odpowiedzią
  (`:74-81`) oraz przed wczesnym zwrotem `schedule: null` (`:65-67`): zwalidować `availabilities`
  (`parseScheduleAvailabilities`) i `assignments` (`parseScheduleAssignmentRows`).
- **POST** — po `getAvailabilitiesForWeek` (`:129-132`), **przed** `generateDraft` (`:134-138`):
  zwalidować `employees` (`parseScheduleEmployees`), `openingHours` (`parseScheduleOpeningHours`)
  i `availabilities` (`parseScheduleAvailabilities`).
- **PATCH** (gałąź `status === "saved"`) — po `getAssignments` (`:246-249`), **przed**
  `findScheduleBlockers` (`:251-261`): zwalidować `openingHours`, `availabilities` oraz
  zmapowane `DraftPiece` (`parseScheduleDraftPieces`) — walidacja ma objąć wynik mapowania
  z `:254-259`, nie surowe wiersze.

Kolejność jest wiążąca: walidacja **przed** czystą logiką. `ERROR_SERVER` (`src/lib/http.ts:25`)
jest jedyną istniejącą stałą o właściwej semantyce („awaria po naszej stronie") — nie dodajemy nowej.
Gałąź `status === "draft"` (odblokowanie) nie wymaga walidacji kształtu danych grafiku.

#### 3. Testy walidatorów

**File**: `src/lib/services/schedule-validation.test.ts` (nowy)

**Intent**: Przypiąć kontrakt każdego parsera i udowodnić, że **zły kształt daje błąd, nie pusty wynik**.

**Contract**: Dla każdego z pięciu parserów: ścieżka poprawna, brak klucza, zły typ wartości,
oraz przypadki dziedzinowe — `weekday` poza 1–7, `closesAt <= opensAt`, `endTime <= startTime`,
`employeeId` nie-UUID, data nienależąca do kalendarza (`2026-02-30`), czas bez zero-paddingu (`8:30`),
czas z sekundami (`08:00:00`). Osobny test-regresja incydentu S-04: **tablica wierszy snake_case**
(`employee_id`/`work_date`/`start_time`/`end_time`) podana do `parseScheduleAvailabilities`
zwraca `error !== null` — a nie `{ data: [] }`. Nazwa testu wprost odwołuje się do incydentu,
żeby przyszły czytelnik wiedział, że to nie jest zwykły przypadek brzegowy.

### Success Criteria:

#### Automated Verification:

- Testy walidatorów przechodzą, w tym test-regresja incydentu: `npm test`
- Typecheck przechodzi: `npm run check`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Ścieżka szczęśliwa bez regresji — logowanie kontem seeda, wejście na `/schedules`, wygenerowanie draftu, uzupełnienie dziur, zapis grafiku kończy się sukcesem tak jak przed zmianą
- Zły kształt nie dochodzi do zapisu: po wymuszeniu błędu walidacji odpowiedź to `500`, a grafik pozostaje w statusie `draft` (nie zapisuje się „pusty i kompletny")

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Czysta logika czasu i tekstu

### Overview

Pokryć testami dwie najmniejsze, w pełni czyste powierzchnie: reguły tygodnia i zamrożenia
(`week.ts`, ryzyko #3) oraz składanie tekstu dla załogi (`schedule-export.ts`, ryzyko #7).

### Changes Required:

#### 1. Testy reguł czasu

**File**: `src/lib/week.test.ts` (nowy)

**Intent**: Przypiąć arytmetykę tygodnia, granice tygodnia, semantykę zamrożenia i konwersję
strefy Europe/Warsaw na stałych datach — bez zależności od prawdziwego zegara i strefy maszyny.

**Contract**: Wywołania **z jawnymi argumentami** `now`/`reference` (`week.ts:55,59,63`) — żadnych
fake timers. Zakres: `weekStartOf` dla wszystkich siedmiu dni tygodnia (dowód, że niedziela jest
ostatnim dniem, a zwracana data jest zawsze poniedziałkiem); `isoWeekday`; `addDays` przez granicę
miesiąca, roku i na dacie przestępnej; `nextMonday` z poniedziałku zwraca **następny** poniedziałek
(`+7`); `weekdayShort`/`weekdayLong` jako literały; `formatDayLabel`/`formatWeekLabel` jako dokładne
literały (`"Pn 28.12 – Nd 03.01"`); `todayInWarsaw`/`currentWeekStart` dla instancji wokół zmiany
czasu (2026-03-29, 2026-10-25) w strefie Europe/Warsaw; `isFrozenWeek` dla tygodnia minionego,
**bieżącego** (zamrożony) i przyszłego; `RangeError` dla dat niepoprawnych (`""`, `"bogus"`,
`"2026-13-01"`). Fixtures i oczekiwane wartości — tabela w `research.md:§Czas`.

#### 2. Testy eksportu tekstu

**File**: `src/lib/services/schedule-export.test.ts` (nowy)

**Intent**: Przypiąć układ tekstu, który pracownik dostaje w Messengerze — kolejność dni, dni
nieczynne, sortowanie zmian i różnicę między wariantem z formatowaniem a bez.

**Contract**: Import z `@/lib/services/schedule-export`. Zakres: zawsze dokładnie 7 dni Pn→Nd
z `weekStart`; dzień bez wpisu w `openingHours` = `— nieczynne` **w pozycji chronologicznej**;
dzień otwarty bez zmian = sam nagłówek, bez linii zmian; wiele zmian w dniu sortowane po `startTime`;
brak nazwiska → `"—"`; tydzień pusty = nagłówek + 7× `— nieczynne`; brak końcowego newline.
Dodatkowo test porównawczy obu wariantów: `plain` nie zawiera `*` ani backticków, a struktura
linii jest identyczna w obu wariantach (nigdy regex-stripping — `schedule-text-export/plan.md:33`).
Asercje na dokładne literały (`pl-PL`, `Europe/Warsaw`), zgodnie z decyzją.

#### 3. Cookbook planu testów

**File**: `context/foundation/test-plan.md`

**Intent**: Wypełnić placeholdery §6.2 i §6.3 wzorcami, które właśnie powstały.

**Contract**: §6.2 (`test-plan.md:107-109`) → lokalizacja, nazewnictwo, test referencyjny
i komenda dla logiki czasu. §6.3 (`:111-113`) → to samo dla eksportu tekstu.
Bez zmian w §1–§5 i §7.

### Success Criteria:

#### Automated Verification:

- Testy `week.test.ts` przechodzą: `npm test`
- Testy `schedule-export.test.ts` przechodzą: `npm test`
- Typecheck przechodzi: `npm run check`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Nazwy testów czytają się jak katalog ryzyk: po samym raporcie `npm test` widać, że pokryty jest tydzień/zamrożenie (ryzyko #3) i układ tekstu (ryzyko #7)
- Asercje na dokładne literały (`Pn … – Nd …`, `— nieczynne`) są zrozumiałe dla osoby nietechnicznej i zgodne z tym, co widać w interfejsie

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Czysta logika grafiku

### Overview

Pokryć sedno ryzyka #2 i część #1: generowanie draftu, liczenie dziur i wykrywanie kolizji.
To największa suita i jedyna, w której przypadki brzegowe wprost odpowiadają scenariuszom awarii
z `test-plan.md:27-28`.

### Changes Required:

#### 1. Testy generowania i blokad

**File**: `src/lib/services/schedule-generation.test.ts` (nowy)

**Intent**: Przypiąć zachowanie produkcyjnej semantyki: `generateDraft` dla przypisań oraz
`computeHoles` + `findScheduleBlockers` dla dziur i kolizji. `generateDraft.holes` **nie** jest
testowane — produkcyjnie liczy je `computeHoles`.

**Contract**: Import z `@/lib/services/schedule-generation`. `DraftInput` i `DraftPiece` budowane
w teście jako literały camelCase (nigdy snake_case — to jest kontrakt). Zakres:

- `generateDraft` — jeden pracownik pokrywający całe okno; wybór pracownika o najdłuższym zasięgu;
  remisy rozstrzygane po `localeCompare("pl")` nazwiska, potem po `id`; dziura, gdy nikt nie pokrywa
  fragmentu okna; dostępność **poza** oknem daje pełną dziurę na okno; dzień bez wpisu w `openingHours`
  jest pomijany **bez** przypisania i **bez** dziury; pracownik z przerwą w dostępności dostaje dwa
  osobne przypisania; `availabilities: []` daje `assignments: []` **i** `holes: []` (ten kontrakt
  jest kluczowy — to jest „cichy pusty grafik", który walidacja z Fazy 2 ma wyprzedzić na granicy);
  duplikat `weekday` → wygrywa ostatni wiersz.
- `computeHoles` — scalanie nakładających się i stykających się przypisań (bez fałszywych dziur);
  przycięcie przypisań wystających poza okno; dziura wiodąca i końcowa; dni zamknięte nieobecne;
  przypisania w dniach spoza `openingHours` ignorowane.
- `findScheduleBlockers` — blokady zawierają dziury i kolizje; nakładka własna jest raportowana
  **symetrycznie** i zdeduplikowana po `kind|employeeId|workDate|startTime|endTime`; rodzaj
  `"uncovered"` dla zmiany poza dostępnością.
- `isFullyCovered` — prawda dla dostępności pokrywającej zakres, fałsz przy luce; `start >= end` → `true`.
- `findUncoveredRanges` — zwraca luki przycięte do zadanego zakresu; pusta lista gdy pokryte.
- `findSelfOverlaps` — zwraca część wspólną z innym przypisaniem tego samego pracownika w tym samym dniu.
- `isWithinOpeningHours` — `false` dla `start >= end` oraz dla dnia bez godzin otwarcia;
  `true` tylko dla zakresu w pełni zawartego w oknie (końce domknięte).

#### 2. Ledger świeżości planu testów

**File**: `context/foundation/test-plan.md`

**Intent**: Odnotować, że Faza 1 planu testów została wdrożona.

**Contract**: §8 (`test-plan.md:136-141`) — zaktualizować wiersz „Last updated"/rewizji strategii
tak, by odzwierciedlał wdrożenie Fazy 1. §3 (statusy) i §6.4 (testy integracyjne) pozostają nietknięte
— należą do `/10x-test-plan` i Fazy 2.

### Success Criteria:

#### Automated Verification:

- Testy `schedule-generation.test.ts` przechodzą: `npm test`
- Pełny zestaw testów przechodzi: `npm test`
- Typecheck przechodzi: `npm run check`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Raport `npm test` pozwala wskazać test odpowiadający każdemu z ryzyk #1 (część serwerowa), #2, #3 i #7
- Uruchomienie pełnego zestawu na świeżym klonie (po `npm ci`) nie wymaga żadnej konfiguracji środowiska ani bazy danych

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

Warstwy testów pokrywają dwie różne klasy: **(a)** nowe parsery walidacji (Faza 2) — kontrakt
wejścia granicy API, oraz **(b)** istniejącą czystą logikę (Fazy 3–4) — kontrakt reguły domenowej.

### Integration Tests:

Poza zakresem tej zmiany. Testy integracyjne na runtime Workers i testy bazy/RLS to Fazy 2 i 3
planu testów; ich scope i narzędzia są już opisane w `test-plan.md:56-57,69-70`.

### Manual Testing Steps:

**Scenariusz A — brak regresji ścieżki szczęśliwej (po Fazie 2)**

1. Punkt startowy: konto seeda właściciela (biznes z godzinami otwarcia, ~5 pracowników
   i dostępnościami wpisanymi na przyszły tydzień). Wejdź na `/schedules`.
2. Nazwa tygodnia w nagłówku powinna pokazywać **przyszły** tydzień (`Pn … – Nd …`).
   Kliknij „Wygeneruj draft".
3. Oczekiwane: siatka tygodnia wypełnia się przypisaniami; dziury (jeśli są) są widoczne
   jako puste, wyróżnione komórki; brak komunikatu o błędzie serwera.
4. Uzupełnij dziury z listy pracowników oznaczonych jako dostępni w danym dniu.
5. Kliknij „Zapisz grafik".
6. Oczekiwane: zapis kończy się sukcesem, status grafiku zmienia się na zapisany, a przycisk
   „Kopiuj" staje się dostępny. **To jest dowód braku regresji po dodaniu walidacji.**

**Scenariusz B — zły kształt danych nie zapisuje grafiku (po Fazie 2)**

1. Punkt startowy: lokalny Supabase (Docker + `supabase start` z WSL) i uruchomiony dev-server.
2. Wymuś błąd kształtu po stronie danych (np. tymczasowo w kodzie zwróć z serwisu wiersze
   z kluczami snake_case zamiast camelCase) i wywołaj `PATCH` z `{"status":"saved"}` dla
   istniejącego draftu.
3. Oczekiwane: odpowiedź `500` z komunikatem „Wystąpił błąd serwera. Spróbuj ponownie."
   oraz grafik pozostający w statusie `draft` — **nie** zapisany jako kompletny.
4. Cofnij tymczasową zmianę i powtórz krok 2.
5. Oczekiwane: przy kompletnym grafiku odpowiedź `200` i status `saved`; przy grafiku
   z dziurą odpowiedź `400` z komunikatem „Grafik nie jest kompletny…" i listą blokad.

**Scenariusz C — runner działa lokalnie (po Fazie 1)**

1. W PowerShell, w katalogu repo, uruchom `npm test`.
2. Oczekiwane: raport wypisuje pliki testowe i przechodzi bez błędów, bez potrzeby stawiania bazy.
3. Uruchom `npm run test:watch`, zmień dowolną asercję w `src/lib/format.test.ts` na błędną.
4. Oczekiwane: runner sam przeładowuje i pokazuje czerwony wynik. Cofnij zmianę.

## Performance Considerations

Bez wpływu na produkcję. `findScheduleBlockers` jest O(n²) po liczbie przypisań
(`schedule-generation.ts:354-355`), ale przy skali MVP (5 pracowników × 7 dni) to nieistotne —
suita testowa nie mierzy czasu. Nowe parsery walidacji są liniowe po długości listy i uruchamiają
się raz na żądanie.

## Migration Notes

Brak migracji bazy danych i brak zmian schematu. Walidacja jest wyłącznie runtime'owa i nie zmienia
kształtu zapisywanych danych. Jedyne zachowanie widoczne dla użytkownika, które się zmienia:
zły kształt danych przestaje być cichym sukcesem i staje się błędem `500` — co jest zamierzone.

Jeśli po wdrożeniu Fazy 2 pojawi się `500 ERROR_SERVER` na ścieżce grafiku, to **nie** jest regresja,
lecz sygnał, że któryś z fetcherów w `src/lib/services/schedule.ts`/`business.ts` przestał mapować
snake_case → camelCase. Diagnostykę zaczyna się od `getAvailabilitiesForWeek`
(`schedule.ts:114-122`) i `toOpeningHoursDays` (`business.ts:23-29`).

## References

- Research: `context/changes/testing-core-logic/research.md`
- Plan testów (Faza 1, ryzyka #2/#3/#7, §4 stos, §5 bramki, §6 cookbook): `context/foundation/test-plan.md`
- Lekcja o rozjeździe kształtu danych i bramce `astro check`: `context/foundation/lessons.md:53-57`
- Lekcja o wspólnych helperach endpointów: `context/foundation/lessons.md:5-13`
- Wzorzec walidacji do naśladowania: `src/pages/api/schedules/index.ts:30-36`
- Istniejące parsery i wzorce: `src/lib/services/schedule-validation.ts:3-11`
- Kontrakt układu tekstu eksportu: `context/archive/2026-09-13-schedule-text-export/plan.md:110`
- Kontrakt bramki zapisu: `context/archive/2026-09-13-save-complete-schedule/plan.md:78-99`
- Konfiguracja aliasu (tylko TS): `tsconfig.json:8-11`
- Bramki CI do rozszerzenia: `.github/workflows/ci.yml:18-24`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Harness — runner, skrypty, CI, test-dymny

#### Automated

- [x] 1.1 Instalacja rozwiązuje jedną wersję Vite 7.x (`npm ls vite`) — 2e05eee
- [x] 1.2 Testy jednostkowe przechodzą (`npm test`) — 2e05eee
- [x] 1.3 Typecheck przechodzi (`npm run check`) — 2e05eee
- [x] 1.4 Lint przechodzi (`npm run lint`) — 2e05eee
- [x] 1.5 Build przechodzi (`npm run build`) — 2e05eee

#### Manual

- [x] 1.6 `npm run test:watch` przeładowuje wynik po zapisie pliku testowego — 2e05eee
- [x] 1.7 CI na PR pokazuje nowe kroki `astro check` i `npm test` — 2e05eee

### Phase 2: Walidacja kształtu na granicy API

#### Automated

- [x] 2.1 Testy walidatorów przechodzą, w tym test-regresja incydentu S-04 (`npm test`) — 855dc84
- [x] 2.2 Typecheck przechodzi (`npm run check`) — 855dc84
- [x] 2.3 Lint przechodzi (`npm run lint`) — 855dc84
- [x] 2.4 Build przechodzi (`npm run build`) — 855dc84

#### Manual

- [x] 2.5 Ścieżka szczęśliwa bez regresji — generowanie i zapis grafiku kończą się sukcesem — 855dc84
- [x] 2.6 Zły kształt daje `500` i nie zapisuje grafiku (status pozostaje `draft`) — 855dc84

### Phase 3: Czysta logika czasu i tekstu

#### Automated

- [x] 3.1 Testy `week.test.ts` przechodzą (`npm test`) — f02d666
- [x] 3.2 Testy `schedule-export.test.ts` przechodzą (`npm test`) — f02d666
- [x] 3.3 Typecheck przechodzi (`npm run check`) — f02d666
- [x] 3.4 Lint przechodzi (`npm run lint`) — f02d666

#### Manual

- [x] 3.5 Nazwy testów czytają się jak katalog ryzyk #3 i #7 — f02d666
- [x] 3.6 Asercje na dokładne literały są zgodne z tym, co widać w interfejsie — f02d666

### Phase 4: Czysta logika grafiku

#### Automated

- [x] 4.1 Testy `schedule-generation.test.ts` przechodzą (`npm test`) — ea62c9a
- [x] 4.2 Pełny zestaw testów przechodzi (`npm test`) — ea62c9a
- [x] 4.3 Typecheck przechodzi (`npm run check`) — ea62c9a
- [x] 4.4 Lint przechodzi (`npm run lint`) — ea62c9a
- [x] 4.5 Build przechodzi (`npm run build`) — ea62c9a

#### Manual

- [x] 4.6 Raport `npm test` pozwala wskazać test dla każdego z ryzyk #1 (serwer), #2, #3, #7 — ea62c9a
- [x] 4.7 Pełny zestaw na świeżym klonie nie wymaga konfiguracji środowiska ani bazy — ea62c9a
