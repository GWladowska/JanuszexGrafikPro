# Zapis kompletnego grafiku (S-06) — Plan Brief

> Full plan: `context/changes/save-complete-schedule/plan.md`

## What & Why

Domknięcie pętli north star: właściciel zapisuje gotowy grafik, a serwer odmawia zapisu, dopóki istnieje choć jedna dziura (nieobsadzona godzina otwarcia) albo kolizja (zmiana poza dostępnością pracownika lub nakładka tej samej osoby). To spełnia guardrail PRD „dziura nie może zostać zapisana po cichu" i AC US-01 „przed zapisem brak dziur" — sedno kryterium primary (< 10 min na kompletny grafik).

## Starting Point

S-04/S-05 dostarczyły cały edytor draftu: czysta logika pokrycia i kolizji, serwis I/O, endpointy tygodniowy i per-zmiana oraz islanda `ScheduleBoard` licząca flagi przy renderze. Schemat ma już enum `schedule_status` z wartościami `draft`/`saved`, a wszystkie mutacje blokują `saved` przez 409 — brakuje tylko kodu, który ustawia `saved` i bramki kompletności przed tym.

## Desired End State

Widok `/schedules` dla draftu pokazuje przycisk „Zapisz grafik": aktywny przy pełnym pokryciu i braku kolizji, wyszarzony z licznikiem braków w przeciwnym razie. Zapis (po potwierdzeniu) ustawia status `saved` bez przeładowania; grafik staje się read-only z zieloną plakietką „Zapisany grafik" i przyciskiem „Odblokuj do edycji", który przywraca draft. Obejście przycisku nie pomija bramki — serwer zwraca 400 z listą blokad.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Co blokuje zapis | Dziury **oraz** kolizje (nie „nadmiar osób") | Brak FR dla nadmiaru; dziury i kolizje to jedyne twarde reguły z PRD | Plan (pytanie) |
| Kolizje przy zapisie | Twarda blokada obu typów (poza dostępnością i nakładka); w drafcie zostają ostrzeżeniami | Szef najpierw kontaktuje pracownika i poprawia dostępność, a zapis finalizuje tylko graf bez flag | Plan (pytanie) |
| Edytowalność po zapisie | Zamrożony + „Odblokuj do edycji" | „Zapisany" znaczy naprawdę zamknięty, ale pomyłka nie jest pułapką bez wyjścia | Plan (PRD Open Q #2) |
| Widok po zapisie | Read-only, zielona plakietka, akcje edycji znikają | Jasny stan końcowy pętli; dziur brak z definicji (bramka) | Plan (pytanie) |
| Przycisk przy brakach | Wyszarzony z licznikiem + zapora serwera zwracająca listę blokad | Od razu widać ile brakuje, a serwer jest źródłem prawdy przy obejściu UI | Plan (pytanie) |
| Potwierdzenia | Oba (zapis i odblokowanie) inline | Dwa działania zmieniające stan końcowy dostają świadomy klik; wzorzec już istnieje | Plan (pytanie) |
| Wyścig na statusie | Warunkowy `UPDATE ... WHERE status = <from>` | Zamyka TOCTOU z przeglądu S-05 bez nowej kolumny/triggera | Research (impl-review S-05 F3) |
| Testy | E2E + bezpośrednie wywołania API; bez automatów | Zgodne z decyzją z S-03–S-05; runner wchodzi w `testing-runner-core-logic` | Plan (pytanie) |

## Scope

**In scope:** czysta funkcja `findScheduleBlockers`; atomowe `saveSchedule`/`unlockSchedule`; `PATCH /api/schedules` z bramką i listą blokad; przycisk zapisu z licznikiem, potwierdzenia, widok read-only, odblokowanie; nowe stałe komunikatów.

**Out of scope:** zmiany trybu ostrzeżeń draftu; blokowanie „nadmiaru osób"; eksport tekstowy (S-07); archiwum (S-08); migracje i seed; automatyczne testy.

## Architecture / Approach

```
ScheduleBoard (island)
  ├─ findScheduleBlockers(...)        ← licznik dziur/kolizji przy renderze
  ├─ PATCH /api/schedules {status}    ← zapis / odblokowanie
  └─ widok: isDraft → akcje edycji | isSaved → read-only + plakietka

PATCH handler (index.ts)
  ├─ getScheduleByWeek → status check (409)
  ├─ getOpeningHours + getAvailabilitiesForWeek + getAssignments
  ├─ findScheduleBlockers → 400 { blockers } gdy niepuste
  └─ saveSchedule / unlockSchedule  → warunkowy UPDATE po statusie
        (PGRST116 → 409)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Logika i serwis | Czysta bramka + atomowe przejścia statusu | Dedup nakładek; poprawne mapowanie PGRST116 |
| 2. Endpoint `PATCH` | Zapora serwera z listą blokad | Kolejność walidacji i spójne kody 400/404/409 |
| 3. Islanda | Przycisk z licznikiem, read-only, odblokowanie | Warunki widoczności akcji (`isDraft` vs `draft`) i czyszczenie stanów przy nawigacji |

**Prerequisites:** S-05 zmergowane (jest); lokalny Supabase + seed (`owner@example.com` / `haslo12345`).
**Estimated effort:** ~2–3 sesje w 3 fazach; brak migracji i nowych zależności.

## Open Risks & Assumptions

- Bramka liczy kolizje z tych samych danych co UI; przy długo otwartej stronie dane klienta mogą się zestarzeć — dlatego serwer zawsze waliduje niezależnie (zapora awaryjna).
- „Odblokuj do edycji" to druga droga zmiany statusu (`saved→draft`) — wymaga pokrycia scenariuszem E2E, by nie powstała pętla bez ponownej walidacji.
- Brak automatycznych testów na regule krytycznej (blokada zapisu) jest świadomym długiem do `testing-runner-core-logic`.

## Success Criteria (Summary)

- Draft z jakąkolwiek dziurą lub kolizją nie da się zapisać — ani przyciskiem, ani bezpośrednim `PATCH`.
- Kompletny grafik zapisuje się jednym potwierdzonym kliknięciem i jest trwale read-only.
- „Odblokuj do edycji" przywraca draft, a ponowny zapis ponownie przechodzi bramkę.
