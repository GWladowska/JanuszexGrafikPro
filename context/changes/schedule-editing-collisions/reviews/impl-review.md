<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Ręczna edycja draftu grafiku z ostrzeżeniami o kolizjach (S-05)

- **Plan**: context/changes/schedule-editing-collisions/plan.md
- **Scope**: Phase 1-3 of 3 + Addendum (pełny przegląd)
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (34/35 MATCH; 2 kosmetyczne dryfy) |
| Scope Discipline | WARNING (benign extras: resolveJsonBody, addendum items udokumentowane) |
| Safety & Quality | WARNING (F1) |
| Architecture | PASS (wspólne helpery w src/lib/api.ts, ServiceResult zachowany) |
| Pattern Consistency | WARNING (F2) |
| Success Criteria | PASS (4 bramki czyste; E2E A-H potwierdzone przez użytkownika z re-weryfikacją) |

## Findings

### F1 — Nieatomowa aktualizacja w PUT (osoba + czasy)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/schedules/assignments.ts:221-249
- **Detail**: Przy jednoczesnym przekazaniu employeeId i czasów handler wykonuje dwa sekwencyjne UPDATE (osoba, potem czasy). Jeśli drugi padnie, zmiana osoby jest już zapisana, klient dostaje 500 — stan serwera i UI się rozjeżdżają (po odświeżeniu osoba „po cichu" zamieniona). Islanda nigdy nie wysyła obu pól naraz (ScheduleBoard wysyła albo/osą), więc dotyczy tylko bezpośredniego użycia API.
- **Fix**: Gdy oba pola obecne — pojedynczy update `{ employee_id, start_time, end_time }` zamiast dwóch wywołań serwisu.
  - Strength: Jedno zapytanie, atomowość, mniej kodu (usuwa gałąź podwójnego update).
  - Tradeoff: Niewielkie — jeden call-site.
  - Confidence: HIGH — serwis i tak robi pojedynczy `.update()`.
  - Blind spot: Brak istotnych.
- **Decision**: FIXED (Fix now — updateAssignmentFields; usunięte wąskie funkcje serwisowe)

### F2 — Wszystkie ServerError w jednym stosie na dole strony

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/components/schedules/ScheduleBoard.tsx:925-930
- **Detail**: Sześć błędów API (generate/delete/swap/edit/add/remove) renderuje się w jednym miejscu na końcu strony, daleko od wiersza, którego dotyczą — błąd zamiany pojawia się odłączony od zmiany. Siostrzany wzorzec (AvailabilityManager) umieszcza błędy edycji/dodawania wewnątrz formularzy.
- **Fix A ⭐ Recommended**: Przenieść swapApi/editApi/addApi/removeApi do miejsc akcji (wiersz/formularz), navApi zostaje na górze
  - Strength: Spójność z wzorcem AvailabilityManager; komunikat widoczny przy klikniętym wierszu.
  - Tradeoff: Więcej miejsc renderowania błędów.
  - Confidence: HIGH — wzorzec istnieje w siostrzanym komponencie.
  - Blind spot: Wymaga krótkiej weryfikacji wizualnej.
- **Fix B**: Zostawić stos, udokumentować odstępstwo
  - Strength: Zero pracy.
  - Tradeoff: UX — błąd daleko od kontekstu akcji.
  - Confidence: LOW — odstępstwo od siostrzanego wzorca.
  - Blind spot: —
- **Decision**: FIXED (Fix A — inline przy wierszu/formularzach; generate/delete zostają w sekcji akcji)

### F3 — Egzekwowanie dostępności po stronie serwera celowo zdegradowane + guard draftu TOCTOU

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/api/schedules/assignments.ts:198-206, 194-196
- **Detail**: Stary PUT odrzucał niedostępną osobę 409; nowy przyjmuje (tryb ostrzeżeń — decyzja PRD Open Q #1). Guard draftu (status !== „draft") jest TOCTOU — osobne zapytanie przed mutacją. Obie rzeczy są świadome (warning mode, single-owner MVP), ale warte potwierdzenia intencji; ewentualnie przyszłościowo: zwracać kolizje w odpowiedzi API dla konsumentów spoza UI.
- **Fix**: Bez akcji — potwierdzić intencję (decyzja produktowa z PRD); notatka do S-06, by finalny zapis rozważył twarde egzekwowanie kolizji.
- **Decision**: FIXED (notatka dopisana do S-06 w roadmapie)

### F4 — Błąd zapytania assignments nie trafia do logu SSR

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/pages/schedules/index.astro:41-47, 56-64
- **Detail**: Plan mówił „loguje, KTÓRE zapytanie padło i z jakim błędem" dla wszystkich pięciu zapytań; assignments loguje tylko boolean assignmentsFailed (obiekt błędu ginie w zasięgu bloku).
- **Fix**: Podnieść assignmentsError do zmiennej i dołączyć do payloadu console.error.
- **Decision**: FIXED (assignmentsError w payloadzie loga SSR)

### F5 — Dryf nazewnictwa stanu islandy vs kontrakt planu

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/schedules/ScheduleBoard.tsx:34-45
- **Detail**: Kontrakt planu nazywał stany editingId / addingFor; implementacja używa editing (id+czasy) i adding (+employeeId). Semantyka identyczna.
- **Fix**: Zostawić kod, odnotować w addendum planu (nazwy są lepsze — dodają employeeId do stanu dodawania).
- **Decision**: FIXED (notatka w addendum planu)

### F6 — Sprzeczność wewnętrzna planu (optgroup vs płaska lista)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/schedule-editing-collisions/plan.md (Faza 3 body vs Addendum)
- **Detail**: Treść fazy 3 wciąż opisuje optgroupy, addendum i decyzja użytkownika nakazują płaską listę (tak jest w kodzie). Przyszły czytelnik planu może się pomylić.
- **Fix**: Dopisać w addendum jednozdanie „Faza 3 pkt 1 (select): optgroupy zastąpione płaską listą — patrz Addendum".
- **Decision**: FIXED (dopisane w addendum planu)

### F7 — Zero-długości zmiana przez API dostaje mylący komunikat

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/schedules/assignments.ts:102-106 (isWithinOpeningHours: schedule-generation.ts:313-315)
- **Detail**: Zmiana 10:00–10:00 w godzinach otwarcia zwraca 400 ERROR_OUTSIDE_OPENING_HOURS (powód: start >= end), co jest nietrafne. UI nieoświecone (klient waliduje wcześniej z precyzyjnym komunikatem); dotyczy tylko bezpośrednich wywołań API.
- **Fix**: W endpointach przed sprawdzeniem okna dodać osobny komunikat dla start >= end (np. stała ERROR_INVALID_TIME_RANGE).
- **Decision**: FIXED (ERROR_INVALID_TIME_RANGE w http.ts; sprawdzenie w POST i PUT przed oknem otwarcia)

### F8 — Martwy kod i ciche no-op przy nietypowych odpowiedziach 200

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/schedules/assignments.ts:251; src/components/schedules/ScheduleBoard.tsx:335-342, 380-384, 215-220
- **Detail**: Niewykonalny fallback 500 w PUT; w islandzie nieprawidłowe ciało 200 (extractAssignment → null) zamyka formularz edycji/dodawania bez komunikatu (wiersz ze starymi danymi); goToWeek wycofuje tydzień po złym ciele 200 bez komunikatu. Niski wpływ — odpowiedzi pochodzą z typowanych handlerów tego repo.
- **Fix**: Zostawić (obronne returny są tanie); ewentualnie ujednolicić w przyszłym sprzątaniu.
- **Decision**: SKIPPED (fallback 500 już usunięty z F1; ciche no-op zaakceptowane — typowane handlery repo)
