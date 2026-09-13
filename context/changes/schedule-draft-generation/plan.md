# Generowanie draftu grafiku z dostępności i widok dziur (S-04) — Implementation Plan

## Overview

Właściciel generuje bazowy draft grafiku tygodnia z dostępności pracowników i widzi nieobsadzone godziny otwarcia („dziury"). Draft zapisuje się od razu w bazie jako wersja robocza (`status: 'draft'`); widok to lista per dzień w stylu widoku dostępności, z czerwonymi wpisami dziur. Przy każdej zmianie Janusz może zamienić osobę na inną **w pełni dostępną** na te godziny; blokada regeneracji ma awaryjne „Usuń draft".

Realizuje FR-007, FR-008 i część generacyjną US-01; granica z S-05: pełna edycja (przesuwanie zmian, osoby niedostępne, ostrzeżenia o kolizjach) NIE wchodzi.

## Current State Analysis

- Schemat gotowy: `schedules` (`business_id`, `week_start` ISO poniedziałek, `status: 'draft'|'saved'`, unikalny `(business_id, week_start)`) i `assignments` (bez ograniczeń nakładania — decyzja F-01: ostrzeżenia w aplikacji, domena S-05). Migracje: `supabase/migrations/20260912141307_domain_schema.sql:97-140`; typy: `src/lib/database.types.ts:37-87, 226-260`.
- Zero kodu grafiku: brak serwisu, endpointu, strony i komponentów. Wzorzec do skopiowania: S-03 (`src/lib/services/availability.ts`, `src/pages/api/availabilities/index.ts`, `src/components/availabilities/AvailabilityManager.tsx`, `src/pages/availabilities/index.astro`).
- `src/lib/week.ts` (`nextMonday`, `weekStartOf`, `addDays`, `formatWeekLabel`) napisane wprost z myślą o reużyciu w S-04.
- Seed (`supabase/seed.sql`): konto `owner@example.com` / `haslo12345`; dostępności 3 tygodni (−7/0/+7 względem poniedziałku); draft na **bieżący** tydzień z celowymi dziurami i nakładką (fixture S-05); **przyszły** tydzień ma dostępności, a nie ma draftu — naturalny scenariusz E2E generacji.
- Bootstrap testów (folder `testing-runner-core-logic`) nie istnieje — decyzja użytkownika: testy automatyczne NIE wchodzą do tej zmiany.

## Desired End State

Po wejściu na `/schedules` właściciel widoi tydzień (domyślnie następny poniedziałek–niedziela) z listą dni: dla każdego dnia z godzinami otwarcia — wygenerowane/przechowywane zmiany (kto, od–do) oraz czerwone wpisy „dziura HH:MM–HH:MM" dla każdego niepokrytego odcinka godzin otwarcia. Przycisk „Generuj draft" tworzy draft z dostępności (zapis do bazy) i jest zablokowany, gdy draft istnieje; „Usuń draft" pozwala zacząć od nowa. Przy zmianie: lista „inni dostępni" (osoby z dostępnością pokrywającą **cały** przedział zmiany) umożliwia zamianę osoby. Weryfikacja: ręczne scenariusze E2E (sekcja Testing Strategy) + brama CI.

### Key Discoveries:

- `assignments` wymaga `business_id` przy każdym insertcie (złożone FK `(business_id, schedule_id)` i `(business_id, employee_id)`) — `supabase/migrations/20260912141307_domain_schema.sql:127-130`.
- Unikalny `(business_id, week_start)` → w tej zmianie nie ma regeneracji (przycisk zablokowany), więc insert zawsze idzie po sprawdzeniu istnienia; kod `23505` mapowany na 409 jako zapora serwerowa.
- Dostępności są kluczowane konkretną datą `work_date` — pobieranie musi być ograniczone zakresem tygodnia (`work_date` między `week_start` a `+6 dni`); spełnia obietnicę S-03 Addendum F4 („filtr dat wraca przy S-04").
- Brak jakiejkolwiek walidacji `assignments` w bazie (nakładanie, przynależność do tygodnia, status) — wszystko na poziomie aplikacji.
- `time` z Postgresta wraca jako `"HH:MM:SS"` → normalizacja do `"HH:MM"` (wzorzec `normalizeTime`, `src/lib/services/business.ts:19`).
- Godziny otwarcia bez `overnight` (`closes_at > opens_at`) — każda zmiana mieści się w jednym dniu kalendarzowym.
- RLS tylko właściciel (`is_business_owner`, `security definer`) — wszystkie zapytania przez klienta cookie z `src/lib/supabase.ts`; nigdy service-role.

## What We're NOT Doing

- Ręczna edycja zmian (przesuwanie, skracanie/wydłużanie, przypisywanie osób niedostępnych, ostrzeżenia o kolizjach) — S-05.
- Finalny zapis grafiku / zmiana statusu na `saved` — S-06.
- Optymalizacja algorytmiczna / rozwiązywanie konfliktów (PRD §Non-Goals).
- Automatyczne testy — decyzja użytkownika 2026-09-13; wracają w `testing-runner-core-logic`.
- Eksport tekstowy (S-07), archiwum (S-08), zmiany w seedzie, nowe migracje (schemat kompletny).

## Implementation Approach

Pionowy slice po wydeptanym wzorcu S-01–S-03: czysta logika w `src/lib/services/schedule-generation.ts` (bez I/O — gotowa do przyszłych testów), dostęp do danych w `src/lib/services/schedule.ts`, walidacja w `schedule-validation.ts` (współdzielona klient/serwer), endpoint `src/pages/api/schedules/index.ts` (GET/POST/PUT/DELETE, kolejność błędów jak w `availabilities/index.ts`), strona SSR `src/pages/schedules/index.astro` + islanda `ScheduleBoard.tsx` właścicielka stanu. Dziury są **liczone**, nie przechowywane: `computeHoles(godzinyOtwarcia, przypisania)` — dzięki temu po edycjach S-05 i zapisie S-06 widok zawsze odzwierciedla rzeczywistość, a dziura nie może „zniknąć" z ekranu (guardrail PRD).

Reguła wyboru pracownika przy generacji: na każdym odcinku bierzemy dostępnego pracownika o **najdłuższym pozostałym ciągu dostępności** (remis: alfabetycznie po nazwisku) — zmiany wychodzą dłuższe i mniej pocięte; pokrycie i dziury są identyczne dla każdej deterministycznej reguły (dziura = odcinek, gdzie NIKT nie jest dostępny).

## Critical Implementation Details

- **Kolejność walidacji endpointów**: 401 → 500 (klient) → 400 (body) → 400 (walidacja pól) → 404 (biznes/przypisanie/pracownik) → 409 (konflikt) → 500; stałe komunikatów wyłącznie z `src/lib/http.ts` (lekcja: nie kopiować między endpointami).
- **Insert `assignments` zawsze z `business_id`** — złożone FK odrzucą wiersz bez zgodności biznesowej; batch insert po utworzeniu `schedules` (id z odpowiedzi insertu). Zapis celowo bez transakcji (Supabase REST): gdyby batch padł po utworzeniu nagłówka, zostaje pusty draft, a ratunkiem jest „Usuń draft".
- **`week_start` musi być poniedziałkiem** (CHECK w bazie) — `parseWeekStart` wymusza `weekStartOf(raw) === raw`; strona oblicza domyślny tydzień jako `nextMonday(dziś)` po stronie serwera (strefa `Europe/Warsaw`), jak w `availabilities/index.astro:28-29`.
- **Dziury liczone przy odczycie** z godzin otwarcia + przypisań ( klient, z czystej funkcji) — nigdy nie zapisywane; dziura na dzień bez godzin otwarcia nie istnieje (dzień nieczynny).
- **Przycinanie dostępności**: generator klipuje przedziały dostępności do okna `[opens_at, closes_at)` danego dnia; dostępność wykraczająca poza godziny otwarcia nie tworzy zmiany poza lokalem.
- **Zamiana osoby (PUT)**: nowa osoba musi pokryć **cały** przedział zmiany (bez dzielenia zmian w S-04); brak pokrycia → 409 `ERROR_EMPLOYEE_NOT_AVAILABLE`. Ostrzeżenia o nakładaniu się zmian tej samej osoby — S-05, świadomie nie tu.
- **Zamiana/usuwanie tylko draftu**: operacje mutujące sprawdzają `status === 'draft'` i odmawiają dla `saved` (409 `ERROR_SAVED_SCHEDULE`) — guardrail pod S-06, zaimplementowany już teraz, bo status istnieje w schemacie.
- **Nawigacja tygodniowa klientowa**: dane statyczne (pracownicy, godziny otwarcia) przychodzą z SSR jako props; dane tygodnia (draft, przypisania, dostępności) islanda pobiera GET-em przy zmianie tygodnia — fetch zawsze ograniczony do 7 dni.

## Phase 1: Serwis, walidacja i czysta logika generacji

### Overview

Warstwa domenowa: czysty generator draftu i licznik dziur, dostęp do danych per tydzień, parsowanie wejścia.

### Changes Required:

#### 1. Czysty generator draftu

**File**: `src/lib/services/schedule-generation.ts` (nowy)

**Intent**: Deterministyczna, bez I/O logika: dostępności + godziny otwarcia → przypisania i dziury. Punktwy sweep per dzień: na odcinku `t` wybierz dostępnego pracownika z największym `end` (remis: `name` alfabetycznie pl, potem `id`), przypisz `[t, end)`, przeskocz; przerwy → dziury. Wpisy dostępności pracownika na dany dzień (schemat dopuszcza wiele wierszy z przerwami) scalaj najpierw w sumę przedziałów — i do sweepa, i do `isFullyCovered`. Sąsiednie segmenty tej samej osoby scalają się naturalnie.

**Contract**: sygnatury, od których zależą fazy 2–3 (czasy `"HH:MM"`, porównywalne leksykograficznie; daty `"YYYY-MM-DD"`):

```ts
type DraftInput = {
  employees: { id: string; name: string }[];
  openingHours: { weekday: number; opensAt: string; closesAt: string }[]; // weekday 1..7 (Pn=1)
  availabilities: { employeeId: string; workDate: string; startTime: string; endTime: string }[];
};
type DraftPiece = { employeeId: string; workDate: string; startTime: string; endTime: string };
generateDraft(input: DraftInput): { assignments: DraftPiece[]; holes: Omit<DraftPiece, "employeeId">[] };
computeHoles(openingHours, assignments: DraftPiece[]): Omit<DraftPiece, "employeeId">[]; // widok dziur
isFullyCovered(availabilities, employeeId, workDate, start, end): boolean; // walidacja zamiany
```

#### 2. Serwis dostępu do danych grafiku

**File**: `src/lib/services/schedule.ts` (nowy)

**Intent**: Jedyny punkt I/O dla `schedules`/`assignments`, w konwencji `availability.ts` (`ServiceResult<T>`, `Supabase` alias, wiersze z `database.types.ts`, scoping `business_id` w każdym zapytaniu).

**Contract**: funkcje: `getScheduleByWeek(supabase, businessId, weekStart)` (row | null), `getAssignments(supabase, scheduleId)`, `getAssignmentWithSchedule(supabase, businessId, assignmentId)` (wiersz przypisania + status jego grafiku — dla PUT: 404, odmowa dla `saved`, dane do `isFullyCovered`), `getAvailabilitiesForWeek(supabase, businessId, weekStart)` (`.gte("work_date", weekStart).lte("work_date", addDays(weekStart, 6))` — realizacja F4), `createScheduleWithAssignments(supabase, businessId, weekStart, pieces)` (insert `schedules`, potem batch `assignments` z `business_id`), `updateAssignmentEmployee(supabase, businessId, assignmentId, employeeId)`, `deleteSchedule(supabase, businessId, scheduleId)`. Bez `updated_at` w zapisach (trigger). Typy wierszy eksportowane dla islandy.

#### 3. Walidacja wejścia grafiku

**File**: `src/lib/services/schedule-validation.ts` (nowy)

**Intent**: Czyste parsery w konwencji `availability-validation.ts` (dyskryminowane unie `{ value } | { fieldError }`, komunikaty po polsku), reużywane przez islandę i endpoint.

**Contract**: `parseWeekStart(raw)` — regex `YYYY-MM-DD` + prawdziwa data + `weekStartOf(raw) === raw` (błąd: „Podaj poniedziałek wybranego tygodnia w formacie RRRR-MM-DD"); `parseAssignmentId` / `parseEmployeeId` — UUID (wzorzec jak `parseEmployeeId` w `src/pages/api/employees/index.ts:74`).

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi bez błędów typów
- `npm run lint` bez błędów
- `npm run build` kończy się sukcesem

#### Manual Verification:

- (po fazie 3 — brak osobnej weryfikacji manualnej dla czystej warstwy)

---

## Phase 2: Endpointy API `/api/schedules`

### Overview

REST-owy endpoint grafiku: odczyt tygodnia, generacja, zamiana osoby, usunięcie draftu — z polskimi komunikatami błędów i zaporą serwerową na duplikat tygodnia.

### Changes Required:

#### 1. Stałe błędów

**File**: `src/lib/http.ts`

**Intent**: Nowe polskie stałe komunikatów (konwencja istniejących `ERROR_*`).

**Contract**: `ERROR_SCHEDULE_EXISTS` („Draft grafiku dla tego tygodnia już istnieje"), `ERROR_SCHEDULE_NOT_FOUND` („Nie znaleziono grafiku dla tego tygodnia"), `ERROR_SAVED_SCHEDULE` („Grafik jest już zapisany i nie można go zmieniać"), `ERROR_EMPLOYEE_NOT_AVAILABLE` („Wybrany pracownik nie jest dostępny w pełnym zakresie tej zmiany").

#### 2. Route handler

**File**: `src/pages/api/schedules/index.ts` (nowy)

**Intent**: Cztery metody w konwencji `availabilities/index.ts` (file-lokalne `resolveRequestContext` + `resolveBusinessId`, `jsonResponse`/`readJsonBody` z `@/lib/http`).

**Contract**:
- `GET ?week=YYYY-MM-DD` → `parseWeekStart`, 400 przy błędzie → `{ schedule, assignments, availabilities }` (schedule `null`, gdy brak draftu).
- `POST { weekStart }` → walidacja → 409 gdy `getScheduleByWeek` istnieje (backstop zablokowanego przycisku) → ładowanie `getOpeningHours` + pracowników + `getAvailabilitiesForWeek` → `generateDraft` → `createScheduleWithAssignments` → `201 { schedule, assignments }`; kod `23505` → 409.
- `PUT { assignmentId, employeeId }` → 404, gdy przypisanie nie należy do biznesu właściciela → 409 `ERROR_SAVED_SCHEDULE`, gdy status grafiku ≠ `draft` → 404 `ERROR_EMPLOYEE_NOT_FOUND`, gdy nowy pracownik spoza biznesu → 409 `ERROR_EMPLOYEE_NOT_AVAILABLE`, gdy `isFullyCovered` fałszywe → update → `200 { assignment }`; `PGRST116` → 404.
- `DELETE { weekStart }` → 404, gdy brak draftu → 409 `ERROR_SAVED_SCHEDULE`, gdy status ≠ `draft` → `200 { deleted: true }`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi
- `npm run lint` bez błędów
- `npm run build` kończy się sukcesem

#### Manual Verification:

- (po fazie 3 — endpointy weryfikowane scenariuszami E2E)

---

## Phase 3: Strona `/schedules`, islanda `ScheduleBoard`, nawigacja

### Overview

Widok tygodniowy „lista per dzień" ze zmianami i czerwonymi dziurami, akcje Generuj / Usuń draft / zamiana osoby, wpuszczenie route do ochrony i nawigacji.

### Changes Required:

#### 1. Strona SSR

**File**: `src/pages/schedules/index.astro` (nowy)

**Intent**: Kanoniczny szkielet strony (jak `availabilities/index.astro:1-75`): guard user → guard klienta → `getBusinessForOwner` (redirect `/business/setup`) → `DbErrorState` przy błędzie DB → załaduj pracowników i godziny otwarcia + dane domyślnego tygodnia (`nextMonday(dziś)` po `Europe/Warsaw`) → props do islandy `client:load`.

**Contract**: props islandy: `initialEmployees` (`{id, name}[]`, czasy znormalizowane do `"HH:MM"`), `openingHours` (tylko dni otwarte, `weekday`/`opensAt`/`closesAt`), `defaultWeekStart`, `initialWeekData` (`{ schedule, assignments, availabilities }` dla tygodnia domyślnego).

#### 2. Islanda widoku draftu

**File**: `src/components/schedules/ScheduleBoard.tsx` (nowa)

**Intent**: Właścicielka stanu tygodnia (konwencja `AvailabilityManager.tsx`): `weekStart`, dane tygodnia, pending, `useApiErrorState`. Nawigacja ‹ › tydzień (`addDays(±7)`, `formatWeekLabel`) → GET `/api/schedules?week=`. Widok: 7 dni (`addDays(weekStart, i)`), dzień nieczynny → „Nieczynne"; dzień otwarty → lista zmian (imię i nazwisko, `HH:MM–HH:MM`) + czerwone wpisy dziur z `computeHoles`. Akcje: „Generuj draft" (POST; disabled z podpowiedzią, gdy draft istnieje), „Usuń draft" (inline potwierdzenie dwuprzyciskowe jak w `AvailabilityManager.tsx:388-416`; DELETE → stan pustego tygodnia), przy każdej zmianie select „inni dostępni" (pula liczona klientowo: inni pracownicy z `isFullyCovered` na dostępnościach tygodnia; pusta pula → brak selecta) → PUT → podmiana wiersza w stanie.

**Contract**: klasy przez `cn()`; karta dnia `rounded-lg border border-white/10 bg-white/5`, dziura czerwona (styl błędu z `availabilities/index.astro:53-55`); sukces/błędy przez `ServerError`/inline; ikony `lucide-react` (`size-4`).

#### 3. Ochrona i nawigacja

**File**: `src/middleware.ts`, `src/pages/dashboard.astro`

**Intent**: Włączenie strony do przepływu aplikacji.

**Contract**: `PROTECTED_ROUTES` += `"/schedules"` (`src/middleware.ts:4`); na dashboardzie (`src/pages/dashboard.astro:64-84`) nowy przycisk „Grafik" → `/schedules`, obok „Dostępności".

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi
- `npm run lint` bez błędów
- `npm run build` kończy się sukcesem

#### Manual Verification:

- Wszystkie scenariusze E2E z sekcji Testing Strategy przechodzą klik-po-kliku
- Dziury są widoczne dla każdego niepokrytego odcinka godzin otwarcia i nie znikają po odświeżeniu strony (guardrail)
- Zablokowany „Generuj" + działające „Usuń draft" → wygeneruj od nowa

---

## Testing Strategy

### Unit Tests:

- Świadomie brak w tej zmianie (decyzja użytkownika 2026-09-13); `schedule-generation.ts` pisana czysto, by testy w `testing-runner-core-logic` przyszły bez refaktoru.

### Integration Tests:

- Świadomie brak (jak wyżej); kontrakt endpointów udokumentowany w fazie 2.

### Manual Testing Steps:

Scenariusze klik-po-kliku (punkt startowy: lokalne `supabase start` z WSL + `supabase db reset`, `npm run dev` z PowerShell).

**A. Konto seeda — bieżący tydzień (draft istnieje):**
1. Wejdź na `http://localhost:4321/auth/signin`, zaloguj `owner@example.com` / `haslo12345`.
2. Z dashboardu kliknij „Grafik".
3. Oczekiwane: widok bieżącego tygodnia (od ostatniego poniedziałku), dni Pon–Śr mają po 2 zmiany ze seeda (Pon: Anna 08:00–14:00 i Piotr 13:00–18:00 — nakładka celowa, bez ostrzeżenia w S-04), czwartek–sobota wyświetlają całodzienne dziury w czerwonych wpisach, niedziela „Nieczynne".
4. Przycisk „Generuj draft" jest nieaktywny z podpowiedzią; „Usuń draft" jest dostępny.

**B. Konto seeda — przyszły tydzień (generacja):**
1. Kliknij „›" (następny tydzień). Oczekiwane: brak draftu, brak zmian; każdy dzień otwarty pokazuje całą dziurę (np. Pon 08:00–18:00), „Generuj draft" aktywny.
2. Kliknij „Generuj draft".
3. Oczekiwane zmiany (reguła najdłuższego ciągu): Pon: Anna 08:00–16:00 + Piotr 16:00–18:00; Wt: Anna 08:00–16:00 + dziura 16:00–18:00; Śr: dziura 08:00–12:00 + Piotr 12:00–20:00; Cz: Maria 08:00–16:00 + dziura 16:00–20:00; Pt: Tomasz 08:00–22:00 (bez dziur); So: Katarzyna 10:00–22:00 (bez dziur); Nd „Nieczynne".
4. Odśwież stronę (F5). Oczekiwane: draft nadal widoczny identycznie (zapis do bazy).

**C. Zamiana osoby (przyszły tydzień):**
1. Przy zmianie Anny (Wt 08:00–16:00) wybierz z selecta „Maria Wiśniewska".
2. Oczekiwane: wiersz zmienia się na Marię bez przeładowania strony; select pozostaje i pokazuje Annę (ona w pełni pokrywa wt 08:00–16:00). Wybierz z powrotem „Anna Kowalska" — wiersz wraca do Anny, a select pokazuje Marię.
3. Przy zmianie Anny z Pon (08:00–16:00) spróbuj wybrać Piotra. Oczekiwane: Piotr **nie występuje** w puli (jego dostępność 12:00–20:00 nie pokrywa 08:00–12:00); wybór niemożliwy.

**D. Usuń draft i wygeneruj od nowa:**
1. Kliknij „Usuń draft" → potwierdź.
2. Oczekiwane: powrót do stanu pustego tygodnia, „Generuj draft" aktywny; po wygenerowaniu zmiany jak w B.3.

**E. Świeże konto — stany puste:**
1. Wyloguj się, zarejestruj nowe konto, załóż biznes z godzinami (Pn–Pt 09:00–17:00), dodaj 1 pracownika, dodaj mu dostępność na przyszły poniedziałek 10:00–14:00.
2. Wejdź na „Grafik". Oczekiwane: pusty tydzień (domyślnie następny poniedziałek), całodzienne dziury, „Generuj draft" aktywny.
3. Kliknij „Generuj draft". Oczekiwane: Pon: zmiana 10:00–14:00 + dziury 09:00–10:00 i 14:00–17:00, Wt–Pt całe dziury; po F5 draft trwały (przycinanie do godzin otwarcia weryfikuje scenariusz B — Piotr 12:00–20:00 → zmiana 16:00–18:00).

**F. Izolacja danych:**
1. Na koncie seeda skopiuj URL tygodnia; wyloguj, zaloguj na konto z kroku E.
2. Oczekiwane: `/schedules` pokazuje tylko dane nowego konta; drafty seeda niedostępne.

## Performance Considerations

Skala MVP (~5 pracowników, 7 dni): fetch per tydzień zwraca dziesiątki wierszy; liczenie dziur po stronie klienta jest pomijalne. Brak dalszych optymalizacji (main_goal=speed).

## Migration Notes

Brak migracji — schemat `schedules`/`assignments` istnieje od F-01; `npm run db:types` niepotrzebne. Brak zmian w seedzie (dane_fixtureowe wystarczają).

## References

- Roadmap: `context/foundation/roadmap.md` (S-04) · PRD: `context/foundation/prd.md` (FR-007, FR-008, US-01)
- Wzorzec serwisu: `src/lib/services/availability.ts` · Wzorzec endpointu: `src/pages/api/availabilities/index.ts`
- Wzorzec widoku tygodniowego: `src/components/availabilities/AvailabilityManager.tsx` · Helpery tygodnia: `src/lib/week.ts`
- Schemat: `supabase/migrations/20260912141307_domain_schema.sql:97-140` · Seed: `supabase/seed.sql`
- Poprzednie plany: `context/archive/2026-09-13-availability-management/plan.md`, `context/archive/2026-09-12-domain-schema-rls/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Serwis, walidacja i czysta logika generacji

#### Automated

- [x] 1.1 `npx astro sync` przechodzi bez błędów typów — 6f0e09b
- [x] 1.2 `npm run lint` bez błędów — 6f0e09b
- [x] 1.3 `npm run build` kończy się sukcesem — 6f0e09b

### Phase 2: Endpointy API /api/schedules

#### Automated

- [x] 2.1 `npx astro sync` przechodzi — 6f45f3d
- [x] 2.2 `npm run lint` bez błędów — 6f45f3d
- [x] 2.3 `npm run build` kończy się sukcesem — 6f45f3d

### Phase 3: Strona /schedules, islanda ScheduleBoard, nawigacja

#### Automated

- [ ] 3.1 `npx astro sync` przechodzi
- [ ] 3.2 `npm run lint` bez błędów
- [ ] 3.3 `npm run build` kończy się sukcesem

#### Manual

- [ ] 3.4 Scenariusz A: konto seeda, bieżący tydzień — draft widoczny, „Generuj" zablokowany
- [ ] 3.5 Scenariusz B: przyszły tydzień — generacja z oczekiwanym układem zmian i dziur, trwałość po F5
- [ ] 3.6 Scenariusz C: zamiana osoby w puli dostępnych; Piotr niedostępny na Poniedziałek
- [ ] 3.7 Scenariusz D: „Usuń draft" → regeneracja od zera
- [ ] 3.8 Scenariusz E: świeże konto — stany puste i przycinanie do godzin otwarcia
- [ ] 3.9 Scenariusz F: izolacja danych między dwoma kontami
