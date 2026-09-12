---
project: JanuszexGrafikPro
created: 2026-09-12
updated: 2026-09-12
source: context/foundation/roadmap.md (v1)
system: GitHub Issues
repo: GWladowska/JanuszexGrafikPro
cli: gh 2.100.0+ (auth: GWladowska, scope: repo)
---

# Task management: GitHub Issues

Podsumowanie przeniesienia roadmapy (`context/foundation/roadmap.md`) do GitHub Issues oraz konwencji pracy na zgłoszeniach. Dokument żywy — edit-in-place (patrz `README.md` w tym katalogu).

## System

- **Narzędzie:** GitHub Issues w repo `GWladowska/JanuszexGrafikPro`. Bez GitHub Projects i milestone'ów — dla liniowego MVP (`main_goal=speed`) wystarczą etykiety + task listy w treści zgłoszenia.
- **Dostęp:** `gh` CLI, konto `GWladowska`, scope `repo`.
- **Etykiety:**

  | Etykieta | Kolor | Znaczenie |
  |---|---|---|
  | `roadmap` | `#5319e7` | każdy element roadmapy (wszystkie 8 zgłoszeń) |
  | `foundation` | `#1d76db` | fundament (F-NN) |
  | `slice` | `#0e8a16` | pionowy przekrój (S-NN) |

- **Statusy:** GitHub zna tylko `open` / `closed`. Źródłem prawdy o dojrzałości elementu jest pole `Status` w `roadmap.md` (`ready` / `proposed` / `done`) — aktualizowane ręcznie (albo przez `/10x-archive` dla `done`).
- **Zależności:** wyrażone jako task listy `- [ ] Blocked by #N — <tytuł>` w treści zgłoszenia. To konwencja czytelna dla człowieka; GitHub nie liczy z niej automatycznie „gotowe do startu" (pomocniczo można użyć natywnych linked dependencies, patrz recipe 11).

## Mapa issue ↔ roadmap

| Roadmap ID | Change ID | Issue | Tytuł | Etykiety | Blocked by |
|---|---|---|---|---|---|
| F-01 | `domain-schema-rls` | [#4](https://github.com/GWladowska/JanuszexGrafikPro/issues/4) | Schemat domeny + RLS | `roadmap`, `foundation` | — |
| S-01 | `business-opening-hours` | [#5](https://github.com/GWladowska/JanuszexGrafikPro/issues/5) | Ustawienie biznesu i godzin otwarcia | `roadmap`, `slice` | #4 |
| S-02 | `employee-management` | [#6](https://github.com/GWladowska/JanuszexGrafikPro/issues/6) | Zarządzanie pracownikami biznesu | `roadmap`, `slice` | #5 |
| S-03 | `availability-management` | [#7](https://github.com/GWladowska/JanuszexGrafikPro/issues/7) | Dostępności pracowników (CRUD ręczne) | `roadmap`, `slice` | #6 |
| S-04 | `schedule-draft-generation` | [#8](https://github.com/GWladowska/JanuszexGrafikPro/issues/8) | Generowanie draftu grafiku i widok dziur | `roadmap`, `slice` | #7 |
| S-05 | `schedule-editing-collisions` | [#9](https://github.com/GWladowska/JanuszexGrafikPro/issues/9) | Edycja draftu z ostrzeżeniami o kolizjach | `roadmap`, `slice` | #8 |
| S-06 | `save-complete-schedule` | [#10](https://github.com/GWladowska/JanuszexGrafikPro/issues/10) | Zapis kompletnego grafiku (walidacja dziur) | `roadmap`, `slice` | #9 |
| S-07 | `schedule-text-export` | [#11](https://github.com/GWladowska/JanuszexGrafikPro/issues/11) | Kopiowanie tekstowego widoku grafiku | `roadmap`, `slice` | #10 |

> Zgłoszenia powstały w kolejności zależności, więc numeracja #4–#11 pokrywa się z kolejnością dostarczania. F-01 nie ma poprzednika i odblokowuje całą resztę (`Unlocks: S-01…S-07`).

## Łańcuch zależności

Liniowy — każdy `S-NN` ma dokładnie jednego poprzednika, brak pracy równoległej w v1:

```text
#4 F-01 (foundation)
└─ #5 S-01 → #6 S-02 → #7 S-03 → #8 S-04 → #9 S-05 → #10 S-06 → #11 S-07
```

Zasady:

- Start `S-NN` dopiero po zamknięciu poprzednika; `Blocked by` w treści wskazuje konkretne zgłoszenie.
- Zmiana kolejności = edycja `roadmap.md` (At a glance + sekcja) **oraz** treści zgłoszeń (`gh issue edit <n> --body-file …`), żeby oba źródła zostały spójne.
- `/10x-plan <change-id>` uruchamia planowanie pojedynczego elementu; F-01 jest oznaczony jako `ready`, resztę odblokowuje się po zamknięciu poprzednika.

## Konwencja statusów

| Etap | GitHub | `roadmap.md` — `Status` |
|---|---|---|
| Zaplanowany, niegotowy | `open`, bez assignee | `proposed` |
| Gotowy do `/10x-plan` | `open`, bez assignee | `ready` |
| W realizacji | `open`, assignee = autor zmiany (opcjonalnie etykieta `in-progress`) | `proposed`/`ready` |
| Ukończony | `closed` | `done` (dopisuje `/10x-archive`) |

## Przepisy `gh`

Wszystkie komendy z `--repo GWladowska/JanuszexGrafikPro` (można pominąć, gdy cwd to to repo).

### 1. Odczyt

```powershell
gh issue list --repo GWladowska/JanuszexGrafikPro --label roadmap --state open
gh issue view 4 --repo GWladowska/JanuszexGrafikPro
```

### 2. Odczyt maszynowy (skrypty)

```powershell
gh issue list --repo GWladowska/JanuszexGrafikPro --label roadmap --json number,title,labels,assignees
gh issue view 5 --repo GWladowska/JanuszexGrafikPro --json number,title,state,body --jq '"\(.number) [\(.state)] \(.title)"'
```

### 3. Wzięcie zadania na siebie (start pracy)

```powershell
gh issue edit 5 --repo GWladowska/JanuszexGrafikPro --add-assignee "@me"
```

### 4. Opcjonalna etykieta „w toku"

Etykieta `in-progress` nie jest tworzona domyślnie — to opt-in, gdy assignee/PR to za mało:

```powershell
gh label create in-progress --repo GWladowska/JanuszexGrafikPro --color "fbca04" --description "Praca w toku"
gh issue edit 5 --repo GWladowska/JanuszexGrafikPro --add-label in-progress
gh issue edit 5 --repo GWladowska/JanuszexGrafikPro --remove-label in-progress
```

### 5. Zamknięcie po ukończeniu

```powershell
gh issue close 4 --repo GWladowska/JanuszexGrafikPro --comment "Zrealizowane — schemat domeny + RLS."
```

Po zamknięciu: zaktualizuj `Status` w `roadmap.md` (albo pozostaw to `/10x-archive`, który przy archiwizacji zmiany ustawi `done`).

### 6. Ponowne otwarcie

```powershell
gh issue reopen 4 --repo GWladowska/JanuszexGrafikPro
```

### 7. Auto-zamknięcie przez PR

W opisie PR (lub commicie merge) dodaj:

```text
Closes #4
```

Merge PR zamknie zgłoszenie automatycznie; można łańcuchowo: `Closes #4, closes #5`.

### 8. Komentarz / notatka postępu

```powershell
gh issue comment 5 --repo GWladowska/JanuszexGrafikPro --body "Decyzja: kolizja = ostrzeżenie (PRD Open Q #1)."
```

### 9. Edycja treści (np. po zmianie zależności)

```powershell
gh issue edit 6 --repo GWladowska/JanuszexGrafikPro --body-file .\issue-s02.md
```

### 10. Zbiorczy przegląd stanu

```powershell
4..11 | ForEach-Object {
  gh issue view $_ --repo GWladowska/JanuszexGrafikPro --json number,title,state,assignees --jq '"\(.number) [\(.state)] \(.title)"'
}
```

### 11. Natywne linked dependencies (opcjonalnie)

GitHub udostępnia w UI „blocked by / blocking". Z CLI bez Projects jest to ograniczone — jeśli zależności mają być wymuszane przez GitHuba, rozważ GitHub Projects (poza zakresem v1) albo pozostań przy task listach i discipline z sekcji „Łańcuch zależności".

## Dodawanie nowego elementu

1. Dopisz wiersz w `roadmap.md` (At a glance + sekcja + Backlog Handoff).
2. Utwórz zgłoszenie (`gh issue create`) z etykietą `roadmap` + `foundation`/`slice`.
3. Uzupełnij `Blocked by` numerem poprzednika i dopisz wiersz do tabeli w tym dokumencie.
4. Zaktualizuj `Ready for /10x-plan` w roadmapie, gdy element staje się wykonalny.
