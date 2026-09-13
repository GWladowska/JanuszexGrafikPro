# Archiwum zapisanych grafików (S-08) — Implementation Plan

## Overview

Właściciel przegląda zapisane grafiki tygodnia bieżącego i minionych w trybie tylko do odczytu, z **wiernie odwzorowanymi godzinami otwarcia obowiązującymi w danym tygodniu** — a nie z bieżącymi godzinami, które dziś zmieniają wygląd starych grafików po każdej edycji. Tygodnie ≤ bieżący są zamrożone dla nowego planowania: nie można w nich wygenerować nowego grafiku ani odblokować zapisanego; edycja i planowanie są dostępne wyłącznie dla tygodni przyszłych. W widoku archiwalnym obecna jest sekcja tekstowa do wysłania załodze z S-07 (z uwzględnieniem historycznych godzin), a nawigacja pozostaje tygodniowa ‹ › — bez spisu tygodni.

Rozszerza NFR trwałości danych („Zapisany grafik… nie znikają między sesjami") i domyka założenia użytkownika z 2026-09-13 zapisane w roadmapie S-08.

## Current State Analysis

- Godziny otwarcia są dziś **jednym, bieżącym zbiorem**: `src/pages/schedules/index.astro:33` pobiera `getOpeningHours(businessId)` przez `src/lib/services/business.ts:43`, wysyła je jako prop `openingHours` do islandy, a serwer czyta je ponownie przy każdej walidacji. Nie ma żadnego zapisu godzin „z danego tygodnia" — edycja godzin otwarcia zmienia wygląd wszystkich wcześniej zapisanych grafików (problem, który ten slice naprawia).
- Status `saved` już blokuje mutacje przypisań przez 409 `ERROR_SAVED_SCHEDULE` (`src/pages/api/schedules/assignments.ts:89-91,201-203,287-289`), a zapis grafiku domyka wyścig warunkowym `UPDATE ... WHERE status='draft'` (`src/lib/services/schedule.ts:261-279`).
- **Brak pojęcia „tydzień bieżący" po stronie kodu mutacji**: `parseWeekStart` (`src/lib/services/schedule-validation.ts:13`) waliduje wyłącznie poniedziałek. Nawigacja ‹ › jest nieograniczona (`ScheduleBoard.tsx:636-660`), a „Odblokuj do edycji" pokazuje się dla każdego zapisanego grafiku, także minionego (`ScheduleBoard.tsx:1091-1104`).
- **Draft w tygodniu bieżącym/minionym jest w pełni edytowalny** (blokada dotyczy tylko statusu `saved`) — i zgodnie z decyzją projektową tak ma zostać; zamrożenie nie obejmuje dokończenia istniejącego draftu.
- Gotowe wzorce: gałąź `isSaved` z plakietką, „Odblokuj do edycji" i sekcją tekstową (`ScheduleBoard.tsx:1056-1167`), `ServiceResult<T>` i warunkowe przejścia statusu (`src/lib/services/schedule.ts`), helpery `src/lib/api.ts`, stałe komunikatów `src/lib/http.ts`, `findScheduleBlockers` liczone identycznie po stronie UI i serwera, sprzątanie stanów w `closeEditingForms()` (`ScheduleBoard.tsx:281-293`).
- `week.ts` ma już pełny zestaw helperów tygodnia (`addDays`, `isoWeekday`, `weekStartOf`, `formatWeekLabel`), a `index.astro:29` liczy „dziś" przez `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" })` — tę samą technikę wykorzysta nowy helper czasu.
- `getScheduleByWeek` robi `select("*")` (`src/lib/services/schedule.ts:36-41`), więc nowa kolumna `opening_hours_snapshot` wróci z API bez zmian kontraktu — odczyt archiwum nie wymaga nowego endpointu.

## Desired End State

Na `/schedules`, po nawigacji ‹ › do wybranego tygodnia:

1. **Tydzień przyszły** — zachowanie jak dziś: brak grafiku → „Generuj draft"; draft → edycja/zapis/usunięcie; zapisany → plakietka „Zapisany grafik", „Odblokuj do edycji" i sekcja tekstowa S-07. Przy zapisie grafiku do wiersza trafia kopia bieżących godzin otwarcia.
2. **Tydzień bieżący lub miniony** bez żadnego grafiku → komunikat „Brak zapisanego grafiku dla tego tygodnia." i **brak** przycisku „Generuj draft".
3. **Tydzień bieżący lub miniony** z istniejącym **draftem** → draft pokazany normalnie i nadal edytowalny/zapisywalny/usuwalny (dokończenie draftu), bez żadnych nowych blokad.
4. **Tydzień bieżący lub miniony** z **zapisanym** grafikiem → widok tylko do odczytu: dni i godziny otwarcia z **kopii godzin z tego tygodnia** (a gdy kopii brak — z bieżących godzin), dyskretna linijka „Archiwum — godziny otwarcia z tego tygodnia", plakietka „Zapisany grafik", sekcja tekstowa S-07 policzona z historycznych godzin, **brak** „Odblokuj do edycji" i brak akcji edycji.
5. **Serwer** nie pozwala obejść zamrożenia: `POST /api/schedules` (generowanie) i `PATCH` (odblokowanie) dla tygodni ≤ bieżący zwracają 409 z komunikatem o zamrożeniu; zapis kompletnego draftu w zamrożonym tygodniu nadal przechodzi.
6. **Dostępności** (rozszerzenie ad-hoc, Faza 4): można dodawać/edytować/usuwać wyłącznie na tygodnie przyszłe oraz na tydzień bieżący, dopóki grafik tego tygodnia nie jest zapisany. Miniony tydzień jest read-only. Regułę egzekwują baza (trigger), serwer (API dostępności) i UI.

### Key Discoveries:

- Kopia godzin musi być używana **wyłącznie** dla zamrożonego i zapisanego tygodnia (`isFrozen && isSaved`). Dla przyszłego zapisanego grafiku trzeba dalej pokazywać bieżące godziny, bo użytkownik może go jeszcze odblokować i edytować — inaczej zobaczyłby nieaktualne godziny bez możliwości reakcji.
- Pusty snapshot (`[]`) znaczy „wszystkie dni zamknięte" i jest poprawną wartością — fallback do bieżących godzin wolno zastosować tylko dla wartości `null`/niepoprawnej, inaczej tydzień w pełni zamknięty przewróciłby się na „otwarty".
- Bramka zamrożenia na serwerze dotyczy dokładnie dwóch miejsc: `POST` (generowanie) i gałęzi odblokowania w `PATCH`. Zapis (`draft → saved`) i usunięcie draftu pozostają dozwolone w zamrożonym tygodniu (decyzja: dokończenie draftu), a `assignments.ts` nie wymaga zmian.
- Backfill w migracji da się zrobić jednym `UPDATE` z agregacją `opening_hours` per biznes; wiersz bez godzin dostaje `[]`, nie `null`.
- `SCHEDULE` `opening_hours_snapshot` jest typu `jsonb` → po `npm run db:types` kolumna ma typ `Json | null`; jeśli TypeScript nie przyjmie `OpenDay[]` wprost, mapować na zwykłe obiekty lub rzucić przez `as unknown as Json`.
- Seed nie ma dziś żadnego **zapisanego** grafiku, więc po wprowadzeniu zamrożenia archiwum nie da się przetestować z UI (nie można już utworzyć zapisanego grafiku w minionym tygodniu) — fixture jest konieczny, nie opcjonalny.

## What We're NOT Doing

- Zmian w `src/pages/api/schedules/assignments.ts` — status `saved` już blokuje mutacje, a draft w zamrożonym tygodniu ma pozostać dokończalny.
- Wersjonowania godzin otwarcia (osobna tabela z datami obowiązywania) — wybrano snapshot przy zapisie (decyzja projektowa).
- Blokowania edycji/generowania po stronie UI dla draftu w zamrożonym tygodniu — draft jest dokończalny.
- Nowych ekranów, osobnej trasy archiwum i spisu tygodni — archiwum to ten sam `/schedules` z nawigacją ‹ ›.
- Eksportu obrazka (PNG/PDF), zmian w treści tekstu S-07, nazwy biznesu w nagłówku eksportu.
- Automatycznych testów — brak runnera (decyzja z S-01–S-07); logika czasu i kopii pisana czysto, wejdzie pod testy w `testing-runner-core-logic`.
- Zmian w RLS — nowa kolumna należy do istniejącej tabeli objętej politykami wierszowymi.
- Ograniczania zasięgu nawigacji ‹ › (np. tylko do tygodni z grafikiem).

## Implementation Approach

Trzy fazy. Najpierw **warstwa danych i reguła czasu**: migracja dokłada kolumnę `opening_hours_snapshot jsonb` i jednorazowo uzupełnia nią istniejące zapisane grafiki, seed zyskuje zapisany grafik z minionego tygodnia (fixture do archiwum), a `week.ts` dostaje `todayInWarsaw`/`currentWeekStart`/`isFrozenWeek` oraz powstaje czysty moduł `schedule-archive.ts` (parsowanie kopii i wybór godzin dla tygodnia). Następnie **serwer**: `saveSchedule` zapisuje kopię godzin, a `POST` i odblokowanie w `PATCH` odrzucają zamrożone tygodnie nowym komunikatem. Na końcu **islanda**: `currentWeekStart` jako prop z `index.astro`, historyczne godziny dla zamrożonego zapisanego tygodnia, linijka „Archiwum…", ukrycie „Generuj draft" i „Odblokuj do edycji" oraz komunikat dla pustego zamrożonego tygodnia — z reużyciem sekcji tekstowej S-07.

## Critical Implementation Details

- **Kiedy używać kopii godzin:** `useSnapshot = isFrozen && isSaved`. Dla przyszłego zapisanego grafiku oraz dla każdego draftu wyświetlane godziny to bieżące godziny otwarcia. Ta sama wartość (`weekOpeningHours`) musi zasilać nagłówki dni, `findScheduleBlockers` i `buildScheduleText`; walidacja czasu przy edycji (`validateShiftTimes`) może dalej używać bieżących godzin, bo edycja dotyczy wyłącznie tygodni przyszłych i draftów.
- **Pusty snapshot to „wszystko zamknięte":** `parseOpeningHoursSnapshot([])` zwraca `[]` (poprawną wartość), a fallback do bieżących godzin stosuje się tylko dla `null`/wartości niepoprawnej. Backfill dla biznesu bez wpisów `opening_hours` zapisuje `[]`.
- **Kolejność bramki serwera:** w `POST` sprawdzenie `isFrozenWeek(weekStart)` przed sprawdzeniem istniejącego grafiku (jaśniejszy komunikat); w `PATCH` bramka wyłącznie w gałęzi `status === "draft"` (odblokowanie), po potwierdzeniu, że grafik jest `saved`. Gałąź zapisu (`status === "saved"`) nie dostaje bramki — dokończenie draftu jest dozwolone.
- **Typ `jsonb` w TS:** po regeneracji typów kolumna jest `Json | null`. W `saveSchedule` przekazanie `OpenDay[]` może wymagać jawnego rzutowania/mapowania — jeśli `astro check` zgłosi błąd, zapisać zwykłe obiekty i rzucić na `Json`.
- **Fixture archiwum musi być spójny:** przypisania zapisanego grafiku z minionego tygodnia pokrywają dokładnie godziny z kopii (żadnych dziur ani kolizji z dostępnościami), inaczej widok archiwum pokaże czerwone/żółte ostrzeżenia na zapisanym grafiku.
- **Granica zamrożenia jest liczona przy ładowaniu strony:** `currentWeekStart` przychodzi jako prop i nie odświeża się, gdy karta jest otwarta przez poniedziałkową noc. To świadomie akceptowane — nieświeży UI może chwilowo pokazać akcje, ale serwerowa bramka (`isFrozenWeek` w `POST`/`PATCH`) i tak odrzuci je 409, więc nie ma ryzyka zapisu.

## Phase 1: Dane, reguła czasu i odczyt kopii

### Overview

Migracja z nową kolumną i backfillem, regeneracja typów, fixture zapisanego grafiku w seedzie oraz czysta logika czasu i odczytu kopii godzin.

### Changes Required:

#### 1. Migracja: kolumna kopii godzin + backfill

**File**: `supabase/migrations/<timestamp>_schedule_opening_hours_snapshot.sql` (nowy; utworzyć z WSL: `supabase migration new schedule_opening_hours_snapshot`)

**Intent**: Dodać do grafiku nośnik historycznych godzin otwarcia i jednorazowo uzupełnić nim istniejące zapisane grafiki, żeby po wdrożeniu stare tygodnie przestały zależeć od bieżących godzin otwarcia.

**Contract**: `alter table public.schedules add column opening_hours_snapshot jsonb;` (nullable, bez wartości domyślnej, bez zmian RLS). Następnie `UPDATE` po `where status = 'saved'`, który dla każdego wiersza zapisuje `jsonb_agg` godzin z `opening_hours` tego biznesu (kształt `{weekday, opensAt, closesAt}`, godziny `HH24:MI`), a przy braku wpisów zapisuje `'[]'::jsonb`:

```sql
update public.schedules s
set opening_hours_snapshot = coalesce(
  (
    select jsonb_agg(
      jsonb_build_object(
        'weekday', oh.weekday,
        'opensAt', to_char(oh.opens_at, 'HH24:MI'),
        'closesAt', to_char(oh.closes_at, 'HH24:MI')
      ) order by oh.weekday
    )
    from public.opening_hours oh
    where oh.business_id = s.business_id
  ),
  '[]'::jsonb
)
where s.status = 'saved';
```

Uruchomienie: WSL `supabase db reset` aplikuje migrację i seed.

#### 2. Fixture zapisanego grafiku z minionego tygodnia

**File**: `supabase/seed.sql`

**Intent**: Dodać zapisany grafik z **poprzedniego** tygodnia wraz z kopią godzin inną niż obecne godziny otwarcia — jedyny sposób przetestowania archiwum po zamrożeniu. Fixture ma być kompletny (przypisania pokrywają całe godziny z kopii, bez dziur i kolizji z istniejącymi dostępnościami).

**Contract**: `week_start = date_trunc('week', now())::date - 7`, `status = 'saved'`, `opening_hours_snapshot` = ręcznie zapisany JSONB. Proponowany zestaw (różni się od bieżących godzin, więc dowodzi wiernego odwzorowania):

| Dzień | Kopia (archiwum) | Bieżące godziny | Przypisanie (pokrywa całość) |
|---|---|---|---|
| Pn | 08:00–16:00 | 08:00–18:00 | Anna 08:00–16:00 |
| Wt | 08:00–16:00 | 08:00–18:00 | Anna 08:00–16:00 |
| Śr | 12:00–20:00 | 08:00–20:00 | Piotr 12:00–20:00 |
| Cz | 08:00–16:00 | 08:00–20:00 | Maria 08:00–16:00 |
| Pt | 08:00–22:00 | 08:00–22:00 | Tomasz 08:00–22:00 |
| So | 10:00–22:00 | 10:00–22:00 | Katarzyna 10:00–22:00 |
| Nd | zamknięte (brak wpisu) | zamknięte | — |

Przypisania dobrane tak, by mieściły się w istniejących dostępnościach z poprzedniego tygodnia (seed generuje je przez `week_offset = -7`) — dzięki temu archiwalny widok nie pokaże fałszywych flag kolizji.

#### 3. Reguła tygodnia bieżącego i zamrożenia

**File**: `src/lib/week.ts`

**Intent**: Jeden spójny sposób wyznaczania tygodnia bieżącego (czas Europe/Warsaw) i porównania, czy tydzień jest zamrożony — używany identycznie przez API i islandę.

**Contract**:

```ts
export function todayInWarsaw(now: Date = new Date()): string;      // YYYY-MM-DD (en-CA + Europe/Warsaw)
export function currentWeekStart(now: Date = new Date()): string;   // weekStartOf(todayInWarsaw(now))
export function isFrozenWeek(weekStart: string, reference: string = currentWeekStart()): boolean;
// isFrozenWeek: weekStart <= reference (porównanie ISO YYYY-MM-DD jako stringów)
```

#### 4. Czysty odczyt kopii godzin

**File**: `src/lib/services/schedule-archive.ts` (nowy)

**Intent**: Jedno miejsce walidujące kształt kopii z bazy i wybierające, które godziny pokazać dla wyświetlanego tygodnia. Bez I/O — gotowe do przyszłych testów jednostkowych.

**Contract**:

```ts
import type { OpenDay } from "@/lib/services/business-validation";

export function parseOpeningHoursSnapshot(value: unknown): OpenDay[] | null;
// Array poprawnych {weekday:1..7, opensAt, closesAt} → OpenDay[]; [] → []; cokolwiek innego → null

export function resolveOpeningHours(current: OpenDay[], snapshot: unknown, useSnapshot: boolean): OpenDay[];
// useSnapshot === false → current; true → parseOpeningHoursSnapshot(snapshot) ?? current
```

#### 5. Regeneracja typów bazy

**File**: `src/lib/database.types.ts`

**Intent**: Kolumna `opening_hours_snapshot` musi trafić do typów, inaczej `astro check` nie zobaczy jej na `ScheduleRow`.

**Contract**: `npm run db:types` (PowerShell) po `supabase db reset`; w pliku musi pojawić się `opening_hours_snapshot`.

### Success Criteria:

#### Automated Verification:

- `supabase db reset` (WSL) aplikuje nową migrację i seed bez błędów
- `npm run db:types` generuje `src/lib/database.types.ts` zawierający `opening_hours_snapshot`
- `npx astro sync` przechodzi bez błędów typów
- `npm run lint` bez błędów
- `npx astro check` bez błędów typów
- `npm run build` kończy się sukcesem

#### Manual Verification:

- W lokalnej bazie (Supabase Studio lub psql) zapytanie `select week_start, status, opening_hours_snapshot from public.schedules order by week_start;` pokazuje zapisany grafik z poprzedniego tygodnia z niepustą, różną od obecnych godzin kopią

---

## Phase 2: Serwer — kopia godzin przy zapisie i bramka zamrożenia

### Overview

Zapis grafiku dokłada kopię godzin otwarcia; generowanie i odblokowanie zamrożonych tygodni są odrzucane po stronie serwera nowym komunikatem.

### Changes Required:

#### 1. Komunikat zamrożenia

**File**: `src/lib/http.ts`

**Intent**: Polska stała w konwencji `ERROR_*`, zrozumiała bez żargonu.

**Contract**: `export const ERROR_WEEK_FROZEN = "Miniony i bieżący tydzień są zablokowane — grafik można układać i odblokowywać tylko na przyszłe tygodnie.";`

#### 2. Zapis kopii godzin w serwisie

**File**: `src/lib/services/schedule.ts`

**Intent**: `saveSchedule` przy przejściu `draft → saved` utrwala ówczesne godziny otwarcia w tym samym atomowym `UPDATE`, co status.

**Contract**:

```ts
export async function saveSchedule(
  supabase: Supabase,
  businessId: string,
  scheduleId: string,
  openingHours: OpenDay[],
): Promise<ServiceResult<ScheduleRow>>;
// update({ status: "saved", opening_hours_snapshot: openingHours })
//   .eq("id", scheduleId).eq("business_id", businessId).eq("status", "draft").select().single()
```

Import typu `OpenDay` z `src/lib/services/business-validation`. Jedyny wywołujący to `PATCH` w `src/pages/api/schedules/index.ts`. Jeśli `astro check` nie przyjmie `OpenDay[]` jako `Json` — zmapować na zwykłe obiekty i rzucić jawnie.

#### 3. Bramka zamrożenia i przekazanie godzin w endpointcie tygodniowym

**File**: `src/pages/api/schedules/index.ts`

**Intent**: Odmówić utworzenia nowego grafiku oraz odblokowania zapisanego grafiku dla tygodni ≤ bieżący; przy zapisie przekazać odczytane godziny do serwisu.

**Contract**:
- Import `isFrozenWeek` z `@/lib/week` oraz `ERROR_WEEK_FROZEN` z `@/lib/http`.
- `POST`: po `resolveBusinessId(...)`, przed sprawdzeniem `existing`, dodać `if (isFrozenWeek(weekField.weekStart)) return jsonResponse({ error: ERROR_WEEK_FROZEN }, 409);`.
- `PATCH`: w gałęzi odblokowania (`status === "draft"`) — po `if (schedule.status !== "saved") return 409 ERROR_SCHEDULE_NOT_SAVED` dołożyć `if (isFrozenWeek(weekField.weekStart)) return jsonResponse({ error: ERROR_WEEK_FROZEN }, 409);`. Gałąź zapisu bez zmian poza przekazaniem godzin: `saveSchedule(supabase, businessId, schedule.id, openingHoursResult.data)`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi
- `npm run lint` bez błędów
- `npx astro check` bez błędów typów
- `npm run build` kończy się sukcesem

#### Manual Verification:

- `POST /api/schedules` z `weekStart` minionego tygodnia → 409 z komunikatem o zamrożeniu; z `weekStart` przyszłego tygodnia → 201
- `PATCH /api/schedules { status: "draft" }` dla zapisanego grafiku z minionego tygodnia → 409 o zamrożeniu; dla zapisanego grafiku z przyszłego tygodnia → 200
- `PATCH /api/schedules { status: "saved" }` zapisuje kompletny draft i w wyniku (albo w kolejnym `GET`) widać niepusty `opening_hours_snapshot`
- Ponowny zapis po odblokowaniu nadpisuje kopię godzin nowymi wartościami

---

## Phase 3: Islanda i strona — widok archiwalny i zamrożone akcje

### Overview

Islanda dostaje tydzień bieżący jako prop, pokazuje historyczne godziny i oznaczenie archiwum dla zamrożonego zapisanego tygodnia, ukrywa „Generuj draft" i „Odblokuj do edycji" dla tygodni ≤ bieżący oraz wyświetla komunikat, gdy zamrożony tydzień nie ma grafiku.

### Changes Required:

#### 1. Przekazanie tygodnia bieżącego

**File**: `src/pages/schedules/index.astro`

**Intent**: Wyznaczyć granicę zamrożenia na serwerze (jedno źródło prawdy) i przekazać ją islandzie jako prop.

**Contract**: Import `weekStartOf` z `@/lib/week`; `const currentWeekStartValue = weekStartOf(today);` (zmienna `today` już istnieje — `index.astro:29`); nowy prop `currentWeekStart={currentWeekStartValue}` na `<ScheduleBoard />` (`index.astro:97-103`).

#### 2. Widok archiwum i zamrożone akcje w islandzie

**File**: `src/components/schedules/ScheduleBoard.tsx`

**Intent**: Dla zamrożonego zapisanego tygodnia renderować godziny z kopii i tryb read-only bez odblokowania; dla zamrożonego tygodnia bez grafiku pokazać komunikat zamiast generowania; dodać linijkę „Archiwum…". Draft w zamrożonym tygodniu pozostawić bez zmian.

**Contract**:
- Nowy prop `currentWeekStart: string` w `ScheduleBoardProps` i w sygnaturze komponentu (`:40-45`, `:227-232`).
- Nowe wartości pochodne: `const isFrozen = weekStart <= currentWeekStart;`, `const isArchived = isFrozen && isSaved;`, `const weekOpeningHours = resolveOpeningHours(openingHours, weekData.schedule?.opening_hours_snapshot ?? null, isArchived);` (import `resolveOpeningHours` z `@/lib/services/schedule-archive`).
- Podmienić `openingHours` na `weekOpeningHours` w: mapie `openingByWeekday` (`:579`), wywołaniu `findScheduleBlockers` (`:580-585`) oraz w `buildScheduleText` (`:591-598`). `validateShiftTimes` dalej używa bieżących `openingHours` (edycja dotyczy tylko przyszłych tygodni/draftów).
- Linijka archiwum: gdy `isArchived && !navPending`, pod etykietą tygodnia (`:648`) pokazać `Archiwum — godziny otwarcia z tego tygodnia` w kolorze wyciszonym (`text-xs text-blue-100/60`).
- Sekcja akcji (`:1049-1296`):
  - `weekData.schedule === null && !navPending`: gdy `isFrozen` → zamiast formularza „Generuj draft" pokazać komunikat „Brak zapisanego grafiku dla tego tygodnia."; gdy `!isFrozen` → dotychczasowy formularz.
  - gałąź `isSaved`: plakietka „Zapisany grafik" i sekcja tekstowa S-07 zostają; blok „Odblokuj do edycji" (przycisk i potwierdzenie) renderować tylko gdy `!isFrozen`.
  - gałąź draftu: bez zmian (dokończenie draftu dozwolone).
- **Flagi przy zapisanym grafiku**: pary flag „⚠ Poza dostępnością” i „⚠ Nakładka…” (`:874-887`) renderować tylko gdy `isDraft` — zapisany grafik (także archiwalny) nie pokazuje ostrzeżeń, bo bramka zapisu gwarantuje brak kolizji; inaczej dryf dostępności po zapisie pokazałby w archiwum fałszywe flagi.
- Bez nowych stanów `useState` — wszystko jest wartością pochodną, więc `closeEditingForms()` nie wymaga zmian.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi
- `npm run lint` bez błędów
- `npx astro check` bez błędów typów
- `npm run build` kończy się sukcesem

#### Manual Verification:

- Scenariusz A (archiwum z seeda): miniony tydzień z zapisanym grafikiem pokazuje linijkę „Archiwum…", godziny z kopii (Pn/Wt 08:00–16:00, Śr 12:00–20:00, Cz 08:00–16:00), brak „Odblokuj do edycji", brak akcji edycji, obecną sekcję tekstową S-07 z historycznymi godzinami i zamkniętą niedzielą
- Scenariusz B (draft w tygodniu bieżącym z seeda): draft nadal edytowalny (np. edycja godziny zmiany działa), dostępny „Zapisz grafik"/„Usuń draft", brak linijki „Archiwum…"
- Scenariusz C (pusty zamrożony tydzień): nawigacja do minionego tygodnia bez grafiku → komunikat „Brak zapisanego grafiku dla tego tygodnia." bez przycisku „Generuj draft"
- Scenariusz D (przyszły tydzień): generowanie, zapis i „Odblokuj do edycji" działają jak dotąd; po zapisie i odblokowaniu ponowny zapis przechodzi
- Scenariusz E (wierność historyczna): zmiana godzin otwarcia w „Biznes" nie zmienia wyglądu minionego zapisanego tygodnia; przyszły zapisany tydzień nadal pokazuje bieżące godziny
- Scenariusz F (bramka serwera przez API) — patrz Testing Strategy
- Scenariusz G (kopia przy zapisie): po zapisie grafiku na przyszły tydzień `GET /api/schedules?week=...` zwraca `schedule.opening_hours_snapshot` zgodny z bieżącymi godzinami
- Scenariusz H (brak fałszywych flag): po usunięciu dostępności pracownika z minionego tygodnia archiwalny zapisany grafik nadal nie pokazuje flag „Poza dostępnością”/„Nakładka”

---

## Phase 4: Zamrożenie edycji dostępności (rozszerzenie ad-hoc S-08)

### Overview

Dostępności pracowników można dodawać, edytować i usuwać wyłącznie na tygodnie przyszłe oraz na tydzień bieżący — i to tylko dopóki grafik tego tygodnia nie jest zapisany. Miniony tydzień jest read-only. Reguła jest egzekwowana na trzech warstwach: trigger w bazie (nie do obejścia), API dostępności (komunikat 409) i UI (akcje ukryte + informacja). Zmiana w tygodniu bieżącym dotyczy **każdego** zapisu, w tym przeniesienia wpisu z minionego tygodnia — dlatego przy `UPDATE` sprawdzana jest zarówno nowa, jak i poprzednia data.

### Changes Required:

#### 1. Komunikat błędu

**File**: `src/lib/http.ts`

**Intent**: Nowa stała w konwencji `ERROR_*` na odmowę zapisu dostępności w zamrożonym tygodniu.

**Contract**: `export const ERROR_AVAILABILITY_WEEK_FROZEN = "Miniony tydzień jest zablokowany, a bieżący — gdy grafik jest już zapisany. Dostępności można zmieniać na bieżący (do zapisania grafiku) i przyszłe tygodnie.";`

#### 2. Trigger bazy danych

**File**: `supabase/migrations/<timestamp>_enforce_availability_week_writes.sql` (nowy; z WSL: `supabase migration new enforce_availability_week_writes`)

**Intent**: Zamknąć regułę na poziomie bazy, żeby nie dało się jej obejść bezpośrednim zapisem i żeby wyścig „dostępność zmieniana w trakcie zapisu grafiku" był niemożliwy.

**Contract**: Funkcja `public.enforce_availability_week_writes()` (BEFORE INSERT/UPDATE/DELETE na `availabilities`) liczy `date_trunc('week', candidate)::date` dla każdej daty z pary `(new.work_date, old.work_date)` (obecne przy INSERT/UPDATE/DELETE odpowiednio; `array_remove(..., null)`) i przy odwołaniu do `now() at time zone 'Europe/Warsaw'` odmawia, gdy: tydzień daty < bieżący tydzień, albo = bieżący tydzień i istnieje `schedules.status = 'saved'` dla `(business_id, week_start)`. `raise exception ... using errcode = '23000'` (PostgREST → 409). Wzorzec zgodny z `trg_assignments_enforce_draft` (S-06), łącznie z tolerancją dla kaskadowych kasowań, gdy biznes/schedule już nie istnieje.

#### 3. Bramka serwera i odczyt wiersza

**File**: `src/lib/services/availability.ts`, `src/lib/services/availability-guard.ts` (nowy)

**Intent**: Jedna funkcja odpowiada na pytanie „czy ten tydzień wolno zmieniać", a API potrzebuje odczytu istniejącego wpisu, by sprawdzić jego datę przy edycji/usunięciu.

**Contract**:
```ts
// availability.ts
export async function getAvailabilityById(supabase, businessId, availabilityId): Promise<ServiceResult<AvailabilityRow | null>>;
// select("*").eq("id", ...).eq("business_id", ...).maybeSingle() + normalizeAvailabilityRow

// availability-guard.ts
export async function isAvailabilityWeekEditable(supabase, businessId, workDate: string): Promise<ServiceResult<boolean>>;
// weekStartOf(workDate) < currentWeekStart() → false
// weekStartOf(workDate) > currentWeekStart() → true
// == currentWeekStart() → false tylko gdy dla tego tygodnia istnieje zapisany grafik
```

#### 4. Bramka w API dostępności

**File**: `src/pages/api/availabilities/index.ts`

**Intent**: Odmówić zapisu w zamrożonym tygodniu, niezależnie od tego, skąd przyszło żądanie.

**Contract**:
- `POST`: po `resolveBusinessId` sprawdzić `isAvailabilityWeekEditable(..., parsed.input.workDate)`; `false` → 409 `ERROR_AVAILABILITY_WEEK_FROZEN`, `error` → 500.
- `PUT`: pobrać wpis przez `getAvailabilityById` (brak → 404 `ERROR_AVAILABILITY_NOT_FOUND`); sprawdzić bramką **starą i nową** datę; dopiero potem walidacja nakładania i zapis.
- `DELETE`: pobrać wpis (brak → 404); sprawdzić bramką jego `work_date` przed kasowaniem.

#### 5. Seed bez minionego tygodnia

**File**: `supabase/seed.sql`

**Intent**: Seed nie może łamać nowego triggera — dostępności powstają teraz tylko na tydzień bieżący i przyszły.

**Contract**: W `cross join (values (-7), (0), (7))` zostawić `(0)` i `(7)`; zaktualizować komentarz nagłówka („dwa tygodnie" zamiast „trzy", usunąć wzmiankę o poprzednim). Fixture archiwum (Faza 1) nie potrzebuje już dostępności z minionego tygodnia — flagi dla zapisanego grafiku i tak są ukryte (Faza 3).

#### 6. UI — read-only dla zamrożonego tygodnia

**File**: `src/pages/availabilities/index.astro`, `src/components/availabilities/AvailabilityManager.tsx`

**Intent**: Użytkownik widzi od razu, że tygodnia minionego (lub bieżącego z zapisanym grafikiem) nie da się edytować — bez klikania, które kończy się błędem.

**Contract**:
- `index.astro`: `weekStartOf(today)` przekazane jako prop `currentWeekStart`.
- `AvailabilityManager`: nowy prop `currentWeekStart: string`; stan `currentWeekSaved: boolean | null`; `writesBlocked = weekStart < currentWeekStart || (weekStart === currentWeekStart && currentWeekSaved !== false)`.
- Przy wejściu w tydzień bieżący (i gdy `currentWeekSaved === null`) leniwy `fetch('/api/schedules?week=...')` → `currentWeekSaved = schedule?.status === "saved"`; przy błędzie/niepowodzeniu `true` (bezpieczniej blokować).
- Gdy `writesBlocked`: brak przycisków „Dodaj", „Edytuj", „Usuń" i formularzy; komunikat rozróżniający miniony tydzień od bieżącego z zapisanym grafikiem; nawigacja ‹ › działa.

### Success Criteria:

#### Automated Verification:

- `supabase db reset` (WSL) aplikuje trigger i seed bez błędów (seed bez offsetu -7)
- `npx astro sync` przechodzi
- `npm run lint` bez błędów
- `npx astro check` bez błędów typów
- `npm run build` kończy się sukcesem

#### Manual Verification:

- Miniony tydzień: brak „Dodaj"/„Edytuj"/„Usuń", komunikat o widoku tylko do odczytu; `POST /api/availabilities` na minioną datę → 409 o zamrożeniu
- Bieżący tydzień bez zapisanego grafiku (draft): można dodać/edytować/usunąć dostępność przez UI; `POST` działa
- Bieżący tydzień z zapisanym grafikiem: akcje znikają po wejściu w tydzień, `POST/PUT/DELETE` → 409
- Przyszły tydzień: pełna edycja działa jak dotąd
- `PUT` ze starą datą w zamrożonym tygodniu (edycja wpisu z bieżącego zapisanego tygodnia) albo nową datą w minionym tygodniu → 409 (bramka patrzy na obie daty)
- Bezpośredni zapis do bazy (`insert` dostępności na minioną datę) → błąd triggera (SQLSTATE 23000)

---

## Testing Strategy

### Unit Tests:

- Świadomie brak (decyzja użytkownika, brak runnera). `week.ts` (nowe helpery) i `schedule-archive.ts` pisane czysto, bez I/O — wejdą pod testy w `testing-runner-core-logic` bez refaktoru.

### Integration Tests:

- Świadomie brak; kontrakty `POST`/`PATCH` sprawdzane bezpośrednimi żądaniami (scenariusz F).

### Manual Testing Steps:

Scenariusze klik-po-kliku. Punkt startowy wspólny: z WSL w katalogu projektu `supabase start` + `supabase db reset` (seed: `owner@example.com` / `haslo12345`), z PowerShell `npm run dev`; przeglądarka `http://localhost:4321`. Fixture: seed zawiera zapisany grafik z **poprzedniego** tygodnia oraz draft w tygodniu **bieżącym** (`date_trunc('week', now())`).

**A. Archiwum minionego tygodnia (konto seeda):**
1. Zaloguj `owner@example.com` / `haslo12345`, wejdź na „Grafik" (domyślnie przyszły tydzień), potem kliknij „Poprzedni", aż dojdziesz do tygodnia sprzed obecnego.
2. Oczekiwane: pod etykietą tygodnia linijka „Archiwum — godziny otwarcia z tego tygodnia"; zielona plakietka „Zapisany grafik"; brak przycisku „Odblokuj do edycji"; brak przycisków Edytuj/Zamień/kosz/Dodaj zmianę; w każdym dniu widoczne godziny z kopii — poniedziałek i wtorek `08:00 – 16:00`, środa `12:00 – 20:00`, czwartek `08:00 – 16:00`, piątek `08:00 – 22:00`, sobota `10:00 – 22:00`, niedziela „Nieczynne".
3. Oczekiwane: brak czerwonych dziur i żółtych flag kolizji; w sekcji tekstowej podgląd zaczyna się od `*Pn DD.MM – Nd DD.MM*`, a niedziela to `— nieczynne`.

**B. Draft w zamrożonym tygodniu bieżącym nadal dokończalny:**
1. Wróć do tygodnia bieżącego („Następny"). Oczekiwane: draft z seeda widoczny, brak linijki „Archiwum…", przyciski edycji widoczne, dostępne „Zapisz grafik" i „Usuń draft".
2. Przy dowolnej zmianie (np. Anna, poniedziałek) kliknij „Edytuj", zmień godzinę „do" na `14:30`, kliknij „Zapisz". Oczekiwane: zmiana zapisana, wiersz pokazuje `… 14:30` (dowód, że draft w zamrożonym tygodniu jest edytowalny).
3. Oczekiwane: nie ma nigdzie przycisku pozwalającego wygenerować nowy grafik w tym tygodniu.

**C. Zamrożony tydzień bez grafiku:**
1. Klikaj „Poprzedni" do tygodnia sprzed fixture (dwa tygodnie wstecz). Oczekiwane: komunikat „Brak zapisanego grafiku dla tego tygodnia." i **brak** przycisku „Generuj draft".
2. Kliknij „Następny" — wracasz do tygodnia, który ma fixture; zachowanie jak w A.

**D. Przyszły tydzień bez zmian:**
1. Wejdź na tydzień po następnym (dwa razy „Następny" od bieżącego). Oczekiwane: brak linijki „Archiwum…", przycisk „Generuj draft" dostępny.
2. Kliknij „Generuj draft". Oczekiwane: draft powstaje; edycja, zapis i „Usuń draft" jak dotąd.
3. Uzupełnij brakujące dziury/kolizje tak, aby przycisk „Zapisz grafik" był aktywny, i kliknij go → potwierdź. Oczekiwane: plakietka „Zapisany grafik", przycisk „Odblokuj do edycji" **obecny**.
4. Kliknij „Odblokuj do edycji" → potwierdź. Oczekiwane: wracają akcje edycji (przyszły tydzień nie jest zamrożony).

**E. Wierność historyczna godzin:**
1. Z widoku archiwum z A zapamiętaj godziny poniedziałku (`08:00 – 16:00`).
2. Przejdź do „Biznes" (lub ekranu godzin otwarcia) i zmień poniedziałek na `07:00 – 21:00`; zapisz.
3. Wróć na „Grafik" i wejdź w ten sam miniony tydzień. Oczekiwane: poniedziałek nadal `08:00 – 16:00` (z kopii) — zmiana bieżących godzin nie wpłynęła na archiwum.
4. Wejdź w przyszły tydzień. Oczekiwane: poniedziałek pokazuje bieżące `07:00 – 21:00` (brak kopii lub brak zamrożenia → bieżące godziny).

**F. Bramka serwera — bezpośrednie żądania na `/schedules`:**
1. W konsoli przeglądarki (na stronie archiwum) wykonaj `fetch('/api/schedules?week=<poniedziałek minionego tygodnia>').then(async r => [r.status, await r.json()])`. Oczekiwane: 200 i `schedule.opening_hours_snapshot` niepusty.
2. `fetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStart: '<poniedziałek minionego tygodnia>' }) }).then(async r => [r.status, await r.json()])`. Oczekiwane: **409** z komunikatem „Miniony i bieżący tydzień są zablokowane — grafik można układać i odblokowywać tylko na przyszłe tygodnie.".
3. Ten sam `POST` z `weekStart` **przyszłego tygodnia bez grafiku**. Oczekiwane: **201** (utworzony draft; można go potem usunąć).
4. `PATCH /api/schedules` z `{ weekStart: '<poniedziałek minionego tygodnia>', status: 'draft' }` na zapisanym grafiku z fixture. Oczekiwane: **409** z komunikatem o zamrożeniu (mimo że grafik jest `saved`).
5. `PATCH /api/schedules` z `{ weekStart: '<przyszły tydzień z zapisanym grafikiem>', status: 'draft' }`. Oczekiwane: **200** (przyszły tydzień odblokowuje się normalnie).

**G. Kopia godzin zapisywana przy zapisie:**
1. Na przyszłym tygodniu ułóż kompletny grafik i zapisz. Oczekiwane: zapis przechodzi.
2. W konsoli `fetch('/api/schedules?week=<ten tydzień>').then(r => r.json())` → sprawdź, że `schedule.opening_hours_snapshot` zawiera bieżące godziny otwarcia (tablica `{weekday, opensAt, closesAt}`).
3. Zmień godziny otwarcia na ten dzień, odblokuj ten przyszły tydzień i zapisz ponownie. Oczekiwane: kopia godzin w wyniku `GET` odzwierciedla nowe godziny (nadpisanie przy ponownym zapisie).

**H. Brak fałszywych flag na zapisanym grafiku:**
1. Zaloguj `owner@example.com` / `haslo12345`, wejdź na „Grafik" i przejdź do minionego tygodnia z fixture (scenariusz A). Oczekiwane: brak żółtych flag przy zmianach.
2. Wejdź na „Pracownicy" → przy Annie kliknij „Dostępności". Klikaj „Poprzedni", aż dojdziesz do minionego tygodnia; przy poniedziałkowym wpisie Anny kliknij ikonę kosza → potwierdź usunięcie. Oczekiwane: wpis znika.
3. Wróć na „Grafik" i wejdź w ten sam miniony tydzień. Oczekiwane: poniedziałkowa zmiana Anny nadal widoczna, **bez** żółtej flagi „⚠ Poza dostępnością" (zapisany grafik jest zwalidowany); brak przycisków edycji i odblokowania.

## Performance Considerations

Skala MVP (~5 pracowników, ≤ kilkanaście zmian/tydzień): brak nowych zapytań do bazy — kopia godzin jedzie w istniejącym `select *` grafiku, a bramka zamrożenia to porównanie dwóch stringów. Backfill to jeden `UPDATE` po istniejących wierszach w migracji. Bez nowych indeksów i optymalizacji (main_goal=speed).

## Migration Notes

- Nowa kolumna `schedules.opening_hours_snapshot jsonb` (nullable) + backfill istniejących `saved` grafików bieżącymi godzinami biznesu (najlepsze dostępne przybliżenie; dawnych godzin nie da się już odtworzyć). Kody bez wpisów `opening_hours` dostają `[]`.
- Migrację utworzyć i zastosować **z WSL** (`supabase migration new …`, `supabase db reset`) — nigdy `npx supabase` (lekcja `lessons.md`). Po resecie `npm run db:types` z PowerShell i sprawdzić, że plik zawiera kolumnę (guard przed pustym plikiem).
- Migrację na produkcję wdrożyć ręcznie (`supabase link` + `supabase db push`) przed deployem.
- Brak zmian w RLS — kolumna należy do tabeli już objętej politykami wierszowymi.
- Migracja jest addytywna i cofalna przez `drop column`, ale backfill nie jest odtwarzalny wstecz (nadpisuje przybliżeniem) — świadoma decyzja projektowa.

## References

- Roadmap: `context/foundation/roadmap.md` (S-08, wiersz `:42`, szczegóły `:165-176`) · PRD: `context/foundation/prd.md` (NFR „trwałość danych", `:132`; Business Logic `:136`)
- Poprzednie plany: `context/archive/2026-09-13-save-complete-schedule/plan.md` (widok `isSaved`, przejścia statusu, sprzątanie `closeEditingForms`) · `context/archive/2026-09-13-schedule-text-export/plan.md` (sekcja tekstowa, `buildScheduleText`)
- Wzorce kodu: `src/pages/api/schedules/index.ts` (POST/PATCH, mapowanie błędów) · `src/lib/services/schedule.ts` (atomowy `saveSchedule`) · `src/components/schedules/ScheduleBoard.tsx` (gałąź `isSaved`, sekcja tekstowa, `isFrozenWeek` w UI) · `src/lib/week.ts` · `src/lib/services/schedule-generation.ts` (`findScheduleBlockers`) · `supabase/migrations/20260912141307_domain_schema.sql:97-107`
- Lekcje: `context/foundation/lessons.md` (supabase tylko z WSL, `npx astro check` w bramce, mapowanie snake_case→camelCase, scenariusze E2E klik-po-kliku, pytania bez żargonu)
- Seed: `supabase/seed.sql` (konto `owner@example.com` / `haslo12345`, kawiarnia z godzinami i dostępnościami na trzy tygodnie)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dane, reguła czasu i odczyt kopii

#### Automated

- [x] 1.1 `supabase db reset` (WSL) aplikuje nową migrację i seed bez błędów — 6dec4d4
- [x] 1.2 `npm run db:types` generuje `src/lib/database.types.ts` zawierający `opening_hours_snapshot` — 6dec4d4
- [x] 1.3 `npx astro sync` przechodzi bez błędów typów — 6dec4d4
- [x] 1.4 `npm run lint` bez błędów — 6dec4d4
- [x] 1.5 `npx astro check` bez błędów typów — 6dec4d4
- [x] 1.6 `npm run build` kończy się sukcesem — 6dec4d4

#### Manual

- [x] 1.7 Seed zawiera zapisany grafik z minionego tygodnia z niepustą kopią godzin różną od obecnych — 6dec4d4

### Phase 2: Serwer — kopia godzin przy zapisie i bramka zamrożenia

#### Automated

- [x] 2.1 `npx astro sync` przechodzi — 1499571
- [x] 2.2 `npm run lint` bez błędów — 1499571
- [x] 2.3 `npx astro check` bez błędów typów — 1499571
- [x] 2.4 `npm run build` kończy się sukcesem — 1499571

#### Manual

- [x] 2.5 `POST` generowania dla minionego tygodnia → 409 o zamrożeniu; dla przyszłego → 201 — 1499571
- [x] 2.6 `PATCH` odblokowania dla zapisanego minionego tygodnia → 409; dla przyszłego → 200 — 1499571
- [x] 2.7 Zapis grafiku zapisuje niepusty `opening_hours_snapshot` — 1499571
- [x] 2.8 Ponowny zapis po odblokowaniu nadpisuje kopię godzin nowymi wartościami — 1499571

### Phase 3: Islanda i strona — widok archiwalny i zamrożone akcje

#### Automated

- [x] 3.1 `npx astro sync` przechodzi — eab7bd8
- [x] 3.2 `npm run lint` bez błędów — eab7bd8
- [x] 3.3 `npx astro check` bez błędów typów — eab7bd8
- [x] 3.4 `npm run build` kończy się sukcesem — eab7bd8

#### Manual

- [x] 3.5 Scenariusz A: archiwum minionego tygodnia — linijka „Archiwum…", historyczne godziny z kopii, brak odblokowania i edycji, sekcja tekstowa S-07 — eab7bd8
- [x] 3.6 Scenariusz B: draft w zamrożonym tygodniu bieżącym nadal edytowalny i dokończalny, bez linijki „Archiwum…" — eab7bd8
- [x] 3.7 Scenariusz C: pusty zamrożony tydzień — komunikat bez „Generuj draft" — eab7bd8
- [x] 3.8 Scenariusz D: przyszły tydzień — generowanie, zapis i odblokowanie działają jak dotąd — eab7bd8
- [x] 3.9 Scenariusz E: zmiana bieżących godzin otwarcia nie zmienia archiwum; przyszły zapisany tydzień nadal pokazuje bieżące godziny — eab7bd8
- [x] 3.10 Scenariusz F: bramka serwera przez API — 409 przy generowaniu/odblokowaniu minionego, 201/200 dla przyszłego — eab7bd8
- [x] 3.11 Scenariusz G: kopia godzin zapisana przy zapisie i nadpisana po ponownym zapisie — eab7bd8
- [ ] 3.12 Scenariusz H: usunięcie dostępności z minionego tygodnia nie tworzy fałszywych flag na archiwalnym zapisanym grafiku — eab7bd8

### Phase 4: Zamrożenie edycji dostępności (rozszerzenie ad-hoc S-08)

#### Automated

- [x] 4.1 `supabase db reset` (WSL) aplikuje trigger i seed bez błędów
- [x] 4.2 `npx astro sync` przechodzi
- [x] 4.3 `npm run lint` bez błędów
- [x] 4.4 `npx astro check` bez błędów typów
- [x] 4.5 `npm run build` kończy się sukcesem

#### Manual

- [x] 4.6 Miniony tydzień: akcje ukryte i komunikat; `POST` na minioną datę → 409
- [x] 4.7 Bieżący tydzień bez zapisanego grafiku: edycja przez UI działa, `POST` działa
- [x] 4.8 Bieżący tydzień z zapisanym grafikiem: akcje ukryte, `POST`/`PUT`/`DELETE` → 409
- [x] 4.9 Przyszły tydzień: pełna edycja działa jak dotąd
- [x] 4.10 `PUT` ze starą lub nową datą w zamrożonym tygodniu → 409 (bramka patrzy na obie daty)
- [x] 4.11 Bezpośredni `insert` dostępności na minioną datę w bazie → błąd triggera (SQLSTATE 23000)
