---
date: 2026-09-14T02:51:00+02:00
researcher: Gabriela Władowska
git_commit: f69093f2a09f256ba0f8337480dec92ad36c3e20
branch: master
repository: JanuszexGrafikPro
topic: "Faza 2 planu testów: reguły po stronie serwera — zapis, zamrożenie, uprawnienia (testy integracyjne)"
tags: [research, codebase, integration-tests, api, schedules, availabilities, rls, freeze, ownership, vitest-pool-workers]
status: complete
last_updated: 2026-09-14
last_updated_by: Gabriela Władowska
---

# Research: Faza 2 planu testów — reguły po stronie serwera (zapis, zamrożenie, uprawnienia)

**Date**: 2026-09-14T02:51:00+02:00
**Researcher**: Gabriela Władowska
**Git Commit**: [f69093f](https://github.com/GWladowska/JanuszexGrafikPro/commit/f69093f2a09f256ba0f8337480dec92ad36c3e20)
**Branch**: master
**Repository**: JanuszexGrafikPro

> Odnośniki: HEAD (`f69093f`) jest wypchnięty na `origin/master`, więc permalinki GitHub są poprawne
> i użyte dla odniesień do kodu produkcyjnego. Odniesienia do `context/archive/**` są lokalne.

## Research Question

Research dla zmiany `testing-server-side-rules` — **Faza 2** z `context/foundation/test-plan.md:56`
("Reguły po stronie serwera: zapis, zamrożenie, uprawnienia"), obejmującej ryzyka **#1 (część serwerowa),
#3, #5, #6** o typach testów **integration**. Brief z `change.md`:

- **#1**: udowodnić, że serwer odrzuca zapis grafiku z brakującą godziną lub kolizją (nie tylko przycisk),
  a odpowiedź mówi, co blokuje; podważyć „zielony przycisk = serwer też pozwoli".
- **#3**: udowodnić, że daty graniczne dają właściwy tydzień i właściwą decyzję zamknięte/otwarte
  w strefie Europe/Warsaw; podważyć „serwer działa w czasie lokalnym"; nie pisać testów zależnych
  od dzisiejszej daty ani od strefy maszyny — produkcyjne wywołania pomijają wstrzykiwany zegar,
  więc potrzebne są fake timers.
- **#5**: udowodnić, że żądanie z identyfikatorem zasobu innego właściciela jest odrzucane,
  a żądanie bez zalogowania nie zmienia danych.
- **#6**: udowodnić, że po zmianie wspólnego pomocnika kluczowe odpowiedzi pozostają takie same
  na kilku różnych ścieżkach.

Pytanie badawcze w jednym zdaniu: **jaki jest minimalny, wierny rzeczywistości sposób uruchomienia
testów integracyjnych na trasach `src/pages/api/**` i jakie kontrakty odpowiedzi (statusy, kształty,
komunikaty, zamrożenie, własność zasobów) te testy muszą przypinać, aby pokryć ryzyka #1/#3/#5/#6?**

## Summary

1. **Trasy API są jednolite i bezpośrednio wywoływalne.** Wszystkie 9 plików tras eksportuje
   nazwane `GET`/`POST`/`PUT`/`PATCH`/`DELETE` przyjmujące `APIContext` i nie dotyka ani
   `context.platform`, ani `context.session` ([schedules/index.ts:45](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/schedules/index.ts#L45)).
   Jedyną przeszkodą importu jest wartość `astro:env/server` w [supabase.ts:3](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/supabase.ts#L3) —
   do zasymulowania aliasem Vite. Warstwa serwisowa trzyma klienta Supabase **jako parametr**
   (`import type`), więc test może wstrzyknąć realny klient (lokalny Supabase) albo mock.

2. **Dwa złącza integracyjne.** **Seam A** — bezpośrednie wywołanie handlerów z atrapą
   `APIContext` (`request`, `locals.user`, `cookies`, `url`) na zwykłym Vitest: tanie, działa dziś,
   dowodzi kontraktów żądań/odpowiedzi, statusów i kształtów błędów; nie ćwiczy middleware ani workerd.
   **Seam B** — `@cloudflare/vitest-pool-workers` (to §4 planu testów): wymaga nowej devDependency,
   dedykowanego `defineWorkersConfig`, bindings Miniflare (`SUPABASE_URL`/`SUPABASE_KEY`, opcjonalnie
   `SESSION` KV), a adapter `@astrojs/cloudflare` wymaga **zbuilowanego `dist/`** jako wejścia
   ([wrangler.jsonc:9](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/wrangler.jsonc#L9))
   — to realny koszt i realna wartość (ćwiczy middleware, `astro:env`, ciasteczka, workerd).

3. **Kontrakty odpowiedzi są spójne i w dużej mierze już udokumentowane w archiwum.** Baza to
   [http.ts](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/http.ts) (22 stałe
   `ERROR_*` + `readJsonBody` + `jsonResponse`); walidacja pól → `400 { error, fieldErrors }`;
   zamrożenie → `409 { error: ERROR_WEEK_FROZEN }` / `ERROR_AVAILABILITY_WEEK_FROZEN`;
   bramka zapisu → `400 { error: ERROR_SCHEDULE_INCOMPLETE, blockers }`; cudzy zasób → **404** (nigdy 403).

4. **Bramka zapisu (ryzyko #1) ma w pełni spójną sekwencję.** PATCH `status:"saved"`:
   walidacja pól → własny biznes → schedule → parsery kształtu (z Fazy 1) → `findScheduleBlockers` →
   blokady = `400 + blockers`, sukces = warunkowy `UPDATE status='draft'` → wygrany 200,
   przegrany wyścigu `PGRST116` → 409 `ERROR_SAVED_SCHEDULE`. Trigger `23000` → 409 jest backstopem.
   Sprawdzenie blokad i zapis **nie są atomowe** — zaakceptowany wyścig MVP.

5. **Zamrożenie (ryzyko #3) ma trzy punkty serwerowe + trigger SQL, wszystkie z ukrytym zegarem.**
   `isFrozenWeek(weekStart)` bez `reference` w [index.ts:124](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/schedules/index.ts#L124)
   i [index.ts:321](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/schedules/index.ts#L321),
   `currentWeekStart()` w [availability-guard.ts:13](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/services/availability-guard.ts#L13).
   Strefa `Europe/Warsaw` jest jawna i w TS ([week.ts:5,7](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/week.ts#L5)),
   i w trigerze (`now() at time zone 'Europe/Warsaw'`). **Asymetria do przypięcia**: PATCH save
   (`status:"saved"`) **nie ma bramki zamrożenia** — dokończenie draftu w bieżącym tygodniu jest celowe.

6. **Własność (ryzyko #5) trzyma się łańcucha `user.id → business → business_id` + RLS.** Żadna trasa
   nie przyjmuje ID zasobu w URL — wszystko w ciele, a `businessId` zawsze pochodzi z
   `getBusinessForOwner(user.id)`. Cudzy/nielistniejący ID → `null`/`[]` na odczycie, `PGRST116` → 404
   na zapisie. Bez zalogowania → `401 { error: ERROR_UNAUTHORIZED }` zanim jakikolwiek serwis zadziała.
   **Middleware nie chroni `/api/**`** ([middleware.ts:4,18](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/middleware.ts#L4))
   — ochrona jest konwencją per-trasa. RLS jest włączone na wszystkich 6 tabelach; test integracyjny
   przeciw **realnemu lokalnemu Supabase** daje sygnał izolacji, mock go traci.

7. **Dryf wspólnych pomocników już istnieje (ryzyko #6 jest realne).** `employees/index.ts` duplikuje
   `resolveRequestContext`/`resolveBusinessId` z [api.ts](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/api.ts);
   `auth/signup.ts:11` ma **angielski** komunikat zamiast `ERROR_NOT_CONFIGURED`;
   dwa konkurencyjne `parseWorkDate` o różnych komunikatach; `assignments.ts` ma lokalną
   `fieldErrorResponse`. Test #6 ma sens właśnie dlatego, że te kopie zaczęły się rozjeżdżać
   (lekcja `lessons.md:5-13`).

## Detailed Findings

### 1. Powierzchnia API i kształt handlerów

Dziewięć plików tras; każda trasa JSON zwraca `jsonResponse(...)` i czyta ciało przez `readJsonBody`.

| Plik | Metody | Główny kontrakt | Uwagi |
|------|--------|-----------------|-------|
| `src/pages/api/schedules/index.ts` | GET, POST, PATCH, DELETE | GET `?week=` → `{ schedule, assignments, availabilities }`; POST `{ weekStart }` → 201 `{ schedule, assignments }`; PATCH `{ weekStart, status }` → 200 `{ schedule }` (save/unlock); DELETE `{ weekStart }` → 200 `{ deleted: true }` | Sedno ryzyka #1 (save) i #3 (freeze) |
| `src/pages/api/schedules/assignments.ts` | POST, PUT, DELETE | POST `{ weekStart, employeeId, workDate, startTime, endTime }` → 201 `{ assignment }`; PUT `{ assignmentId, ... }` → 200; DELETE `{ assignmentId }` → 200 `{ deleted: true }` | Gate: status `draft` (+ trigger `23000`) |
| `src/pages/api/availabilities/index.ts` | POST, PUT, DELETE | `{ employeeId, workDate, startTime, endTime }` / `+ id` → 201/200 `{ availability }`; DELETE → 200 `{ deleted: true }` | Freeze przez `resolveWeekGuard`; `23P01` → 409 |
| `src/pages/api/business/index.ts` | POST, PUT | `{ name, openingHours? }` → 201/200 `{ business }` | Duplikat biznesu `23505` → 409 |
| `src/pages/api/business/opening-hours.ts` | PUT | `{ openingHours }` → 200 `{ openingHours }` | |
| `src/pages/api/employees/index.ts` | POST, PUT, DELETE | `{ name, contactEmail }` / `+ id` → 201/200 `{ employee }`; DELETE → 200 `{ deleted: true }` | Duplikuje helpery z `api.ts` (ryzyko #6) |
| `src/pages/api/auth/signin.ts`, `signup.ts`, `signout.ts` | POST | form-encoded, odpowiedzi to `302` redirect | Poza ryzykiem #5 (publiczne z założenia); `signup.ts` ma angielski komunikat |

### 2. Kontrakt `src/lib/http.ts` — serce ryzyka #6

[http.ts](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/http.ts) (44 linie) eksportuje:
22 stałe `ERROR_*` z dokładnymi polskimi komunikatami, `readJsonBody(request)` (zwraca `null` dla
nie-obiektu/tablicy/nieparsowalnego JSON) i `jsonResponse(data, status)`.

Najważniejsze stałe (pełna lista w pliku, `:1-25`):

| Stała | Komunikat | Używana przy |
|-------|-----------|--------------|
| `ERROR_UNAUTHORIZED` | `Wymagane zalogowanie.` | 401 |
| `ERROR_VALIDATION` | `Formularz zawiera błędy.` | 400 + `fieldErrors` |
| `ERROR_WEEK_FROZEN` | `Miniony i bieżący tydzień są zablokowane — grafik można układać i odblokowywać tylko na przyszłe tygodnie.` | 409 |
| `ERROR_AVAILABILITY_WEEK_FROZEN` | `Miniony tydzień jest zablokowany, a bieżący — gdy grafik jest już zapisany. Dostępności można zmieniać na bieżący (do zapisania grafiku) i przyszłe tygodnie.` | 409 |
| `ERROR_SCHEDULE_INCOMPLETE` | `Grafik nie jest kompletny — uzupełnij dziury i usuń kolizje przed zapisem.` | 400 + `blockers` |
| `ERROR_SAVED_SCHEDULE` | `Grafik jest już zapisany i nie można go zmieniać` | 409 |
| `ERROR_SCHEDULE_NOT_SAVED` | `Grafik nie jest zapisany.` | 409 |
| `ERROR_OVERLAPPING_AVAILABILITY` | `Ten pracownik ma już dostępność nakładającą się na ten przedział — zedytuj istniejący wpis.` | 409 |
| `ERROR_SERVER` | `Wystąpił błąd serwera. Spróbuj ponownie.` | 500 |

**Kody statusów** (literały przy wywołaniach, brak stałych statusu): `200`, `201`, `400`, `401`, `404`,
`409`, `500`; trasy auth używają `302`.

**Istniejący dryf (ryzyko #6 — dowód, że kopie się rozjeżdżają):**

- [employees/index.ts:22](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/employees/index.ts#L22) — lokalny `UUID_PATTERN` (duplikat `schedule-validation.ts:17`);
- [employees/index.ts:30-47](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/employees/index.ts#L30) — lokalny `resolveRequestContext` (duplikat [api.ts:21-33](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/api.ts#L21));
- [employees/index.ts:49-58](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/employees/index.ts#L49) — lokalny `resolveBusinessId` (duplikat `api.ts:43-52`);
- [availabilities/index.ts:41](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/availabilities/index.ts#L41) — lokalny komunikat `"Wybierz pracownika."` w `fieldErrors`;
- [assignments.ts:35-37](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/schedules/assignments.ts#L35) — lokalna `fieldErrorResponse` (nie ma jej w `http.ts`);
- [auth/signup.ts:11](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/auth/signup.ts#L11) — **angielski** `Supabase is not configured` vs `ERROR_NOT_CONFIGURED` (polski) w [signin.ts:11](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/auth/signin.ts#L11);
- dwa konkurencyjne `parseWorkDate` z różnymi komunikatami: `schedule-validation.ts:21` (`Podaj datę zmiany w formacie RRRR-MM-DD.`) vs `availability-validation.ts:16,20,24` (`Data jest wymagana.` / `Podaj datę w formacie RRRR-MM-DD.` / `Podaj poprawną datę.`).

Trasy auth **nie importują** `http.ts`. Importerzy: `api.ts`, `schedules/index.ts`, `assignments.ts`,
`availabilities/index.ts`, `business/index.ts`, `business/opening-hours.ts`, `employees/index.ts`.

### 3. Bramka zapisu — sekwencja PATCH `status:"saved"` (ryzyko #1)

Dokładna kolejność w [index.ts:228-329](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/schedules/index.ts#L228):

1. `resolveRequestContext` → 401/500;
2. `readJsonBody` → 400 `ERROR_INVALID_BODY`;
3. `parseWeekStartField` → 400 `{ error: ERROR_VALIDATION, fieldErrors: { weekStart } }`;
4. `status` spoza `{"saved","draft"}` → 400 `ERROR_INVALID_BODY`;
5. `resolveBusinessId` → 404 `ERROR_BUSINESS_NOT_FOUND`;
6. `getScheduleByWeek` (scoped `business_id` + `week_start`) → 500 / 404 `ERROR_SCHEDULE_NOT_FOUND`;
7. **gałąź `status === "saved"`** (`:265-314`):
   - `schedule.status !== "draft"` → **409 `ERROR_SAVED_SCHEDULE`**;
   - pobranie godzin otwarcia/dostępności/przypisań (każdy błąd → 500);
   - parsery kształtu z Fazy 1 (`parseScheduleOpeningHours`, `parseScheduleAvailabilities`, `parseScheduleDraftPieces` — błąd → 500 `ERROR_SERVER`);
   - `blockers = findScheduleBlockers(...)` (`:305`);
   - blokady > 0 → **400 `{ error: ERROR_SCHEDULE_INCOMPLETE, blockers: { holes, collisions } }`** (`:306-308`);
   - sukces → `saveSchedule` (`:310`): warunkowy `UPDATE status='saved' WHERE status='draft'`
     [schedule.ts:271-273](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/services/schedule.ts#L271);
     `PGRST116` (przegrany wyścigu) → **409 `ERROR_SAVED_SCHEDULE`**, inny błąd → 500 (`:311-313`);
     sukces → 200 `{ schedule }` (`:314`);
8. **gałąź `status === "draft"`** (odblokowanie, `:317-329`):
   - `schedule.status !== "saved"` → 409 `ERROR_SCHEDULE_NOT_SAVED`;
   - `isFrozenWeek(weekStart)` → **409 `ERROR_WEEK_FROZEN`**;
   - `unlockSchedule` (`UPDATE status='draft' WHERE status='saved'`) → `PGRST116` → 409, sukces → 200.

**Atomowość / współbieżność**: sprawdzenie blokad i zapis to osobne round-tripy (read-then-write).
Ochronę stanu daje warunkowy `UPDATE ... WHERE status='draft'` — wygrywa dokładnie jeden zapis,
przegrany dostaje `PGRST116` → 409. Zaakceptowany wyścig MVP: przypisanie dodane między czytaniem
blokad a zapisem może wejść do zapisanego grafiku (udokumentowane w `save-complete-schedule/plan.md:59`).

POST (generowanie draftu, `:101-181`): walidacja → biznes → `isFrozenWeek` 409 → istniejący draft
`23505` → 409 `ERROR_SCHEDULE_EXISTS` → parsery → `generateDraft` → `createScheduleWithAssignments`
(cleanup osieroconego schedule przy błędzie przypisań, `schedule.ts:160-164`) → 201 `{ schedule, assignments }`.

**Trigger-backstop** `enforce_draft_assignment_writes.sql`: `BEFORE INSERT/UPDATE/DELETE` na
`assignments` odrzuca zapisy, gdy rodzic nie jest `draft`, z `errcode = '23000'` (→ 409). Escapacja
kaskady: gdy rodzica już nie ma, `parent_status` jest NULL → zapis przechodzi.

### 4. Zamrożenie — punkty egzekucji (ryzyko #3)

| # | Miejsce | Warunek | Odpowiedź |
|---|---------|---------|-----------|
| 1 | [index.ts:124-126](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/schedules/index.ts#L124) (POST create) | `isFrozenWeek(weekStart)` | 409 `ERROR_WEEK_FROZEN` |
| 2 | [index.ts:321-323](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/schedules/index.ts#L321) (PATCH unlock → draft) | `isFrozenWeek(weekStart)` | 409 `ERROR_WEEK_FROZEN` |
| 3 | [availabilities/index.ts:113-124](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/availabilities/index.ts#L113) (`resolveWeekGuard`) → POST `:154`, PUT `:224` (obie daty!), DELETE `:293` | `isAvailabilityWeekEditable` | 409 `ERROR_AVAILABILITY_WEEK_FROZEN` |
| 4 | trigger `enforce_availability_week_writes.sql` (backstop, `23000`) | `date_trunc('week', now() at time zone 'Europe/Warsaw')` | 409 (mapowane z `23000`) |

Semantyka zamrożenia:
- `isFrozenWeek(weekStart, reference = currentWeekStart())` → `weekStart <= reference` — **bieżący
  tydzień też jest zamrożony** dla tworzenia/odblokowania grafiku ([week.ts:63-65](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/week.ts#L63)).
- Dostępności: tydzień miniony → zamrożony zawsze; tydzień bieżący → zamrożony tylko, gdy grafik
  tego tygodnia jest `saved` ([availability-guard.ts:15-32](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/services/availability-guard.ts#L15)).
- **Asymetria do przypięcia**: PATCH save (`status:"saved"`) celowo **nie** sprawdza zamrożenia —
  dokończenie draftu w bieżącym tygodniu jest dozwolone (`schedule-archive/reviews/impl-review.md:83`).

**Ukryty zegar (fake timers konieczne w warstwie integracyjnej):** wszystkie produkcyjne wywołania
pomijają wstrzykiwalne argumenty — `isFrozenWeek` bez `reference` (`index.ts:124,321`),
`currentWeekStart()` bez `now` (`availability-guard.ts:13`). Test integracyjny musi ustawić zegar
(`vi.useFakeTimers` + `setSystemTime`) na konkretną chwilę w strefie Europe/Warsaw, a nie polegać
na dacie maszyny. Strefa jest jawna w [week.ts:5,7](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/week.ts#L5)
i w trigerze SQL — test nie potrzebuje zmiany strefy środowiska.

### 5. Własność zasobów i niezalogowane żądania (ryzyko #5)

**Brak ID w URL** — wszystkie identyfikatory przychodzą w ciele JSON. Business jest zawsze
rozwiązywany serwerowo z zalogowanego właściciela (klient nigdy nie wysyła `businessId`).
Łańcuch własności: `user.id` → `getBusinessForOwner` (`.eq("owner_id", ownerId)`) → `business.id` →
wszystkie zapytania dzieci z `.eq("business_id", businessId)`.

| Funkcja | Filtr | Cudzy ID da |
|---------|-------|-------------|
| `getBusinessForOwner` [business.ts:35](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/services/business.ts#L35) | `.eq("owner_id", ownerId)` | `null` → 404 `ERROR_BUSINESS_NOT_FOUND` |
| `getScheduleByWeek` [schedule.ts:40-41](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/services/schedule.ts#L40) | `business_id` + `week_start` | `null` → 404 / GET: `schedule: null` 200 |
| `getAssignmentWithSchedule` [schedule.ts:77-78](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/services/schedule.ts#L77) | `id` + `business_id` | `null` → 404 |
| `getAvailabilityById` [availability.ts:91-92](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/services/availability.ts#L91) | `id` + `business_id` | `null` → 404 |
| `getEmployeeById` [employee.ts:33-34](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/services/employee.ts#L33) | `id` + `business_id` | `null` → 404 |
| zapisy (`update*`/`delete*`/`saveSchedule`/`unlockSchedule`) | `id` + `business_id` (+ `status`) + `.single()` | `PGRST116` → 404 / 409 |
| `updateBusinessName` [business.ts:86](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/services/business.ts#L86) | **tylko** `.eq("id", businessId)` | bezpieczne tylko dzięki id z owner-lookup + RLS |

**Zachowanie per trasa dla cudzego zasobu**: mutacje → 404 `ERROR_*_NOT_FOUND`; GET week bez wiersza →
200 `{ schedule: null, assignments: [], availabilities }` (cichy pusty, nie 404). Wyjątek `GET`
jest kontraktem do przypięcia — nie 403, nie 404, tylko `schedule: null`.

**Niezalogowane żądanie**: `resolveRequestContext` ([api.ts:21-33](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/api.ts#L21))
zwraca `401 { error: ERROR_UNAUTHORIZED }` gdy `locals.user` jest null — na wszystkich trasach
schedules/assignments/availabilities/employees; business/opening-hours mają inline odpowiednik.
Gdy klient Supabase jest null (brak env) → **500 `ERROR_NOT_CONFIGURED`** (test fixture musi
dostarczyć env, inaczej zamiast 401 zobaczy 500). Middleware **nie** przechwytuje `/api/**`
([middleware.ts:4,18](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/middleware.ts#L4)) —
ochrona to konwencja per-trasa; trasy auth są publiczne z założenia (302, nie 401).

**RLS jako realna granica** (publiczny anon key!): wszystkie 6 tabel ma RLS włączone z per-operacyjnymi
politykami; dzieci przez `security definer` `is_business_owner(business_id)`, biznesy przez
`owner_id = auth.uid()` ([domain_rls.sql](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/supabase/migrations/20260912144543_domain_rls.sql)).
Żadna tabela nie jest bez RLS. Filtr `business_id` w kodzie to nie granica bezpieczeństwa —
granicą jest RLS; test izolacji (ryzyko #5) ma sens tylko przeciw realnej bazie.

### 6. Wspólne pomocniki i stabilność odpowiedzi (ryzyko #6)

Wspólny rdzeń: `http.ts` (komunikaty + helpery), `api.ts` (`resolveRequestContext`,
`resolveBusinessId`), `schedule-validation.ts` (parsery kształtu używane przez GET/POST/PATCH
schedules). Test #6 powinien przypinać **kształty odpowiedzi na kilku ścieżkach naraz**:
np. ten sam `{ error }` JSON dla 400/401/404/409 na schedules, assignments, availabilities, employees
i business, oraz te same stałe komunikatów — tak, by zmiana `http.ts` nie mogła cicho rozjechać
jednej trasy. Surowy dowód, że to nie jest teoretyczne: istniejące duplikaty (sekcja 2 wyżej) już
rozjechały się w auth (`signup.ts` angielski vs `signin.ts` polski).

### 7. Infrastruktura testów integracyjnych — stan i złącza

**Stan dziś:** Vitest 4.1.11 w środowisku `node` ([vitest.config.ts:11](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/vitest.config.ts#L11)),
glob `src/**/*.test.ts`, alias `@` → `./src`. **`@cloudflare/vitest-pool-workers` NIE jest
zainstalowany** (0 trafień w package.json i package-lock.json). `miniflare` i `workerd` istnieją
tylko transytywnie przez wrangler 4.90.

**wrangler.jsonc**: `main: @astrojs/cloudflare/entrypoints/server`, `compatibility_date 2026-05-08`,
`nodejs_compat`, `assets` (katalog `./dist`!), KV `SESSION`, brak bloków `env`/`vars`.
**astro.config.mjs**: `output: "server"`, adapter cloudflare, `env.schema` z `SUPABASE_URL`/`SUPABASE_KEY`
(`context: server`, `access: secret`, `optional: true`). `.dev.vars` wskazuje lokalny Supabase
`http://127.0.0.1:54321`.

**Seam A (tani, dziś):** bezpośrednie wywołanie handlerów z atrapą `APIContext` (realny `Request`,
`locals: { user: { id } | null }`, `cookies` z `set`, `url`, `redirect`). Jedyna blokada: wartość
`astro:env/server` w `supabase.ts:3` — alias Vite do stuba zwracającego `SUPABASE_URL`/`SUPABASE_KEY`
z env testu. Serwisowa warstwa przyjmuje klienta jako parametr → można wstrzyknąć realny klient
Supabase (lokalny) albo mock. Dowodzi kontraktów #1/#5/#6 na poziomie handlerów; **nie** ćwiczy
middleware, routingu Astro, ciasteczek SSR ani workerd.

**Seam B (pełny, §4 planu):** `defineWorkersConfig` + `@cloudflare/vitest-pool-workers`; testy przez
`SELF.fetch()`/`env` z `cloudflare:test`; wymaga zbudowanego `dist/` (adapter oczekuje assets),
bindings `SUPABASE_URL`/`SUPABASE_KEY` (+ opcjonalnie `SESSION` KV), osobnego configu i globu.
Ćwiczy middleware + `astro:env` + ciasteczka + workerd. Ryzyka: kompatybilność wersji
pool-workers ↔ vitest 4.1.11 ↔ wrangler 4.90 do zweryfikowania; outbound fetch workerd →
`127.0.0.1` (host Windows) do zweryfikowania empirycznie; CI potrzebuje kroku build + secrets
na kroku testów.

**Backend testowy**: realny lokalny Supabase (WSL `supabase start`) jest jedyną drogą do sygnału
izolacji RLS (ryzyko #5) i triggerów (backstop #1/#3); mock traci te gwarancje. AGENTS.md:
Supabase CLI tylko z WSL, `npm test` z PowerShell — uruchamianie integracji może wymagać hybrydy.

### 8. Mapowanie kodów błędów DB → HTTP (do przypięcia w testach)

| Kod DB | Znaczenie | Mapowanie |
|--------|-----------|-----------|
| `23000` | zamrożona dostępność / zapis na saved schedule (triggery) | → 409 (`ERROR_AVAILABILITY_WEEK_FROZEN` / `ERROR_SAVED_SCHEDULE`) |
| `23P01` | naruszenie exclusion constraint dostępności (nakładka) | → 409 `ERROR_OVERLAPPING_AVAILABILITY` |
| `23505` | unikalność (biznes, pracownik, draft tygodnia) | → 409 (`ERROR_DUPLICATE_BUSINESS` / `ERROR_DUPLICATE_EMPLOYEE` / `ERROR_SCHEDULE_EXISTS`) |
| `PGRST116` | `.single()` bez wiersza | → 404 (zasób) / 409 (wyścig statusu: save/unlock) |
| nieznany | wszystko inne | → 500 `ERROR_SERVER` |

## Code References

- [src/pages/api/schedules/index.ts:228-329](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/schedules/index.ts#L228-329) — PATCH save/unlock: pełna sekwencja bramki zapisu i zamrożenia
- [src/pages/api/schedules/index.ts:124-126](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/schedules/index.ts#L124-126) — POST: `isFrozenWeek` 409
- [src/pages/api/schedules/index.ts:305-308](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/schedules/index.ts#L305-308) — blokady → 400 `{ error: ERROR_SCHEDULE_INCOMPLETE, blockers }`
- [src/lib/services/schedule.ts:268-275](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/services/schedule.ts#L268-275) — warunkowy `UPDATE status='saved' WHERE status='draft'` (atomowość statusu)
- [src/lib/http.ts:1-25](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/http.ts#L1-25) — 22 stałe `ERROR_*` (dokładne komunikaty)
- [src/lib/api.ts:21-33](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/api.ts#L21-33) — `resolveRequestContext`: 401 / 500
- [src/lib/services/availability-guard.ts:7-33](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/services/availability-guard.ts#L7-33) — `isAvailabilityWeekEditable` (ukryty zegar, Europe/Warsaw)
- [src/lib/week.ts:55-65](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/week.ts#L55-65) — wstrzykiwalne wejście zegara; `isFrozenWeek` z `<=` (bieżący tydzień zamrożony)
- [src/middleware.ts:4,18](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/middleware.ts#L4) — `PROTECTED_ROUTES` obejmuje tylko strony, nie `/api/**`
- [supabase/migrations/20260913203855_enforce_draft_assignment_writes.sql](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/supabase/migrations/20260913203855_enforce_draft_assignment_writes.sql) — trigger `23000` dla zapisów na saved schedule
- [supabase/migrations/20260913212151_enforce_availability_week_writes.sql:12](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/supabase/migrations/20260913212151_enforce_availability_week_writes.sql#L12) — trigger zamrożenia dostępności (`now() at time zone 'Europe/Warsaw'`)
- [supabase/migrations/20260913040000_no_overlap_availabilities.sql:14-20](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/supabase/migrations/20260913040000_no_overlap_availabilities.sql#L14-20) — exclusion constraint `23P01` (nakładka dostępności)
- [supabase/migrations/20260912144543_domain_rls.sql](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/supabase/migrations/20260912144543_domain_rls.sql) — RLS na 6 tabelach, `is_business_owner`
- [src/lib/services/schedule-validation.ts](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/lib/services/schedule-validation.ts) — parsery kształtu (Faza 1), używane w GET/POST/PATCH schedules
- [vitest.config.ts:6-12](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/vitest.config.ts#L6-12) — alias, env node, glob `src/**/*.test.ts`
- [wrangler.jsonc:4-20](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/wrangler.jsonc#L4-20) — main adapter, `nodejs_compat`, assets `./dist`, KV `SESSION`
- [src/pages/api/auth/signup.ts:11](https://github.com/GWladowska/JanuszexGrafikPro/blob/f69093f/src/pages/api/auth/signup.ts#L11) — angielski komunikat (dowód dryfu #6)

## Architecture Insights

1. **Jednolity kształt handlerów = testowalność.** Każda trasa to czysta funkcja `(APIContext) => Response`
   bez `platform`/`session`; serwis przyjmuje klienta Supabase jako parametr. To jest ta sama
   świadoma czystość, którą Faza 1 znalazła w logice domenowej — granica API też jest „gotowa do testów".
2. **Własność to łańcuch + RLS, nie pojedyncza bramka.** Kod filtruje `business_id` (nie `user.id`),
   a realną granicą jest RLS (klucz anon jest publiczny). Test #5 musi patrzeć na odpowiedzi handlera
   (404/401), ale jego sygnał izolacji daje dopiero realna baza z dwoma właścicielami.
3. **Dwie niezależne implementacje zamrożenia (TS + SQL) i trzecia w UI.** Testy integracyjne pinują
   warstwę TS (409 z komunikatem); trigger SQL jest backstopem TOCTOU, testowalnym tylko przez realną
   bazę (Faza 3, pgTAP).
4. **404-nie-403 dla cudzych zasobów** to świadoma konwencja (nie zdradzamy istnienia zasobu).
   Test #5 nie powinien oczekiwać 403.
5. **Bramka zapisu jest dwuwarstwowa**: soft (obliczone blokady, 400) + hard (warunkowy UPDATE + trigger,
   409). Test #1 pinuje obie: niekompletny zapis → 400 z `blockers`; zapis już-zapisany/konkurencyjny → 409.
6. **Dryf kopii już istnieje** — ryzyko #6 nie jest hipotetyczne: `employees/index.ts` i `auth/*`
   trzymają własne kopie helperów/komunikatów. Testy przypinają kształty; naprawa dryfu to osobna zmiana.
7. **Middleware nie chroni API** — ochrona per-trasa jest konwencją. Test #5 (niezalogowany → 401,
   brak mutacji) jest tym samym testem na tę konwencję.

## Historical Context (from prior changes)

- `context/archive/2026-09-14-testing-core-logic/research.md:225-233` — pełny inwentarz czystej logiki;
  ukryty zegar w `index.ts:107,277` i `availability-guard.ts:13`; `assignments.ts` bez bramki daty
  (tylko status `draft`).
- `context/archive/2026-09-13-save-complete-schedule/plan.md:150,164-169` — `ERROR_SCHEDULE_INCOMPLETE`
  i kształt `{ error, blockers: { holes, collisions } }`; `plan.md:34,56` — warunkowy UPDATE jako
  guard TOCTOU, `PGRST116` → 409; `plan.md:59` — zaakceptowany wyścig read-then-write;
  `reviews/impl-review.md:37-54` — trigger `23000` → 409.
- `context/archive/2026-09-13-schedule-editing-collisions/plan.md:36` — nakładka dwóch różnych osób
  **nie** jest kolizją; `plan.md:142` — `ERROR_OUTSIDE_OPENING_HOURS`, `ERROR_WORK_DATE_OUT_OF_WEEK`;
  `plan.md:26` — 404/409 dla assignment poza `draft`.
- `context/archive/2026-09-13-availability-management/plan.md:54` — nakładka `aStart < bEnd && bStart < aEnd`,
  stykanie dozwolone; `reviews/impl-review.md:27-39` — constraint `23P01` → 409.
- `context/archive/2026-09-12-domain-schema-rls/plan.md:127-148` — polityki RLS per tabela, pomocnik
  `is_business_owner`, ręczny `supabase/tests/rls_isolation.sql`; `plan-brief.md:60-61` — „zielone CI
  nie sprawdza SQL" (uzasadnienie Fazy 3).
- `context/archive/2026-09-13-schedule-draft-generation/reviews/impl-review.md:27-35` — `getAssignments`
  pierwotnie **bez** `business_id`; fix przez dodanie scoping.
- `context/archive/2026-09-13-schedule-archive/plan.md:337-352` — kontrakt `isAvailabilityWeekEditable`
  i `resolveWeekGuard` (obecny tydzień edytowalny do zapisu grafiku); `reviews/impl-review.md:83` —
  PATCH save bez bramki zamrożenia (świadoma decyzja Q2).
- `context/foundation/lessons.md:5-13` — reguła: nowy endpoint używa helperów ze `src/lib/http.ts`,
  nie kopiuje ich (bezpośrednie uzasadnienie ryzyka #6).

## Related Research

- `context/archive/2026-09-14-testing-core-logic/research.md` — research Fazy 1 (runner + czysta
  logika); klasa import-safety serwisów (klient Supabase jako `import type`) jest fundamentem
  złącza A dla Fazy 2.
- `context/archive/2026-09-14-testing-core-logic/plan.md` — jak Faza 1 rozwiązała alias, glob,
  skrypty i CI; wzorzec do rozszerzenia o warstwę integracyjną.
- `context/foundation/test-plan.md` — §3 Phase 2 (ta zmiana), §4 stack (`@cloudflare/vitest-pool-workers`),
  §6.4 cookbook (TBD — do wypełnienia po wdrożeniu).

## Open Questions

1. **Złącze: Seam A vs Seam B dla planu.** §4 planu testów nazywa `@cloudflare/vitest-pool-workers`,
   ale Seam A (bezpośrednie wywołanie handlerów + alias `astro:env/server` + realny lokalny Supabase)
   dowodzi kontraktów #1/#5/#6 taniej i bez nowej zależności. Czy plan zakłada Seam A, Seam B,
   czy hybrydę (Seam A jako podstawa + wąski Seam B tylko dla ścieżek zależnych od middleware/ciasteczek)?
   To decyzja `/10x-plan` — research dostarcza fakty dla obu.
2. **Backend: realny lokalny Supabase vs mock klienta.** Realny daje sygnał RLS/triggerów (sedno #5
   i backstopu #1/#3), ale: (a) workerd → `127.0.0.1` z hosta Windows do zweryfikowania empirycznie,
   (b) CI wymaga kroku build + secrets na kroku testów (i ewentualnie serwisu Supabase w Dockerze),
   (c) `npm test` z PowerShell vs `supabase start` z WSL (AGENTS.md) — hybryda uruchamiania.
3. **GET week bez wiersza zwraca `200 { schedule: null }`** — czy to kontrakt do przypięcia (cichy
   pusty dla obcego/nieistniejącego tygodnia), czy plan ma oczekiwać 404? Research stwierdza stan:
   200 z `schedule: null`.
4. **Czy testy #6 mają obejmować trasy auth (`signin`/`signup`)** — tam dryf jest największy
   (angielski komunikat w `signup.ts`), ale trasy są publiczne i poza resztą kontraktów; decyzja,
   czy pinujemy ich komunikat jako dowód dryfu, czy zostawiamy poza zakresem.
5. **Weryfikacja wersji `@cloudflare/vitest-pool-workers`** — wspierany zakres wobec vitest 4.1.11
   i wrangler 4.90 musi być potwierdzony przed wyborem Seam B (test-plan §4: `checked: 2026-09-14`).
6. **Fake timery w środowisku workers pool** — `vi.useFakeTimers`/`setSystemTime` w Seam B (workerd)
   do potwierdzenia empirycznie; w Seam A (Node) działa standardowo.
7. **Własność `updateBusinessName`** (`business.ts:86`, jedyne zapytanie bez filtra `business_id`)
   — czy test #5 pinuje je przez 404 na PUT /api/business z cudzym kontekstem (backstop: RLS), czy
   zostawiamy wyłącznie pod Fazę 3 (pgTAP)?
