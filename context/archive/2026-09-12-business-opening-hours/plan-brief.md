# Biznes i godziny otwarcia (S-01) — Plan Brief

> Full plan: `context/changes/business-opening-hours/plan.md`
> Roadmap: `context/foundation/roadmap.md` (S-01, issue #5)

## What & Why

Pierwszy pionowy przekrój JanuszexGrafikPro (S-01): właściciel zakłada swój biznes (jeden na konto — FR-003) i definiuje godziny otwarcia lokalu na każdy dzień tygodnia (FR-004). To dane wejściowe całej reguły produktu — bez godzin otwarcia nie ma o czym pilnować pokrycia w grafiku.

## Starting Point

F-01 jest zaimplementowane: schemat (`businesses` z unikalnym `owner_id`, `opening_hours` — jeden ciągły przedział na dzień, brak wiersza = dzień zamknięty) i RLS izolujące per właściciel istnieją, typy wygenerowane. Auth i wzorce API/UI działają z baseline. Brakuje całej warstwy aplikacyjnej: serwisu, endpointów domenowych i jakiegokolwiek UI poza auth.

## Desired End State

Po zalogowaniu właściciel bez biznesu trafia na `/business/setup` i jednym formularzem (nazwa + siatka 7 dni) zakłada biznes; następnie widzi podgląd na dashboardzie i może edytować nazwę i godziny na `/business`. Zamknięte dni nie mają wierszy w bazie; niepoprawne godziny (zamknięcie ≤ otwarcie) odrzucane client- i server-side.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Onboarding | Osobna strona `/business/setup` + redirect gating | Najkrótsza ścieżka do wartości, dashboard pozostaje czysty | Plan (Q&A) |
| Edytor godzin | Island React, siatka 7 dni, zapis „Zapisz tydzień" | Natychmiastowa walidacja i toggle dni bez przeładowań; zgodny z NFR < 10 minut | Plan (Q&A) |
| API | `POST /api/business`, `PUT /api/business` (nazwa), `PUT /api/business/opening-hours` | Zapis tygodnia jednym requestem = jeden spójny stan | Plan (Q&A) |
| Komunikacja island↔API | fetch + JSON (błędy per pole) | Redirect-with-error z auth gubiłby stan 14-poliowej siatki | Plan |
| Godziny nocne | Poza zakresem (schemat F-01: `closes > opens`) | Kawiarnia zamyka przed północą; zero zmian w schemacie | Plan (Q&A) |
| Edycja nazwy biznesu | W tym slice (PUT) | Trywialny koszt, unika frustracji literówki | Plan (Q&A) |
| Walidacja | Ręczna: serwis (autorytatywnie) + lekka client-side | Minimalizm zgodny z main_goal=speed; brak zod w repo | Plan (Q&A) |
| Dashboard z biznesem | Podgląd nazwy + read-only siatka + link „Edytuj" | Pętla feedbacku po zapisie; naturalne miejsce rozbudowy S-02+ | Plan (Q&A) |
| Domyślny prefill tygodnia | pon–pt 09:00–17:00, weekend zamknięty | Przyspiesza konfigurację, każdy dzień łatwo przestawić | Plan |

## Scope

**In scope:** serwis `src/lib/services/business.ts` (+ walidacja), 3 endpointy JSON, strony `/business/setup` i `/business`, gating dashboardu, islandy (wspólny `OpeningHoursEditor` + 3 formularze), rozszerzenie `PROTECTED_ROUTES`, read-only podgląd godzin.

**Out of scope:** migracje (schemat stoi), pracownicy/dostępności/draft (S-02+), usuwanie biznesu, wielu lokali, godziny nocne, zod/test runner, mobile-first.

## Architecture / Approach

Serwis skupia operacje Supabase i reguły; API routes to cienkie handlery (JSON, 401/400/404/409); UI = strony Astro + islandy React współdzielące edytor siatki. Właściciel z `context.locals.user` (middleware), sesja w cookies napędza RLS — brak dodatkowej warstwy uprawnień w kodzie. Zapis tygodnia: upsert dni otwartych (`onConflict business_id,weekday`) + delete zamkniętych; nieatomowy, ale idempotentny.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Serwis + walidacja | `business.ts` + `business-validation.ts` z typami | Rozjazd reguł client/server (mitygowane: server autorytatywny) |
| 2. Endpointy API | POST/PUT/PUT z kodami błędów 401/400/404/409 | Rozpoznanie duplikatu (`23505`) jako 409 |
| 3. Strony i islandy | Setup, edycja, gating, read-only podgląd | UX siatki (toggle, błędy per wiersz) i redirect flow |

**Prerequisites:** F-01 wdrożone (migracje lokalne + zdalne); `npx supabase start` + Docker do testów; konto seedowe owner@example.com.
**Estimated effort:** ~1 sesja robocza, 3 fazy.

## Open Risks & Assumptions

- Zapis tygodnia nie jest atomowy (brak transakcji na kluczu publicznym) — akceptowane, operacja idempotentna; regresja łatwa do wychwycenia ręcznie, bo brak testów automatycznych.
- `<input type="time">` różni się między przeglądarkami — NFR obejmuje dwie najnowsze desktopowe główne przeglądarki; weryfikacja manualna.
- Brak test runnera: reguły walidacji sprawdzone tylko ręcznie do czasu S-02+.

## Success Criteria (Summary)

- Nowy właściciel: rejestracja → setup → zapis biznesu z godzinami → podgląd na dashboardzie, wszystko w minuty.
- Właściciel z biznesem: edycja nazwy i godzin działa; zamknięcie dnia usuwa wiersz; niepoprawne godziny nie przechodzą.
- Zero zmian w bazie — F-01 nietknięty, izolacja RLS zachowana.
