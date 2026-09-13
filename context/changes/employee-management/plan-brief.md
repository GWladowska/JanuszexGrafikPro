# Zarządzanie pracownikami biznesu (S-02) — Plan Brief

> Full plan: `context/changes/employee-management/plan.md`

## What & Why

Właściciel kawiarni musi mieć w systemie listę pracowników — to dane wejściowe dla dostępności (S-03) i grafiku (S-04+). PRD wymaga formalnie tylko „dodania pracownika" (FR-005), ale roadmapa nazwała S-02 „prostym CRUD-em" i użytkownik potwierdził pełen zakres: dodawanie, lista, edycja, usuwanie.

## Starting Point

Fundament danych istnieje od F-01: tabela `employees` (nazwa + opcjonalny e-mail kontaktowy) z pełnymi politykami RLS izolującymi dane per właściciel. S-01 dostarczył gotowy pionowy wzorzec (serwis → endpointy JSON → strona + islanda) oraz lekcję „helpery endpointów w `src/lib/http.ts`". Kodu domenowego pracowników nie ma żadnego.

## Desired End State

Zalogowany właścicz z biznesem wchodzi z dashboardu na `/employees`, gdzie dodaje pracowników (imię i nazwisko + wymagany e-mail), widzi listę, edytuje wiersze inline i usuwa z potwierdzeniem ostrzegającym o kaskadzie. Przy próbie dodania pary nazwa + e-mail identycznej z istniejącą system pyta „czy to na pewno inna osoba". Każde konto widzi wyłącznie swoich pracowników.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Zakres zmiany | Pełny CRUD (dodaj/lista/edytuj/usuń) | FR-005 wymaga tylko dodania, ale roadmapa nazwała S-02 CRUD-em; decyzja użytkownika | Plan (user) |
| Duplikaty | Dozwolone; ostrzeżenie tylko przy identycznej nazwie **i** e-mailu | Ostrzega przy realnie podejrzanej zbieżności, bez fałszywych alarmów (dwóch Marków z różnymi mailami przechodzi) | Plan (user) |
| E-mail kontaktowy | Wymagany w formularzu | Kolumna istnieje; przydaje się do kontaktu i rozróżniania osób | Plan (user) |
| Lokalizacja UI | Osobna strona `/employees` + link z dashboardu | Miejsce na rozbudowę S-03; zakładki na dashboardzie to wizja docelowa — po MVP | Plan (user) |
| Testy | Bez testera na razie | Deadline 2026-09-14; tester wraca przy S-04 (logika grafiku) | Plan (user) |
| Baza danych | Zero zmian | Tabela i RLS gotowe od F-01 | Roadmap/PRD |

## Scope

**In scope:**
- Serwis + walidacja pracowników (`src/lib/services/employee*.ts`)
- Endpointy `POST/PUT/DELETE /api/employees` (kontrakt duplikatu 409 + `confirmDuplicate`)
- Strona `/employees` (lista, pusty stan, błędy) + islanda `EmployeeManager` (dodawanie, edycja inline, usuwanie dwuetapowe, ostrzeżenie o duplikacie)
- Link „Pracownicy" na dashboardzie, wpis w `PROTECTED_ROUTES`

**Out of scope:**
- Dostępności (S-03), grafik (S-04+), konta pracowników, zakładki na dashboardzie
- Twarda blokada duplikatów, zmiany schematu bazy, automatyczne testy
- Sortowanie/paginacja, dodatkowe pola, import z pliku

## Architecture / Approach

Trzy warstwy 1:1 jak w S-01: serwis (`src/lib/services/employee.ts` + `employee-validation.ts`) jako jedyne miejsce dotykające tabeli → cienkie endpointy JSON (`src/pages/api/employees/index.ts`) → strona SSR `/employees` z islandą React `EmployeeManager` (właściciel stanu listy, mutacje przez fetch, brak przeładowań). Ochrona danych spoczywa na już działającym RLS (`is_business_owner`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Serwis i walidacja | Warstwa domenowa pracowników + wykrywanie duplikatów | Minimalne; wzorzec skopiowany z S-01 |
| 2. Endpointy API | POST/PUT/DELETE z kontraktem duplikatu i 404 z `PGRST116` | Mapowanie `PGRST116` → 404 (nietrywialny detal Postgrest) |
| 3. Strona + nawigacja | `/employees` z pełnym zarządzaniem i wejściem z dashboardu | Pomylenie „błędu DB" z „brakiem pracowników" (error-first z S-01) |

**Prerequisites:** F-01 i S-01 zakończone (są); lokalna baza z seedem do testów (`npx supabase db reset`).
**Estimated effort:** 1 sesja, 3 fazy — najmniejszy slice roadmapy.

## Open Risks & Assumptions

- Kolumna `contact_email` jest nullable w bazie, wymagana dopiero na poziomie aplikacji — stare wiersze bez e-maila (poza seedem, który go ma) wymuszą uzupełnienie przy edycji.
- Porównanie duplikatów w JS (nie SQL) — poprawne przy skali ~5 pracowników; do przeglądu przy większej skali.
- Brak automatycznych testów — walidacja chroniona tylko ręcznym E2E (świadome, deadline).

## Success Criteria (Summary)

- Właściciel dodaje, edytuje i usuwa pracowników na `/employees` bez przeładowań, z polskim interfejsem i potwierdzeniami przy operacjach niebezpiecznych.
- Identyczna para nazwa + e-mail wywołuje ostrzeżenie z możliwością potwierdzenia; inna para przechodzi bez alarmu.
- Dane są izolowane per właściciel (RLS), a gość nie wejdzie na `/employees`.
