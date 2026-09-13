# Dostępności pracowników (S-03) — Implementation Plan

## Overview

Właściciel zarządza dostępnościami pracowników (FR-006): dodaje (data + godzina od + do), przegląda w ujęciu jednego tygodnia z nawigacją ‹ ›, edytuje w miejscu i usuwa. Serwer blokuje nakładające się przedziały tego samego pracownika w tym samym dniu (409 z polskim komunikatem). Tabela `availabilities` z pełnym RLS istnieje od F-01 — **zero migracji**; slice to serwis + API + UI na wzorcu S-02.

## Current State Analysis

- **Baza gotowa:** `availabilities` (id, business_id, employee_id, work_date date, start_time/end_time time, check `end_time > start_time`, FK kompozytowe `(business_id, employee_id) → employees(business_id, id) on delete cascade`, indeksy `(employee_id, work_date)` i `(business_id, work_date)`, trigger `updated_at`) — `supabase/migrations/20260912141307_domain_schema.sql:72-93`. RLS select/insert/update/delete przez `public.is_business_owner(business_id)` — `supabase/migrations/20260912144543_domain_rls.sql:93-109`. Typy wygenerowane w `src/lib/database.types.ts:88`. Wiele wierszy na dzień dozwolone (przerwy) — zgodnie z decyzją użytkownika; brak ograniczenia nakładania w bazie (blokada po stronie aplikacji, patrz Critical Implementation Details).
- **Wzorzec pionowy z S-02:** serwis (`src/lib/services/employee.ts`), walidacja (`employee-validation.ts`), endpointy POST/PUT/DELETE (`src/pages/api/employees/index.ts` — prelude, `resolveRequestContext`, `resolveBusinessId`), strona SSR (`src/pages/employees/index.astro`), islanda właściciel stanu (`src/components/employees/EmployeeManager.tsx`).
- **`ServiceResult<T>`** w `src/lib/services/types.ts` (dodendum F5 z S-02 wykonane — trzeci serwis ma z niego korzystać).
- **Walidacja czasu gotowa do reużycia:** `parseTime` w `src/lib/services/business-validation.ts:51` normalizuje `"HH:MM(:SS)?"` → `"HH:MM"` z walidacją zakresu — nie kopiować.
- **Helpery HTTP:** `src/lib/http.ts` (`readJsonBody`, `jsonResponse`, stałe błędów po polsku) — lekcja z `context/foundation/lessons.md`: używać, nie kopiować.
- **Ochrona tras:** `PROTECTED_ROUTES` w `src/middleware.ts:4` = `["/dashboard", "/business", "/employees"]` (dopasowanie `startsWith`).
- **Dashboard:** wiersz akcji z linkami „Edytuj" i „Pracownicy" — `src/pages/dashboard.astro:64-78`.
- **Komponenty do reużycia:** `FormField` (przyjmuje `type` — kontroluje wartość także dla `date`/`time`, ale natywne pickery wymagają `[color-scheme:dark]` — precedens `timeInputClass`, `OpeningHoursEditor.tsx:10-11`), `SubmitButton` (prop `pending`), `ServerError` z `src/components/auth/`; hook `useApiErrorState` (`src/components/hooks/useApiErrorState.ts`).
- **Seed (tylko lokalnie):** konto `owner@example.com` / `haslo12345`, biznes, 5 pracowników **z dostępnościami** na tydzień bieżący — `supabase/seed.sql:107-117`; ten slice rozszerza seed o tygodnie: poprzedni, bieżący i następny (change 6 w fazie 3 — nawigacja ‹ › dostaje dane do przeglądania w E2E). Usunięcie pracownika kaskaduje na jego dostępności (FK `on delete cascade`) — tekst potwierdzenia usuwania pracownika (S-02) już to komunikuje.
- **Nawigacja tygodniowa — kontekst produktowy:** MVP pracuje w rytmie jednego tygodnia (PRD Persona: pod koniec tygodnia zbierane są dostępności na nadchodzący tydzień; S-04 będzie generować draft per tydzień). Widok dostępności pokazuje dokładnie jeden tydzień naraz z minimalną nawigacją ‹ › (decyzja użytkownika); przyszłe archiwum grafików to nowy slice S-08 `schedule-archive` w roadmapie (decyzja z planowania tego slice'a), który reużyje ten sam wzorzec nawigacji tygodniowej.

## Desired End State

Zalogowany właściciel z założonym biznesem wchodzi z dashboardu na `/availabilities`, wybiera pracownika z listy rozwijanej i widoki jego dostępności w wybranym tygodniu (domyślnie **kolejny** tydzień od poniedziałku; strzałki ‹ › pozwalają przeglądać historię i przyszłość). Dodaje wpisy (data + od + do), edytuje je inline, usuwa po potwierdzeniu. Nakładające się przedziały tego samego pracownika w tym samym dniu są odrzucane przez serwer (409); stykające się (koniec = początek) są dozwolone. Każde konto widzi wyłącznie dostępności swojego biznesu (RLS). Weryfikacja: ręczne E2E na koncie seeda i świeżym koncie + `npx astro sync` / `npm run lint` / `npm run build`.

### Key Discoveries:

- Tabela i RLS istnieją — **zero migracji**; slice to serwis + API + UI na wzorcu S-02.
- `update`/`delete` z filtrem `business_id + id` przy obcym/nieistniejącym id zwraca 0 wierszy → Postgrest `PGRST116` przy `.single()` — endpoint mapuje to na **404** (wzorzec z S-02).
- PostgREST zwraca `time` jako `"HH:MM:SS"`, a `<input type="time">` operuje na `"HH:MM"` — przy mapowaniu wierszy trzeba uciąć sekundy wg precedensu `normalizeTime` (`business.ts:19-21`, dziś prywatny — wyeksportować), inaczej input odrzuci wartość.
- FK kompozytowe `(business_id, employee_id)` chroni spójność, ale `23503` z FK to zły kontrakt API — endpoint weryfikuje przynależność pracownika do biznesu jawnie i zwraca 404.
- Nic nie referencjonuje `availabilities` — usunięcie wpisu dostępności **nie kaskaduje** na nic (potwierdzenie jednorazowe, bez ostrzeżeń o grafikach).
- Brak testera (decyzja z S-01/S-02) — weryfikacja: ręczne E2E + trzy komendy bramki CI.

## What We're NOT Doing

- Generowanie draftu grafiku i widok pokrycia (S-04) — dostępności to tylko dane wejściowe.
- Formularz tygodniowy / akcja „Powtórz" przy wpisie (decyzja: pojedynczy wpis; szybkie wprowadzanie wróci, jeśli E2E pokaże ból).
- Blokada nakładania w bazie (exclusion constraint + `btree_gist`) — walidacja aplikacyjna jest autorytatywna przy skali 1 użytkownika; consistent z podejściem „reguły w aplikacji" z komentarza przy tabeli `assignments` (domain_schema.sql:114-115).
- Blokada dat w przeszłości (decyzja: dozwolone — poprawki „wstecz" i historia muszą być edytowalne).
- Auto-import dostępności (ankiety, kalendarze) — parked w PRD/roadmapie.
- Konta pracowników — parked; dostępność wpisuje tylko szef.
- Automatyczne testy (decyzja S-02: wracają przy S-04, tam się opłacają).
- Paginacja, wirtualizacja, grupowanie po pracownikach w jednym widoku, widok miesięczny.

## Implementation Approach

Trzy warstwy 1:1 jak w S-02, serwer autorytatywny (walidacja i reguły po stronie serwera, islanda tylko wysyła i pokazuje):

1. **Serwis + walidacja** (`src/lib/services/availability*.ts`) — jedyne miejsce dotykające tabeli `availabilities`; porównania nakładania w JS na pobranych wierszach (wzorzec `findDuplicateEmployee` z S-02, skala ~5 pracowników).
2. **Endpointy JSON** (`src/pages/api/availabilities/index.ts`) — POST/PUT/DELETE, reużycie helperów z `src/lib/http.ts`, rozstrzygnięcie biznesu przez `getBusinessForOwner`.
3. **Strona + islanda** (`/availabilities` + `AvailabilityManager.tsx`) — SSR pobiera pracowników i wszystkie dostępności biznesu jednym zapytaniem; islanda jest właścicielem stanu (selektor pracownika, tydzień, formularz, lista, edycja inline, usuwanie) i aktualizuje stan lokalnie bez przeładowań. Nawigacja tygodniowa to filtr klienta — pełna historia dostępności jest od razu w pamięci.

## Critical Implementation Details

- **Kontrakt nakładania (409):** przed insert/update endpoint pobiera wpisy pracownika na dany dzień (`findOverlappingAvailability` w serwisie) i porównuje w JS: `aStart < bEnd && bStart < aEnd` na znormalizowanych `"HH:MM"` (porównanie leksykograficzne stringów jest poprawne dla zero-padded godzin). Stykające się przedziały (`end == start` sąsiada) są dozwolone. Przy PUT własny wpis (`id`) jest wykluczony z porównania. Odpowiedź: `409 { error: ERROR_OVERLAPPING_AVAILABILITY }`. Decyzja: bez exclusion constraint w bazie — walidacja aplikacyjna jest wystarczająca przy tej skali (odwrotność drogi z triage S-02/F4, gdzie duplikaty pracowników miały realne ryzyko kontuzji przy wielu kontach; tu jeden właściciel na biznes i jedna ścieżka zapisu).
- **Czas "HH:MM:SS" vs "HH:MM":** PostgREST zwraca `time` z sekundami; `<input type="time">` ich nie przyjmie. Wiersze normalizowane w warstwie serwisu wg precedensu `normalizeTime` (`business.ts:19-21` — wyeksportować z business.ts lub przenieść do wspólnego modułu); `parseTime` (`business-validation.ts:51`) zostaje do walidacji wejścia formularza.
- **Przynależność pracownika:** POST/PUT weryfikują, że `employeeId` należy do biznesu właściciela (listą `getEmployees` w JS — skala), inaczej **404** `ERROR_EMPLOYEE_NOT_FOUND`; FK `23503` pozostaje ostatnią linią obrony.
- **PGRST116 → 404** przy update/delete (wzorzec S-02).
- **Tydzień i strefa czasowa:** kotwica tygodnia = poniedziałek ISO. Domyślny tydzień liczony na **serwerze** (SSR, `Europe/Warsaw`) i przekazywany propem — eliminuje hydration mismatch i rozjazdy stref; to samo źródło prawdy dla „kolejnego tygodnia": najbliższy poniedziałek **po** bieżącym (jeśli dziś poniedziałek, pokazujemy następny).
- **Auto-przełączenie tygodnia po zapisie:** po udanym POST/PUT, jeśli wpis ma datę spoza wyświetlanego tygodnia, islanda ustawia wyświetlany tydzień na tydzień wpisu — zapobiega „znikaniu" świeżo zapisanych danych z ekranu (kontynuacja guardraila „nic nie znika po cichu").
- **Daty i strefa:** `work_date` to string `YYYY-MM-DD`; etykiety dni formatowane z `timeZone: "Europe/Warsaw"` (lekcja F1 z impl-review S-02).

## Phase 1: Serwis i walidacja dostępności

### Overview

Warstwa domenowa: reguły formularza, operacje na tabeli `availabilities` i wykrywanie nakładania. Bez API i UI.

### Changes Required:

#### 1. Walidacja dostępności

**File**: `src/lib/services/availability-validation.ts` (nowy)

**Intent**: czyste funkcje walidacji wejścia formularza dostępności z polskimi komunikatami, spójne z konwencją `parseEmployeeName` (`employee-validation.ts`) i reużywające generycznego `parseTime` z `business-validation.ts`.

**Contract**: `parseWorkDate(raw): { value: "YYYY-MM-DD" | null, fieldError: string | null }` — wymagana, regex `YYYY-MM-DD` + walidacja realności daty; `parseAvailabilityTime` — cienki wrapper na `parseTime` z komunikatem „Podaj godzinę w formacie HH:MM."; `validateTimeRange(startTime, endTime): string | null` — `end > start`, komunikat „Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia."; `intervalsOverlap(aStart, aEnd, bStart, bEnd): boolean`; typ `AvailabilityInput { employeeId: string; workDate: string; startTime: string; endTime: string }`.

#### 2. Serwis dostępności

**File**: `src/lib/services/availability.ts` (nowy)

**Intent**: jedyne miejsce dostępu do tabeli `availabilities`; reużywa `ServiceResult<T>` z `src/lib/services/types.ts`.

**Contract**: `getAvailabilities(supabase, businessId)` (order `work_date` asc, `start_time` asc); `createAvailability(supabase, businessId, input)` (insert + `.select().single()`); `updateAvailability(supabase, businessId, availabilityId, input)` (`.eq("id", …).eq("business_id", …)` + `.select().single()`); `deleteAvailability(supabase, businessId, availabilityId)`; `findOverlappingAvailability(supabase, businessId, employeeId, workDate, startTime, endTime, excludeAvailabilityId?)` — pobiera wpisy pracownika na dany dzień i porównuje w JS przez `intervalsOverlap`; zwraca kolidujący wiersz lub `null`. Typ `AvailabilityRow` z `Database["public"]["Tables"]["availabilities"]["Row"]`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi bez błędów
- `npm run lint` przechodzi
- `npm run build` kończy się sukcesem

#### Manual Verification:

- Brak — zachowanie weryfikowane przez endpointy (faza 2) i E2E (faza 3).

---

## Phase 2: Endpointy API /api/availabilities

### Overview

Trzy operacje JSON (dodaj/zmień/usuń) w jednym pliku, w sekwencji błędów jak `src/pages/api/employees/index.ts` (401 → 500 → 400 body → 400 walidacja → 404 biznes → 404 pracownik → 409 nakładanie → logika). Lista nie potrzebuje GET — strona czyta przez serwis w SSR.

### Changes Required:

#### 1. Nowe stałe błędów

**File**: `src/lib/http.ts`

**Intent**: komunikaty o dostępnościach w jednym miejscu (lekcja: nie kopiować stałych między endpointami).

**Contract**: `ERROR_AVAILABILITY_NOT_FOUND = "Nie znaleziono wpisu dostępności."`, `ERROR_OVERLAPPING_AVAILABILITY = "Ten pracownik ma już dostępność nakładającą się na ten przedział — zedytuj istniejący wpis."`.

#### 2. Endpoint dostępności

**File**: `src/pages/api/availabilities/index.ts` (nowy)

**Intent**: POST tworzy wpis, PUT zmienia istniejący, DELETE usuwa; serwer autorytatywnie pilnuje przynależności pracownika i reguły braku nakładania.

**Contract**: wspólny prelude jak w `src/pages/api/employees/index.ts` — `context.locals.user` 401, `createClient` null → 500, `readJsonBody` null → 400, `getBusinessForOwner` → błąd 500 / brak biznesu 404. POST: `parseWorkDate` + `parseAvailabilityTime` (od i do) + `validateTimeRange` (400 z `fieldErrors`), weryfikacja przynależności pracownika (404), `findOverlappingAvailability` → 409, `createAvailability` → 201 `{ availability }`. PUT: dodatkowo `body.id` — UUID, inaczej 400; te same walidacje; overlap z wykluczeniem własnego `id`; `updateAvailability` → `PGRST116` mapowany na 404, sukces 200 `{ availability }`. DELETE: `id` jak wyżej, `deleteAvailability` → 404 przy `PGRST116`, sukces 200 `{ deleted: true }`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi bez błędów
- `npm run lint` przechodzi bez błędów
- `npm run build` kończy się sukcesem

#### Manual Verification:

- Brak — pełne scenariusze E2E w fazie 3.

---

## Phase 3: Strona /availabilities i nawigacja

### Overview

Chroniona strona z wyborem pracownika, tygodniowym widokiem dostępności i pełnym CRUD + wejście z dashboardu. Islanda `AvailabilityManager` jest właścicielem stanu (bez przeładowań).

### Changes Required:

#### 1. Ochrona trasy

**File**: `src/middleware.ts:4`

**Intent**: `/availabilities` wymaga logowania.

**Contract**: `PROTECTED_ROUTES` dostaje wpis `"/availabilities"` (dopasowanie `startsWith`).

#### 2. Strona dostępności

**File**: `src/pages/availabilities/index.astro` (nowy)

**Intent**: SSR wg wzorca `src/pages/employees/index.astro` — przekierowanie bez logowania, brak biznesu → `/business/setup`, error-first: błąd DB → `DbErrorState`, błąd list → stan „Odśwież stronę", dopiero potem islanda.

**Contract**: pobiera `getEmployees` i `getAvailabilities` (jedno zapytanie na encję); liczy `defaultWeekStart` (kolejny poniedziałek względem dziś, `Europe/Warsaw`) i przekazuje propsy `initialEmployees`, `initialAvailabilities`, `defaultWeekStart` do islandy `client:load`.

#### 3. Islanda zarządzania dostępnościami

**File**: `src/components/availabilities/AvailabilityManager.tsx` (nowy)

**Intent**: jeden komponent-stan: selektor pracownika, nawigacja tygodniowa, formularz dodawania, lista tygodnia, edycja inline, usuwanie.

**Contract**: props `initialEmployees: EmployeeRow[]`, `initialAvailabilities: AvailabilityRow[]`, `defaultWeekStart: string`. Stan: `selectedEmployeeId` (domyślnie pierwszy pracownik), `weekStart` (domyślnie `defaultWeekStart`), trzy `useApiErrorState` (add/edit/delete). Selektor pracownika (`<select>` w stylu `timeInputClass` — patrz niżej). Nawigacja ‹ › zmienia `weekStart` o ±7 dni; etykieta zakresu `Pn DD.MM – Nd DD.MM`. Formularz: `FormField type="date"` (domyślnie `weekStart`), `FormField type="time"` ×2 — oba pola i selektor z `[color-scheme:dark]` wg precedensu `timeInputClass` (`OpeningHoursEditor.tsx:10-11`; bez tego natywne pickery są jasne na ciemnym tle); walidacja kliencka tymi samymi parserami z serwisu (wzorzec `EmployeeManager`); POST/PUT na `/api/availabilities`; po sukcesie wpisy poza wyświetlanym tygodniem przełączają `weekStart` (patrz Critical Implementation Details). Lista: 7 dni tygodnia (Pn–Nd z datami), wpisy dnia posortowane po `start_time`, dzień bez wpisów oznaczony „—"; edycja inline (wiersz przechodzi w tryb formularza data+od+do), usuwanie dwuetapowe („Na pewno usunąć ten wpis dostępności?" → DELETE). Stan listy aktualizowany lokalnie po każdej operacji. 0 pracowników → pusty stan z linkiem do `/employees`, bez formularza. Reużycie: `FormField`, `SubmitButton`, `ServerError`, `useApiErrorState`, `cn()`.

#### 4. Wejście z dashboardu

**File**: `src/pages/dashboard.astro:64-78`

**Intent**: właściciel ma widoczne wejście do dostępności.

**Contract**: w wierszu akcji karty dashboardu obok „Pracownicy" pojawia się link „Dostępności" → `/availabilities` (styl spójny z istniejącymi linkami).

#### 5. Helpery tygodnia (wspólne)

**File**: `src/lib/week.ts` (nowy)

**Intent**: net-new logika dat/tygodni (zero helperów w repo — weryfikacja plan-review); czyste funkcje na stringach `YYYY-MM-DD`, reużywalne przez S-04 (draft per tydzień) i S-08 (archiwum), zgodnie z AGENTS.md (wspólne helpery → `src/lib/`).

**Contract**: `nextMonday(from: string): string` — najbliższy poniedziałek strictly **po** dniu `from` (kotwica „kolejnego tygodnia" z Critical Details); `addDays(date: string, days: number): string` — arytmetyka nawigacji ‹ ›; `formatWeekLabel(weekStart: string): string` — etykieta `Pn DD.MM – Nd DD.MM` (`Europe/Warsaw`, lekcja F1 z S-02). Strona (change 2) używa `nextMonday` do `defaultWeekStart`; islanda (change 3) — `addDays` + `formatWeekLabel`.

#### 6. Seed: dostępności na trzy tygodnie

**File**: `supabase/seed.sql` (edycja bloku dostępności, linie 107-117)

**Intent**: nawigacja tygodniowa ‹ › i historia wpisów potrzebują danych w E2E — seed rozszerza dostępności z samego tygodnia bieżącego na trzy tygodnie: poprzedni, bieżący i następny (decyzja użytkownika z triage plan-review: skoro można przeglądać więcej danych, niech seed je dostarczy).

**Contract**: zachować istniejące rozkłady 5 pracowników i zgrać je z tygodniami: wiersze tygodnia bieżącego bez zmian (`date_trunc('week', now())::date`), zduplikowane/rozszerzone o `::date - 7` (poprzedni tydzień) i `::date + 7` (następny). Wyłącznie lokalnie — seed nigdy nie trafia na projekt zdalny (AGENTS.md); weryfikacja: `supabase db reset` z WSL.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi bez błędów
- `npm run lint` przechodzi bez błędów
- `npm run build` kończy się sukcesem

#### Manual Verification:

- Pełny scenariusz E2E (lista w „Testing Strategy" poniżej), na koncie świeżym i na koncie z seeda.

---

## Testing Strategy

### Unit Tests:

- Brak — świadoma decyzja (deadline 2026-09-14); automatyczne testy wracają przy S-04 (logika draftu), gdzie dają realną wartość.

### Integration Tests:

- Ręczne E2E na dwóch kontach; lokalna baza z seedem (`supabase db reset` **z WSL** — lekcja: nigdy `npx supabase`; konto `owner@example.com` / `haslo12345`). RLS regeneracji podlega `supabase/tests/rls_isolation.sql` — polityk nie zmieniamy, bez zmian.

### Manual Testing Steps:

1. Świeże konto bez biznesu → `/availabilities` przekierowuje na `/business/setup`.
2. Po założeniu biznesu: dashboard → „Dostępności" → 0 pracowników → pusty stan z linkiem do `/employees`.
3. Po dodaniu pracownika: `/availabilities` → selektor ma pracownika, wyświetlony tydzień = kolejny poniedziałek, wszystkie 7 dni z „—".
4. Dodaj wpis (np. najbliższy poniedziałek 08:00–16:00) → widoczny w dniu bez przeładowania.
5. Nakładanie: dodaj 10:00–15:00 tego samego dnia → 409 z polskim komunikatem, wpis nie powstaje; styk 16:00–20:00 → przechodzi.
6. Edycja inline: zmień godziny → zapis; zmień datę na inny tydzień → zapis i widok automatycznie przełącza się na tydzień wpisu.
7. Usuwanie: „Usuń" → potwierdzenie → wpis znika.
8. Nawigacja ‹ ›: przeglądanie poprzednich/następnych tygodni; edycja wpisu z przeszłości działa (decyzja: przeszłość dozwolona).
9. Próba dodania wpisu z datą w przeszłości → przechodzi (decyzja) i jest widoczna po nawigacji.
10. Izolacja: drugie konto widzi puste listy, nigdy danych konta A (RLS).
11. Wylogowanie → `/availabilities` przekierowuje do logowania.
12. Konto seeda (`owner@example.com`): dostępności z seeda siedzą w trzech tygodniach (poprzednim, bieżącym i następnym — seed.sql); domyślny widok (kolejny tydzień) ma wpisy z seeda, nawigacja ‹ pokazuje tydzień bieżący i poprzedni.

## Performance Considerations

Znaczenie zerowe przy założonej skali (~5 pracowników): dwa zapytania SSR (pracownicy + dostępności), porównania nakładania w JS na wpisach jednego dnia. Nawigacja tygodniowa filtrowana po stronie klienta — zero dodatkowych requestów.

## Migration Notes

Brak zmian w bazie — `availabilities` i RLS są już na produkcji (F-01, push 2026-09-12). Deploy = merge do `master` (Workers Builds); rollback tylko kodu: `npx wrangler rollback`. Nowa trasa `/availabilities` zaczyna działać po deployu; nie trzeba nic robić po stronie Supabase.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-03; spójność nawigacji tygodniowej z przyszłym S-08 schedule-archive), PRD: `context/foundation/prd.md` (FR-006, US-01)
- Wzorzec 1:1: `context/archive/2026-09-13-employee-management/plan.md`, `src/pages/api/employees/index.ts`, `src/lib/services/employee.ts`, `src/pages/employees/index.astro`, `src/components/employees/EmployeeManager.tsx`
- Schemat/RLS: `supabase/migrations/20260912141307_domain_schema.sql:72-93`, `supabase/migrations/20260912144543_domain_rls.sql:93-109`
- Lekcje: `context/foundation/lessons.md` (helpery `src/lib/http.ts`; Supabase CLI z WSL)
- Reużycia: `parseTime` (`src/lib/services/business-validation.ts:51`), `ServiceResult` (`src/lib/services/types.ts`), `FormField`/`SubmitButton`/`ServerError`, `useApiErrorState`

## Addendum (impl-review triage, 2026-09-13)

Przegląd `/10x-impl-review` (raport: `reviews/impl-review.md`, APPROVED) — triage decyzje:

- **F1 (TOCTOU nakładania) — decyzja użytkownika zmieniona podczas triage:** reguła „przedziały nie nachodzą" przeniesiona do bazy jako **wykluczający constraint** (`btree_gist` + `timerange` z `'[start,end)'`, styki dozwolone) — migracja `supabase/migrations/20260913040000_no_overlap_availabilities.sql`. Endpointy mapują naruszenie z bazy (`23P01`) na ten sam 409 z `ERROR_OVERLAPPING_AVAILABILITY`; aplikacyjny `findOverlappingAvailability` zostaje jako przyjazny pre-check. **Wymaga ręcznego `supabase db push` z WSL** (human-gate, jak w S-02/F4) + re-testu nakładania. Ta decyzja zastępuje „What We're NOT Doing → Blokada nakładania w bazie" i „zero migracji" w sekcjach powyżej.
- **F2** — komentarz nagłówka `seed.sql` zaktualizowany („trzy tygodnie").
- **F3** — sortowanie wpisów dnia przez `localeCompare` (równe godziny = 0).
- **F4 (częściowo)** — `resolveEmployeeMembership` zwężone do `getEmployeeById` (`select("id")...limit(1)`); `getAvailabilities` **pozostaje celowo bez granicy dat**: widok pozwala przeskakiwać dowolne tygodnie ‹ › i auto-przełącza się po zapisie, więc pełna historia musi być w pamięci islandy. Filtr dat wraca przy S-04 (serwisowe pobieranie per tydzień) albo przy pierwszym realnym horizonie danych.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Serwis i walidacja dostępności

#### Automated

- [x] 1.1 `npx astro sync` przechodzi — 1f48aca
- [x] 1.2 `npm run lint` przechodzi — 1f48aca
- [x] 1.3 `npm run build` kończy się sukcesem — 1f48aca

### Phase 2: Endpointy API /api/availabilities

#### Automated

- [x] 2.1 `npx astro sync` przechodzi — b2f0c4b
- [x] 2.2 `npm run lint` przechodzi — b2f0c4b
- [x] 2.3 `npm run build` kończy się sukcesem — b2f0c4b

### Phase 3: Strona /availabilities i nawigacja

#### Automated

- [x] 3.1 `npx astro sync` przechodzi — 88e4d80
- [x] 3.2 `npm run lint` przechodzi — 88e4d80
- [x] 3.3 `npm run build` kończy się sukcesem — 88e4d80

#### Manual

- [x] 3.4 Pusty stan przy 0 pracownikach z linkiem do /employees — 88e4d80
- [x] 3.5 Dodanie wpisu pojawia się na liście tygodnia bez przeładowania — 88e4d80
- [x] 3.6 Nakładanie odrzucone 409; stykające się przedziały przechodzą — 88e4d80
- [x] 3.7 Edycja inline zapisuje zmiany; zmiana daty na inny tydzień przełącza widok — 88e4d80
- [x] 3.8 Usunięcie z potwierdzeniem usuwa wpis — 88e4d80
- [x] 3.9 Nawigacja ‹ › przegląda tygodnie; wpisy z przeszłości edytowalne — 88e4d80
- [x] 3.10 Izolacja: drugie konto widzi pusto; wylogowanie blokuje /availabilities — 88e4d80
- [x] 3.11 Konto seeda widzi dostępności z seeda — 88e4d80
- [x] 3.12 Seed widoczny w trzech tygodniach (poprzednim, bieżącym, następnym) przez nawigację ‹ › — 88e4d80
