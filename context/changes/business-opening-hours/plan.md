# Biznes i godziny otwarcia (S-01) Implementation Plan

## Overview

Pierwszy pionowy przekrój aplikacji: zalogowany właściciel zakłada swój biznes (jeden na konto — FR-003) i definiuje godziny otwarcia lokalu na każdy dzień tygodnia (FR-004). Onboarding przez dedykowaną stronę `/business/setup`, edycja przez `/business`, podgląd na dashboardzie. Warstwa danych i RLS istnieją po F-01 — ten slice dodaje wyłącznie serwis aplikacyjny, API i UI.

## Current State Analysis

- **Schemat gotowy (F-01, implemented):** `businesses` z `unique (owner_id)` — jeden biznes na konto wymuszony w bazie (supabase/migrations/20260912141307_domain_schema.sql:28); `opening_hours` — jeden ciągły przedział na dzień, `weekday` ISO 1–7, brak wiersza = dzień zamknięty, `CHECK (closes_at > opens_at)`, `unique (business_id, weekday)` (schema.sql:38-48). RLS izoluje per właściciel przez `is_business_owner` (20260912144543_domain_rls.sql:11). Typy wygenerowane: `src/lib/database.types.ts:129` (businesses), `:188` (opening_hours).
- **Auth baseline:** `src/middleware.ts` ustawia `context.locals.user` na każdej trasie i chroni `PROTECTED_ROUTES = ["/dashboard"]`; klient Supabase SSR (`src/lib/supabase.ts`) niesie sesję użytkownika w cookies, więc RLS działa automatycznie.
- **Wzorce UI:** interaktywne formularze to React islands z `client:load` (`src/pages/auth/signin.astro:16`); walidacja client-side w island + obsługa błędu serwera (wzorzec `src/components/auth/SignInForm.tsx`); komponenty wielokrotnego użytku `FormField`, `SubmitButton`, `ServerError` w `src/components/auth/`; styl kosmiczny glassmorphism Tailwind.
- **Wzorzec API:** handlery uppercase (`POST: APIRoute`), form-data + redirect z `?error=` (`src/pages/api/auth/signup.ts`) — dla endpointów JSON tego slice'a świadomie fetch + JSON (uzasadnienie: błędy per pole bez utraty stanu 14-poliowej siatki; redirect gubiłby dane formularza).
- **Dane testowe:** seed lokalny (supabase/seed.sql) tworzy konto owner@example.com z biznesem "Kawiarnia Januszex" i godzinami pon–sob — konto seedowe testuje tryb edycji, świeża rejestracja testuje tryb tworzenia.
- **Brak:** test runnera, zod, react-hook-form (package.json). CI gate: `npx astro sync` + `npm run lint` + `npm run build` (@.github/workflows/ci.yml).

## Desired End State

Nowo zarejestrowany właściciel po logowaniu ląduje na `/business/setup`, wypełnia nazwę biznesu i siatkę godzin (7 dni, każdy otwarty/zamknięty), zapisuje — i widzi podgląd na dashboardzie. Właściciel z biznesem może na `/business` zmienić nazwę i godziny; zamknięte dni usuwają wiersze z bazy, brak wiersza = dzień zamknięty. Próba zapisu niepoprawnych godzin (zamknięcie ≤ otwarcie) jest odrzucana po stronie klienta i serwera. Weryfikacja: ręczny przepływ E2E na dwóch kontach (świeża rejestracja + konto seedowe) + zielone `lint`/`build`/`astro sync`.

### Key Discoveries:

- `businesses.unique(owner_id)` (schema.sql:28) — druga próba utworzenia biznesu kończy się naruszeniem unikalności; rozpoznawane po kodzie błędu PostgREST `23505` i obsługiwane jako 409.
- `opening_hours` bez wiersza dla danego dnia = dzień zamknięty — zapis tygodnia to upsert dni otwartych + delete dni zamkniętych (nic więcej).
- `CHECK (closes_at > opens_at)` (schema.sql:44) — godziny nocne (np. 10:00–02:00) są niemożliwe; decyzja: akceptujemy, walidacja komunikuje to użytkownikowi (kawiarnia zamyka przed północą).
- `src/components/auth/{FormField,SubmitButton,ServerError}.tsx` są generyczne i wielokrotnego użytku w nowych formularzach.
- `src/pages/api/business/index.ts` może eksportować `POST` i `PUT` w jednym pliku (konwencja uppercase-handlerów z @src/pages/api/auth/signup.ts).

## What We're NOT Doing

- Zero migracji i zmian schematu — F-01 pozostaje nietknięty.
- Brak pracowników (S-02), dostępności (S-03), draftu grafiku (S-04+).
- Brak usuwania biznesu i obsługi wielu lokali (PRD Non-Goals; jeden biznes na konto).
- Brak godzin nocnych (zamknięcie po północy) — decyzja z planowania; walidacja odmawia zapisu.
- Brak zod / react-hook-form / test runnera — walidacja ręczna, weryfikacja ręczna + CI gate.
- Brak stronie zarządzania kontem / resetu hasła (poza zakresem PRD v1).

## Implementation Approach

Trzy cienkie warstwy: **serwis** (`src/lib/services/business.ts`) skupia wszystkie operacje Supabase i reguły walidacji — API routes pozostają cienkimi handlerami HTTP; **API** zwraca JSON (`{ error, fieldErrors? }` przy błędach, 401/400/404/409); **UI** składa się z trzech stron Astro i islandów React współdzielących jeden komponent edytora siatki godzin. Zapis tygodnia jednym requestem (upsert istniejących dni, insert nowych, delete zamkniętych) — zgodnie z UX "Zapisz tydzień". Właściciel rozpoznawany z `context.locals.user` (middleware), klient RLS z `createClient(headers, cookies)`.

## Critical Implementation Details

- **Zapis tygodnia nie jest atomowy.** supabase-js na kluczu publicznym nie wykonuje transakcji, a RPC odpadło w decyzjach: **jeden** upsert wszystkich dni otwartych (`onConflict: "business_id,weekday"` — obsługuje i istniejące, i nowe wiersze), potem delete dni zamkniętych. Operacja jest idempotentna — po częściowym błędzie powtórny zapis domyka stan, więc brak transakcji jest akceptowalny w v1; nie wprowadzać kolejności odwrotnej (delete przed upsert zrobiłby okno z brakującymi danymi).

## Phase 1: Serwis domenowy + walidacja

### Overview

Wszystkie operacje na biznesie i godzinach otwarcia w jednym module serwisowym z ręczną walidacją wejścia. API z fazy 2 będzie wywoływać wyłącznie te funkcje.

### Changes Required:

#### 1. Serwis biznesu

**File**: `src/lib/services/business.ts`

**Intent**: Skupić dostęp do Supabase dla domeny biznes/godziny w jednym miejscu, aby endpointy i strony nie dubliły zapytań.

**Contract**: Funkcje `getBusinessForOwner(supabase, ownerId)` → biznes lub `null`; `createBusiness(supabase, ownerId, input)` → utworzenie z RLS (`owner_id: user.id`); `updateBusinessName(supabase, ownerId/businessId, name)`; `upsertOpeningWeek(supabase, businessId, days)` — upsert dni otwartych + delete zamkniętych (zgodnie z Critical Implementation Details). Wyniki w jednolitym kształcie `{ data } | { error }`, błędy Supabase przepuszczane z kodem (`error.code === "23505"` rozpoznawany wyżej jako duplikat).

#### 2. Walidacja domenowa

**File**: `src/lib/services/business-validation.ts`

**Intent**: Jedna definicja reguł walidacji używana przez endpointy (autorytatywnie) i islandy (lekka kopia reguł client-side).

**Contract**: `parseBusinessName(name)` → `{ value } | { fieldError }` (trim, 1–120 znaków); `parseOpeningWeek(days)` → `{ value: OpeningHoursDay[] } | { fieldErrors }` — weekday int 1–7, czas `HH:MM` (akceptuje `HH:MM:SS` z `<input type="time">`, normalizuje do `HH:MM`), dla dnia otwartego `closes > opens` (porównanie znormalizowanych stringów — poprawne dla zero-padded HH:MM). Typ dzielony z islandami:

```ts
type OpeningHoursDay =
  | { weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; opensAt: string; closesAt: string }
  | { weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; closed: true };
```

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npm run build` przechodzi (typy serwisu kompatybilne z `database.types.ts`)

#### Manual Verification:

- Przegląd kodu: kontrakt funkcji serwisu zgadza się z planem; walidacja pokrywa nazwę, weekday, format czasu i `closes > opens`

---

## Phase 2: Endpointy API (JSON)

### Overview

Trzy endpointy pod `src/pages/api/business/` — utworzenie biznesu z godzinkami, zmiana nazwy, zapis tygodnia godzin. Autoryzacja z `context.locals.user`, RLS po stronie bazy. Oba PUT-y rozwiązują biznes przez `getBusinessForOwner(ownerId)` → `404` gdy null; normalizacja `HH:MM:SS`→`HH:MM` (PostgREST zwraca `time` z sekundami) należy do serwisu — zwracane wiersze i propsy stron są już znormalizowane.

### Changes Required:

#### 1. Tworzenie i zmiana nazwy biznesu

**File**: `src/pages/api/business/index.ts`

**Intent**: `POST` tworzy biznes (+ opcjonalne godziny jednym wywołaniem serwisu — zgodnie z decyzją o 2 endpointach, godziny są opcjonalnym elementem payloadu utworzenia); `PUT` zmienia nazwę istniejącego biznesu.

**Contract**: Wejście JSON: `POST { name, openingHours?: OpeningHoursDay[] }`, `PUT { name }`. Odpowiedzi: `201 { business }` / `200 { business }`; błędy JSON `{ error, fieldErrors? }` z kodami: `401` (brak sesji), `400` (walidacja), `409` (biznes już istnieje — `error.code === "23505"` → komunikat „Masz już swój biznes"), `404` (PUT bez biznesu). `createClient` → `null` oznacza brak konfiguracji Supabase (odpowiedź `500` z JSON-em błędu; auth routes robią to redirectem z `?error=` — dla endpointów JSON to 500).

#### 2. Zapis tygodnia godzin

**File**: `src/pages/api/business/opening-hours.ts`

**Intent**: Zapis całego tygodnia jednym requestem — serce edytora godzin.

**Contract**: `PUT { openingHours: OpeningHoursDay[] }` → `200 { openingHours }` (znormalizowane wiersze z bazy) lub `400`/`401`/`404`/`500` jak wyżej. Wywołuje `upsertOpeningWeek` z serwisu.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Smoke-test z sesją (REST client / devtools): bez sesji `401`; `closes < opens` → `400` z fieldErrors; drugi `POST` → `409`; happy path `201` tworzy wiersze w Supabase Studio

---

## Phase 3: Strony i islandy

### Overview

Gating onboardingu, strona setupu, strona edycji i podgląd na dashboardzie. Island `OpeningHoursEditor` współdzielony między setupem a edycją.

### Changes Required:

#### 1. Ochrona tras biznesowych

**File**: `src/middleware.ts`

**Intent**: Rozszerzyć `PROTECTED_ROUTES` o `"/business"`, aby strony biznesowe wymagały logowania (spójnie z `/dashboard`).

**Contract**: `PROTECTED_ROUTES = ["/dashboard", "/business"]`.

#### 2. Strona onboardingu

**File**: `src/pages/business/setup.astro`

**Intent**: Właściciel bez biznesu definiuje nazwę i godziny w jednym formularzu; właściciel z biznesem jest przekierowany na `/business`.

**Contract**: Frontmatter: `Astro.locals.user` → serwis → gdy biznes istnieje, `Astro.redirect("/business")`. Render: `<BusinessSetupForm client:load />`.

#### 3. Strona edycji biznesu

**File**: `src/pages/business/index.astro`

**Intent**: Podgląd i edycja istniejącego biznesu: formularz nazwy + edytor tygodnia.

**Contract**: Frontmatter: redirect `/business/setup` gdy brak biznesu; pobranie biznesu i godzin serwisem; props do islandów z danymi początkowymi (znormalizowane `HH:MM`, dni bez wiersza = `closed`). Render: `<BusinessNameForm businessId currentName client:load />` + `<BusinessHoursForm initialDays client:load />` + link powrotny do `/dashboard`.

#### 4. Dashboard — podgląd i gating

**File**: `src/pages/dashboard.astro`

**Intent**: Dashboard staje się punktem startowym: brak biznesu → onboarding; biznes → podgląd nazwy + read-only siatka godzin + link „Edytuj" + istniejący Sign out.

**Contract**: Frontmatter: pobranie biznesu serwisem; brak → `Astro.redirect("/business/setup")`. Read-only siatka renderowana po stronie serwera w Astro (dni otwarte z przedziałem, zamknięte z etykietą „Zamknięte") — bez islanda, to statyczny podgląd.

#### 5. Islandy formularzy biznesowych

**Files**: `src/components/business/OpeningHoursEditor.tsx`, `src/components/business/BusinessSetupForm.tsx`, `src/components/business/BusinessNameForm.tsx`, `src/components/business/BusinessHoursForm.tsx`

**Intent**: Wspólny edytor siatki 7 dni (pn–nd) — wiersz: przełącznik otwarte/zamknięte (wyłącza pola czasu dnia), `<input type="time">` od–do, błędy per wiersz — komponowany w trzy formularze mówiące do API.

**Contract**: `OpeningHoursEditor` kontrolowany propsami (`days`, `onChange`, `errors?`) — bez własnego fetchowania. `BusinessSetupForm` (nazwa + edytor → `POST /api/business` → redirect `/dashboard`), `BusinessNameForm` (→ `PUT /api/business`), `BusinessHoursForm` (edytor → `PUT /api/business/opening-hours`); wszystkie przez `fetch` + JSON, stan `pending` na przyciskach (`SubmitButton` z `pendingText` + nowy opcjonalny prop `pending?: boolean` — `useFormStatus()` w `SubmitButton.tsx:12` raportuje pending tylko dla natywnego submitu `<form>`, więc islandy przekazują własny stan; fallback do `useFormStatus` gdy prop nieobecny), błędy serwera mapowane na pola (`ServerError`/inline). Komunikacja fetch+JSON zamiast redirect-with-error — celowe odstępstwo od wzorca auth (patrz Implementation Approach). Reużyte: `FormField`, `SubmitButton`, `ServerError` z `src/components/auth/`; `cn()` z `src/lib/utils.ts` do budowania klas.

#### 6. Helpery weekday i stan domyślny

**File**: `src/components/business/opening-hours.ts`

**Intent**: Etykiety dni (PL skróty: Pn…Nd) i domyślny stan dla trybu tworzenia — wspólny dla obu trybów.

**Contract**: `WEEKDAY_LABELS` (ISO 1–7 → Pn, Wt, Śr, Cz, Pt, So, Nd), `defaultWeek()` dla nowego biznesu: pon–pt `09:00–17:00` otwarte, sob–nd zamknięte (skrót konfiguracji; użytkownik zmienia dowolnie).

#### 7. Redirect po logowaniu

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Domknąć obietnicę „po logowaniu ląduje na /business/setup" — dziś handler redirectuje na `/` (publiczny Welcome), więc gating dashboardu nie zadziała bez ręcznego kliknięcia „Dashboard" w Topbar.

**Contract**: `context.redirect("/")` → `context.redirect("/dashboard")` (signin.ts:19). Dashboard (zmiana 4) robi resztę: brak biznesu → `/business/setup`, biznes → podgląd.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Świeża rejestracja → login → redirect na `/business/setup` → zapis nazwy + godzin → dashboard pokazuje podgląd
- Konto seedowe (owner@example.com) → `/business/setup` redirectuje na `/business`; edycja nazwy i godzin działa; zaznaczenie dnia jako zamkniętego usuwa wiersz z bazy
- Walidacja: `closes < opens` i pusta nazwa blokowane client-side i (z pominięciem clienta) server-side; dzień zamknięty ignoruje pola czasu
- Bezpośrednie wejście niezalogowanego na `/business` i `/business/setup` → redirect `/auth/signin`

---

## Testing Strategy

### Unit Tests:

- Brak test runnera w repo (świadomie, main_goal=speed) — reguły walidacji weryfikowane ręcznie przez UI i smoke-testy API; kolejny slice z formularzami (S-02) może być momentem na wprowadzenie runnera.

### Integration Tests:

- Ręczny E2E w przeglądarce (opisany w fazie 3): tworzenie, zapis tygodnia, edycja, gating, walidacje; izolacja RLS zweryfikowana w F-01 i nietknięta (zero zmian w bazie).

### Manual Testing Steps:

1. `npx supabase start` + `npm run dev`; zarejestruj świeże konto → sprawdź redirect na `/business/setup`
2. Utwórz biznes z domyślnego prefillu, zmień 2 dni, sobotę otwórz i ustaw godziny → zapis → sprawdź wiersze w Supabase Studio (6 wierszy pon–sob + brak nd; prefill ma sobotę zamkniętą, więc jej otwarcie pokrywa ścieżkę insertu nowego dnia)
3. Zaloguj się kontem seedowym (owner@example.com / haslo12345) → `/business` → zmień nazwę, zmień godziny środy, zamknij niedzielę (już zamknięta — bez zmian) → zapis
4. Próbuj zapisać `closes 07:00 < opens 09:00` → błąd per wiersz bez utraty pozostałych danych formularza
5. Wyloguj → wejdź bezpośrednio na `/business` → redirect na `/auth/signin`

## Performance Considerations

Zapytania pojedynczo-rzędowe pod istniejącymi indeksami (`unique(owner_id)`, `unique(business_id, weekday)`) — brak potrzeby optymalizacji. Zapis tygodnia to 1–3 round-tripy do Supabase (upsert + ewentualny delete), długość poniżej progu odczuwalności.

## Migration Notes

Brak migracji — schemat i RLS z F-01 bez zmian. Dane seedowe są kompatybilne (kontro seeded = tryb edycji; świeże konto = tryb tworzenia). Na produkcji nic nie zmienia się w bazie — deploy to zwykły `npx wrangler deploy` po mergu.

## References

- Roadmap: `context/foundation/roadmap.md` (S-01, issue #5)
- PRD: `context/foundation/prd.md` (FR-003, FR-004; US-01 jako kontekst)
- Schemat i RLS: `context/changes/domain-schema-rls/plan.md`, `supabase/migrations/20260912141307_domain_schema.sql`, `supabase/migrations/20260912144543_domain_rls.sql`
- Wzorce: `src/pages/api/auth/signup.ts`, `src/components/auth/SignInForm.tsx`, `src/pages/dashboard.astro`
- Seed: `supabase/seed.sql` (konta testowe)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Serwis domenowy + walidacja

#### Automated

- [x] 1.1 `npm run lint` przechodzi — 6144c8d
- [x] 1.2 `npm run build` przechodzi (typy serwisu zgodne z `database.types.ts`) — 6144c8d

#### Manual

- [x] 1.3 Przegląd kodu: kontrakt serwisu i reguły walidacji zgodne z planem — 6144c8d

### Phase 2: Endpointy API (JSON)

#### Automated

- [x] 2.1 `npm run lint` przechodzi — ff4e9fd
- [x] 2.2 `npm run build` przechodzi — ff4e9fd

#### Manual

- [x] 2.3 Smoke-test API: 401 bez sesji, 400 walidacja, 409 duplikat, happy path 201/200 — ff4e9fd

### Phase 3: Strony i islandy

#### Automated

- [x] 3.1 `npx astro sync` przechodzi
- [x] 3.2 `npm run lint` przechodzi
- [x] 3.3 `npm run build` przechodzi

#### Manual

- [x] 3.4 E2E tworzenie: świeża rejestracja → `/business/setup` → zapis → dashboard pokazuje podgląd
- [x] 3.5 E2E edycja: konto seedowe → `/business` → zmiana nazwy i godzin; dzień zamknięty usuwa wiersz
- [x] 3.6 Walidacje: `closes < opens` i pusta nazwa blokowane client i server
- [x] 3.7 Bezpośrednie wejście niezalogowanego na `/business` i `/business/setup` → redirect `/auth/signin`
