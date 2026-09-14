# Per-edit hooki jakości w pętli agenta (Kilo) — Plan Brief

> Full plan: `context/changes/agent-per-edit-hooks/plan.md`
> Research: `context/changes/agent-per-edit-hooks/research.md`

## What & Why

Zadanie: po każdej edycji pliku przez agenta uruchamiać linter i typecheck, przetestować to, a typecheck przenieść do pre-commita, jeśli spowalnia. W tym repo agentem jest Kilo, więc realizacją jest natywny plugin z hookiem `tool.execute.after` — odpowiednikiem Claude'owego `PostToolUse`. Powód: agent nie ma dziś żadnego feedbacku o jakości w trakcie pracy; dowiaduje się o błędzie dopiero przy commicie albo w CI, gdy koszt diagnozy jest największy.

## Starting Point

Pre-commit już istnieje i działa (`.husky/pre-commit` = `npx lint-staged` + `npm run check`), a CI wymusza sześć bramek przez ruleset „Protect". `test-plan.md:95` nazywa wprawdzie bramkę „hook po zapisie pliku / lokalnie (pętla agenta)", ale jej realizacja jest commit-time — per-edit nie istnieje. `.kilo/` nie jest w ogóle śledzone przez git (`*.kilo` w `.gitignore`), więc każdy plik pluginu wymaga decyzji o śledzeniu.

## Desired End State

Agent po każdej edycji widzi w wyniku narzędzia jeden krótki blok `[eslint exit N]` z realnymi błędami lintu dla plików, które właśnie zmienił — bez mutowania plików i bez wyjścia na terminal użytkownika. Drugi hook (typecheck) istnieje, jest domyślnie wyłączony i włącza się przez `KILO_QUALITY_TYPECHECK=tsc|check`. Oba pliki pluginu są w repo; `AGENTS.md` i `test-plan.md` opisują tę warstwę jako feedback, nie bramkę.

## Key Decisions Made

| Decision        | Choice                                                         | Why (1 sentence)                                                                        | Source   |
| --------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| Narzędzie       | Kilo natywnie (plugin, nie plik configu)                       | Repo pracuje pod Kilo; `tool.execute.after` to jedyny mechanizm per-edit                | Research |
| Zakres per-edit | Lint zawsze; typecheck jako drugi hook za flagą, domyślnie off | Dosłownie spełnia „dwa hooki" i klauzulę „jeśli typecheck spowalnia — pre-commit"       | Plan     |
| Wejście ESLint  | `node node_modules/eslint/bin/eslint.js`, nie `npx`            | Oszczędza ~4 s narzutu resolvera i omija ograniczenia argumentów `.cmd`                 | Research |
| Liczba wywołań  | Jedno wywołanie na wszystkie dotknięte pliki (limit 10)        | 5 plików w jednym wywołaniu: 6,2 s vs 29–32 s w pięciu osobnych                         | Plan     |
| Feedback        | Dopisek do `output.output`, nigdy nie blokuje                  | W Kilo blokadą jest `throw`; blokowanie pętli na jednym ostrzeżeniu jest zbyt kosztowne | Plan     |
| `--fix`         | Bez `--fix` (tylko raport)                                     | Hook nie mutuje pliku po zapisie — to, co widzi agent, zgadza się z plikiem             | Plan     |
| Rejestracja     | Auto-discovery `.kilo/plugin/` + env var                       | Zero zmian w `kilo.json`, przełącznik per sesja                                         | Plan     |
| Śledzenie       | Tylko `.kilo/plugin/` (surgical `.gitignore`)                  | Hook odtwarzalny z klona; `kilo.json` (MCP) i `agent-manager.json` zostają lokalne      | Plan     |
| Dokumentacja    | `AGENTS.md` + `test-plan.md` (§5, §6.7, §8) + `lessons.md`     | Wiedza ląduje z kodem; nazewnictwo bramki przestaje mylić warstwy                       | Plan     |
| Kody wyjścia    | Raportowane, nie interpretowane                                | Bramką jest pre-commit/CI; hook tylko informuje                                         | Plan     |

## Scope

**In scope:** dwa pliki pluginu w `.kilo/plugin/`; chirurgiczna korekta `.gitignore`; zapis feedbacku do wyniku narzędzia; obsługa `edit`/`write`/`apply_patch` z filtrowaniem plików nieistniejących i spoza `worktree`; flaga `KILO_QUALITY_TYPECHECK` (`tsc`/`check`); dopiski w `AGENTS.md`, `test-plan.md` (§5, §6.7, §8) i `lessons.md`.

**Out of scope:** zmiany w `.husky/`, `lint-staged`, `ci.yml` i rulesecie; nowe zależności npm; włączanie typechecku domyślnie; testy jednostkowe hooka i zmiany w `vitest.config.ts`; lint per-edit testów integracyjnych/pgTAP/builda; wciąganie całego `.kilo/` do repo; edycja §3 `test-plan.md`.

## Architecture / Approach

Dwa niezależne pluginy auto-odkrywane z `.kilo/plugin/` (jeden obiekt `Hooks` może mieć tylko jeden klucz `tool.execute.after`, więc „dwa hooki" = dwa pliki).

```
edycja agenta (edit / write / apply_patch)
        │
        ▼
tool.execute.after ──► lint-on-edit.ts   ──► [eslint exit N]    (zawsze, ~6 s)
        │
        └────────────► typecheck-on-edit.ts ─► [typecheck:… exit N] (tylko gdy flaga ≠ off)
```

Oba bez importów, oba w `try/catch` (nigdy nie rzucają), oba wołane z `.cwd(directory).nothrow().quiet()`; wywołania sekwencyjne w kolejności ładowania, więc wynik lintu pojawia się przed wynikiem typechecku.

## Phases at a Glance

| Phase                             | What it delivers                                                               | Key risk                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 1. Hook lintu po edycji           | Śledzony plugin: jedno wywołanie ESLint na dotknięte pliki + dopisek do wyniku | `.gitignore` odsłania za dużo lub za mało — katalog nadrzędny musi być odzyskany przed plikiem |
| 2. Drugi hook: typecheck za flagą | Niezależny plugin, domyślnie nieaktywny, tryby `tsc`/`check` + pomiar kosztu   | `process.env` niedostępne w module pluginu → flaga nigdy nie zadziała                          |
| 3. Dokumentacja i domknięcie      | `AGENTS.md`, `test-plan.md` (§5/§6.7/§8), `lessons.md`                         | §3 `test-plan.md` nie może zostać ruszone (domena orchestratora)                               |

**Prerequisites:** sesja Kilo do restartu po dodaniu pluginów (ładowanie przy starcie); `node_modules` z ESLint/TypeScript/Astro obecne; brak potrzeby Dockera ani Supabase.
**Estimated effort:** ~2 sesje — Faza 1 to jeden plik i weryfikacja manualna, Faza 2 drugi plik plus pomiary, Faza 3 to dopiski w trzech plikach.

## Open Risks & Assumptions

- **Kolejność ładowania pluginów** jest globalna (wbudowane → globalne → projektowe). Nie kolidujemy z istniejącymi pluginami, ale nie mamy na nią wpływu.
- **Pierwszy start Kilo z `.kilo/plugin/`** każe Kilo utworzyć `.kilo/package.json` i może uruchomić `bun install` — wymaga sieci; artefakty pozostają ignorowane.
- **`node` musi być na PATH procesu Kilo**; jeśli nie jest, komenda nie wystartuje i hook zaraportuje błąd zamiast lintu (fallback: `node_modules\.bin\eslint.cmd`, świadomie nieużyty domyślnie).
- **Koszt skaluje się z liczbą wywołań narzędzi, nie plików** — tura z 10 edycjami to ~+55–65 s; przy dalszym wzroście projektu punktem odcięcia jest ograniczenie do lintu wyłącznie w pre-commicie.
- Założenie: `apply_patch` w tej wersji Kilo dostarcza `output.metadata.files[].filePath`; jeśli nie, hook parsuje `patchText` (ścieżka zapasowa jest w kontrakcie).
- Założenie: nikt nie polega na tym, że `.kilo/` jest w całości nieśledzone — zmiana `.gitignore` jest chirurgiczna i weryfikowana komendami.

## Success Criteria (Summary)

- Po edycji pliku z błędem lintu agent dostaje w wyniku narzędzia blok `[eslint exit 1]`; po edycji czystego pliku — ciszę; pliki na dysku pozostają nietknięte.
- `KILO_QUALITY_TYPECHECK=check` raportuje błąd typu także w pliku `.astro` — czego tryb `tsc` nie potrafi; bez flagi koszt wynosi zero.
- `git ls-files .kilo/plugin` zwraca oba pluginy, a `git check-ignore .kilo/kilo.json` nadal ignoruje lokalną konfigurację.
