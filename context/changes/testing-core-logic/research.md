---
date: 2026-09-14T00:49:23+02:00
researcher: Gabriela Władowska
git_commit: 8ecc8d9de1e2f6898fe4688c59c9d190ced39ea5
branch: master
repository: JanuszexGrafikPro
topic: "Faza 1 planu testów: uruchomienie testów + czysta logika grafiku i czasu"
tags: [research, codebase, schedule-generation, week, schedule-export, schedule-validation, test-runner, vitest]
status: complete
last_updated: 2026-09-14
last_updated_by: Gabriela Władowska
---

# Research: Faza 1 planu testów — uruchomienie testów + czysta logika grafiku i czasu

**Date**: 2026-09-14T00:49:23+02:00
**Researcher**: Gabriela Władowska
**Git Commit**: 8ecc8d9de1e2f6898fe4688c59c9d190ced39ea5
**Branch**: master
**Repository**: JanuszexGrafikPro

> Uwaga o odnośnikach: HEAD (`8ecc8d9`) nie jest wypchnięty na `origin/master` (`bb9286f`), więc
> permalinki GitHub prowadziłyby do 404. Wszystkie odnośniki są lokalne (`ścieżka:linia`), co jest
> wystarczające dla planu i implementacji.

## Research Question

Research dla zmiany `testing-core-logic` — **Faza 1** z `context/foundation/test-plan.md:55`
("Uruchomienie testów + czysta logika grafiku i czasu"), obejmującej ryzyka **#2, #3, #7 i część #1**.
Zakres: tylko Faza 1 (testy API/Workers, pgTAP i CI — Fazy 2–4 — poza zakresem). Głębokość:
jedno i drugie — (a) jak uruchomić runner testów w tym projekcie oraz (b) inwentarz czystej logiki
z kontraktami danych i przypadkami brzegowymi. Wynik: pełny `research.md` pod `/10x-plan`.

Pytanie badawcze w jednym zdaniu: **jaki jest minimalny, wierny rzeczywistości zestaw konfiguracji
i przypadków testowych, który uruchomi testy jednostkowe i pokryje czystą logikę grafiku, czasu
i tekstu — bez mockowania frameworka?**

## Summary

1. **W repo nie ma żadnego runnera testów** — brak pakietu (`vitest`/`jest`/`mocha`/`@cloudflare/vitest-pool-workers`
   nie występują w `package.json`, lockfile ani `node_modules`), brak configu, brak plików testowych,
   brak skryptu `test` i brak kroku testowego w CI (`package.json:5-14`, `.github/workflows/ci.yml:18-24`).
   `node:test` istnieje w Node 22, ale nic go nie wywołuje.

2. **Wybrany stos z planu (Vitest) jest wykonalny i tani**, bo docelowa logika Fazy 1 jest **całkowicie
   czysta**. Wszystkie kluczowe moduły (`week.ts`, `format.ts`, `schedule-generation.ts`,
   `schedule-validation.ts`, `schedule-export.ts`, `business-validation.ts`, `availability-validation.ts`)
   nie mają ani jednego importu runtime z frameworka — framework wchodzi do nich wyłącznie jako `import type`
   (erased przez `verbatimModuleSyntax`). Nie potrzeba `jsdom`, `happy-dom` ani `@cloudflare/vitest-pool-workers`.

3. **Trzy rzeczy trzeba dorobić po stronie konfiguracji**: (a) rozwiązywanie aliasu `@/*` — dziś istnieje
   **wyłącznie w TypeScript** (`tsconfig.json:8-11`), a `astro.config.mjs:17-19` nie definiuje
   `vite.resolve.alias`, więc runner musi zmapować alias sam; (b) glob obejmujący `src/**/*.test.ts`
   (`tsconfig.json:3` `include: ["**/*"]` już go łapie) i skrypt `test`; (c) typy globali testowych
   (`describe`/`it`/`expect`) — `eslint.config.js` nie ma żadnej konfiguracji dla plików testowych.

4. **Kluczowa masa testowa to trzy moduły**: `schedule-generation.ts` (obsada, dziury, kolizje — 7 eksportów,
   wszystkie czyste), `week.ts` (tydzień, zamrożenie, Europe/Warsaw — 11 eksportów) i `schedule-export.ts`
   (tekst dla załogi — 2 eksporty). Razem ~20 funkcji, żadna nie wymaga mocka.

5. **Najbardziej niedoceniony obszar to „cicha” awaria kształtu danych** (ryzyko #2). Czysta logika
   **nie waliduje kształtu i nie rzuca błędem dla złych wartości** — wiersz snake_case podany jako
   `DraftInput["availabilities"]` daje `workDate === undefined` → `continue` → **pusty grafik i zero dziur**,
   czyli dokładnie scenariusz „błąd ukryty za pustym ekranem" z `test-plan.md:42`. Co gorsza, taki pusty
   draft **przechodzi bramkę zapisu**, bo blokady są przeliczane z tych samych, wadliwych danych
   (`src/pages/api/schedules/index.ts:251-264`).

6. **Pułapka „dzisiaj”**: jedyne deterministyczne wejście zegara to `now`/`reference` w `week.ts:55,59,63`,
   ale **każde produkcyjne wywołanie je pomija** (`src/pages/api/schedules/index.ts:107,277`,
   `src/lib/services/availability-guard.ts:13`) — więc testy muszą albo podać argument jawnie, albo
   użyć fake timers. To najważniejsza decyzja projektowa Fazy 1.

7. **Przypadki brzegowe są dobrze zmapowane przez trzy niezależne źródła**: kod (gałęzie `if`/`continue`),
   zachowane plany archiwalne (kontrakty z Faz 1) i lekcje (`context/foundation/lessons.md:53-57`).
   Zidentyfikowano 20 przypadków dla grafiku, ~13 dla czasu i 8 dla eksportu tekstu (sekcje poniżej).

8. **Ustalona kolejność wartości**: `computeHoles` (czysta, ale bez zewnętrznych konsumentów!),
   `generateDraft` (konsumuje tylko `src/pages/api/schedules/index.ts:134`), `buildScheduleText`
   (konsumuje tylko `ScheduleBoard.tsx:601-608`). Wszystkie trzy są gotowe do testu bez refaktoru —
   autor logiki napisał je świadomie jako czyste „gotowe do przyszłych testów"
   (`context/archive/2026-09-13-schedule-draft-generation/plan.md:41`).

## Detailed Findings

### 1. Stan wyjściowy — czego dziś brakuje

Zweryfikowane brak, nie „prawdopodobnie brak":

| Element | Stan | Dowód |
|---------|------|-------|
| Pakiet runnera | brak | brak w `package.json`, `package-lock.json`, `node_modules/**` |
| Pliki `*.test.ts` / `*.spec.ts` / `__tests__/` | brak | glob repo-wide — zero trafień |
| Config runnera (`vitest.config.*` itp.) | brak | glob repo-wide — zero trafień |
| Skrypt `test` | brak | `package.json:5-14` |
| Krok testowy w CI | brak | `.github/workflows/ci.yml:18-24` (tylko `astro sync` + `lint` + `build`) |
| Typy globali testowych | brak | `eslint.config.js` — jedyne `globals` to `window`/`document` |
| `@types/node` | nie zadeklarowany (transytywnie v25.6.2) | `package-lock.json:3293` |

Istniejący gate jakości to `npx astro sync` + `npm run lint` + `npm run build`. Lekcja
`lessons.md:53-57` opisuje, dlaczego to za mało: rozjazd kontraktu typów między serwisem, czystą logiką
i islandą **przeszedł wszystkie trzy bramki** i wyszedł dopiero w ręcznych scenariuszach E2E
(pusty draft, fałszywe całodzienne dziury). To jest bezpośrednie uzasadnienie Fazy 1.

### 2. Powierzchnia konfiguracji, którą runner musi zdefiniować

Cztery fakty, nie rekomendacje:

1. **Alias `@/*` → `./src/*`** deklaruje wyłącznie `tsconfig.json:8-11` (`baseUrl: "."`). Nie ma
   odpowiednika w Vite (`astro.config.mjs:17-19` ma tylko `tailwindcss()`), brak `vite-tsconfig-paths`.
   Runner musi więc zmapować alias sam.
2. **Glob plików testowych**: `tsconfig.json:3` ma `include: ["**/*"]` i `exclude: ["dist"]`, więc
   przyszłe `src/**/*.test.ts` **już są w projekcie TS**. `eslint.config.js` używa `projectService: true`
   (`:21-24`), więc typowane lintowanie obejmie je bez zmian.
3. **Typy globali**: `tsconfig.json` nie ma tablicy `types`. `describe`/`it`/`expect` nie są nigdzie
   zadeklarowane — trzeba albo importować jawnie z runnera, albo dodać typy globali.
4. **Środowisko**: Node, bez DOM. `jsdom`/`happy-dom` nie istnieje w repo (i nie jest potrzebne —
   patrz §3).

Pułapka środowiskowa: `astro:env/server` ma **tylko deklarację typów** (`.astro/env.d.ts:1-4`), bez
implementacji runtime. Moduły `src/lib/config-status.ts:1`, `src/lib/supabase.ts:3` i `src/lib/api.ts:1`
zaimportują go i test by się wywalił — ale te moduły są **poza** zakresem Fazy 1 (klasa c, patrz §3).

### 3. Klasy czystości — która logika nadaje się do testu bez mocka

Klasyfikacja każdego pliku pod `src/lib/**` i `src/lib/services/**`:

**(a) Czyste / bez zależności runtime** — testowalne wprost, bez żadnej konfiguracji:
`week.ts`, `format.ts`, `http.ts` (używa tylko globali `Request`/`Response`), `database.types.ts` (typy),
`services/business-validation.ts`, `services/employee-validation.ts`.

**(a′) Prawie czyste** — zależność zewnętrzna, ale nie frameworkowa:
`utils.ts` (`clsx`, `tailwind-merge`), `services/types.ts` (`@supabase/supabase-js` — **tylko typ**).

**(b) Importują wyłącznie inne moduły `src/lib`** — ładują się w czystym Node ESM i są testowalne:
`services/schedule-generation.ts`, `services/schedule-validation.ts`, `services/schedule-export.ts`,
`services/schedule-archive.ts`, `services/business.ts`, `services/availability.ts`,
`services/availability-validation.ts`, `services/availability-guard.ts`, `services/employee.ts`,
`services/schedule.ts`.

Kluczowa własność klasy (b): **wszystkie odwołania do klienta Supabase są `import type`** (np.
`schedule.ts:5`, `business.ts:2`, `availability.ts:3`), więc runtime-owo moduły są czyste. Funkcje
dotykające bazy przyjmują klienta jako **parametr** (`type Supabase = NonNullable<ReturnType<typeof createClient>>`,
`schedule.ts:9`) — testowalne tylko z fake/mockiem, co jest pracą Fazy 2, nie Fazy 1.

**(c) Framework-bound — poza zakresem Fazy 1**: `supabase.ts` (`@supabase/ssr`, `astro:env/server`),
`config-status.ts` (`astro:env/server`), `api.ts` (`astro` `APIContext`, `createClient`).

**Wniosek dla Fazy 1**: celuj w klasy (a) i (b). Zero mocków frameworka, zero DOM, zero Workers runtime.

### 4. Czysta logika grafiku — `src/lib/services/schedule-generation.ts`

To rdzeń Fazy 1. Importuje tylko `addDays, isoWeekday` z `@/lib/week` (`:1`) — sam czysty. **Wszystkie
7 eksportów jest czystych** i nie ma stanu modułowego trwałego między wywołaniami.

| Funkcja | Linia | Sygnatura skrótowo |
|---------|-------|--------------------|
| `generateDraft` | `:142` | `(input: DraftInput) => { assignments: DraftPiece[]; holes: DraftHole[] }` |
| `computeHoles` | `:193-197` | `(openingHours, assignments, weekStart) => DraftHole[]` |
| `isFullyCovered` | `:230-236` | `(availabilities, employeeId, workDate, start, end) => boolean` |
| `findUncoveredRanges` | `:257-263` | `(availabilities, employeeId, workDate, startTime, endTime) => {startTime,endTime}[]` |
| `findSelfOverlaps` | `:289-292` | `(assignments, target) => {startTime,endTime}[]` |
| `isWithinOpeningHours` | `:307-312` | `(openingHours, weekday, startTime, endTime) => boolean` |
| `findScheduleBlockers` | `:336-341` | `(openingHours, availabilities, assignments, weekStart) => ScheduleBlockers` |

Kontrakty wejścia/wyjścia (camelCase) — `DraftInput` `:3-7`, `DraftPiece` `:9-14`, `DraftHole` `:16`,
`ScheduleCollision` `:323-329`, `ScheduleBlockers` `:331-334`.

**Model czasu**: wszystkie porównania to **leksykograficzne porównanie stringów `HH:MM`**
(`:23-37`, `:110`, `:214-223`, `:313-320`). Zero arytmetyki minutowej. Poprawność milcząco zależy od
niezmiennika zero-paddingu — a sam moduł go **nie egzekwuje** (normalizacja żyje w `business.ts:19-21`).
Przedziały są **półotwarte**: `interval.start <= cursor && cursor < interval.end` (`:110`).

**Algorytm `generateDraft`** (`:142-191`), krok po kroku:
1. `employeesById` (`:143`) i `windowByWeekday` (`:144-146`) — przy duplikacie `weekday` wygrywa **ostatni wiersz**.
2. Grupowanie dostępności do `Map<workDate, Map<employeeId, Interval[]>>` (`:148-161`).
3. Iteracja posortowanych dat (`:165`); brak godziny otwarcia dla dnia → **`continue`, dzień w ogóle pominięty**
   (`:166-169`) — bez przypisania i bez dziury.
4. `generateDay` (`:88-140`) — zachłannie, „najdłuższy zasięg najpierw": `cursor` idzie od `window.start`;
   zwycięzcą jest pracownik, którego scalony przedział zawiera `cursor`, a przy remisie: dłuższe `end`,
   potem `localeCompare("pl")` po nazwisku, potem mniejsze `id` (`:69-86`). Brak zwycięzcy → dziura do
   najbliższego `start` innego pracownika, albo do końca okna (`:126-136`).
5. Sortowanie końcowe: `workDate`, potem `startTime`, leksykograficznie (`:180-188`).

Skutki uboczne warte przypięcia testem: pracownik z **przerwą** w dostępności dostaje **wiele** przypisań
w jednym dniu; pracownik z listy `employees`, ale bez dostępności, nie pojawia się wcale; pracownik
obecny w dostępnościach, a nieobecny w `employees`, **nadal dostaje przypisanie** z nazwą `""` (`:79-80`).

**`computeHoles`** (`:193-228`) liczy dziury **niezależnie od dostępności** — wyłącznie z bieżących
przypisań i godzin otwarcia. To znaczy, że istnieją **dwie różne semantyki dziur**: `generateDraft` pomija
dni bez dostępności, `computeHoles` generuje dla nich pełne dziury, jeśli dzień jest w `openingHours`.
Rozjazd jest znany i udokumentowany (`context/archive/2026-09-13-schedule-draft-generation/reviews/impl-review.md:87-95`);
**test musi nazwać, którą semantykę pinuje**. Uwaga: `computeHoles` jest eksportowana, ale **nie ma
zewnętrznych konsumentów** — woła ją tylko `findScheduleBlockers` (`:342`).

**`isFullyCovered`** (`:230-255`) — pułapka: dla `start >= end` zwraca `true` (pętla pominięta,
`cursor >= end` prawdziwe, `:254`).

**`findSelfOverlaps`** jest **symetryczne** — tę samą nakładkę raportuje dla obu wierszy pary, stąd dedup
po kluczu `kind|employeeId|workDate|startTime|endTime` w `findScheduleBlockers` (`:347`).

### 5. Reguły czasu — `src/lib/week.ts`

Moduł 65 linii, 11 eksportów, wszystkie czyste. Miesza trzy mechanizmy czasu — **względem siebie spójne**:

- **A. UTC do arytmetyki tygodnia**: `parseUtcDate` (`:9-11`) buduje `T00:00:00Z`, `formatIsoDate` (`:13-15`)
  tnie `toISOString()`, a `addDays` używa `setUTCDate`/`getUTCDate` (`:17-21`). Ponieważ instancja jest
  przypięta do północy UTC, `getUTCDay()` to **dzień kalendarzowy samego stringa ISO** — niezależny
  od strefy maszyny i od zmiany czasu.
- **B. Europe/Warsaw do „jaka jest dziś data" i etykiet**: formatery budowane raz na poziomie modułu —
  `new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", timeZone: "Europe/Warsaw" })`
  (`:5`) i `new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" })` (`:7`).
- **C. Potencjalne rozjazdy**: brak. `formatDayLabel` dostaje instancję północy UTC, a Warszawa jest
  przed UTC (+1/+2), więc data nigdy się nie cofa. Jedyne miejsce świadomej konwersji to `todayInWarsaw` (`:56`).
  W module **nie występuje** żadna lokalno-strefowa metoda (`getDay`, `setDate`, `toLocaleDateString` bez `timeZone`).

**Tydzień zaczyna się w poniedziałek** — dowiedzione z `weekStartOf` (`:33-37`): `(getUTCDay()+6)%7`
daje 0 dla poniedziałku i 6 dla niedzieli, więc niedziela jest **ostatnim** dniem tygodnia, nie pierwszym.
Baza potwierdza to niezależnie: `supabase/migrations/20260912141307_domain_schema.sql:104`
(`check (extract(isodow from week_start) = 1)`). Etykieta `formatWeekLabel` (`:51-53`) hardkoduje `Pn`/`Nd`
— jest poprawna **wyłącznie dlatego**, że `weekStartOf` zawsze zwraca poniedziałek; to warto przypiąć testem.

**`nextMonday` zwraca poniedziałek *ściśle następny*** — gdy `from` jest poniedziałkiem, wzór `(8-d)%7 || 7`
daje `+7` (`:23-27`). Wpływ: SSR domyślnie pokazuje **przyszły** tydzień także w poniedziałek.

**Zamrożenie**: `isFrozenWeek(weekStart, reference = currentWeekStart())` → `weekStart <= reference`
(`:63-65`). Czyli **bieżący tydzień jest zamrożony**, nie tylko minione. Potwierdza to komunikat
`src/lib/http.ts:19-20`. Egzekwowane w:
`src/pages/api/schedules/index.ts:107-109` (POST draft) i `:277-279` (PATCH unlock) — oba z **ukrytym zegarem**;
`src/lib/services/availability-guard.ts:12-32` (**ukryty zegar**, `:13`);
`src/pages/api/availabilities/index.ts:113-124` (przez `resolveWeekGuard`);
trigger bazy `20260913212151_enforce_availability_week_writes.sql:12` (`date_trunc('week', now() at time zone 'Europe/Warsaw')` — autorytatywne, liczone w SQL);
UI w `ScheduleBoard.tsx:584` i `AvailabilityManager.tsx:291-293` (**reimplementuje `<=`**, nie importuje `isFrozenWeek`).
**Ścieżka `assignments.ts` nie sprawdza daty wcale** — jej bramką jest status `draft` (`:82-91`).

**Wstrzykiwanie zegara to decyzja projektowa Fazy 1**: `todayInWarsaw(now)`/`currentWeekStart(now)`/
`isFrozenWeek(weekStart, reference)` przyjmują argument, ale **żaden produkcyjny caller go nie podaje**.
Testowanie API/SSR wymagałoby fake timers; testowanie samego `week.ts` jest w pełni deterministyczne.

### 6. Eksport tekstu — `src/lib/services/schedule-export.ts`

Dwa eksporty, oba czyste: `buildScheduleDays` (`:29`) → dokładnie 7 dni Pn→Nd z `weekStart`,
`buildScheduleText` (`:90`) → `{ formatted, plain }`. Input `ScheduleExportInput` (`:16-21`) jest camelCase;
`assignments` to `DraftPiece[]` konwertowane z wierszy snake_case w islandzie (`ScheduleBoard.tsx:149-151`).

Reguły wyjścia:
- Pętla `offset 0..6` (`:33-41`); brak wpisu w `openingHours` dla dnia = **zamknięte**, ale **w pozycji
  chronologicznej**, nie na końcu (`:38-41`).
- Zmiany w dniu sortowane po `startTime` przez `localeCompare` **bez locale** (`:25-27`) — remisy bez tie-breaka.
- Układ: nagłówek `formatWeekLabel`, potem pusty wiersz i blok każdego dnia (`:70-87`);
  dzień otwarty = pogrubiona etykieta + `Nazwa · HH:MM – HH:MM`; dzień zamknięty = jedna linia
  `Label — nieczynne` (`:76-79`); brak końcowego newline (`join("\n")`, `:87`).
- Brak nazwiska pracownika → `"—"` (`:23,46`).
- **Zero przypisań jest legalne** — wszystkie 7 dni renderuje się jako zamknięte (kontrakt
  `context/archive/2026-09-13-schedule-text-export/plan.md:110`, scenariusz manualny G.3 `:215`).

**Dwa warianty, jedno źródło struktury** — `formatted` vs `plain` różnią się wyłącznie przełącznikiem
`bold`/`mono` (`:67-68`, `:93-94`). **Nigdy nie odcinanie znaczników regexem** — to świadoma decyzja
z `2026-09-13-schedule-text-export/plan.md:33`. Oba warianty zawierają `·`, `–` i `—`; tylko `formatted`
dodaje `*` i backticki.

Pułapka kształtu danych (znany incydent, `lessons.md:53-57`): gdyby surowy wiersz snake_case trafił tutaj,
filtr `assignment.workDate === workDate` (`:44`) **odrzuciłby wszystkie przypisania**, renderując wszystkie
dni otwarte jako puste nagłówki. `buildScheduleDays` nie broni się przed tym — test powinien albo podawać
wyłącznie camelCase, albo jawnie przypiąć to zachowanie jako dowód incydentu.

### 7. Sygnalizacja błędów — dlaczego to jest sedno ryzyka #2

To najbardziej wartościowe znalezisko dla planu. Czysta logika **nie waliduje kształtu**:

- Wiersz snake_case jako `DraftInput["availabilities"]` → `workDate = row.work_date` = `undefined` →
  `isoWeekday(undefined)` = `NaN` → trafienie w okno nie następuje (`:166`) → `continue` (`:167-169`) →
  **`assignments: []` i `holes: []`**. Bez wyjątku, bez błędu. Dokładnie „pusty grafik" z `test-plan.md:28`.
- `undefined` pod `availabilities` → `TypeError` na `.map` (`:149`) — jedyna ścieżka rzucająca, ale to
  nieobsłużony crash, nie komunikat dla użytkownika (poskutkuje `ERROR_SERVER` z `http.ts:25`).
- Niezerowany czas `"9:00"` → leksykograficznie `"9:00" > "08:00"` → **cicha** błędna kolejność/dziury (`:23-37`).
- Granica klient/serwer jest **tylko rzutowaniem, nie walidacją**: `extractWeekData` sprawdza wyłącznie
  `Array.isArray` i rzutuje `as DraftInput["availabilities"]` (`ScheduleBoard.tsx:80-88`).

Konsekwencja krytyczna: ponieważ `findScheduleBlockers` **przelicza** blokady z tych samych danych
(`src/pages/api/schedules/index.ts:251-261`), pusty draft z wadliwych danych **przechodzi bramkę zapisu**
z zerem blokad. Rozróżnienie „odczyt się nie udał" (→ 500) od „odczyt się udał, ale kształt jest zły"
(→ cicha awaria) jest dziś niewidoczne. Test Fazy 1 powinien to przypiąć jako kontrakt: zły kształt
musi dać **obserwowalny** wynik (pusty + zero dziur to stan do wykrycia), a nie zostać uznany za sukces.

### 8. Przypadki brzegowe do przypięcia (skondensowane)

**Grafik (`schedule-generation.ts`)** — 20 przypadków; najważniejsze:
`availabilities: []` → pusty draft i **zero dziur** (zapisywalny!); dzień otwarty bez wiersza dostępności →
`continue`, brak dziury („ciche zniknięcie dziury"); dostępność **poza** oknem → pełna dziura na okno;
dostępność **równa** oknu → jedno przypisanie bez dziur; zerowa długość (`start == end`) → odrzucone przez
`clipIntervals` (`:62`); duplikaty → scalone (`:39-55`); duplikat `weekday` w `openingHours` → w generatorze
wygrywa ostatni, w `computeHoles` przetworzone **oba**; `"8:30"` → cicha korupcja; okno przez północ
(`22:00–02:00`) → nieobsługiwane; `start >= end` do `isFullyCovered` → `true`.

**Czas (`week.ts`)** — fixtures (wszystkie zweryfikowane wzorami):

| Fixture | `weekStartOf` | `isoWeekday` | Inne |
|---------|---------------|--------------|------|
| `2026-01-01` (czw) | `2025-12-29` | 4 | tydzień przechodzi przez rok |
| `2026-01-04` (nd) | `2025-12-29` | 7 | niedziela = ostatni dzień |
| `2026-03-29` (nd, DST PL) | `2026-03-23` | 7 | `nextMonday` = `2026-03-30` |
| `2026-03-30` (pon) | `2026-03-30` | 1 | `nextMonday` = `2026-04-06` (**nie** ona sama) |
| `2026-10-25` (nd, DST PL) | `2026-10-19` | 7 | `nextMonday` = `2026-10-26` |
| `2026-12-31` (czw) | `2026-12-28` | 4 | `addDays(...,1)` = `2027-01-01` |
| `2028-02-29` (wt) | `2028-02-28` | 2 | `addDays(...,1)` = `2028-03-01` |
| `"2026-02-30"`, `""`, `"bogus"` | — | — | `week.ts` rzuca `RangeError` (brak walidacji) |

Zmiana czasu jest **nieistotna dla arytmetyki** (wszystko UTC), ale warto ją przypiąć jako dowód
niezależności od strefy maszyny. Walidatory w `schedule-validation.ts:21-25,58-62` i
`availability-validation.ts:22-24` odrzucają złe daty **przed** wejściem w `week.ts` (round-trip
`toISOString().slice(0,10) === value`).

**Eksport (`schedule-export.ts`)** — 8 przypadków: pusty grafik → 7× `— nieczynne` (legalny);
dzień otwarty bez zmian → **nagłówek bez linii zmian** (nieosiągalny w *zapisanym* grafiku, bo dziura
blokuje zapis — `reviews/impl-review.md:23`); brak nazwiska → `"—"`; brak czasu → `"undefined – undefined"`
(brak guardu, `format.ts:1-2`); wiele zmian w dniu → sort po `startTime`, remisy zależne od stabilności sortu;
zmiana przez północ → renderowana bez obsługi (domena zabrania: `business-validation.ts:101-104`).

### 9. Pułapki testowalności (do zaadresowania w planie)

1. **Ukryty zegar** w `api/schedules/index.ts:107,277` i `availability-guard.ts:13` — test tych ścieżek
   wymaga fake timers; sam `week.ts` testuje się deterministycznie przez argumenty.
2. **Zależność od ICU**: `Intl` z locale `"pl-PL"`/`"en-CA"` (`week.ts:5,7`) i `localeCompare("pl")`
   (`schedule-generation.ts:81`) oraz `localeCompare()` bez locale (`schedule-export.ts:26`).
   Node 22 z pełnym ICU działa; minimalne ICU mogłoby zmienić wyjście.
3. **Leksykograficzna arytmetyka** — każdy test podający `"9:00"` dostanie cichą korupcję; niezmiennik
   zero-paddingu egzekwują wyłącznie parsery (`schedule-validation.ts:7`, `business-validation.ts:27`).
4. **Funkcje prywatne** (`compareIntervals`, `mergeIntervals`, `clipIntervals`, `isPreferredCandidate`,
   `generateDay` — `:23-140`) nie są eksportowane; testujemy je wyłącznie tranzytywnie.
5. **Kolejność wstawiania do `Map`** (`:148-161`) — wynik jest deterministyczny dzięki tie-breakom
   (`:76-85`), ale równość wyniku dla różnych kolejności wejścia warto zweryfikować, nie założyć.
6. **`computeHoles` bez konsumentów** — test może ją wołać wprost, ale to nie odzwierciedla przepływu
   produkcyjnego (produkcyjnie liczy `findScheduleBlockers`).
7. **Klient Supabase jako typ niestrukturalny** (`schedule.ts:9`) — mocki dla Fazy 2 będą wymagały pełnego
   łańcucha buildera PostgREST; teraz poza zakresem.

## Code References

- `src/lib/services/schedule-generation.ts:142` — `generateDraft`, główny generator draftu
- `src/lib/services/schedule-generation.ts:193-228` — `computeHoles`, druga semantyka dziur
- `src/lib/services/schedule-generation.ts:336-382` — `findScheduleBlockers`, bramka zapisu (blokady)
- `src/lib/services/schedule-generation.ts:23-67` — prywatne `compareIntervals`/`mergeIntervals`/`clipIntervals`
- `src/lib/week.ts:33-37` — `weekStartOf`, dowód poniedziałku jako początku tygodnia
- `src/lib/week.ts:55-65` — jedyne wstrzykiwalne wejście zegara (`now`, `reference`)
- `src/lib/week.ts:63-65` — `isFrozenWeek`, bieżący tydzień też zamrożony
- `src/lib/services/schedule-export.ts:29` — `buildScheduleDays`, 7 dni Pn→Nd
- `src/lib/services/schedule-export.ts:66-88` — `buildVariant`, układ tekstu i przełącznik `bold`/`mono`
- `src/lib/services/schedule-validation.ts:5-7` — wzorce `WEEK_START`/`UUID`/`TIME`
- `src/lib/services/business.ts:19-29` — `normalizeTime`, `toOpeningHoursDays` (granica snake→camel)
- `src/lib/services/business-validation.ts:101-104` — zakaz godzin przez północ
- `src/pages/api/schedules/index.ts:107` / `:277` — zamrożenie z ukrytym zegarem
- `src/pages/api/schedules/index.ts:251-264` — bramka zapisu przeliczająca blokady z tych samych danych
- `src/components/schedules/ScheduleBoard.tsx:149-151` — `toDraftPiece`, guard snake→camel
- `src/components/schedules/ScheduleBoard.tsx:80-88` — `extractWeekData`, rzutowanie bez walidacji
- `tsconfig.json:3-11` — `include: ["**/*"]` i alias `@/*` (tylko TS)
- `.github/workflows/ci.yml:18-24` — istniejące bramki (bez testów)
- `context/foundation/lessons.md:53-57` — lekcja: `astro check` + jawna granica snake→camel

## Architecture Insights

1. **Czysta logika jest tu realną, nie życzeniową architekturą.** Autor pisał generator, blokady i eksport
   świadomie jako bezwywołaniowe, „gotowe do przyszłych testów" (`schedule-draft-generation/plan.md:41`,
   `save-complete-schedule/plan.md:230`). Fazę 1 da się zrobić **bez refaktoru** — wystarczy runner.
2. **Granica snake_case/camelCase jest ręczna, per-miejsce i nigdzie nie walidowana.** Mapowanie żyje
   w `getAvailabilitiesForWeek` (`schedule.ts:114-122`), `toOpeningHoursDays` (`business.ts:23-29`),
   `toDraftPiece` (`ScheduleBoard.tsx:149-151`), `parseOpeningHoursSnapshot` (`schedule-archive.ts:14-21`).
   Istnieją **dwa różne fetchery dostępności o różnych kształtach** (`schedule.ts:97` camelCase vs
   `availability.ts:18` snake_case) — to jest strukturalne źródło ryzyka #2.
3. **Istnieją dwie niezależne implementacje zamrożenia** (TS `isFrozenWeek` i SQL trigger) plus **trzecia**
   w UI (`ScheduleBoard.tsx:584` reimplementuje `<=`). Trzy źródła prawdy dla jednej reguły.
4. **Istnieją dwie semantyki dziur** (`generateDraft` vs `computeHoles`) i produkcyjnie działa ta druga,
   mimo że pierwsza jest tą „zwracaną" przez generator. Generowane `holes` z `generateDraft` są w praktyce
   nieużywane.
5. **Arytmetyka czasu opiera się na niezmienniku stringów**, egzekwowanym wyłącznie na granicy (parsery
   + `normalizeTime`), nigdy w rdzeniu. Testy są tu jedynym mechanizmem, który ten niezmiennik utrwali.
6. **Bramka zapisu jest samoodnosząca się**: blokady przelicza się z tych samych danych, które mogły być
   wadliwe, więc błąd kształtu przechodzi jako sukces („zielony przycisk = serwer też pozwoli",
   założenie do podważenia z `test-plan.md:41`).

## Historical Context (from prior changes)

- `context/archive/2026-09-13-schedule-draft-generation/plan.md:27-28` — czas z PostgREST przychodzi jako
  `"HH:MM:SS"`; brak godzin przez północ; `plan.md:41` — generator czysty świadomie; `plan.md:43` —
  deterministyczna reguła wyboru (najdłuższy zasięg → nazwa pl → id); `plan.md:50` — dziury liczone przy
  odczycie, nigdy nie zapisywane; `plan.md:36` — testy odłożone **wprost do `testing-runner-core-logic`**.
- `context/archive/2026-09-13-schedule-draft-generation/reviews/impl-review.md:43` — F2: wyścig nawigacji
  dawał **fałszywe całodzienne dziury** z nieaktualnych przypisań; `:87-95` — F7: dwa różne algorytmy dziur,
  `generateDraft.holes` nieużywane; `:67-75` — F5: check-then-act w `isFullyCovered` zaakceptowany jako ryzyko MVP.
- `context/archive/2026-09-13-schedule-text-export/plan.md:11` — dzień zamknięty = **brak** wpisu w godzinach
  otwarcia; `:33` — oba warianty z jednego źródła struktury, nigdy regex; `:54` — dni zamknięte w kolejności
  chronologicznej; `:110` — pełny kontrakt układu tekstu, `"—"` dla brakującego nazwiska, sort po `startTime`;
  `:215` — manualny scenariusz G.3: w pełni zamknięty tydzień = nagłówek + 7× `— nieczynne`.
- `context/archive/2026-09-13-schedule-text-export/reviews/impl-review.md:23` — dzień otwarty bez zmian
  **nieosiągalny** w zapisanym grafiku (dziura blokuje zapis); `:57-65` — F4: `formatRange` wyciągnięty
  do wspólnego `src/lib/format.ts`.
- `context/archive/2026-09-13-save-complete-schedule/plan.md:35` — `findSelfOverlaps` symetryczne, stąd dedup;
  `:59` — zaakceptowany wyścig: `UPDATE ... WHERE status='draft'` chroni status, nie dane pod bramką;
  `:78-99` — kontrakt: blokady = dziury + kolizje, zdeduplikowane.
- `context/archive/2026-09-13-save-complete-schedule/reviews/impl-review.md:37-54` — F2: nieatomowość
  zapisów przypisań naprawiona **triggerem w bazie** + mapowanie `23000` → 409.
- `context/archive/2026-09-13-availability-management/plan.md:54` — kontrakt nakładania
  `aStart < bEnd && bStart < aEnd` na `"HH:MM"`, z **jawnym stwierdzeniem, że porównanie leksykograficzne
  jest poprawne dla zero-paddingu** — to podstawa poprawności sortowania w eksporcie; `:58` — kotwica
  tygodnia = poniedziałek ISO; `:253` — reguła nakładania przeniesiona do bazy (exclusion constraint, `23P01`).
- `context/archive/2026-09-13-schedule-editing-collisions/plan.md:17` — błąd `getAssignments` bez
  `business_id` (UUID harmonogramu w `business_id`) crashował widok; `:36` — nakładka dwóch **różnych** osób
  nie jest kolizją.
- `context/archive/2026-09-12-business-opening-hours/plan.md:24` — `CHECK (closes_at > opens_at)`, godziny
  przez północ niemożliwe; `:43` — zapis tygodnia nieatomowy, ale idempotentny; `:210-214` — brak runnera,
  wyłącznie manualne E2E.
- `context/archive/2026-09-12-domain-schema-rls/plan.md` — izolacja per właściciel (tło ryzyka #4, nieobjęte Fazą 1).

## Related Research

- Brak wcześniejszych `research.md` w `context/changes/**` ani `context/archive/**` — to pierwszy artefakt
  researchu w tym repo. Wiedza historyczna jest w `plan.md`/`reviews/**` zmian archiwalnych (patrz wyżej).

## Open Questions

1. **Semantyka dziur**: którą z dwóch (`generateDraft.holes` czy `computeHoles`) uznajemy za kontrakt Fazy 1?
   Produkcyjnie działa `computeHoles` przez `findScheduleBlockers`; `generateDraft.holes` jest martwe.
2. **Zakres Fazy 1 wobec `findScheduleBlockers`**: testujemy całą bramkę zapisu (dziury + kolizje + dedup),
   czy tylko składowe? Bramka jest jedynym miejscem, gdzie oba rodzaje blokad się spotykają.
3. **Czy Faza 1 ma przypiąć zachowanie „zły kształt danych = pusty draft"?** To wykrywalny dowód incydentu,
   ale wymaga jawnie brzydkiego testu (snake_case w camelCase kontrakcie) — do decyzji w planie.
4. **Czy `weekStart` nie-poniedziałek i daty niepoprawne w `week.ts` mają rzucać, czy być walidowane
   na wejściu?** Dziś `week.ts` rzuca `RangeError`; parsery odrzucają wcześniej. Kontrakt do ustalenia.
5. **Format `formatDayLabel`/`formatWeekLabel` w runtime produkcyjnym** — dokładny separator pl-PL
   w workerd (ICU) nie został zweryfikowany empirycznie; testy asertujące literalny string mogą być
   wrażliwe na środowisko. Kandydat na „czego nie testujemy" albo na asercję strukturalną.
6. **Czy Faza 1 dokłada `npx astro check` do bramki** (`test-plan.md:89` mówi „wymagana po §3 Phase 1") —
   to element planu, nie researchu, ale wiąże się z konfiguracją runnera i CI.
