# Ręczna edycja draftu grafiku z ostrzeżeniami o kolizjach (S-05) — Implementation Plan

## Overview

Właściciel ręcznie edytuje draft grafiku: przesuwa/skraca/wydłuża zmiany, zamienia osoby (także na niedostępne — z ostrzeżeniem), dodaje zmiany w dziurach i usuwa zmiany. Kolizje są sygnalizowane natychmiast (tryb ostrzeżeń: zapis dozwolony, zmiana dostaje trwałą żółtą flagę z zakresem naruszenia): (1) pracownik ułożony poza swoją dostępnością, (2) ta sama osoba w dwóch nakładających się zmianach. Całość ograniczona godzinami otwarcia lokalu — zmiana musi mieścić się w oknie dnia.

Realizuje FR-009, FR-010, US-01 (korekta), US-03 i guardrail PRD. Granica z S-06: finalny zapis/status `saved` nie wchodzi — operacje edycji działają wyłącznie na draftzie (guard serwerowy już istnieje).

## Current State Analysis

- S-04 dostarczył pełną pionową warstwę: czysta logika (`generateDraft`, `computeHoles`, `isFullyCovered` — `src/lib/services/schedule-generation.ts`), serwis I/O (`src/lib/services/schedule.ts`), endpoint `src/pages/api/schedules/index.ts` (GET/POST/PUT/DELETE), strona `src/pages/schedules/index.astro` + islanda `src/components/schedules/ScheduleBoard.tsx` (nawigacja tygodnia, generacja/usuwanie draftu, zamiana osoby).
- **Zamiana osoby jest zablokowana przez konstrukcję**: pula selecta = wyłącznie osoby w pełni pokrywające zmianę (`isFullyCovered`, `ScheduleBoard.tsx:290-300`), a serwer odrzuca niedostępnych z 409 (`src/pages/api/schedules/index.ts:243-252`). W trybie ostrzeżeń obie warstwy muszą zostać poluzowane — inaczej przypisanie niedostępnej osoby (jedyna kolizja, którą_FR-010 każe sygnalizować) jest nieosiągalne.
- **Dziury są liczone, nie przechowywane** (`computeHoles` po stronie klienta) — po każdej edycji widok dziur aktualizuje się automatycznie; guardrail PRD („dziura nie znika z ekranu") jest zachowany bez dodatkowej pracy.
- Draft trwale zapisany w bazie (`status: 'draft'`, unikalny `(business_id, week_start)`); mutacje sprawdzają status i odmawiają dla `saved` (409 `ERROR_SAVED_SCHEDULE`).
- Seed (`supabase/seed.sql`) zawiera gotowe dane testowe: draft na bieżący tydzień z nakładką dwóch osób (Pon: Anna 08:00–14:00 + Piotr 13:00–18:00) i zmianami poza dostępnością (Wt: Tomasz 14:00–18:00 — brak dostępności; Śr: Katarzyna 08:00–12:00, Anna 12:00–20:00 — brak dostępności). Konto `owner@example.com` / `haslo12345`.
- Helpery `resolveRequestContext`/`resolveBusinessId` są plikowo-lokalne i **zduplikowane** między `src/pages/api/availabilities/index.ts` a `src/pages/api/schedules/index.ts` (lekcja z `lessons.md`: nie mnożyć kopii — nowy endpoint musi korzystać z helperów w `src/lib/`).
- **Zgłoszony błąd `/schedules` zdiagnozowany i naprawiony w trakcie planowania (2026-09-13, poza fazami)**: `src/pages/schedules/index.astro:41` wołał `getAssignments` bez `business_id` (UUID grafiku lądował w `business_id`, `schedule_id=undefined`) — strona padła dla każdego konta z draftem na domyślny tydzień (konto seeda), a działała dla świeżych kont (brak draftu → zapytanie nie startuje). Naprawione na `scheduleResult.data.business_id`. Przy okazji `astro check` (nowa bramka z lekcji) wyłapał dwa prezydencjące błędy typów S-04: `getOpeningHours` deklarował unię `OpeningHoursDay` z dniem zamkniętym, choć zwraca wyłącznie dni otwarte — typ zwężony do `OpenDay[]` (`business.ts`, `ScheduleBoard.tsx`). W drzewie roboczym są trzy niekommitowane naprawy baseline (getAssignments, typy opening hours, logowanie błędów SSR — zmiana 2 fazy 3); wejdą do commita fazy 1. Zweryfikowane: `astro sync`/`lint` (0 errors)/`astro check` (0 errors)/`build` + strona ownera renderuje draft bez błędu.
- Zero schematów/migracji do zrobienia — schemat kompletny od F-01; `assignments` celowo nie ogranicza nakładania (decyzja F-01, ostrzeżenia w aplikacji).

## Desired End State

Po wejściu na `/schedules` właściciel może, bez przeładowania strony: (1) wejść w tryb edycji każdej zmiany i zmienić jej godziny „od"–„do"; (2) zamienić osobę na dowolną z biznesu — dostępne opcje w sekcji „Dostępni", pozostałe w „Niedostępni" z dopiskiem; (3) dodać zmianę w dziurze (formularz wstępnie wypełniony zakresem dziury) lub dowolną w otwartym dniu; (4) usunąć zmianę (potwierdzenie dwuprzyciskowe). Każda zmiana, której przedział nie jest w pełni pokryty dostępnością pracownika, nosi trwałą żółtą flagę „⚠ Poza dostępnością: {zakresy}", a zmiana nakładająca się z inną zmianą tej samej osoby — flagę „⚠ Nakładka z inną zmianą tej samej osoby: {zakresy}"; obie widoczne również po odświeżeniu. Próba ułożenia zmiany poza godzinami otwarcia dnia jest odrzucana (walidacja klienta + zaporą serwerową). Dziury przeliczają się po każdej operacji.

### Key Discoveries:

- `getAssignmentWithSchedule` (`src/lib/services/schedule.ts:68`) zwraca wiersz przypisania + status grafiku — gotowy guard dla operacji per-przypisanie (404 / 409 `ERROR_SAVED_SCHEDULE`).
- Kolejność walidacji endpointów (lekcja S-04): 401 → 500 (klient) → 400 (body) → 400 (walidacja pól) → 404 (biznes/zasób) → 409 (konflikt) → 500; komunikaty wyłącznie ze stałych `src/lib/http.ts`.
- Czasy porównywalne leksykograficznie w formacie `"HH:MM"`; wiersze bazy normalizowane przez `normalizeAssignmentRow`; dostępności z serwisu przychodzą już w kształcie `DraftInput` (camelCase — lekcja z S-04: nie przepuszczać surowych wierszy do czystej logiki).
- `assignments` wymaga `business_id` przy każdym insertcie (złożone FK — `supabase/migrations/20260912141307_domain_schema.sql:127-130`).
- Godziny otwarcia nigdy nie są nocne (`closes_at > opens_at`) — każda zmiana mieści się w jednym dniu kalendarzowym; `weekday` 1..7 (Pn=1), `workDate = addDays(weekStart, weekday-1)`.
- RLS tylko właściciel (`is_business_owner`) — wszystkie zapytania przez klienta cookie z `src/lib/supabase.ts`.

## What We're NOT Doing

- Finalny zapis grafiku / zmiana statusu na `saved` (S-06) — edycja działa tylko na draftzie.
- Ostrzeżenie o nakładce dwóch RÓŻNYCH osób — to nie kolizja (dwie osoby w szczycie są normalne; fixture z seeda służy jako test negatywny).
- Blokada operacji tworzących nakładkę tej samej osoby — nakładka to ostrzeżenie, nie błąd (spójnie z trybem ostrzeżeń).
- Przeciąganie na siatce (drag&drop) i nowy widok kalendarzowy — edycja w miejscu na liście per dzień.
- Automatyczne testy — decyzja użytkownika 2026-09-13 (wracają w `testing-runner-core-logic`).
- Zmiany w schemacie, migracjach i seedzie; eksport tekstowy (S-07); archiwum (S-08).

## Implementation Approach

Pionowy slice po wydeptanym wzorcu S-01–S-04: czysta logika kolizji i walidacji okna czasowego w `schedule-generation.ts` (bez I/O, gotowa do przyszłych testów), parsery w `schedule-validation.ts`, CRUD przypisań w `schedule.ts`, nowy endpoint `src/pages/api/schedules/assignments.ts` (POST/PUT/DELETE per-zmiana; GET/POST/DELETE tygodniowe zostają na `index.ts`, stary PUT z twardą blokadą zostaje usunięty), islanda `ScheduleBoard.tsx` jako właścicielka stanu edycji. Flagi obu kolizji — „poza dostępnością" (`findUncoveredRanges`) i nakładki tej samej osoby (`findSelfOverlaps`) — są **liczone** przy renderze, nigdy nie przechowywane, dzięki czemu po każdej operacji i po odświeżeniu widok zawsze odzwierciedla rzeczywistość (guardrail: kolizja nie znika po cichu).

Przy okazji: wyciągnięcie zduplikowanych helperów endpointów (`resolveRequestContext`, `resolveBusinessId`) do `src/lib/api.ts` i refaktor istniejących dwóch tras — lekcja „nie kopiuj helperów między endpointami" zanim trzeci endpoint zdąży je rozjechać.

## Critical Implementation Details

- **Zdjęcie twardej blokady zamiany** — obecny PUT na `index.ts` odrzuca niedostępnego pracownika 409; w trybie ostrzeżeń serwer **akceptuje** każdą osobę z biznesu (guard: 404 tylko spoza biznesu), a kolizję wyświetla wyłącznie klient. Usunięte zostaje też nieużywane stałe `ERROR_EMPLOYEE_NOT_AVAILABLE`.
- **Okno otwarcia jako warunek twardy (klient + serwer)** — zmiana musi spełniać `start < end` i mieścić się w `[opensAt, closesAt)` dnia (dzień zamknięty → brak okna). Klient pokazuje błąd inline bez wysyłki; serwer odpowiada 400 `ERROR_OUTSIDE_OPENING_HOURS` jako zapora.
- **workDate przy dodawaniu musi należeć do tygodnia draftu** (`weekStart ≤ workDate ≤ addDays(weekStart,6)`) — inaczej 400; dzień z daty wyliczany przez `isoWeekday(workDate)`, nie z formularza.
- **Sekcje „Dostępni/Niedostępni" liczą wyłącznie dostępność** — podwójna rezerwacja nie przenosi osoby do „Niedostępni" przy wyborze; ujawnia się flagą po zapisie (jeden mechanizm sygnalizacji, prostszy select).
- **Edycja w miejscu musi być odwoływalna**: nawigacja tygodnia podczas otwartej edycji/dodawania zamyka formularz (stan per-dzień/per-zmiana czyszczony w `goToWeek`, jak już robi to `setDeleting(false)`), a akcje mutujące są blokowane na czas `navPending` (konwencja widoku).

## Phase 1: Logika kolizji, walidacja czasu i serwis przypisań

### Overview

Warstwa domenowa: czyste funkcje wykrywania niedopięcia dostępności i sprawdzania okna otwarcia, nowe parsery, CRUD przypisań w serwisie.

### Changes Required:

#### 1. Czysta logika kolizji i okna otwarcia

**File**: `src/lib/services/schedule-generation.ts`

**Intent**: Trzy nowe czyste funkcje (bez I/O), korzystające z istniejących `mergeIntervals`/`clipIntervals`. `findUncoveredRanges` zwraca fragmenty zmiany NIEpokryte dostępnością pracownika (dane do flagi „⚠ Poza dostępnością"); brak jakiegokolwiek wiersza dostępności w danym dniu = cała zmiana niepokryta. `findSelfOverlaps` zwraca nakładki zmiany z INNYMI zmianami tej samej osoby w tym samym dniu (dane do flagi „⚠ Nakładka z inną zmianą tej samej osoby"). `isWithinOpeningHours` sprawdza twardy warunek okna.

**Contract**: sygnatury, od których zależą fazy 2–3 (czasy `"HH:MM"`, daty `"YYYY-MM-DD"`):

```ts
// fragmenty [start,end) niepokryte dostępnością pracownika — do flagi kolizji
findUncoveredRanges(
  availabilities: DraftInput["availabilities"],
  employeeId: string,
  workDate: string,
  startTime: string,
  endTime: string,
): { startTime: string; endTime: string }[];

// nakładki [start,end) z INNYMI zmianami tej samej osoby w tym samym dniu — do flagi kolizji
findSelfOverlaps(
  assignments: DraftPiece[], // pozostałe zmiany tygodnia (bez sprawdzanej)
  target: DraftPiece,
): { startTime: string; endTime: string }[];

// dzień zamknięty, start >= end albo wyjście poza [opensAt, closesAt) → false
isWithinOpeningHours(
  openingHours: DraftInput["openingHours"],
  weekday: number, // 1..7 (Pn=1)
  startTime: string,
  endTime: string,
): boolean;
```

#### 2. Parsery wejścia zmiany

**File**: `src/lib/services/schedule-validation.ts`

**Intent**: Parsery w istniejącej konwencji dyskryminowanych unii `{ value } | { fieldError }`, komunikaty po polsku, reużywane przez islandę i endpoint.

**Contract**: `parseShiftTime(raw)` — format `GG:MM`, godzina 00–23, minuta 00–59 (błąd: „Podaj godzinę w formacie GG:MM (np. 08:30)."); `parseWorkDate(raw)` — `YYYY-MM-DD`, prawdziwa data (nie wymaga poniedziałku — błąd: „Podaj datę zmiany w formacie RRRR-MM-DD.").

#### 3. CRUD przypisań w serwisie

**File**: `src/lib/services/schedule.ts`

**Intent**: Jedyny punkt I/O dla pojedynczych przypisań, w konwencji istniejących funkcji (`ServiceResult<T>`, `business_id` w każdym zapytaniu, normalizacja czasów wiersza).

**Contract**: `createAssignment(supabase, businessId, scheduleId, piece: DraftPiece): Promise<ServiceResult<AssignmentRow>>` (insert z `business_id`); `updateAssignmentTimes(supabase, businessId, assignmentId, startTime, endTime): Promise<ServiceResult<AssignmentRow>>`; `deleteAssignment(supabase, businessId, assignmentId): Promise<ServiceResult<AssignmentRow>>` (`.delete().select().single()` → `PGRST116` mapowane przez endpoint na 404). Zamiana osoby używa istniejącego `updateAssignmentEmployee`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi bez błędów typów
- `npm run lint` bez błędów
- `npx astro check` bez błędów typów (lekcja: sync/lint/build nie łapią rozjazdu kontraktów)
- `npm run build` kończy się sukcesem

#### Manual Verification:

- (po fazie 3 — warstwa czysta i serwis weryfikowane scenariuszami E2E)

---

## Phase 2: Endpointy API przypisań + wspólny kontekst endpointów

### Overview

Nowy route per-przypisaniowy (dodaj / edytuj / usuń), zdjęcie twardej blokady niedostępnych osób, wyciągnięcie zduplikowanych helperów do `src/lib/api.ts`.

### Changes Required:

#### 1. Stałe komunikatów błędów

**File**: `src/lib/http.ts`

**Intent**: Nowe polskie stałe w konwencji `ERROR_*`; usunięcie `ERROR_EMPLOYEE_NOT_AVAILABLE` (jedyny jego użytek — twarda blokada — znika w tym samym fazie).

**Contract**: `ERROR_OUTSIDE_OPENING_HOURS` = „Zmiana musi mieścić się w godzinach otwarcia lokalu na wybrany dzień." oraz `ERROR_WORK_DATE_OUT_OF_WEEK` = „Data zmiany musi należeć do wybranego tygodnia." (oba zwracane jako 400).

#### 2. Wspólny kontekst endpointów

**File**: `src/lib/api.ts` (nowy) + refaktor `src/pages/api/availabilities/index.ts`, `src/pages/api/schedules/index.ts`

**Intent**: Lekcja z `lessons.md` — trzeci endpoint nie może skopiować plikowo-lokalnych helperów. Wyciągnięcie `resolveRequestContext` i `resolveBusinessId` (dokładnie te ciała z `src/pages/api/schedules/index.ts:41-72`) do modułu i podpięcie obu istniejących tras.

**Contract**: `resolveRequestContext(context: APIContext): { supabase; ownerId } | Response`; `resolveBusinessId(supabase, ownerId): Promise<string | Response>` — zachowanie identyczne jak dziś (401/500/404).

#### 3. Route przypisań

**File**: `src/pages/api/schedules/assignments.ts` (nowy)

**Intent**: Operacje na pojedynczej zmianie w draftzie. Kolejność walidacji jak w `index.ts`; guard draftu przez `getAssignmentWithSchedule` (dla POST: `getScheduleByWeek`).

**Contract**:
- `POST { weekStart, employeeId, workDate, startTime, endTime }` → walidacje pól (400 z `fieldErrors`) → biznes 404 → grafik: brak → 404 `ERROR_SCHEDULE_NOT_FOUND`, status ≠ `draft` → 409 `ERROR_SAVED_SCHEDULE` → `workDate` w tygodniu, inaczej 400 → okno otwarcia (`isWithinOpeningHours` z `isoWeekday(workDate)`), inaczej 400 `ERROR_OUTSIDE_OPENING_HOURS` → pracownik w biznesie 404 `ERROR_EMPLOYEE_NOT_FOUND` → `createAssignment` → `201 { assignment }`.
- `PUT { assignmentId, employeeId?, startTime?, endTime? }` → `assignmentId` wymagane; pozostałe pola opcjonalne (min. jedno obecne, inaczej 400) → przypisanie 404 → guard draftu 409 → jeśli `employeeId`: pracownik w biznesie 404 (bez sprawdzania dostępności — tryb ostrzeżeń) → docelowe czasy = podane albo bieżące; jeśli czasy podane: okno otwarcia dnia przypisania, inaczej 400 → update (osoba / czasy / oba) → `200 { assignment }`.
- `DELETE { assignmentId }` → 404 → guard draftu 409 → `deleteAssignment` → `200 { deleted: true }`.

#### 4. Sprzątanie starego PUT

**File**: `src/pages/api/schedules/index.ts`

**Intent**: Usunięcie handlera `PUT` (zamiana przeniesiona do nowego route; twarda blokada `isFullyCovered` znika) wraz z importami, które zostają bezużyteczne.

**Contract**: `index.ts` pozostaje z GET/POST/DELETE (odczyt tygodnia, generacja, usunięcie draftu); brak zmian w ich zachowaniu.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi
- `npm run lint` bez błędów
- `npx astro check` bez błędów typów
- `npm run build` kończy się sukcesem

#### Manual Verification:

- (po fazie 3 — endpointy weryfikowane scenariuszami E2E)

---

## Phase 3: Islanda ScheduleBoard — edycja w miejscu z flagami kolizji

### Overview

Pełna edycja w widoku listy: flagi kolizji, inline-edycja czasu, select z dwiema sekcjami, dodawanie zmiany (także z klikniętej dziury), usuwanie ze zmianą, logowanie błędów SSR.

### Changes Required:

#### 1. Islanda — flagi, edycja, wybór osoby

**File**: `src/components/schedules/ScheduleBoard.tsx`

**Intent**: Rozszerzenie widoku o zdolności, każda na istniejącym stanie tygodnia (bez nowych źródeł danych):
- **Nagłówek dnia z godzinami otwarcia**: karta każdego dnia otwarte pokazuje okno lokalu (np. „Pn 14.09 · 08:00 – 18:00" obok daty); dzień zamknięty zachowuje „Nieczynne". Okno jest jednocześnie źródłem prefillu formularza dodawania zmiany i granicą walidacji edycji (poniżej) — użytkownik widzi granice, których pilnuje system.
- **Flagi kolizji**: przy renderze każdej zmiany dwie detekcje — `findUncoveredRanges(weekData.availabilities, row.employee_id, row.work_date, row.start_time, row.end_time)` → chip „⚠ Poza dostępnością: {zakresy}" oraz `findSelfOverlaps(pozostałe zmiany tygodnia, row)` → chip „⚠ Nakładka z inną zmianą tej samej osoby: {zakresy}" (konwencja stylu `holeClass`, paleta amber). Flagi liczone przy każdym renderze — po każdej operacji i po F5 są aktualne.
- **Edycja w miejscu**: per zmiana przycisk „Edytuj" → dwa pola `<input type="time">` (`[color-scheme:dark]` jak `selectClass`) wypełnione bieżącymi godzinami + Zapisz/Anuluj. Walidacja klienta (format, `start < end`, `isWithinOpeningHours`) → błąd inline bez wysyłki; sukces → PUT `{ assignmentId, startTime, endTime }` → podmiana wiersza w stanie.
- **Wybór osoby z dwiema sekcjami**: select „Zamień na…" widoczny, gdy są inni pracownicy; `<optgroup label="Dostępni">` (osoby z `isFullyCovered` na pełny przedział zmiany) i `<optgroup label="Niedostępni">` (pozostali, etykieta „{imię} (poza dostępnością)"). Wybór z obu sekcji → PUT `{ assignmentId, employeeId }` → serwer akceptuje; flaga pojawi się sama (liczenie przy renderze).
- **Dodawanie zmiany**: w każdym otwartym dniu (gdy draft istnieje) „＋ Dodaj zmianę" → inline formularz: select osoby (te same dwie sekcje, liczony dla bieżących wartości pól), dwa pola czasu (domyślnie godziny otwarcia dnia). Wpis dziury dostaje dodatkowo „＋ Obsadź", które otwiera ten sam formularz z czasami wypełnionymi zakresem dziury. POST `{ weekStart, employeeId, workDate, startTime, endTime }` → dołączenie wiersza; dziury przeliczają się same.
- **Usuwanie zmiany**: przy zmianie ikona kosza (`lucide-react`, `size-4`) → potwierdzenie dwuprzyciskowe inline (wzorzec `ScheduleBoard.tsx:377-416`) → DELETE `{ assignmentId }` → usunięcie wiersza ze stanu.
- Akcje zablokowane na czas `navPending` i własnych pending-state'ów; otwarta edycja/dodawanie zamykane przy zmianie tygodnia.

**Contract**: klasy przez `cn()`; nowe stany: `editingId`, `addingFor: { workDate: string; startTime: string; endTime: string } | null`, potwierdzenie usunięcia per-zmiana; żądania do `/api/schedules/assignments` (POST/PUT/DELETE), błędy przez `useApiErrorState`/`ServerError`.

#### 2. Logowanie błędów SSR — JUŻ W DRZEWIE ROBOCZYM

**File**: `src/pages/schedules/index.astro`

**Intent**: Diagnozowalność zgłoszonego błędu pobierania — gałąź `listsFailed` loguje, KTÓRE zapytanie padło i z jakim błędem. **Ta zmiana została wprowadzona już w trakcie planowania** (diagnostyka na żywo, 2026-09-13) i siedzi niekommitowana w drzewie roboczym — faza 3 jedynie ją weryfikuje i commituje.

**Contract**: `console.error` z zebranymi błędami poszczególnych zapytań (pracownicy, godziny, grafik, dostępności, przypisania) przed renderem komunikatu; treść komunikatu w UI bez zmian.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi
- `npm run lint` bez błędów
- `npx astro check` bez błędów typów
- `npm run build` kończy się sukcesem

#### Manual Verification:

- Wszystkie scenariusze E2E z sekcji Testing Strategy przechodzą klik-po-kliku
- Flagi kolizji widoczne natychmiast po operacji i po odświeżeniu strony (guardrail „po cichu")
- Dziury aktualizują się po każdej operacji i nie znikają z ekranu

---

## Testing Strategy

### Unit Tests:

- Świadomie brak (decyzja użytkownika 2026-09-13); nowe funkcje w `schedule-generation.ts` pisane czysto, bez I/O — testy w `testing-runner-core-logic` wejdą bez refaktoru.

### Integration Tests:

- Świadomie brak; kontrakt endpointów udokumentowany w fazie 2.

### Manual Testing Steps:

Scenariusze klik-po-kliku. Punkt startowy wszystkich: z WSL w katalogu projektu `supabase start` + `supabase db reset` (seed: `owner@example.com` / `haslo12345`), z PowerShell `npm run dev`; przeglądarka `http://localhost:4321`.

**A. Konto seeda — następny tydzień, generacja i flaga kolizji przy zamianie:**
1. Zaloguj się (`/auth/signin`) na `owner@example.com` / `haslo12345`, z dashboardu kliknij „Grafik".
2. Oczekiwane: widok następnego tygodnia (Pn 14.09 – Nd 20.09), nagłówki dni otwarcia z zakresem („Pn 14.09 · 08:00 – 18:00" … „So 19.09 · 10:00 – 22:00"), niedziela „Nieczynne", brak draftu, całodzienne dziury, „Generuj draft" aktywny.
3. Kliknij „Generuj draft". Oczekiwane zmiany (reguła S-04): Pon: Anna 08:00–16:00 + Piotr 16:00–18:00; Wt: Anna 08:00–16:00 + dziura 16:00–18:00; Śr: dziura 08:00–12:00 + Piotr 12:00–20:00; Cz: Maria 08:00–16:00 + dziura 16:00–20:00; Pt: Tomasz 08:00–22:00; So: Katarzyna 10:00–22:00; Nd „Nieczynne". Żadna zmiana nie ma flagi.
4. Przy zmianie Anny (Wt 08:00–16:00) otwórz „Zamień na…". Oczekiwane: dwie sekcje — „Dostępni": Maria Wiśniewska; „Niedostępni": Piotr Nowak i Tomasz Zieliński (z dopiskiem „(poza dostępnością)").
5. Wybierz Piotra Nowaka z „Niedostępni". Oczekiwane: wiersz od razu pokazuje Piotra, a pod nim żółty chip „⚠ Poza dostępnością: 08:00 – 12:00" (Piotr ma we wt 12:00–20:00) — bez przeładowania strony.
6. Odśwież stronę (F5). Oczekiwane: zamiana i flaga widoczne nadal identycznie (zapis do bazy, flaga liczona przy odczycie).

**B. Przesuwanie zmiany i przeliczanie dziur:**
1. Przy zmianie Piotra (Wt, po scenariuszu A: 08:00–16:00) kliknij „Edytuj". Oczekiwane: pola czasu wypełnione 08:00 / 16:00.
2. Zmień na 10:00 – 16:00, kliknij „Zapisz". Oczekiwane: wiersz 10:00–16:00; chip aktualizuje się na „⚠ Poza dostępnością: 10:00 – 12:00"; dziury wtorku: 08:00–10:00 i 16:00–18:00.
3. Kliknij „Edytuj", ustaw 07:30 – 16:00, kliknij „Zapisz". Oczekiwane: błąd inline przy polu („Zmiana musi mieścić się w godzinach otwarcia lokalu…"), żądanie nie wychodzi, tryb edycji pozostaje otwarty.
4. Anuluj edycję. Oczekiwane: powrót do wiersza 10:00–16:00 bez zmian w danych.
5. Odśwież stronę (F5) i ponownie przejdź scenariusz B.2–B.4 przez bezpośrednie żądanie API (np. konsola przeglądarki: `fetch('/api/schedules/assignments', {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({assignmentId:'<id zmiany>', startTime:'07:30', endTime:'16:00'})}).then(r=>r.status)`). Oczekiwane: HTTP 400 z komunikatem o godzinach otwarcia (zapora serwerowa).

**C. Dodawanie zmiany z dziury — bez kolizji:**
1. W wtorek przy dziurze 16:00–18:00 kliknij „＋ Obsadź". Oczekiwane: formularz z czasami 16:00 / 18:00.
2. Wybierz Piotra Nowaka (sekcja „Dostępni" — jego dostępność 12:00–20:00 pokrywa 16:00–18:00) i potwierdź.
3. Oczekiwane: nowy wiersz Piotr 16:00–18:00 bez flagi; dziura 16:00–18:00 znika z wtorku.

**D. Dodawanie zmiany z dziury — z kolizją:**
1. W środę przy dziurze 08:00–12:00 kliknij „＋ Obsadź". Oczekiwane: formularz 08:00 / 12:00; w selekcie sekcja „Dostępni" pusta (nikt nie ma dostępności w Śr przed 12:00), wszyscy w „Niedostępni".
2. Wybierz Marię Wiśniewską i potwierdź.
3. Oczekiwane: wiersz Maria 08:00–12:00 z flagą „⚠ Poza dostępnością: 08:00 – 12:00" (Maria ma Śr brak dostępności); dziura 08:00–12:00 znika z widoku.

**E. Usuwanie zmiany:**
1. Przy zmianie Marii ze środy (scenariusz D) kliknij ikonę kosza. Oczekiwane: inline potwierdzenie („Usunąć zmianę…?").
2. Potwierdź. Oczekiwane: wiersz znika, dziura 08:00–12:00 wraca.

**F. Fixture na bieżącym tygodniu (‹ nawigacja) — flagi prezydencjące i test negatywny nakładki:**
1. Kliknij „Poprzedni" (bieżący tydzień, draft ze seeda). Oczekiwane:
   - Pon: Anna 08:00–14:00 i Piotr 13:00–18:00 — **bez flag** (oboje dostępni; nakładka dwóch różnych osób NIE jest kolizją),
   - Wt: Maria 08:00–14:00 bez flagi; Tomasz 14:00–18:00 z flagą „⚠ Poza dostępnością: 14:00 – 18:00" (brak dostępności we wt),
   - Śr: Katarzyna 08:00–12:00 z flagą (całość) i Anna 12:00–20:00 z flagą (całość),
   - Cz–So: całodzienne dziury; Nd „Nieczynne".
2. Przy zmianie Tomasza (Wt) otwórz „Zamień na…". Oczekiwane: sekcja „Dostępni" pusta/nieobecna, wszystkie osoby w „Niedostępni".
3. Wybierz Marię. Oczekiwane: wiersz Maria 14:00–18:00 z flagą „⚠ Poza dostępnością: 16:00 – 18:00" (Maria dostępna we wt 08:00–16:00).

**G. Świeże konto — edycja od zera:**
1. Wyloguj się, zarejestruj nowe konto, załóż biznes Pn–Pt 09:00–17:00, dodaj 1 pracownika z dostępnością w przyszły poniedziałek 10:00–14:00, wejdź na „Grafik", kliknij „Generuj draft".
2. Oczekiwane: Pon: zmiana 10:00–14:00 + dziury 09:00–10:00 i 14:00–17:00; Wt–Pt całe dziury.
3. Usuń jedyną zmianę (scenariusz E). Oczekiwane: Pon wraca do całodziennej dziury; „Dodaj zmianę" pozwala odtworzyć ją ręcznie (formularz z domyślnymi godzinami 09:00 / 17:00, po zapisie flaga „10:00 – 14:00", bo pracownik ma dostępność tylko 10:00–14:00).

**H. Podwójna rezerwacja tej samej osoby (fixture tworzony ręcznie, następny tydzień):**
1. Po scenariuszu A Piotr ma w środę zmianę 12:00–20:00. Przy dziurze Śr 08:00–12:00 kliknij „＋ Obsadź", zmień czasy na 11:00 / 13:00, wybierz Piotra Nowaka i potwierdź.
2. Oczekiwane: nowy wiersz Piotr 11:00–13:00 — bez flagi „poza dostępnością" (Piotr ma Śr 12:00–20:00, co pokrywa… nakładkę, nie zmianę) — a OBIE zmiany Piotra (11:00–13:00 i 12:00–20:00) dostają chip „⚠ Nakładka z inną zmianą tej samej osoby: 12:00 – 13:00"; nakładka dwóch RÓŻNYCH osób (Pon: Anna + Piotr w bieżącym tygodniu) nadal nie daje flagi.
3. Usuń zmianę 11:00–13:00. Oczekiwane: chip znika natychmiast z obu wierszy (flagi liczone przy renderze), dziura Śr 08:00–12:00 wraca.

## Performance Considerations

Skala MVP (~5 pracowników, ≤ kilkanaście zmian/tydzień): flagi liczone przy każdym renderze z już pobranych danych (dziesiątki przedziałów) — koszt pomijalny; nowe endpointy to pojedyncze zapytania na operację. Brak dalszych optymalizacji (main_goal=speed).

## Migration Notes

Brak migracji i zmian schematu; `npm run db:types` zbędne. Seed bez zmian — fixture (nakładka + zmiany poza dostępnością) już jest.

## References

- Roadmap: `context/foundation/roadmap.md` (S-05) · PRD: `context/foundation/prd.md` (FR-009, FR-010, US-01, US-03, Guardrails, Open Q #1)
- Poprzedni plan: `context/archive/2026-09-13-schedule-draft-generation/plan.md`
- Wzorce: `src/pages/api/schedules/index.ts` (konwencja endpointu) · `src/components/schedules/ScheduleBoard.tsx` (stan tygodnia) · `src/lib/services/schedule.ts` (ServiceResult)
- Lekcje: `context/foundation/lessons.md` (helpery w `src/lib/`, `npx astro check` w bramce, scenariusze E2E klik-po-kliku)
- Schemat: `supabase/migrations/20260912141307_domain_schema.sql:97-140` · Seed: `supabase/seed.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Logika kolizji, walidacja czasu i serwis przypisań

#### Automated

- [x] 1.1 `npx astro sync` przechodzi bez błędów typów
- [x] 1.2 `npm run lint` bez błędów
- [x] 1.3 `npx astro check` bez błędów typów
- [x] 1.4 `npm run build` kończy się sukcesem

### Phase 2: Endpointy API przypisań + wspólny kontekst endpointów

#### Automated

- [ ] 2.1 `npx astro sync` przechodzi
- [ ] 2.2 `npm run lint` bez błędów
- [ ] 2.3 `npx astro check` bez błędów typów
- [ ] 2.4 `npm run build` kończy się sukcesem

### Phase 3: Islanda ScheduleBoard — edycja w miejscu

#### Automated

- [ ] 3.1 `npx astro sync` przechodzi
- [ ] 3.2 `npm run lint` bez błędów
- [ ] 3.3 `npx astro check` bez błędów typów
- [ ] 3.4 `npm run build` kończy się sukcesem

#### Manual

- [ ] 3.5 Scenariusz A: nagłówki dni z godzinami otwarcia + generacja następnego tygodnia + zamiana na niedostępnego z natychmiastową flagą, trwałość po F5
- [ ] 3.6 Scenariusz B: przesuwanie zmiany, przeliczanie dziur i flagi, walidacja okna (klient + zapora serwerowa)
- [ ] 3.7 Scenariusz C: dodanie zmiany z dziury bez kolizji
- [ ] 3.8 Scenariusz D: dodanie zmiany z dziury z kolizją (sekcja „Niedostępni" w formularzu)
- [ ] 3.9 Scenariusz E: usuwanie zmiany z potwierdzeniem, dziura wraca
- [ ] 3.10 Scenariusz F: fixture bieżącego tygodnia — nakładka dwóch osób bez flagi, flagi prezydencją, zamiana na niedostępnego
- [ ] 3.11 Scenariusz G: świeże konto — edycja od zera (dodanie, usunięcie, flaga po dodaniu poza dostępnością)
- [ ] 3.12 Scenariusz H: podwójna rezerwacja tej samej osoby — flaga na obu nakładających się zmianach, znika po usunięciu
