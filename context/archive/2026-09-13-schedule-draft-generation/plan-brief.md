# Generowanie draftu grafiku i widok dziur (S-04) — Plan Brief

> Full plan: `context/changes/schedule-draft-generation/plan.md`

## What & Why

Właściciel generuje bazowy draft grafiku tygodnia z dostępności pracowników i zawsze widzi nieobsadzone godziny otwarcia („dziury"). To rdzeń logiki domenowej produktu (FR-007, FR-008) i pierwszy krok pętli north star US-01: draft → dziury → (S-05) korekta → (S-06) zapis.

## Starting Point

Schemat kompletny od F-01 (tabele `schedules` i `assignments`, status `draft`/`saved`, jeden grafik na tydzień od poniedziałku), ale zero kodu grafiku — serwis, endpoint i UI do zbudowania od zera po wzorcu S-03. Helpery tygodnia (`src/lib/week.ts`) i seed (dostępności 3 tygodni + draft-fixture na tydzień bieżący) już czekają.

## Desired End State

Na `/schedules` (domyślnie następny tydzień) właściciel klika „Generuj draft" i widzi listę per dzień: zmiany (kto, od–do) i czerwone dziury z godzinami. Draft jest od razu zapisany w bazie (nie znika po F5), przy każdej zmianie można zamienić osobę na inną w pełni dostępną, a „Usuń draft" pozwala zacząć od nowa.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Regeneracja draftu | Blokada przycisku + awaryjne „Usuń draft" | Nic nie ginie jednym kliknięciem, a przed S-05 jest droga wyjścia | Plan |
| Wybór pracownika przy kilku dostępnych | Generator układa automatycznie (najdłuższy ciąg, remis alfabetycznie) + zamiana osoby w widoku | Janusz zachowuje kontrolę bez komplikowania generacji; pełna edycja zostaje w S-05 | Plan |
| Trwałość draftu | Zapis od razu do bazy (status `draft`) | Nic nie ginie przy odświeżeniu; S-05/S-06 dostają punkt zaczepienia zgodny ze schematem | Plan |
| Zakres tygodni | Dowolny tydzień | Spójność z nawigacją dostępności, zero dodatkowych reguł | Plan |
| Kształt widoku | Lista per dzień (jak dostępności) | main_goal=speed + deadline 14.09; PRD wymaga tylko widoczności dziur | Plan |
| Dziury | Liczone przy odczycie, nie przechowywane | Po edycjach S-05 i zapisie S-06 widok zawsze zgodny z rzeczywistością; dziura nie może „zniknąć" | Research |
| Reguła pokrycia | Sweep „najdłuższy dostępny ciąg", klipowanie do godzin otwarcia | Mniej pociętych zmian; pokrycie/dziury identyczne jak przy każdej deterministycznej regule | Plan |
| Testy | Brak testów automatycznych w tej zmianie | Decyzja użytkownika — wracają w `testing-runner-core-logic` | Plan |

## Scope

**In scope:** serwis + czysty generator + walidacja; endpointy GET/POST/PUT/DELETE `/api/schedules`; strona `/schedules` + islanda `ScheduleBoard` (nawigacja tygodniowa, Generuj / Usuń draft / zamiana osoby, dziury czerwone); dashboard + `PROTECTED_ROUTES`.

**Out of scope:** ręczna edycja zmian i ostrzeżenia o kolizjach (S-05), finalny zapis (S-06), eksport tekstowy (S-07), archiwum (S-08), optymalizacja (Non-Goals), testy automatyczne, migracje i seed.

## Architecture / Approach

Czysty `schedule-generation.ts` (bez I/O: `generateDraft`, `computeHoles`, `isFullyCovered`) → serwis `schedule.ts` (I/O, `ServiceResult<T>`, scoping `business_id`) → endpoint w konwencji `availabilities/index.ts` (kolejność błędów 401→500→400→404→409, polskie stałe w `src/lib/http.ts`) → strona SSR (pracownicy + godziny otwarcie jako props) + islanda (stan tygodnia, GET przy zmianie tygodnia, mutacje POST/PUT/DELETE). Dziury zawsze liczone z godzin otwarcia i przypisań.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Serwis + logika generacji | Czysty generator, dostęp do danych, parsery | Subtelności sweepa (scalenie segmentów, klipowanie) |
| 2. Endpointy API | GET/POST/PUT/DELETE z zaporą 409 i odmową dla `saved` | Mapowanie kodów PG (23505, PGRST116) |
| 3. Strona + islanda + nawigacja | Pełny przepływ użytkownika z dziurami i akcjami | Nowy komponent — ryzyko dryfu stylistycznego względem dostępności |

**Prerequisites:** F-01–S-03 (done); lokalny Supabase z WSL + seed; deadline 2026-09-14.
**Estimated effort:** ~2 sesje (3 fazy), bez testów automatycznych.

## Open Risks & Assumptions

- „Usuń draft" usuwa też ręcznie ułożone przypisania — przed S-05 to jedyna droga poprawy; akceptowane decyzją o blokadzie.
- Zamiana osoby nie ostrzega o nakładaniu się zmian tej samej osoby (S-05).
- Brak testów automatycznych — logika generacji bez siatki bezpieczeństwa do czasu `testing-runner-core-logic`.

## Success Criteria (Summary)

- Generacja z dostępności tworzy draft zapisany w bazie; dziury każdego niepokrytego odcinka są widoczne i nie znikają po odświeżeniu.
- Zamiana osoby możliwa wyłącznie na osoby w pełni dostępne na cały przedział zmiany.
- Wszystkie scenariusze E2E (A–F) przechodzą klik-po-kliku; CI (sync + lint + build) zielone.
