# Zapis kompletnego grafiku (S-06) — Implementation Plan

## Overview

Domknięcie pętli north star: właściciel zapisuje gotowy grafik jednym świadomym kliknięciem, a **serwer odmawia zapisu, dopóki grafik nie jest kompletny** — tzn. dopóki istnieje jakakolwiek dziura (nieobsadzona godzina otwarcia) lub jakakolwiek kolizja (zmiana poza dostępnością pracownika albo nakładka tej samej osoby w tym samym czasie). Po zapisie grafik staje się tylko do odczytu z zieloną plakietką „Zapisany grafik" i przyciskiem „Odblokuj do edycji", który cofa go do draftu.

Realizuje FR-011, US-01 (AC „przed zapisem brak dziur"), guardrail „dziura nie może zostać zapisana po cichu" oraz PRD Open Q #2 (rozstrzygnięte: zamrożony + odblokowanie). W drafcie tryb ostrzeżeń z S-05 zostaje bez zmian — twarde egzekwowanie obu kolizji obowiązuje wyłącznie przy zapisie.

Praktyczna konsekwencja bramki: dziura z definicji powstaje tam, gdzie żadna dostępność nie sięga (`generateDraft`), więc obsadzenie dziury dowolną osobą daje od razu kolizję „poza dostępnością". Droga do zapisu prowadzi przez korektę dostępności pracownika: szef obsadza dziurę (draft przyjmuje przypisanie jako ostrzeżenie), dzwoni do pracownika, dopisuje mu dostępność na ten dzień, a flaga znika i zapis przechodzi.

## Current State Analysis

- S-04/S-05 dostarczyły całą warstwę grafiku: czysta logika (`generateDraft`, `computeHoles`, `isFullyCovered`, `findUncoveredRanges`, `findSelfOverlaps`, `isWithinOpeningHours` — `src/lib/services/schedule-generation.ts`), serwis I/O (`src/lib/services/schedule.ts`), endpointy tygodniowy (`src/pages/api/schedules/index.ts` — GET/POST/DELETE) i per-zmiana (`src/pages/api/schedules/assignments.ts` — POST/PUT/DELETE), stronę `src/pages/schedules/index.astro` + islandę `src/components/schedules/ScheduleBoard.tsx`.
- **Status nigdy nie wychodzi z `draft`**: schemat ma enum `schedule_status ('draft','saved')` (`supabase/migrations/20260912141307_domain_schema.sql:7`), ale żaden kod nie ustawia `saved`. Wszystkie mutacje już blokują `saved` przez 409 `ERROR_SAVED_SCHEDULE` (`index.ts:170-172`, `assignments.ts:89-91,198-200,281-283`) — brakuje wyłącznie miejsca, które ten status ustawia.
- **Kolizje są liczone przy renderze, nigdy nie przechowywane** (`ScheduleBoard.tsx:506-516`) — po każdej operacji i po F5 odzwierciedlają rzeczywistość. Bramka zapisu musi liczyć je z tych samych danych (assignments + availabilities + openingHours), inaczej UI i serwer mogłyby się rozjechać.
- **Dziury liczy `computeHoles`** (`schedule-generation.ts:193-228`) — pokrycie godzin otwarcia; dzień zamknięty nie generuje dziur. To gotowa definicja „braku dziur".
- **Wyścig na statusie (TOCTOU)**: guard draftu to osobne `SELECT` statusu przed mutacją (uwaga z impl-review S-05, F3, dopisana do S-06 w roadmapie). Finalny zapis ma domknąć to warunkowym `UPDATE ... WHERE status = 'draft'`.
- **Wzorce**: `ServiceResult<T>` (`src/lib/services/types.ts`), helpery `resolveRequestContext`/`resolveBusinessId`/`resolveJsonBody` (`src/lib/api.ts`), stałe komunikatów (`src/lib/http.ts`), `useApiErrorState` (`src/components/hooks/useApiErrorState.ts`), inline-potwierdzenie dwuprzyciskowe (`ScheduleBoard.tsx:648-679,884-910`).
- **Seed** (`supabase/seed.sql`) — konto `owner@example.com` / `haslo12345`; bieżący tydzień ma draft, który **jednocześnie** zawiera dziury (Cz–So) i kolizje (Wt Tomasz, Śr Katarzyna i Anna poza dostępnością) — gotowy test negatywny dla bramki.

## Desired End State

Na `/schedules`, dla wybranego tygodnia:
1. Dopóki grafik jest draftem, wszystkie akcje edycji z S-05 działają bez zmian (tryb ostrzeżeń: kolizje to żółte flagi, zapis zmiany przechodzi).
2. Gdy draft istnieje, w sekcji akcji widoczny jest przycisk „Zapisz grafik":
   - **brak dziur i kolizji** → aktywny; klik otwiera potwierdzenie „Zapisać grafik? Po zapisie edycja będzie zablokowana."; potwierdzenie ustawia status `saved` bez przeładowania;
   - **są braki** → wyszarzony z tekstem „Uzupełnij dziury (N) i kolizje (M), aby zapisać" (część o zerowej liczbie pomijana, np. tylko „Uzupełnij kolizje (1), aby zapisać").
3. Po zapisie grafik jest tylko do odczytu: znikają Edytuj/Zamień/Dodaj/Usuń/Obsadź, w sekcji akcji pojawia się zielona plakietka „Zapisany grafik" i przycisk „Odblokuj do edycji" (z potwierdzeniem), a „Generuj/USuń draft" znikają. Dziur nie ma (bramka nie przepuściła) — widok pokrycia pozostaje.
4. „Odblokuj do edycji" → potwierdzenie → status wraca do `draft`, akcje edycji wracają, ponowny zapis ponownie przechodzi bramkę.
5. Obejście przycisku (bezpośrednie żądanie API) nie zapisze niekompletnego grafiku: serwer zwraca 400 z listą blokujących dziur i kolizji, a UI potrafi ją pokazać.

### Key Discoveries:

- Warunkowy `UPDATE ... eq("status", from).select().single()` to jedyny sposób domknięcia TOCTOU bez nowej kolumny/triggera; brak dopasowania daje `PGRST116`, który endpoint mapuje na 409 (analogicznie do istniejących mapowań `PGRST116` w `index.ts:176-178`, `assignments.ts:241-243`).
- `findSelfOverlaps` jest symetryczna — ta sama nakładka raportowana jest dla obu wierszy pary; w bramce trzeba deduplikować, żeby licznik „kolizje (M)" i lista blokad nie dublowały wpisu.
- Zmiana warunków widoczności akcji z `draft` (= grafik istnieje) na `isDraft` (= status `draft`) jest krytyczna: obecnie `const draft = weekData.schedule !== null` (`ScheduleBoard.tsx:434`) steruje widocznością Edytuj/Zamień/Usuń/Obsadź — po zapisie, bez tej zmiany, akcje zostałyby widoczne.
- `index.ts` już jest trasą tygodniową (GET/POST/DELETE tygodnia); zmiana statusu to operacja tygodniowa, więc `PATCH` tam pasuje i nie wymaga nowego pliku ani nowych helperów.
- Wdrażanie z PowerShell/Windows dotyczy tylko `npm run dev`/`build`; nic w tym planie nie wymaga Dockera ani Supabase CLI (brak migracji).

## What We're NOT Doing

- Zmian w trybie ostrzeżeń draftu — `assignments.ts` pozostaje bez zmian: nadal przyjmuje zmiany poza dostępnością i nakładki (S-05, PRD Open Q #1).
- Blokowania zapisu z powodu „nadmiaru osób" na zmianie — decyzja użytkownika: bramką są wyłącznie dziury i kolizje (brak FR dla nadmiaru).
- Eksportu tekstowego (S-07) i widoku archiwum (S-08).
- Automatycznych testów — decyzja użytkownika 2026-09-13; runner wchodzi w `testing-runner-core-logic`. Weryfikacja: scenariusze E2E + bezpośrednie wywołania API.
- Zmian schematu, migracji i seeda; `npm run db:types` zbędne.
- Emaili/powiadomień do pracowników o potwierdzenie zwiększonej dostępności (to proces po stronie szefa, poza systemem).

## Implementation Approach

Trzy fazy po wydeptanym wzorcu. Logika kompletności powstaje jako **jedna czysta funkcja** `findScheduleBlockers` w `schedule-generation.ts`, reużywająca istniejących `computeHoles`/`findUncoveredRanges`/`findSelfOverlaps` — dzięki temu UI i serwer liczą blokady identycznie, a przyszłe testy jednostkowe wejdą bez refaktoru. Przejścia statusu to dwie nazwane funkcje serwisu (`saveSchedule`, `unlockSchedule`) na warunkowym UPDATE po statusie. Endpoint dostaje `PATCH` obok istniejących handlerów tygodniowych. Islanda zyskuje licznik blokad, potwierdzenia i rozgałęzienie widoku draft/saved.

## Critical Implementation Details

- **Bramka liczy oba typy kolizji z tych samych danych co UI** — `findScheduleBlockers(openingHours, availabilities, assignments, weekStart)` woła `computeHoles` po assignments (dziury), a po każdym przypisaniu `findUncoveredRanges` (poza dostępnością) i `findSelfOverlaps` (nakładka). Nakładki **deduplikować** po `(kind, employeeId, workDate, startTime, endTime)` — inaczej para zaraportuje ten sam przedział dwa razy.
- **Atomowość przejścia statusu** — `saveSchedule`/`unlockSchedule` robią `UPDATE ... SET status = <to> WHERE id = ? AND business_id = ? AND status = <from>`; endpoint wcześniej i tak czyta status (dla czytelnego 409), ale to warunkowe `WHERE` jest prawdziwym guardem. Brak dopasowania (`PGRST116`) → 409, nie 500.
- **Warunki widoczności akcji** — wszystkie `draft && ...` w `ScheduleBoard.tsx` (Obsadź, Dodaj zmianę, Edytuj/Zamień/Usuń) przełączyć na `isDraft` (`weekData.schedule?.status === "draft"`); `isSaved` rządzi plakietką i przyciskiem odblokowania. Bez tego po zapisie akcje zostają na ekranie.
- **Potwierdzenia resetowane przy nawigacji tygodnia** — nowe stany potwierdzeń zapisu/odblokowania dodać do `closeEditingForms()` (wołanej z `goToWeek` i `submitDelete`), tak jak dziś `setDeleting(false)`/`setRemoveConfirmId(null)`.
- **Świadomie zaakceptowany wyścig na danych** — warunkowy `UPDATE` chroni status, ale nie dane pod bramką: przypisanie dodane między odczytem (godziny/dostępności/przypisania) a zapisem mogłoby wejść do zapisanego grafiku. Przy jednym właścicielu i braku równoległych edycji ryzyko jest pomijalne; domknięcie (ponowne sprawdzenie blokad po `UPDATE`) świadomie odłożone.

## Phase 1: Logika kompletności i serwis przejść statusu

### Overview

Czysta funkcja zbierająca wszystkie blokady zapisu oraz dwie atomowe operacje serwisu zmieniające status grafiku.

### Changes Required:

#### 1. Czysta logika blokad zapisu

**File**: `src/lib/services/schedule-generation.ts`

**Intent**: Jedna funkcja zwracająca komplet blokad zapisu: dziury pokrycia (przez istniejące `computeHoles`) oraz kolizje obu typów (poza dostępnością + nakładka tej samej osoby), zdeduplikowane. Brak nowych reguł domenowych — wyłącznie złożenie istniejących detektorów.

**Contract**:

```ts
export interface ScheduleCollision {
  kind: "uncovered" | "self-overlap";
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
}

export interface ScheduleBlockers {
  holes: DraftHole[];
  collisions: ScheduleCollision[];
}

// holes = computeHoles(...); collisions z findUncoveredRanges + findSelfOverlaps,
// zdeduplikowane po (kind, employeeId, workDate, startTime, endTime).
export function findScheduleBlockers(
  openingHours: DraftInput["openingHours"],
  availabilities: DraftInput["availabilities"],
  assignments: DraftPiece[],
  weekStart: string,
): ScheduleBlockers;
```

#### 2. Atomowe przejścia statusu w serwisie

**File**: `src/lib/services/schedule.ts`

**Intent**: Dwie nazwane operacje, obie warunkowe po statusie (zamykają TOCTOU), w konwencji `ServiceResult<T>` i z filtrem `business_id`.

**Contract**:

```ts
export async function saveSchedule(
  supabase: Supabase,
  businessId: string,
  scheduleId: string,
): Promise<ServiceResult<ScheduleRow>>; // UPDATE status='saved' WHERE status='draft'

export async function unlockSchedule(
  supabase: Supabase,
  businessId: string,
  scheduleId: string,
): Promise<ServiceResult<ScheduleRow>>; // UPDATE status='draft' WHERE status='saved'
```

Obie kończą `.select().single()`; brak dopasowania → `PGRST116` w `error` (mapowane w endpointcie na 409).

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi bez błędów typów
- `npm run lint` bez błędów
- `npx astro check` bez błędów typów (lekcja: sync/lint/build nie łapią rozjazdu kontraktów)
- `npm run build` kończy się sukcesem

---

## Phase 2: Endpoint zapisu i odblokowania

### Overview

`PATCH /api/schedules` obok tygodniowych GET/POST/DELETE: zmiana statusu grafiku z twardą bramką kompletności i nowymi komunikatami błędów.

### Changes Required:

#### 1. Stałe komunikatów

**File**: `src/lib/http.ts`

**Intent**: Dwie polskie stałe w konwencji `ERROR_*`.

**Contract**: `ERROR_SCHEDULE_INCOMPLETE` = „Grafik nie jest kompletny — uzupełnij dziury i usuń kolizje przed zapisem." (400 z listą blokad) oraz `ERROR_SCHEDULE_NOT_SAVED` = „Grafik nie jest zapisany." (409 przy próbie odblokowania draftu).

#### 2. Handler `PATCH`

**File**: `src/pages/api/schedules/index.ts`

**Intent**: Operacja tygodniowa zmiany statusu. Wzorzec walidacji jak w pozostałych handlerach; przy zapisie doładowuje dane potrzebne bramce (godziny otwarcia, dostępności, przypisania) po sprawdzeniu statusu.

**Contract**: `PATCH { weekStart, status }`, gdzie `status ∈ { "saved", "draft" }`.
- `parseWeekStart(body.weekStart)` → 400 `fieldErrors.weekStart`; `status` nie z pary → 400 `ERROR_INVALID_BODY`.
- 401/500 (kontekst), 404 biznes (helpery), 404 `ERROR_SCHEDULE_NOT_FOUND` gdy brak grafiku.
- `status === "saved"`:
  - bieżący status ≠ `draft` → 409 `ERROR_SAVED_SCHEDULE`;
  - wczytaj `getOpeningHours`, `getAvailabilitiesForWeek`, `getAssignments`;
  - `findScheduleBlockers(...)`; gdy `holes` lub `collisions` niepuste → 400 `{ error: ERROR_SCHEDULE_INCOMPLETE, blockers: { holes, collisions } }`;
  - `saveSchedule(...)` → 200 `{ schedule }`; `PGRST116` → 409 `ERROR_SAVED_SCHEDULE`.
- `status === "draft"` (odblokowanie):
  - bieżący status ≠ `saved` → 409 `ERROR_SCHEDULE_NOT_SAVED`;
  - `unlockSchedule(...)` → 200 `{ schedule }`; `PGRST116` → 409 `ERROR_SCHEDULE_NOT_SAVED`.

Kolejność walidacji spójna z konwencją repo (401 → 500 → 400 → 404 → 409 → 500).

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi
- `npm run lint` bez błędów
- `npx astro check` bez błędów typów
- `npm run build` kończy się sukcesem

---

## Phase 3: Islanda ScheduleBoard — przycisk zapisu, widok read-only, odblokowanie

### Overview

Licznik blokad i wyszarzony przycisk zapisu, potwierdzenia inline, rozgałęzienie widoku draft/saved oraz prezentacja listy blokad z serwera jako zapory awaryjnej.

### Changes Required:

#### 1. Islanda — blokady, zapis, odblokowanie, read-only

**File**: `src/components/schedules/ScheduleBoard.tsx`

**Intent**:
- **Blokady klienta**: policz `findScheduleBlockers(openingHours, weekData.availabilities, toDraftPieces(weekData.assignments), weekStart)` i użyj `blockers.holes` jako dotychczasowego `weekHoles` (jedno liczenie zamiast dwóch). `holesCount`/`collisionsCount` zasilają licznik.
- **Rozgałęzienie statusu**: `isDraft = weekData.schedule?.status === "draft"`, `isSaved = weekData.schedule?.status === "saved"`. Wszystkie warunki widoczności akcji edycji (`Obsadź`, `Dodaj zmianę`, Edytuj/Zamień/Usuń) przełączyć z `draft` na `isDraft`.
- **Sekcja akcji** (przy `weekData.schedule !== null`):
  - `isDraft`: „Usuń draft" bez zmian + nowy „Zapisz grafik" — aktywny, gdy `holesCount === 0 && collisionsCount === 0`; inaczej wyszarzony z tekstem złożonym z niezerowych części („Uzupełnij dziury (N) i kolizje (M), aby zapisać"). Klik aktywnego → inline potwierdzenie („Zapisać grafik? Po zapisie edycja będzie zablokowana.") → `PATCH { weekStart, status: "saved" }`.
  - `isSaved`: zielona plakietka „Zapisany grafik" + „Odblokuj do edycji" → inline potwierdzenie → `PATCH { weekStart, status: "draft" }`; brak „Generuj/Usuń draft". Po odblokowaniu akcje edycji wracają automatycznie (na podstawie `isDraft`).
- **Zapora awaryjna z serwera**: gdy `PATCH` zwróci 400 z `blockers`, pokaż listę blokad (dziury i kolizje — z datą/godzinami, dla kolizji z imieniem przez `employeesById`); w przeciwnym razie `applyApiError`.
- **Sprzątanie**: nowe stany (potwierdzenia zapisu/odblokowania, przechwycone blokady z serwera) czyścić w `closeEditingForms()`; nowe pending dodać do `actionsPending`.

**Contract**: nowe stany `saveConfirming`, `savePending`, `unlockConfirming`, `unlockPending`, `serverBlockers: ScheduleBlockers | null`; `saveApi`/`unlockApi` z `useApiErrorState`; ikony z `lucide-react` (np. `CheckCircle2`, `LockOpen`); klasy przez `cn()`; helper `extractSchedule(body)` (odczyt `{ schedule }`) w konwencji `extractAssignment`. Plakietka w palecie zielonej spójnej z resztą (np. `border-emerald-400/30 bg-emerald-500/10 text-emerald-100`).

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi
- `npm run lint` bez błędów
- `npx astro check` bez błędów typów
- `npm run build` kończy się sukcesem

#### Manual Verification:

- Scenariusz A: świeże konto — dziura, kolizja poza dostępnością i nakładka tej samej osoby kolejno blokują zapis; usunięcie braku odblokowuje przycisk
- Scenariusz B: udany zapis z potwierdzeniem → read-only + plakietka „Zapisany grafik", trwałość po F5, „Odblokuj do edycji" i ponowny zapis
- Scenariusz C: konto seeda — bieżący tydzień (dziury + kolizje) i następny po generacji (same dziury) pokazują wyszarzony przycisk z licznikami
- Scenariusz D: zapora serwera — `PATCH` przy brakach 400 z listą blokad, kompletny 200, ponowny zapis 409, odblokowanie 200, odblokowanie draftu 409
- Scenariusz E: główna ścieżka — dziura obsadzona niedostępną osobą daje kolizję; rozszerzenie dostępności pracownika usuwa flagę i pozwala zapisać
- Scenariusz F: zapora awaryjna UI — nieświeże dane klienta (przycisk aktywny) → serwer 400 z listą blokad, UI ją pokazuje

---

## Testing Strategy

### Unit Tests:

- Świadomie brak (decyzja użytkownika 2026-09-13). `findScheduleBlockers` pisane czysto, bez I/O — wejdzie pod testy w `testing-runner-core-logic` bez refaktoru.

### Integration Tests:

- Świadomie brak; kontrakt `PATCH` udokumentowany w fazie 2 i sprawdzany bezpośrednimi żądaniami (scenariusz D).

### Manual Testing Steps:

Scenariusze klik-po-kliku. Punkt startowy wspólny: z WSL w katalogu projektu `supabase start` + `supabase db reset` (seed: `owner@example.com` / `haslo12345`), z PowerShell `npm run dev`; przeglądarka `http://localhost:4321`.

**A. Świeże konto — przygotowanie i trzy blokady (bez zapisu):**
1. Wyloguj się. Zarejestruj nowe konto, załóż biznes. Godziny otwarcia: Pn–Pt `09:00–17:00`, So i Nd zamknięte.
2. Dodaj pracownika „Anna Testowa" z dostępnością Pn–Pt `09:00–17:00`; dodaj pracownika „Bogdan Testowy" z dostępnością **tylko Wt–Pt** `09:00–17:00` (bez poniedziałku).
3. Wejdź na „Grafik" → dla następnego tygodnia kliknij „Generuj draft". Oczekiwane: każdy dzień Pn–Pt ma zmianę Anny `09:00–17:00`, brak żółtych flag, brak dziur. Przycisk „Zapisz grafik" **aktywny**.
4. **Dziura blokuje.** Przy zmianie Anny w poniedziałek kliknij kosz → potwierdź usunięcie. Oczekiwane: dziura „Dziura 09:00 – 17:00", przycisk wyszarzony z tekstem „Uzupełnij dziury (1), aby zapisać".
5. Uzupełnij dziurę: przy dziurze kliknij „Obsadź", wybierz **Bogdana Testowego**, zostaw czasy `09:00`/`17:00`, potwierdź. Oczekiwane: wiersz Bogdan `09:00–17:00` z żółtą flagą „⚠ Poza dostępnością: 09:00 – 17:00" (Bogdan nie ma poniedziałku), dziura znika, przycisk wyszarzony z tekstem „Uzupełnij kolizje (1), aby zapisać".
6. **Kolizja poza dostępnością blokuje.** Przy tym wierszu użyj „Zamień na…" i wybierz **Annę Testową**. Oczekiwane: flaga znika, przycisk zapisu znów **aktywny**.
7. **Nakładka tej samej osoby blokuje.** W poniedziałek kliknij „Dodaj zmianę", wybierz Annę, ustaw `10:00`–`12:00`, potwierdź. Oczekiwane: OBIE zmiany Anny dostają „⚠ Nakładka z inną zmianą tej samej osoby: 10:00 – 12:00", przycisk wyszarzony z tekstem „Uzupełnij kolizje (1), aby zapisać" (nie 2 — nakładka liczona raz).
8. Usuń dodaną zmianę `10:00–12:00` (kosz → potwierdź). Oczekiwane: flagi znikają, przycisk zapisu **aktywny**.

**B. Świeże konto — udany zapis, read-only, odblokowanie:**
1. Z widoku po kroku A.8 kliknij „Zapisz grafik". Oczekiwane: inline potwierdzenie „Zapisać grafik? Po zapisie edycja będzie zablokowana." z przyciskami Zapisz/Anuluj.
2. Kliknij „Zapisz". Oczekiwane: bez przeładowania — akcje edycji (Edytuj/Zamień/kosz/Dodaj zmianę/Obsadź) znikają, w sekcji akcji pojawia się zielona plakietka „Zapisany grafik" i przycisk „Odblokuj do edycji"; „Generuj draft" i „Usuń draft" znikają.
3. Odśwież stronę (F5). Oczekiwane: widok identyczny — read-only, plakietka, przycisk odblokowania (status z bazy).
4. Kliknij „Odblokuj do edycji" → potwierdź. Oczekiwane: akcje edycji wracają, plakietka znika, przycisk zapisu wraca (aktywny przy braku blokad).
5. Zapisz ponownie (potwierdź). Oczekiwane: znów read-only, `saved`.

**C. Konto seeda — draft z seeda ma i dziury, i kolizje:**
1. Wyloguj się, zaloguj `owner@example.com` / `haslo12345`, wejdź na „Grafik", przejdź do **bieżącego tygodnia** (draft ze seeda).
2. Oczekiwane: na ekranie jednocześnie dziury (Cz–So) i kolizje (Wt Tomasz, Śr Katarzyna i Anna — żółte flagi); przycisk zapisu wyszarzony z tekstem zawierającym licznik dziur **oraz** kolizji.
3. Kliknij „Następny" (następny tydzień), kliknij „Generuj draft". Oczekiwane: draft bez kolizji, ale z dziurami (m.in. Wt `16:00–18:00`, Śr `08:00–12:00`, Cz `16:00–20:00`); przycisk wyszarzony z tekstem „Uzupełnij dziury (N), aby zapisać".

**D. Zapora serwera — bezpośrednie żądania `PATCH` (konto seeda, bieżący tydzień z dziurami i kolizjami):**
1. Otwórz konsolę przeglądarki na `/schedules`. Wykonaj:
   `fetch('/api/schedules', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStart: '<poniedziałek bieżącego tygodnia>', status: 'saved' }) }).then(async r => [r.status, await r.json()])`
   Oczekiwane: HTTP **400**, w ciele `error` = „Grafik nie jest kompletny — uzupełnij dziury i usuń kolizje przed zapisem." oraz `blockers.holes` i `blockers.collisions` z konkretnymi zakresami/datami; odświeżenie pokazuje, że grafik **nadal jest draftem** (edycja działa).
2. Na świeżym/kompletnym grafiku (np. z scenariusza B po odblokowaniu i uzupełnieniu) wykonaj ten sam `PATCH` z `status: 'saved'`. Oczekiwane: HTTP **200** z `{ schedule }` o statusie `saved`.
3. Powtórz identyczny `PATCH status:'saved'` na już zapisanym. Oczekiwane: HTTP **409**, `error` = „Grafik jest już zapisany i nie można go zmieniać".
4. `PATCH` z `{ weekStart, status: 'draft' }` na zapisanym. Oczekiwane: HTTP **200**, status `draft` (odblokowanie przez API).
5. `PATCH` z `{ weekStart, status: 'draft' }` na drafcie. Oczekiwane: HTTP **409**, `error` = „Grafik nie jest zapisany."

**E. Świeże konto — obsadzenie dziury przez rozszerzenie dostępności (główna ścieżka):**

1. Kontynuuj na świeżym koncie (po scenariuszu B). Jeśli grafik jest zapisany, kliknij „Odblokuj do edycji" → potwierdź. W poniedziałek usuń zmianę Anny (kosz → potwierdź). Oczekiwane: „Dziura 09:00 – 17:00", przycisk wyszarzony z tekstem „Uzupełnij dziury (1), aby zapisać".
2. Przy dziurze kliknij „Obsadź", wybierz **Bogdana Testowego**, zostaw `09:00`/`17:00`, potwierdź. Oczekiwane: wiersz Bogdan `09:00–17:00` z flagą „⚠ Poza dostępnością: 09:00 – 17:00" (Bogdan nie ma poniedziałku); przycisk wyszarzony z tekstem „Uzupełnij kolizje (1), aby zapisać".
3. Przejdź do „Pracownicy" → przy Bogdanie kliknij „Dostępności" → w tym samym tygodniu dodaj Bogdanowi dostępność na **poniedziałek** `09:00–17:00`.
4. Wróć na „Grafik" (ten sam tydzień). Oczekiwane: poniedziałek — Bogdan `09:00–17:00` **bez flagi** (dostępność wydłużona), dziur brak, przycisk zapisu **aktywny**.
5. Kliknij „Zapisz grafik" → potwierdź. Oczekiwane: zapis przechodzi, widok read-only z zieloną plakietką „Zapisany grafik". To dowód, że jedyną drogą do zapisu była korekta dostępności, nie obejście bramki.

**F. Zapora awaryjna w UI — nieświeże dane klienta (konto świeże lub seeda):**

1. Przygotuj draft z **aktywnym** przyciskiem „Zapisz grafik" (brak dziur i kolizji), np. odblokuj grafik po scenariuszu E i nie zmieniaj danych. **Nie odświeżaj** karty grafiku.
2. W drugiej karcie/przeglądarce wejdź na „Pracownicy" → osoba z poniedziałkową zmianą → „Dostępności" i **usuń** jej dostępność na poniedziałek.
3. Wróć na **pierwszą** kartę grafiku (bez F5 — klient wciąż widzi starą dostępność, więc przycisk jest aktywny) i kliknij „Zapisz grafik" → potwierdź.
4. Oczekiwane: serwer zwraca 400 z listą blokad, a UI pokazuje ją przy sekcji zapisu (komunikat o niekompletnym grafiku wraz z dziurami/kolizjami) — mimo że przycisk był aktywny po stronie klienta. Po F5: flaga kolizji na tej zmianie i wyszarzony przycisk z licznikiem.

## Performance Considerations

Skala MVP (~5 pracowników, ≤ kilkanaście zmian/tydzień): `findScheduleBlockers` to kilka przejść po dziesiątkach przedziałów, liczone raz przy renderze i raz przy zapisie. Bramka zapisu doładowuje trzy istniejące zapytania; brak nowych indeksów i optymalizacji (main_goal=speed).

## Migration Notes

Brak migracji i zmian schematu — `schedule_status` istnieje od F-01. `npm run db:types` zbędne. Seed bez zmian (draft bieżącego tygodnia z dziurami i kolizjami służy jako test negatywny scenariusza C/D).

## References

- Roadmap: `context/foundation/roadmap.md` (S-06, unknowny z przeglądu S-05) · PRD: `context/foundation/prd.md` (FR-011, US-01, Guardrails, Open Q #2)
- Poprzedni plan: `context/archive/2026-09-13-schedule-editing-collisions/plan.md` i `reviews/impl-review.md` (F3 — uwaga o TOCTOU dopisana do S-06)
- Wzorce: `src/pages/api/schedules/index.ts` (konwencja endpointu i mapowanie `PGRST116`) · `src/lib/services/schedule.ts` (ServiceResult) · `src/components/schedules/ScheduleBoard.tsx:648-679,884-910` (potwierdzenia inline) · `src/lib/api.ts`
- Lekcje: `context/foundation/lessons.md` (helpery w `src/lib/`, `npx astro check` w bramce, scenariusze E2E klik-po-kliku, pytania bez żargonu)
- Schemat: `supabase/migrations/20260912141307_domain_schema.sql:7,97-140` · Seed: `supabase/seed.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Logika kompletności i serwis przejść statusu

#### Automated

- [x] 1.1 `npx astro sync` przechodzi bez błędów typów — c707e33
- [x] 1.2 `npm run lint` bez błędów — c707e33
- [x] 1.3 `npx astro check` bez błędów typów — c707e33
- [x] 1.4 `npm run build` kończy się sukcesem — c707e33

### Phase 2: Endpoint zapisu i odblokowania

#### Automated

- [x] 2.1 `npx astro sync` przechodzi — 47de723
- [x] 2.2 `npm run lint` bez błędów — 47de723
- [x] 2.3 `npx astro check` bez błędów typów — 47de723
- [x] 2.4 `npm run build` kończy się sukcesem — 47de723

### Phase 3: Islanda ScheduleBoard — przycisk zapisu, widok read-only, odblokowanie

#### Automated

- [x] 3.1 `npx astro sync` przechodzi — ce74db3
- [x] 3.2 `npm run lint` bez błędów — ce74db3
- [x] 3.3 `npx astro check` bez błędów typów — ce74db3
- [x] 3.4 `npm run build` kończy się sukcesem — ce74db3

#### Manual

- [x] 3.5 Scenariusz A: świeże konto — dziura, kolizja poza dostępnością i nakładka tej samej osoby kolejno blokują zapis (licznik + wyszarzony przycisk), usunięcie braku odblokowuje przycisk — ce74db3
- [x] 3.6 Scenariusz B: udany zapis z potwierdzeniem → read-only + plakietka „Zapisany grafik", trwałość po F5, „Odblokuj do edycji" i ponowny zapis — ce74db3
- [x] 3.7 Scenariusz C: konto seeda — bieżący tydzień (dziury + kolizje) i następny po generacji (same dziury) pokazują wyszarzony przycisk z licznikami — ce74db3
- [x] 3.8 Scenariusz D: zapora serwera — `PATCH` przy brakach 400 z listą blokad, kompletny 200, ponowny zapis 409, odblokowanie 200, odblokowanie draftu 409 — ce74db3
- [x] 3.9 Scenariusz E: główna ścieżka — dziura obsadzona niedostępną osobą daje kolizję; rozszerzenie dostępności pracownika usuwa flagę i pozwala zapisać — ce74db3
- [x] 3.10 Scenariusz F: zapora awaryjna UI — nieświeże dane klienta (przycisk aktywny) → serwer 400 z listą blokad, UI ją pokazuje — ce74db3
