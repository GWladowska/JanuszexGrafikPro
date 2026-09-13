# Dostępności pracowników (S-03) — Plan Brief

> Full plan: `context/changes/availability-management/plan.md`
> Roadmapa: `context/foundation/roadmap.md` (S-03 + nowy slice S-08 schedule-archive)
> PRD: `context/foundation/prd.md` (FR-006, US-01)

## What & Why

Właściciel wprowadza ręcznie dostępności pracowników (data + przedział godzinowy), przegląda je w ujęciu jednego tygodnia i zarządza nimi (CRUD). To dane wejściowe pętli US-01 — bez nich S-04 nie ma z czego wygenerować draftu grafiku i policzyć „dziur".

## Starting Point

Tabela `availabilities` z pełnym RLS istnieje od F-01 (schema: `work_date` + `start_time/end_time`, wiele wpisów na dzień, check `end > start`) — zero migracji. S-02 zostawił sprawdzony wzorzec pionowego przekroju (serwis → endpointy JSON → strona Astro + islanda React), który ten slice klonuje 1:1.

## Desired End State

Janusz wchodzi z dashboardu na `/availabilities`, wybiera pracownika i widzi jego tydzień (domyślnie kolejny, pon–nd), dodaje wpisy data+od+do, edytuje inline, usuwa z potwierdzeniem. Strzałki ‹ › przeglądają historię i przyszłość. Serwer odrzuca nakładające się przedziały tego samego pracownika w tym samym dniu (409, polski komunikat); stykające się przechodzą.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Lokalizacja w UI | Osobna strona `/availabilities` + link z dashboardu | Czysty ekran z miejscem na przyszły widok tygodniowy S-04 | Plan (Q user) |
| Model wprowadzania | Pojedynczy wpis: data + od + do | Najprostszy formularz, schema już tak działa; ~35 wpisów/tydz. akceptowalne w MVP | Plan (Q user) |
| Widok | Jeden tydzień naraz + nawigacja ‹ ›, domyślnie kolejny tydzień | Zgodne z rytmem MVP (grafik na nadchodzący tydzień) i modelem S-04 | Plan (Q user) |
| Nakładanie przedziałów | Blokada na serwerze (409), wiele przedziałów/dzień OK | „8–12 i 10–15 tracą sens — lepiej zedytować"; styki (12→16) dozwolone | Plan (Q user) |
| Daty z przeszłości | Dozwolone (poprawki „wstecz"), domyślny widok = kolejny tydzień | Schema nie ogranicza; nawigacja ‹ › czyni wpisy widocznymi | Plan (Q user) |
| Archiwum grafików | Nowy slice S-08 `schedule-archive` w roadmapie (read-only, po S-06, równolegle z S-07) | Schemat już trzyma grafik per tydzień — archiwum to tani widok reużyjący nawigację tygodniową | Plan (Q user) |
| Blokada nakładania w aplikacji, nie w bazie | Walidacja JS w API (wzorzec duplikatów S-02) | Skala 1 użytkownika/1 ścieżka zapisu; bez migracji i `btree_gist` | Plan |
| Testy | Brak runnera; sync+lint+build + ręczne E2E | Spójna decyzja S-01/S-02; testy wracają przy S-04 | Roadmap/S-02 |

## Scope

**In scope:**
- Serwis + walidacja (`availability.ts`, `availability-validation.ts`) z reużyciem `parseTime` i `ServiceResult`
- Endpoint `/api/availabilities` POST/PUT/DELETE (sekwencja błędów jak S-02)
- Strona `/availabilities` (SSR) + islanda `AvailabilityManager` (selektor, tydzień ‹ ›, formularz, lista 7 dni, edycja inline, usuwanie)
- Ochrona trasy w middleware + link „Dostępności" na dashboardzie

**Out of scope:**
- Draft grafiku / pokrycie / kolizje ze zmianami (S-04, S-05)
- Formularz tygodniowy i akcja „Powtórz"; auto-import; konta pracowników
- Zmiany w schemacie bazy; automatyczne testy; paginacja/widok miesięczny

## Architecture / Approach

Trzy warstwy jak w S-02: serwis (`src/lib/services/availability*.ts`) jako jedyne miejsce dostępu do tabeli → cienkie endpointy JSON z helperami `src/lib/http.ts` → strona Astro z SSR-fetchem (pracownicy + wszystkie dostępności biznesu, dwa zapytania) i islandą React będącą właścicielem stanu. Nawigacja tygodniowa filtruje po stronie klienta (zero dodatkowych requestów); serwer autorytatywnie weryfikuje przynależność pracownika i regułę nakładania.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Serwis i walidacja | Reguły dat/godzin, CRUD, `findOverlappingAvailability` | Subtelności porównania przedziałów (styki vs nakładanie) |
| 2. Endpointy API | POST/PUT/DELETE z pełną sekwencją błędów (…→404 pracownik→409 nakładanie) | Kolejność i mapowanie błędów (PGRST116→404) |
| 3. Strona + islanda + nawigacja | Pełny UX tygodniowy, link z dashboardu | Hydration/strefa czasowa przy tygodniu i datach |

**Prerequisites:** S-02 done (pracownicy istnieją); lokalny Supabase z seedem (`supabase db reset` z WSL).
**Estimated effort:** ~1 sesja, 3 fazy (wzorzec sklonowany z S-02).

## Open Risks & Assumptions

- Założenie: wpisy poza wyświetlanym tygodniem po zapisie przełączają widok (ochrona przed „niewidzialnymi danymi") — jeśli w E2E okaże się mylące, powrót do zwykłej listy jest tani.
- Nakładanie pilnuje aplikacja, nie baza — przy przyszłej wielu-ścieżkowej aplikacji (np. import z pliku) trzeba przenieść regułę do exclusion constraint (zapisane w planie).
- Wyświetlanie i zapis godzin wymaga normalizacji `"HH:MM:SS"` ↔ `"HH:MM"` (reużyc `parseTime`) — klasyczne miejsce potknięcia.

## Success Criteria (Summary)

- Janusz dodaje/edytuje/usuwa dostępność wybranego pracownika w widoku tygodnia bez przeładowań, a serwer nigdy nie przyjmie nachodzących przedziałów.
- Nawigacja ‹ › pozwala przeglądać i poprawiać historię; domyślnie Janusz widzi kolejny tydzień — dokładnie ten, na który układa grafik w S-04.
- Izolacja per właściciel zachowana (RLS nietknięte); brama jakości: `npx astro sync` + `npm run lint` + `npm run build` + ręczne E2E.
