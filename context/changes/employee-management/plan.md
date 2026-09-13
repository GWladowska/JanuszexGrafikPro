# Zarządzanie pracownikami biznesu (S-02) — Implementation Plan

## Overview

Właściciel zarządza pracownikami swojego biznesu: dodaje (imię i nazwisko + wymagany e-mail kontaktowy), przegląda listę, edytuje w miejscu i usuwa z potwierdzeniem. Przy dodawaniu/edycji system ostrzega o możliwym duplikacie (identyczna nazwa **i** identyczny e-mail) i prosi o potwierdzenie „to inna osoba". Zero zmian w schemacie bazy — tabela `employees` z RLS istnieje od F-01.

## Current State Analysis

- **Baza gotowa:** `employees` (id, business_id FK cascade, name not null, contact_email null, unique(business_id, id)) — `supabase/migrations/20260912141307_domain_schema.sql:56-64`; pełne polityki RLS per-owner — `supabase/migrations/20260912144543_domain_rls.sql:76-91` (select/insert/update/delete przez `public.is_business_owner(business_id)`). Typy wygenerowane w `src/lib/database.types.ts`.
- **Wzorzec pionowy z S-01:** serwis (`src/lib/services/business.ts`, `ServiceResult` na linii 12, `getBusinessForOwner` na linii 31) → cienkie endpointy JSON (`src/pages/api/business/index.ts`) → strony Astro + islandy React (`src/pages/business/index.astro`, `src/components/business/BusinessNameForm.tsx`).
- **Helpery HTTP:** `src/lib/http.ts` (`readJsonBody`, `jsonResponse`, stałe błędów po polsku) — lekcja z `context/foundation/lessons.md`: nie kopiować, zawsze z `src/lib/`.
- **Komponenty formularzy do reużycia:** `FormField`, `SubmitButton` (prop `pending`), `ServerError` z `src/components/auth/`; hook `useApiErrorState` (`src/components/hooks/useApiErrorState.ts`).
- **Ochrona tras:** `PROTECTED_ROUTES` w `src/middleware.ts:4` = `["/dashboard", "/business"]` (dopasowanie `startsWith`).
- **Dashboard:** karta z nazwą biznesu + godzinami + wierszem akcji („Edytuj", „Sign out") — `src/pages/dashboard.astro:64-79`.
- **Seed (tylko lokalnie):** konto `owner@example.com` / `haslo12345`, biznes z 5 pracownikami **z uzupełnionymi e-mailami**, dostępnościami i grafikiem draft — `supabase/seed.sql:99-105`. Uwaga: usuwanie pracownika z seeda kaskadowo skasuje jego dostępności i przypisania (FK `on delete cascade`).
- **Kod pracowników:** zero istniejącego kodu domenowego poza schematem/typami.

## Desired End State

Zalogowany właściciel z założonym biznesem wchodzi z dashboardu na `/employees`, gdzie widzi listę pracowników (nazwa, e-mail, data dodania) i może: dodać pracownika (formularz z walidacją), edytować wiersz inline, usunąć pracownika po dwuetapowym potwierdzeniu. Próba dodania pracownika o identycznej nazwie i e-mailu jak istniejący kończy się ostrzeżeniem z przyciskiem „To inna osoba — dodaj mimo to". Każde konto widzi wyłącznie swoich pracowników (RLS). Weryfikacja: ręczne E2E na dwóch kontach + `astro sync`/`lint`/`build`.

### Key Discoveries:

- Tabela i RLS istnieją — **zero migracji**; slice to serwis + API + UI na wzorcu S-01.
- `update`/`delete` z filtrem `business_id + id` przy obcym/ nieistniejącym id zwraca 0 wierszy → Postgrest `PGRST116` przy `.single()` — endpoint musi mapować to na **404**, nie 500.
- Seed ma już dostępności i przypisania powiązane z pracownikami — usunięcie pracownika z seeda realnie kaskaduje (tekst potwierdzenia musi o tym mówić).
- Kolumna `contact_email` jest nullable w bazie, ale decyzja użytkownika: **wymagany** na poziomie aplikacji.
- Brak testera (decyzja) — weryfikacja jak w S-01: ręczne E2E + trzy komendy bramki CI.

## What We're NOT Doing

- Dostępności pracowników (S-03) i grafik (S-04+) — choć usuwanie pracownika kaskaduje na te dane (ostrzegamy w UI).
- Konta / logowanie pracowników (parked w roadmapie — pracownik to tylko wpis kontaktowy).
- Zakładki na dashboardzie (docelowa wizja użytkownika — po MVP; teraz osobna strona `/employees`).
- Twarda blokada duplikatów — tylko ostrzeżenie z potwierdzeniem; ta sama nazwa + inny e-mail przechodzi bez pytania.
- Zmiany w schemacie bazy, migracje, `db push`.
- Automatyczne testy (decyzja: wracamy przy S-04, tam się opłacają).
- Sortowanie, paginacja, awatary, dodatkowe pola, import pracowników z pliku.

## Implementation Approach

Trzy warstwy 1:1 jak w S-01, serwer autorytatywny (walidacja i reguły po stronie serwera, islanda tylko wysyła i pokazuje):

1. **Serwis + walidacja** (`src/lib/services/employee*.ts`) — jedyne miejsce dotykające tabeli `employees`.
2. **Endpointy JSON** (`src/pages/api/employees/index.ts`) — POST/PUT/DELETE, reużycie helperów z `src/lib/http.ts`, rozstrzygnięcie biznesu przez `getBusinessForOwner`.
3. **Strona + islanda** (`/employees` + `EmployeeManager.tsx`) — SSR pobiera listę, islanda jest właścicielem stanu (dodawanie, edycja inline, usuwanie, ostrzeżenie o duplikacie) i aktualizuje listę lokalnie bez przeładowania.

## Critical Implementation Details

- **Kontrakt duplikatu (409 + flaga potwierdzenia)** — fazy 2 i 3 muszą się zgodzić co do kształtu. Serwer, zanim utworzy/zmieni pracownika, szuka w biznesie pracownika o **znormalizowanej nazwie** (trim, lowercase, zredukowane spacje) **i znormalizowanym e-mailu** (trim, lowercase). Trafienie bez flagi:

  ```jsonc
  // odpowiedź 409
  { "error": "<ERROR_DUPLICATE_EMPLOYEE>", "duplicateOf": { "id": "…", "name": "…", "contactEmail": "…" } }
  // klient ponawia żądanie z dołączoną flagą:
  { "name": "…", "contactEmail": "…", "confirmDuplicate": true }
  ```

  W PUT flaga dotyczy kolizji z **innym** pracownikiem (własny `id` jest wykluczony z porównania). Ta sama nazwa + inny e-mail = brak ostrzeżenia (decyzja użytkownika). Porównanie robimy w JS na pobranej liście (getEmployees) — unika pułapek `ilike`/escapowania, a skala (~5 pracowników) tego nie wymaga w SQL.

- **PGRST116 → 404:** przy update/delete filtrujemy po `business_id` i `id`; obcy lub nieistniejący id daje 0 wierszy, a `.select().single()` rzuca `PGRST116`. Endpoint mapuje ten kod na `404 { error: ERROR_EMPLOYEE_NOT_FOUND }`.

- **E-mail:** zapisujemy tak, jak wpisano; do porównań duplikatów normalizujemy do lowercase. Format sprawdzamy prostym regexem (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), max 254 znaki.

- **Usuwanie kaskaduje:** FK `availabilities`/`assignments` → `employees on delete cascade` — tekst potwierdzenia usuwania musi ostrzegać, że dostępności i przypisania pracownika zostaną usunięte (realne od razu na koncie seeda).

## Phase 1: Serwis i walidacja pracowników

### Overview

Warstwa domenowa: reguły formularza i operacje na tabeli `employees`, w 100% na wzorcu serwisu biznesu. Bez API i UI.

### Changes Required:

#### 1. Walidacja pracowników

**File**: `src/lib/services/employee-validation.ts` (nowy)

**Intent**: czyste funkcje walidacji wejścia formularza pracownika z polskimi komunikatami, spójne z konwencją `parseBusinessName` (`src/lib/services/business-validation.ts:37`).

**Contract**: `parseEmployeeName(raw): { value, fieldError }` — wymagana, trim, maks. 120 znaków (spójnie z nazwą biznesu); `parseContactEmail(raw): { value, fieldError }` — wymagany, trim, format regex, maks. 254 znaki; `normalizeEmployeeName`/`normalizeContactEmail` do porównań duplikatów; typ `EmployeeInput { name: string; contactEmail: string }`.

#### 2. Serwis pracowników

**File**: `src/lib/services/employee.ts` (nowy)

**Intent**: jedyne miejsce dostępu do tabeli `employees`; reużywa `ServiceResult<T>` z `src/lib/services/business.ts:12`.

**Contract**: `getEmployees(supabase, businessId)` (order `created_at` asc), `createEmployee(supabase, businessId, input)` (insert + `.select().single()`), `updateEmployee(supabase, businessId, employeeId, input)` (`.eq("id", …).eq("business_id", …)` + `.select().single()`), `deleteEmployee(supabase, businessId, employeeId)`, `findDuplicateEmployee(supabase, businessId, input, excludeEmployeeId?)` — pobiera listę i porównuje w JS po znormalizowanej nazwie + e-mailu. Typ `EmployeeRow` z `Database["public"]["Tables"]["employees"]["Row"]`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi bez błędów
- `npm run lint` przechodzi
- `npm run build` kończy się sukcesem

#### Manual Verification:

- Brak — zachowanie weryfikowane przez endpointy (faza 2) i E2E (faza 3).

---

## Phase 2: Endpointy API /api/employees

### Overview

Trzy operacje JSON (dodaj/zmień/usuń) w jednym pliku, dokładnie w sekwencji błędów jak `src/pages/api/business/index.ts` (401 → 500 → 400 → 404 → 400 walidacja → logika). Lista nie potrzebuje GET — strona czyta przez serwis w SSR.

### Changes Required:

#### 1. Nowe stałe błędów

**File**: `src/lib/http.ts`

**Intent**: komunikaty o pracownikach w jednym miejscu (lekcja: nie kopiować stałych między endpointami).

**Contract**: `ERROR_DUPLICATE_EMPLOYEE = "Pracownik o takim imieniu i nazwisku oraz e-mailu już jest na liście."`, `ERROR_EMPLOYEE_NOT_FOUND = "Nie znaleziono pracownika."`.

#### 2. Endpoint pracowników

**File**: `src/pages/api/employees/index.ts` (nowy)

**Intent**: POST tworzy pracownika (z kontraktem duplikatu), PUT zmienia nazwę/e-mail istniejącego, DELETE usuwa.

**Contract**: wspólny prelude — `context.locals.user` 401, `createClient` null → 500, `readJsonBody` null → 400, `getBusinessForOwner` → błąd 500 / brak biznesu 404. POST: `parseEmployeeName` + `parseContactEmail` (400 z `fieldErrors`), `findDuplicateEmployee` → 409 + `duplicateOf` (chyba że `confirmDuplicate === true`), `createEmployee` → 201 `{ employee }`. PUT: dodatkowo `body.id` — musi być niepustym stringiem w formacie UUID, inaczej 400; duplikat z wykluczeniem własnego `id`; `updateEmployee` → kod `PGRST116` mapowany na 404, sukces 200 `{ employee }`. DELETE: `id` jak wyżej, `deleteEmployee` → 404 przy `PGRST116`, sukces 200 `{ deleted: true }`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi bez błędów
- `npm run lint` przechodzi bez błędów
- `npm run build` kończy się sukcesem

#### Manual Verification:

- Brak — pełne scenariusze E2E w fazie 3.

---

## Phase 3: Strona /employees i nawigacja

### Overview

Chroniona strona z listą i zarządzaniem pracownikami + wejście z dashboardu. Islanda `EmployeeManager` jest właścicielem stanu listy (bez przeładowań).

### Changes Required:

#### 1. Ochrona trasy

**File**: `src/middleware.ts:4`

**Intent**: `/employees` wymaga logowania.

**Contract**: `PROTECTED_ROUTES` dostaje wpis `"/employees"` (dopasowanie `startsWith` obejmuje przyszłe podstrony).

#### 2. Strona pracowników

**File**: `src/pages/employees/index.astro` (nowy)

**Intent**: SSR wg wzorca `src/pages/business/index.astro` — przekierowanie bez logowania, brak biznesu → `/business/setup`, **error-first**: błąd DB → `DbErrorState` (nie mylić z „brak danych"), dopiero potem lista.

**Contract**: pobiera `getEmployees`; błąd listy → stan błędu z „Odśwież stronę"; sukces → przekazuje `initialEmployees` do islandy; pusta lista → komunikat „Nie masz jeszcze pracowników…" + formularz.

#### 3. Islanda zarządzania pracownikami

**File**: `src/components/employees/EmployeeManager.tsx` (nowy)

**Intent**: jeden komponent-stan: formularz dodawania, lista, edycja inline, usuwanie, ostrzeżenie o duplikacie.

**Contract**: props `initialEmployees: EmployeeRow[]`. Dodawanie: `FormField` (imię i nazwisko) + `FormField` (e-mail) + `SubmitButton pending`; obsługa 409 → panel ostrzegawczy z danymi `duplicateOf` i akcjami „To inna osoba — dodaj mimo to" (ponowne POST z `confirmDuplicate: true`) / „Anuluj". Edycja: wiersz przechodzi w tryb formularza (nazwa + e-mail), PUT, sukces aktualizuje wiersz. Usuwanie: dwuetapowe („Usuń" → „Na pewno usunąć? Usunięte zostaną też jego dostępności i przypisania w grafikach." → DELETE). Po każdej operacji stan listy aktualizowany lokalnie. Reużycie: `FormField`, `SubmitButton`, `ServerError`, `useApiErrorState`, `cn()`.

#### 4. Wejście z dashboardu

**File**: `src/pages/dashboard.astro:64-79`

**Intent**: właściciel ma widoczne wejście do pracowników.

**Contract**: w wierszu akcji karty dashboardu obok „Edytuj" pojawia się link „Pracownicy" → `/employees` (styl spójny z istniejącym linkiem „Edytuj").

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

- Brak — świadoma decyzja (deadline 2026-09-14); automatyczne testy wracają przy S-04 (logika grafiku), gdzie dają realną wartość.

### Integration Tests:

- Ręczne E2E na dwóch kontach; lokalna baza z seedem (`npx supabase db reset`; konto `owner@example.com` / `haslo12345`). RLS regeneracji podlega plikowi `supabase/tests/rls_isolation.sql` — nie zmieniamy polityk, więc bez zmian.

### Manual Testing Steps:

1. Świeże konto → załóż biznes → dashboard → „Pracownicy" → pusty stan + formularz.
2. Dodaj „Anna Kowalska" / anna@example.com → pojawia się na liście bez przeładowania.
3. Walidacja: pusta nazwa, pusty e-mail, zły format e-maila → błędy pod polami, brak żądania/odmowa serwera.
4. Duplikat: dodaj ponownie dokładnie tę samą parę → ostrzeżenie z pytaniem; „To inna osoba — dodaj mimo to" → dodaje; „Anuluj" → nic nie dodaje.
5. Ta sama nazwa, **inny** e-mail → przechodzi **bez** ostrzeżenia.
6. Edycja wiersza: zmień nazwę i e-mail → zapis → widoczne od razu; spróbuj zmienić na dane istniejącego innego pracownika → ostrzeżenie 409 z potwierdzeniem.
7. Usuwanie: „Usuń" → potwierdzenie z ostrzeżeniem o dostępnościach/przypisaniach → pracownik znika; na koncie seeda usuń pracownika mającego dostępności — dostępności i przypisania znikają (kaskada).
8. Dashboard: link „Pracownicy" działa; po wylogowaniu `/employees` przekierowuje do logowania.
9. Izolacja: drugie konto widzi pustą listę, nigdy pracowników konta A (RLS).
10. Konto seeda (`owner@example.com`) widzi 5 pracowników z seeda z e-mailami.

## Performance Considerations

Znaczenie zerowe przy założonej skali (~5 pracowników): lista w jednym zapytaniu SSR, mutacje pojedyncze. Porównywanie duplikatów w JS na liście jest tanie przy tej skali i świadome.

## Migration Notes

Brak zmian w bazie — `employees` i RLS są już na produkcji (F-01, push 2026-09-12). Deploy = merge do `master` (Workers Builds); rollback tylko kodu: `npx wrangler rollback`. Nowa trasa `/employees` zaczyna działać po deployu; nie trzeba nic robić po stronie Supabase.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-02), PRD: `context/foundation/prd.md` (FR-005)
- Wzorce: `src/pages/api/business/index.ts`, `src/lib/services/business.ts`, `src/pages/business/index.astro`, `src/components/business/BusinessNameForm.tsx`
- Lekcje: `context/foundation/lessons.md` (helpery w `src/lib/http.ts`)
- Poprzedni plan: `context/changes/business-opening-hours/plan.md` (decyzje, Not Doing, notka o testerze)
- Schemat/RLS: `supabase/migrations/20260912141307_domain_schema.sql:56-64`, `supabase/migrations/20260912144543_domain_rls.sql:76-91`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Serwis i walidacja pracowników

#### Automated

- [x] 1.1 `npx astro sync` przechodzi — 9a079d4
- [x] 1.2 `npm run lint` przechodzi — 9a079d4
- [x] 1.3 `npm run build` kończy się sukcesem — 9a079d4

### Phase 2: Endpointy API /api/employees

#### Automated

- [x] 2.1 `npx astro sync` przechodzi — 5dea812
- [x] 2.2 `npm run lint` przechodzi — 5dea812
- [x] 2.3 `npm run build` kończy się sukcesem — 5dea812

### Phase 3: Strona /employees i nawigacja

#### Automated

- [x] 3.1 `npx astro sync` przechodzi — c0c77ee
- [x] 3.2 `npm run lint` przechodzi — c0c77ee
- [x] 3.3 `npm run build` kończy się sukcesem — c0c77ee

#### Manual

- [x] 3.4 Dodanie pracownika pojawia się na liście bez przeładowania — c0c77ee
- [x] 3.5 Walidacja formularza (pusta nazwa, pusty/zły e-mail) pokazuje błędy pod polami — c0c77ee
- [x] 3.6 Duplikat (nazwa + e-mail) ostrzega; „To inna osoba" dodaje, „Anuluj" nie; nazwa + inny e-mail bez ostrzeżenia — c0c77ee
- [x] 3.7 Edycja wiersza zapisuje nową nazwę i e-mail — c0c77ee
- [x] 3.8 Usunięcie z potwierdzeniem usuwa pracownika (na koncie seeda także jego dostępności/przypisania) — c0c77ee
- [x] 3.9 Link „Pracownicy" z dashboardu działa; wylogowanie blokuje `/employees` — c0c77ee
- [x] 3.10 Izolacja: drugie konto widzi pustą listę, nie dane konta A — c0c77ee
- [x] 3.11 Konto seeda widzi 5 pracowników z seeda — c0c77ee
