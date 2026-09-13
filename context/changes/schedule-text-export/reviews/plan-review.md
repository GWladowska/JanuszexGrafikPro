<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Tekstowy widok grafiku do skopiowania (S-07)

- **Plan**: context/changes/schedule-text-export/plan.md
- **Mode**: Deep
- **Date**: 2026-09-13
- **Verdict**: REVISE
- **Findings**: 0 critical | 2 warnings | 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

6/6 paths ✓ (w tym `schedule-export.ts` jako nowy, poprawnie nieistniejący), 8/8 symboli ✓ (`addDays`/`isoWeekday`/`weekdayShort`/`formatDayLabel`/`formatWeekLabel` w `week.ts`, `toDraftPiece`/`toDraftPieces`/`closeEditingForms`/`isSaved` w `ScheduleBoard.tsx`, `CircleHelp`/`HelpCircle` w lucide-react), brief↔plan ✓. Progress↔Phase spójny mechanicznie (jedno `## Progress`, fazy 1–2, 1.1–1.4 / 2.1–2.4 / 2.5–2.11 dopasowane 1:1, brak checkboxów poza Progress).

## Findings

### F1 — Podgląd może pokazać mieszankę tygodni podczas nawigacji

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — Sekcja kopiowania w islandzie
- **Detail**: Desired End State #3 obiecuje, że w trakcie nawigacji sekcja kopiowania jest nieobecna, ale plan nie gwarantuje tego w kontrakcie. `goToWeek` wywołuje `setWeekStart(nextWeekStart)` PRZED doładowaniem danych (ScheduleBoard.tsx:255 vs :258-276) — przy nawigacji między dwoma zapisanymi tygodniami podgląd przez chwilę złoży NOWY nagłówek tygodnia ze STARYMI zmianami, a przyciski są w tym oknie klikalne.
- **Fix**: Bramkuj całą sekcję na `!navPending` — renderuj tylko, gdy `isSaved && !navPending` (navPending już jest w `actionsPending`, więc to jednolinijkowa zmiana kontraktu).
- **Decision**: FIXED — kontrakt fazy 2: render sekcji tylko przy `isSaved && !navPending`

### F2 — Podpowiedź „?" nieosiągalna na urządzeniach dotykowych

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Ikona „?"
- **Detail**: Plan opiera podpowiedź o natywny `title` (tylko hover). Na Samsungu — dokładnie tam, gdzie formatowanie zawodzi — hover nie istnieje, więc ostrzeżenie jest nieosiągalne dla użytkownika, który go potrzebuje. Repo nie ma żadnego wzorca tooltipa (weryfikacja: tylko `title`, ScheduleBoard.tsx:1037, :1123).
- **Fix A ⭐ Recommended**: Stała, zawsze widoczna linijka-łagodnik pod przyciskami (np. „Pogrubienia mogą nie działać na niektórych urządzeniach — użyj wariantu bez formatowania."), ikona „?" opcjonalna.
  - Strength: Informacja dociera wszędzie, zero interakcji — zamyka problem zgłoszony przez użytkownika na Samsungu.
  - Tradeoff: Stały tekst zajmuje miejsce w sekcji akcji.
  - Confidence: HIGH — najprostsza forma; nie wymaga nowych wzorców.
  - Blind spot: None significant.
- **Fix B**: Ikona „?" z title + tap-to-toggle (klik pokazuje/ukrywa linijkę)
  - Strength: Mniej trwałego bałaganu wizualnego — podpowiedź tylko na żądanie.
  - Tradeoff: Więcej stanu w islandzie; interakcja „kliknij, żeby zobaczyć" nie jest oczywista na telefonie.
  - Confidence: HIGH — stan boolean jest trywialny, ale UX odkrywalności gorszy.
  - Blind spot: Na Samsungu brak wizualnej podpowiedzi, że ikona jest klikalna.
- **Decision**: FIXED — Fix B (tap-to-toggle + generyczny komunikat o formatowaniu)

### F3 — Zapisany grafik może legalnie nie mieć żadnych przypisań

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Kontrakt `buildScheduleDays`
- **Detail**: `createScheduleWithAssignments` przy zerze przypisań zwraca pustą listę (schedule.ts:141-143), a bramka zapisu przepuszcza grafik bez zmian, gdy biznes jest zamknięty cały tydzień (zero dziur). Taki zapisany grafik jest więc legalny, a plan go nie opisuje: eksport wyświetli 7 linii „nieczynne". Zachowanie wyniknie poprawnie z iteracji 7 dni, ale warto to nazwać w kontrakcie.
- **Fix**: Dopisz do kontraktu `buildScheduleDays`: zero przypisań → wszystkie dni nieczynne; ewentualnie rozszerz scenariusz G o tydzień w pełni zamknięty.
- **Decision**: FIXED — kontrakt `buildScheduleDays`: zero przypisań → wszystkie dni nieczynne; scenariusz G rozszerzony o tydzień w pełni zamknięty

### F4 — Umiejscowienie sekcji kopiowania w gałęzi `isSaved` do doprecyzowania

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Kontrakt sekcji kopiowania
- **Detail**: W gałęzi `isSaved` istnieje ternary `{unlockConfirming ? <potwierdzenie> : <przycisk odblokowania>}` (ScheduleBoard.tsx:987-1029). Sekcja dodana wewnątrz któregoś ramienia zniknie na czas otwartego potwierdzenia odblokowania. Plan mówi „w gałęzi isSaved dodać" — bez precyzji, gdzie dokładnie.
- **Fix**: Dopisz: sekcję dodaj jako rodzeństwo po `<ServerError message={unlockApi.serverError} />` (:1030), poza ternary potwierdzenia.
- **Decision**: FIXED — kontrakt fazy 2: sekcja jako rodzeństwo po `<ServerError message={unlockApi.serverError} />` (:1030)
