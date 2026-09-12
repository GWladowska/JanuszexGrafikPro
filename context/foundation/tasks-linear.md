---
project: JanuszexGrafikPro
created: 2026-09-12
updated: 2026-09-12
source: context/foundation/roadmap.md (v1) + context/foundation/tasks-github.md
system: Linear
team: JanuszexGrafikPro
workspace: januszexgrafikpro
access: Linear MCP
---

# Task management: Linear

Podsumowanie przeniesienia roadmapy (`context/foundation/roadmap.md`) do Linear oraz konwencji pracy na zgłoszeniach. Mirror dokumentu `tasks-github.md` — ten sam zakres roadmapy, inny system. Dokument żywy — edit-in-place (patrz `README.md` w tym katalogu).

## System

- **Narzędzie:** Linear, team `JanuszexGrafikPro`, workspace `januszexgrafikpro`. Bez projektów i milestone'ów — dla liniowego MVP (`main_goal=speed`) wystarczą etykiety + natywne relacje `blocked by`.
- **Dostęp:** Linear MCP (`linear_*` tools), konto `Gabriela Władowska`.
- **Etykiety:**

  | Etykieta | Kolor | ID | Znaczenie |
  |---|---|---|---|
  | `roadmap` | `#5319e7` | `c834aed7-18f7-4895-b634-4dfaa7a5d132` | każdy element roadmapy (wszystkie 8 zgłoszeń) |
  | `foundation` | `#1d76db` | `6f434abd-0ecb-4e83-b61f-cab923d182d7` | fundament (F-NN) |
  | `slice` | `#0e8a16` | `051272b5-933b-4c5a-ab1e-29eecf48c31b` | pionowy przekrój (S-NN) |

- **Workflow (stany):**

  | Stan | ID | Znaczenie |
  |---|---|---|
  | `Backlog` | `09f9461f-1fb5-4707-801e-0ee8fe2cc4ca` | element roadmapy `proposed` (zaplanowany, niegotowy) |
  | `Todo` | `86504391-f955-4075-a165-95dd03ed60b2` | element roadmapy `ready` (gotowy do `/10x-plan`) |
  | `In Progress` | `1bbfe4a2-7e35-4995-9f94-e02d1bf0c47e` | w realizacji |
  | `Done` | `8bb41311-4fd3-48d8-8bb4-8294cf8e2beb` | ukończony (`roadmap.md` → `done`, dopisuje `/10x-archive`) |
  | `Canceled` / `Duplicate` | — | porzucony / duplikat |

- **ID teamu:** `0922baa8-5321-4510-b32e-3d7846a704e1`.
- **Statusy:** Linear ma natywne stany workflow (tabela wyżej) — `Backlog`/`Todo`/`In Progress`/`Done` mapują się 1:1 na `Status` w `roadmap.md` (`proposed`/`ready`/`—`/`done`). Źródłem prawdy pozostaje `roadmap.md`; stan Linear to jego odzwierciedlenie.
- **Zależności:** wyrażone jako **natywne relacje `blocked by`** (i lustrzane `blocks`) — Linear wymusza je na tablicy, inaczej niż GitHub CLI bez Projects. W treści zgłoszenia dodatkowo powtórzone linijką `Blocked by: JAN-N (S-NN)` dla czytelności.
- **Poza zakresem v1:** Linear Projects, milestones, cycles (analogicznie do decyzji „bez GitHub Projects" w `tasks-github.md`).

## Mapa issue ↔ roadmap

| Roadmap ID | Change ID | Linear | GitHub | Tytuł | Etykiety | Blocked by |
|---|---|---|---|---|---|---|
| F-01 | `domain-schema-rls` | [JAN-5](https://linear.app/januszexgrafikpro/issue/JAN-5) | #4 | Schemat domeny + RLS | `roadmap`, `foundation` | — |
| S-01 | `business-opening-hours` | [JAN-6](https://linear.app/januszexgrafikpro/issue/JAN-6) | #5 | Ustawienie biznesu i godzin otwarcia | `roadmap`, `slice` | JAN-5 |
| S-02 | `employee-management` | [JAN-7](https://linear.app/januszexgrafikpro/issue/JAN-7) | #6 | Zarządzanie pracownikami biznesu | `roadmap`, `slice` | JAN-6 |
| S-03 | `availability-management` | [JAN-8](https://linear.app/januszexgrafikpro/issue/JAN-8) | #7 | Dostępności pracowników (CRUD ręczne) | `roadmap`, `slice` | JAN-7 |
| S-04 | `schedule-draft-generation` | [JAN-9](https://linear.app/januszexgrafikpro/issue/JAN-9) | #8 | Generowanie draftu grafiku i widok dziur | `roadmap`, `slice` | JAN-8 |
| S-05 | `schedule-editing-collisions` | [JAN-10](https://linear.app/januszexgrafikpro/issue/JAN-10) | #9 | Edycja draftu z ostrzeżeniami o kolizjach | `roadmap`, `slice` | JAN-9 |
| S-06 | `save-complete-schedule` | [JAN-11](https://linear.app/januszexgrafikpro/issue/JAN-11) | #10 | Zapis kompletnego grafiku (walidacja dziur) | `roadmap`, `slice` | JAN-10 |
| S-07 | `schedule-text-export` | [JAN-12](https://linear.app/januszexgrafikpro/issue/JAN-12) | #11 | Kopiowanie tekstowego widoku grafiku | `roadmap`, `slice` | JAN-11 |

> Zgłoszenia powstały w kolejności zależności, więc numeracja JAN-5…JAN-12 pokrywa się z kolejnością dostarczania i z numeracją GitHub #4–#11. F-01 nie ma poprzednika i odblokowuje całą resztę (`Unlocks: S-01…S-07`).

## Łańcuch zależności

Liniowy — każdy `S-NN` ma dokładnie jednego poprzednika, brak pracy równoległej w v1:

```text
JAN-5 F-01 (foundation)
└─ JAN-6 S-01 → JAN-7 S-02 → JAN-8 S-03 → JAN-9 S-04 → JAN-10 S-05 → JAN-11 S-06 → JAN-12 S-07
```

Zasady:

- Start `S-NN` dopiero po zamknięciu poprzednika; relacja `blocked by` w Linear wskazuje konkretne zgłoszenie.
- Zmiana kolejności = edycja `roadmap.md` (At a glance + sekcja) **oraz** relacji w Linear (`linear_save_issue` z `blockedBy`), żeby oba źródła zostały spójne.
- `/10x-plan <change-id>` uruchamia planowanie pojedynczego elementu; F-01 jest w stanie `Todo` (`ready`), resztę odblokowuje się po zamknięciu poprzednika.

## Konwencja statusów

| Etap | Linear | `roadmap.md` — `Status` |
|---|---|---|
| Zaplanowany, niegotowy | `Backlog`, bez assignee | `proposed` |
| Gotowy do `/10x-plan` | `Todo`, bez assignee | `ready` |
| W realizacji | `In Progress`, assignee = autor zmiany | `proposed`/`ready` |
| Ukończony | `Done` | `done` (dopisuje `/10x-archive`) |

## Synchronizacja z GitHub

Linear to **drugie** źródło tego samego zakresu — GitHub Issues (`tasks-github.md`) zostaje jako prymarny mirror. Nie ma automatycznej synchronizacji; po zmianie roadmapy zaktualizuj oba systemy ręcznie. Mapowanie numerów trzymaj w tabeli „Mapa issue ↔ roadmap" (GitHub #N ↔ Linear JAN-M).

## Przepisy Linear MCP

Wszystkie wywołania przez narzędzia `linear_*`; `team: "JanuszexGrafikPro"` można pominąć tylko tam, gdzie ID zgłoszenia jest jednoznaczne.

### 1. Odczyt

```text
linear_list_issues(team: "JanuszexGrafikPro", label: "roadmap")
linear_get_issue(id: "JAN-5")
```

### 2. Odczyt maszynowy (skrypty / podsumowanie)

```text
linear_list_issues(team: "JanuszexGrafikPro", label: "roadmap",
                   fields: ["id", "title", "status", "labels", "assignee", "blockedBy"])
```

### 3. Wzięcie zadania na siebie (start pracy)

```text
linear_save_issue(id: "JAN-6", assignee: "me")
```

### 4. Przejście w „w toku"

```text
linear_save_issue(id: "JAN-6", state: "In Progress")
```

Zamiast opt-in etykiety `in-progress` z GitHuba używamy natywnego stanu workflow — jest jednoznaczny i nie wymaga tworzenia etykiety.

### 5. Zamknięcie po ukończeniu

```text
linear_save_issue(id: "JAN-5", state: "Done")
linear_save_comment(issueId: "JAN-5", body: "Zrealizowane — schemat domeny + RLS.")
```

Po zamknięciu: zaktualizuj `Status` w `roadmap.md` (albo pozostaw to `/10x-archive`, który przy archiwizacji zmiany ustawi `done`).

### 6. Ponowne otwarcie

```text
linear_save_issue(id: "JAN-5", state: "Todo")
```

### 7. Auto-zamknięcie przez PR

W opisie PR (lub commicie merge) dodaj `Closes #4` (GitHub). Linear podłącza PR-y przez integrację GitHuba i sam przejdzie zgłoszenie do `Done`, gdy branch/PR zawiera klucz `JAN-5` — nie duplikuj ręcznego zamykania.

### 8. Komentarz / notatka postępu

```text
linear_save_comment(issueId: "JAN-6",
  body: "Decyzja: kolizja = ostrzeżenie (PRD Open Q #1).")
```

### 9. Edycja treści (np. po zmianie zależności)

```text
linear_save_issue(id: "JAN-7", description: "<nowa treść>")
```

### 10. Zbiorczy przegląd stanu

```text
linear_list_issues(team: "JanuszexGrafikPro", label: "roadmap",
                   fields: ["id", "title", "status"])
```

### 11. Natywne zależności

Linear obsługuje `blocked by` / `blocks` natywnie — to różnica względem GitHub CLI bez Projects. Ustawienie / korekta:

```text
linear_save_issue(id: "JAN-8", blockedBy: ["JAN-7"])
```

Relacje są append-only przy dodawaniu; usunięcie wymaga `removeBlockedBy`:

```text
linear_save_issue(id: "JAN-8", removeBlockedBy: ["JAN-7"])
```

## Dodawanie nowego elementu

1. Dopisz wiersz w `roadmap.md` (At a glance + sekcja + Backlog Handoff).
2. Utwórz zgłoszenie (`linear_save_issue`) w teamie `JanuszexGrafikPro` z etykietami `roadmap` + `foundation`/`slice`; tytuł z prefiksem `F-NN:`/`S-NN:`.
3. Ustaw zależność `blockedBy` numerem poprzednika i dopisz wiersz do tabeli „Mapa issue ↔ roadmap" w tym dokumencie.
4. Lustrzanie utwórz zgłoszenie w GitHub Issues (`tasks-github.md`) i utrzymuj mapowanie numerów.
5. Zaktualizuj `Ready for /10x-plan` w roadmapie, gdy element staje się wykonalny — i przesuń stan Linear `Backlog` → `Todo`.
