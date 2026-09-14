---
change_id: agent-per-edit-hooks
title: Per-edit hooki jakości w pętli agenta (Kilo): lint po edycji, typecheck w pre-commit
status: archived
created: 2026-09-14
updated: 2026-09-14
archived_at: 2026-09-14T12:46:33Z
---

## Notes

Zadanie kursowe: skonfigurować per-edit hook, który po każdej edycji pliku przez agenta uruchamia linter, oraz drugi hook z typecheckiem. Ustalenia z zakresu researchu:

- Narzędzie: **Kilo natywnie** (repo nie używa Claude Code / Cursor / Codex / Copilot) — mechanizm to plugin z hookiem `tool.execute.after`.
- Podział warstw: **per-edit** = najszybsza warstwa, jedyna która daje agentowi feedback w trakcie pracy (formatowanie, proste błędy typów, padające testy jednostkowe). **Pre-commit** = siatka na to, co prześlizgnęło się przez per-edit: ręczne edycje bez agenta, pliki zmienione poza hookiem, sprawdzenia zbyt wolne na per-edit; operuje na staged files.
- Wynik researchu: research + szkic planu.
