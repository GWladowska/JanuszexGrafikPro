# Ręczna edycja draftu z ostrzeżeniami o kolizjach (S-05) — Plan Brief

> Full plan: `context/changes/schedule-editing-collisions/plan.md`

## What & Why

Właściciel musi móc skorygować wygenerowany draft ręcznie — przesunąć zmiany, zamienić osoby, zapełnić dziury, usunąć pomyłki — a system ma natychmiast sygnalizować kolizje (FR-009, FR-010, US-03; guardrail PRD): ułożenie pracownika poza jego dostępnością oraz tę samą osobę w dwóch nakładających się zmianach. PRD zostawiło otwarte pytanie „ostrzeżenie vs twardy blok" — decyzja (2026-09-13): **ostrzeżenie, zapis dozwolony** (zmiana z kolizją zapisuje się, ale nosi trwałą żółtą flagę).

## Starting Point

S-04 dostarczył pełną pętlę generacji: draft zapisywany w bazie (`status: 'draft'`), widok listy per dzień z licznymi dziurami, zamiana osoby — ale **tylko na osoby w pełni dostępne**, a serwer twardo odrzuca niedostępnych (409). Kolizja jest więc dziś nieosiągalna — nie ma czego ostrzegać. Seed zawiera gotowy fixture: nakładka dwóch osób (Pon) i zmiany poza dostępnością (Wt/Śr).

## Desired End State

Janusz edytuje grafik bez przeładowań: edycja godzin zmiany w miejscu, select z sekcjami „Dostępni / Niedostępni", dodanie zmiany z klikniętej dziury (czasy wypełnione automatycznie), usuwanie z potwierdzeniem. Karta każdego dnia otwarcia pokazuje okno lokalu („Pn 14.09 · 08:00 – 18:00", dzień zamknięty „Nieczynne"). Zmiana wykraczająca poza dostępność pracownika nosi trwałą flagę „⚠ Poza dostępnością: {zakres}", a zmiana nakładająca się z inną zmianą tej samej osoby — flagę „⚠ Nakładka z inną zmianą tej samej osoby: {zakres}"; obie widoczne też po odświeżeniu. Zmiany nie mogą wychodzić poza godziny otwarcia dnia (walidacja klienta + zapora serwerowa). Dziury przeliczają się po każdej operacji i nie znikają z ekranu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Kolizja: ostrzeżenie vs blok | Ostrzeżenie, zapis dozwolony | Zgodne z treścią US-03/FR-010 („system ostrzega") i NFR natychmiastowej reakcji; szef czasem wie więcej niż system |
| Rodzaje kolizji | „Poza dostępnością" + nakładka tej samej osoby | Nakładka tej samej osoby jest fizycznie niewykonalna — najczęstszy błąd przy ręcznym przesuwaniu; nakładka dwóch RÓŻNYCH osób to normalna obsada szczytu (test negatywny) |
| Granica czasowa | Zmiana musi mieścić się w godzinach otwarcia dnia | „Dostępności rozważamy tylko w godzinach pracy biznesu" — twarda walidacja, nie ostrzeżenie |
| Zakres edycji | Pełny zestaw: przesuwanie + zamiana + dodawanie + usuwanie | Bez dodawania dziury w dniach bez żadnej zmiany są nie do zapełnienia — US-01 (north star) by się nie domknął |
| UX przesuwania | Edycja w miejscu (pola czasu), nie drag&drop | Wzorzec listy z S-03/S-04, main_goal=speed, deadline 2026-09-14 |
| Reakcja na niedostępnego | Zapis od razu + trwała flaga | NFR „natychmiast, bez odświeżania"; guardrail zachowany — kolizja stale widoczna |
| Wybór osoby | Jedno pole z dwiema sekcjami (optgroup) | Czytelny podział dostępnych/niedostępnych w jednym kontrolerze |

## Scope

**In scope:** nagłówki dni z zakresem godzin otwarcia; flagi kolizji (poza dostępnością + nakładka tej samej osoby) liczone przy renderze; inline-edycja godzin zmiany; zamiana osoby (także niedostępnej); dodawanie zmiany (z dziury z prefillem i ogólne); usuwanie zmiany z potwierdzeniem; nowy endpoint przypisań (POST/PUT/DELETE); zdjęcie twardej blokady 409; wyciągnięcie zduplikowanych helperów endpointów do `src/lib/api.ts` (lekcja); logowanie błędów SSR na `/schedules`.

**Out of scope:** finalny zapis/status `saved` (S-06); ostrzeżenie o nakładce dwóch RÓŻNYCH osób (to nie kolizja — test negatywny); blokada operacji tworzących nakładkę (ostrzeżenie, nie błąd); drag&drop i widok kalendarzowy; zmiany schematu/migracji/seedu; testy automatyczne (decyzja 2026-09-13).

## Architecture / Approach

Vertical slice po wzorcu S-04: czysta logika (`findUncoveredRanges`, `findSelfOverlaps`, `isWithinOpeningHours` w `schedule-generation.ts`) → parsery (`schedule-validation.ts`) → serwis CRUD przypisań (`schedule.ts`) → endpoint `src/pages/api/schedules/assignments.ts` (POST/PUT/DELETE, guard draftu, kolejność walidacji konwencyjna) → islanda `ScheduleBoard.tsx` (właścicielka stanu edycji, flagi obu kolizji liczone przy renderze z już pobranych danych). Stary PUT z twardą blokadą znika z `index.ts` (GET/POST/DELETE tygodniowe zostają).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Logika i serwis | Wykrywanie niedopięć dostępności, walidacja okna, CRUD przypisań | Rozjazd kontraktów typów — łapie go dopiero `npx astro check` (lekcja) |
| 2. API przypisań | Dodawanie/edycja/usuwanie zmiany; zdjęcie blokady 409; wspólny kontekst endpointów | Regresja istniejących tras przy refaktorze helperów |
| 3. Islanda | Edycja w miejscu, dwie sekcje wyboru, obsadzanie dziur, flagi | Najwięcej stanu UI — ryzyko rozjazdu stanu i danych po operacjach |

**Prerequisites:** lokalny stack (WSL: `supabase start` + `supabase db reset`; PowerShell: `npm run dev`); drafty/daty zgodne z seedem.
**Estimated effort:** ~2–3 sesje robocze w 3 fazach (deadline 2026-09-14).

## Open Risks & Assumptions

- Naprawiono w trakcie planowania (poza fazami, niekommitowane — commitują się z fazą 1) przyczynę błędu „Nie udało się pobrać danych" na `/schedules`: `getAssignments` wołany bez `business_id` — padało dla kont z draftem na domyślny tydzień (owner), działało dla świeżych kont; `astro check` wyłapał przy okazji 2 prezydencjące błędy typów S-04 w `getOpeningHours`/`ScheduleBoard`.
- Podwójna rezerwacja nie przenosi osoby do sekcji „Niedostępni" przy wyborze — ujawnia się flagą po zapisie (celowe uproszczenie; jeśli mylące, follow-up przy impl-review).
- Tryb ostrzeżeń oznacza, że kolizja może zostać w draftzie — S-06 (zapis) musi zdecydować, czy flaga blokuje finalny zapis.

## Success Criteria (Summary)

- Janusz przesuwa, dodaje, usuwa zmiany i zamienia osoby — każda operacja zapisuje się bez przeładowania, dziury aktualizują się natychmiast.
- Przypisanie pracownika poza jego dostępność zapisuje się z trwałą flagą „⚠ Poza dostępnością: {zakres}", a nakładka dwóch zmian tej samej osoby z flagą „⚠ Nakładka z inną zmianą tej samej osoby: {zakres}" — obie również po odświeżeniu; nic nie przechodzi po cichu.
- Zmiana nie da się ułożyć poza godzinami otwarcia dnia (klient i serwer odmawiają).
