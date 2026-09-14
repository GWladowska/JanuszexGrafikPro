---
date: 2026-09-14T12:11:41+02:00
researcher: Kilo
git_commit: 6fc4d086c3122dcc672ebc5538709218c48af315
branch: master
repository: GWladowska/JanuszexGrafikPro
topic: "Per-edit hooki jakości dla agenta (Kilo): lint + typecheck po edycji pliku, z podziałem per-edit vs pre-commit"
tags:
  [
    research,
    codebase,
    kilo,
    plugins,
    hooks,
    tool-execute-after,
    eslint,
    astro-check,
    vitest,
    husky,
    lint-staged,
    agent-loop,
  ]
status: complete
last_updated: 2026-09-14
last_updated_by: Kilo
---

# Research: Per-edit hooki jakości dla agenta (Kilo)

**Date**: 2026-09-14T12:11:41+02:00
**Researcher**: Kilo
**Git Commit**: [6fc4d08](https://github.com/GWladowska/JanuszexGrafikPro/commit/6fc4d086c3122dcc672ebc5538709218c48af315)
**Branch**: master
**Repository**: GWladowska/JanuszexGrafikPro

## Research Question

Zadanie praktyczne: „Skonfiguruj hook lint + typecheck — hook per-edit, który uruchamia linter po każdej edycji pliku przez agenta; dodaj drugi hook z typecheckiem. Wybierz swoje narzędzie, skonfiguruj oba hooki i przetestuj. Jeśli typecheck spowalnia agenta, przenieś go do pre-commit."

Zadanie wymienia Claude Code / Cursor / Codex / Copilot, ale **to repo pracuje pod Kilo** (`.kilo/kilo.json`, `AGENTS.md` pod Kilo, globalna konfiguracja `~/.config/kilo/`). Ustalenia z użytkownikiem przed research:

- **(a) Wariant narzędzia**: Kilo natywnie.
- **(b) Podział warstw**: per-edit = najszybsza warstwa i jedyna, która daje agentowi feedback **w trakcie pracy** (formatowanie, proste błędy typów, padające testy jednostkowe); pre-commit = siatka na to, co prześlizgnęło się przez per-edit (ręczne edycje bez agenta, pliki zmienione poza hookiem, sprawdzenia zbyt wolne na per-edit), operuje na staged files.
- **(c) Wynik**: research + szkic planu.

Pytania badawcze: (1) czy Kilo ma natywny mechanizm hooków per-edit i jak się go rejestruje; (2) po jakich narzędziach i jak odczytać edytowany plik; (3) jak wrócić feedback do agenta i czy działa semantyka „exit code 2"; (4) ile realnie kosztuje lint / typecheck / testy w tym projekcie i co da się odpalać per-edit; (5) co już jest zrobione w pre-commit i CI oraz jakie decyzje historyczne to ograniczają.

## Summary

1. **Kilo ma natywny mechanizm — i jest to plugin, nie plik konfiguracyjny.** Hook `tool.execute.after` w `@kilocode/plugin` jest odpowiednikiem Claude'owego `PostToolUse` (`C:\Users\gwladowska\.config\kilo\node_modules\@kilocode\plugin\dist\index.d.ts:249-258`). Rejestracja nie wymaga edycji `kilo.json`: każdy plik `.ts`/`.js` wrzucony do `.kilo/plugin/` (lub `.kilo/plugins/`) jest **auto-odkrywany przy starcie**. Wariant jawny to tablica `plugin` w `kilo.json`. Kontrakt eksportu: `export default { id, server }` — `id` jest **wymagane** dla pluginu z pliku lokalnego.
2. **Ścieżka edytowanego pliku jest w `input.args.filePath` (camelCase).** Trzy narzędzia mutujące: `edit` (`filePath`, `oldString`, `newString`, `replaceAll?`), `write` (`filePath`, `content` — obejmuje nowe pliki), `apply_patch` (`patchText` — **N plików na jedno wywołanie**; ścieżki wygodniej wziąć z `output.metadata.files[].filePath`). Nie istnieje `multiedit` ani `kilo_edit`.
3. **W Kilo nie ma „exit code 2".** Hooki działają w tym samym procesie co agent: feedback wraca przez **mutację `output.output` / `output.title` / `output.metadata`**, a `throw` przerywa wywołanie narzędzia. Reguła „exit 2 blokuje, inne kody logują" z treści zadania dotyczy Claude Code / Codex, nie Kilo — w Kilo odpowiednikiem blokady jest wyjątek, a nie kod wyjścia.
4. **Kluczowe (i korygujące tezę zadania) odkrycie kosztowe: w tym projekcie nie ma per-edit niczego, co trwa „sekundy".** Każda komenda ma ~6–11 s podłogi samego startu `npx` + Node + rozwiązywania konfiguracji; lint jednego pliku to ~10–13 s (bo `eslint.config.js:22` ma `projectService: true` — type-aware lint buduje program TS), `astro check` ~23–24 s, `vitest run` ~18–21 s. **`astro check` nie da się zawęzić do pliku** — nieznany argument jest po cichu ignorowany (potwierdzone empirycznie). Literalne „lint + typecheck po każdej edycji" to +30–35 s na edycję, czyli dokładnie ten scenariusz, przed którym ostrzega druga część zadania („jeśli typecheck spowalnia agenta").
5. **Testy jednostkowe też nie da się sensownie zawęzić.** `vitest related <plik>` przy 5 plikach testowych w repo: hub `src/lib/week.ts` ściąga 4/5 plików (98 z 99 testów), a pliki bez testów zwracają 0 testów **nadal kosztując ~11 s**. Pełny `npm test` (~18–21 s) jest praktycznie równie drogi.
6. **Najtańszy sygnał typów w całym projekcie to `npx tsc --noEmit` (~8 s), ale jest strukturalnie ślepy na 16 plików `.astro`** (TypeScript nie wciąga `.astro`; pokrywa 53 pliki `.ts/.tsx` z 82, które widzi `astro check`). To dokładnie luka, którą opisuje lekcja o dryfie typów przechodzącym `sync`+`lint`+`build` (`context/foundation/lessons.md:53-58`).
7. **Pre-commit już realizuje warstwę „wolnych" sprawdzeń i nie trzeba go ruszać.** `.husky/pre-commit` to dwie linie: `npx lint-staged` i `npm run check` (`astro check`) — z lekcji `lessons.md:88-92`, że `astro check` (bez argumentów plikowych) musi stać poza `lint-staged`. Zmiana `testing-quality-gates` wprost zabroniła dokładania nowych zależności i pre-push — plugin Kilo nie wymaga ani jednego, ani drugiego.
8. **Historycznie per-edit hook nigdy nie został ani zdecydowany, ani odrzucony.** `test-plan.md:95` ma wiersz bramki o nazwie **„hook po zapisie pliku / lokalnie (pętla agenta)"**, oznaczony jako **„zalecana — wdrożona lokalnie (husky: `lint-staged` + `npm run check`)"** — czyli nazwa mówiła o pętli agenta, a realizacja wylądowała w commicie. Wszystkie 4 fazy §3 rollout test-planu są `complete`, więc to jest **nowa warstwa**, nie niedokończony wiersz fazy.
9. **Rekomendacja (szczegóły w szkicu planu):** plugin `.kilo/plugin/quality-on-edit.ts` z hookiem `tool.execute.after`, który dla `edit`/`write`/`apply_patch` uruchamia **ESLint tylko na dotkniętych plikach** (~10–13 s) i wkleja wynik do `output.output`; typecheck i testy jednostkowe zostają tam, gdzie są dziś (`astro check` w `npm run check` w pre-commit i w CI), z opcjonalnym trybem „typecheck per-edit" za flagą, jeśli użytkownik zaakceptuje ~8 s (`tsc`) lub ~23 s (`astro check`) na edycję.

## Detailed Findings

### 1. Mechanizm hooków Kilo — czym jest i jak się rejestruje

**Hook per-edit istnieje natywnie.** `Hooks` w `@kilocode/plugin` (`C:\Users\gwladowska\.config\kilo\node_modules\@kilocode\plugin\dist\index.d.ts`) deklaruje pełny zestaw zdarzeń, m.in. `event` (`:175-177`), `config` (`:178`), `tool` (`:179-181`), `permission.ask` (`:225-227`), `command.execute.before` (`:228-234`), `tool.execute.before` (`:235-241`) i kluczowy dla zadania:

```ts
// index.d.ts:249-258
"tool.execute.after"?: (input: {
    tool: string;
    sessionID: string;
    callID: string;
    args: any;
}, output: {
    title: string;
    output: string;
    metadata: any;
}) => Promise<void>;
```

**Rejestracja — dwa równoważne sposoby:**

| Sposób                    | Co zrobić                                                        | Uwagi                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Auto-discovery (zalecane) | wrzucić plik `.ts`/`.js` do `.kilo/plugin/` lub `.kilo/plugins/` | zero zmian w `kilo.json`; skan `{plugin,plugins}/*.{ts,js}` per katalog konfiguracji                                  |
| Jawnie w konfiguracji     | `"plugin": ["./plugin/quality-on-edit.ts"]` w `.kilo/kilo.json`  | ścieżka względna rozwiązywana względem katalogu pliku konfiguracji; akceptowany też `file:///...` i nazwa pakietu npm |

Kontrakt eksportu (`index.d.ts:51-56`): `PluginModule = { id?: string; server: Plugin; tui?: never }`, gdzie `Plugin = (input, options?) => Promise<Hooks>`. Loader czyta **`module.default`** i wymaga obiektu z funkcją `server`; dla pluginu z pliku lokalnego **`id` jest obowiązkowe** (w przeciwnym razie rzucany jest błąd `` `Path plugin … must export id` ``). Shipped `example.js` (eksport nagiej funkcji) jest w tej wersji mylący/legacy — używać `export default { id, server }`.

Wstrzykiwane zależności (`index.d.ts:36-46`): `{ client, project, directory, worktree, experimental_workspace, serverUrl, $ }`, gdzie `$` to shell Bun (`shell.d.ts:7-34`), a `directory`/`worktree` dają stabilny kontekst ścieżek.

**Kolejność i współistnienie:** hooki z wielu pluginów uruchamiane są **sekwencyjnie i awaitowane**, w kolejności ładowania: wewnętrzne built-iny → globalna tablica `plugin` → globalny katalog `plugin/` → projektowa tablica `plugin` → projektowy katalog `plugin/`; duplikaty dedupowane. `KILO_PURE=1` / `--pure` wyłącza pluginy zewnętrzne. W tym repo globalna konfiguracja już ciągnie `@kilocode/plugin` (`C:\Users\gwladowska\.config\kilo\package.json:3`) i dwa wewnętrzne pakiety (`@kilocode/kilo-indexing`, `@kilocode/plugin-atomic-chat`), ale **projekt nie ma dziś żadnego katalogu `plugin/` ani wpisu `plugin`** — to jest zielone pole.

Docs (potwierdzają analizę binarki): `https://kilo.ai/docs/automate/extending/plugins` — sekcje „From a plugin directory", „Module shape", „Load order", troubleshooting (`export default { id, server }`).

### 2. Które narzędzia mutują pliki i skąd wziąć ścieżkę

Registry built-inów: `edit`, `write`, `apply_patch` (plus m.in. `read`, `bash`, `glob`, `grep`). Nie ma `multiedit`, `patch`, `kilo_edit`, `kilo_write`. Realne wywołania z lokalnej sesji Kilo potwierdzają: `edit` ×6740, `write` ×1475, `apply_patch` ×1165.

| Narzędzie     | Arg-key ścieżki                | Pozostałe args                          | Ile plików na wywołanie                  |
| ------------- | ------------------------------ | --------------------------------------- | ---------------------------------------- |
| `edit`        | `filePath` (camelCase)         | `oldString`, `newString`, `replaceAll?` | 1                                        |
| `write`       | `filePath`                     | `content`                               | 1 (tworzy nowy plik, jeśli nie istnieje) |
| `apply_patch` | brak — ścieżki w treści patcha | `patchText`                             | **N** (`*** Add/Update/Delete File:`)    |

Dla `apply_patch` wygodniejszym źródłem niż parsowanie `patchText` jest wynik narzędzia: `output.metadata.files[].filePath` zawiera już **absolutne** ścieżki (obserwowane w bazie sesji). `input.args` w `tool.execute.after` to **ten sam obiekt**, który dostał executor narzędzia, więc `input.args.filePath` jest odczytywalne wprost. Klucz snake_case `file_path` w tym CLI nie występuje (21 trafień w binarce to wyłącznie typy providerów OpenAI/Anthropic). Nowe pliki są pokryte: `write` zawsze, `edit` przy `oldString: ""`, `apply_patch` przez `Add File`.

**Guard konieczny w pluginie:** ścieżka bywa absolutna i **poza repo** (obserwowane realne edycje w `C:\Repositories\VOCS-XPlatform\…`), więc hook musi sprawdzić prefiks `worktree`/`directory`, zanim odpali cokolwiek.

### 3. Kanał feedbacku — jak agent widzi wynik hooka

- `Plugin.trigger` iteruje po hookach i **awaituje** każdy, przekazując ten sam obiekt `output`; call-site narzędzia konsumuje `output` **po** hooku, więc mutacja `output.output` / `output.title` / `output.metadata` **trafia do kontekstu modelu**.
- Hook **nie ma pojęcia kodu wyjścia**. Odpowiednik „exit 2" z Claude Code to albo **`throw`** (przerywa wywołanie narzędzia — tak działa dokumentowany przykład `env-guard` w `tool.execute.before`), albo **mutacja `output`** (feedback nieblokujący, dokładnie to, co zwykle chcemy dla lintu).
- Wniosek dla zadania: zdanie „exit code 2 to sygnał blokujący, inne kody logowane" należy w tym repo **zastąpić** regułą: `throw` = blokada, dopisanie do `output.output` = feedback nieblokujący.

### 4. Koszt realny — co da się odpalać per-edit (pomiary)

Środowisko: Windows 11, PowerShell 5.1, Node v24.18.0 (`.nvmrc` pinuje v22.14.0 — rozjazd wart odnotowania). Skala: 69 plików `src/**/*.{ts,tsx,astro}` (39 `.ts`, 14 `.tsx`, 16 `.astro`), 5 plików testów jednostkowych / 99 przypadków.

| Komenda                                                 | Zakres                                       | Cold (s) | Warm (s) | Werdykt                                       |
| ------------------------------------------------------- | -------------------------------------------- | -------- | -------- | --------------------------------------------- |
| `npx eslint src/lib/week.ts`                            | 1 `.ts`                                      | 10,53    | 10,66    | per-edit wykonalne, ale ~10 s podłogi         |
| `npx eslint src/components/schedules/ScheduleBoard.tsx` | 1 `.tsx`                                     | 13,03    | 12,33    | per-edit wykonalne, ~12–13 s                  |
| `npx eslint src/pages/dashboard.astro`                  | 1 `.astro`                                   | 10,44    | 10,31    | per-edit wykonalne                            |
| `npx eslint .`                                          | 80 plików                                    | 22,81    | 19,32    | **tylko pre-commit**                          |
| `npx tsc --noEmit -p tsconfig.json`                     | 53 `.ts/.tsx`, **0 `.astro`**                | 8,38     | 7,85     | najtańszy sygnał typów, ale ślepy na `.astro` |
| `npx astro check`                                       | 82 pliki                                     | 24,10    | 23,06    | **tylko pre-commit**                          |
| `npx astro check src/lib/week.ts`                       | argument **po cichu zignorowany** → 82 pliki | 21,28    | —        | brak zawężania do pliku                       |
| `npx vitest run`                                        | 5 plików / 99 testów                         | 20,82    | 17,69    | **tylko pre-commit**                          |
| `npx vitest related src/lib/week.ts --run`              | hub → 4/5 plików, 98 testów                  | 15,50    | 16,44    | brak realnego zawężenia                       |
| `npx vitest related src/lib/format.ts --run`            | leaf → 2 pliki, 12 testów                    | 13,83    | 15,73    | marginalne                                    |
| `npx vitest related <komponent>.tsx --run`              | plik bez testów → 0 testów                   | 10,85    | —        | zero sygnału, a nadal ~11 s                   |
| `npx prettier --check src/lib/week.ts`                  | 1 plik                                       | 6,49     | 7,34     | jedyne naprawdę tanie zawężenie               |

Trzy wnioski o przyczynach:

- **Lint per plik nie jest 10× tańszy od lintu całego projektu, bo płaci się za `projectService: true`** (`eslint.config.js:22`) — type-aware linting buduje program TS przy każdym uruchomieniu; koszt to konstrukcja programu, nie liczba plików. Dla `.astro` ESLint wypisuje ostrzeżenie, że `astro-eslint-parser` nie wspiera `projectService` i parsuje jako `project: true`.
- **`astro check` strukturalnie nie przyjmuje plików** (`npx astro check --help` nie ma pozycyjnego argumentu; podanie ścieżki nic nie zmienia). Stąd historyczna reguła `lessons.md:92`: trzymać `astro check` **poza** `lint-staged`.
- **Testy integracyjne i pgTAP są poza per-edit** — wymagają lokalnego Supabase (`supabase start` + `supabase db reset` z WSL); jedyna komenda testowa bez bazy to `npm test`.

Konsekwencja dla projektu hooka: sensowny budżet per-edit to **jedno uruchomienie ESLint na dotkniętych plikach**; dołożenie typechecku lub testów mnoży koszt przez ~2–3 (i to na każdą edycję, także w seriach wielu edycji w jednej turze agenta). To argument, by w fazie 1 zrobić lint obligatoryjnie, a typecheck uczynić **opcjonalnym trybem** (patrz szkic planu).

### 5. Stan zastany w projekcie (czego nie ruszać)

- `.husky/pre-commit` — dwie linie: `npx lint-staged` (`:1`) i `npm run check` (`:2`). To realizuje wiersz bramki „hook po zapisie pliku" z `test-plan.md:95`.
- `package.json` — skrypty `lint` (`eslint .`), `lint:fix`, `format`, `check` (`astro check`), `test` (`vitest run`), `test:watch`, `test:integration`; konfiguracja `lint-staged` (`:67-74`): `*.{ts,tsx,astro}` → `eslint --fix`, `*.{json,css,md}` → `prettier --write`. **Bez testów i bez `astro check` wewnątrz `lint-staged`** — celowo.
- `.gitattributes:1-2` — `.husky/* text eol=lf` (twardy precedens z `lessons.md:88-92`: CRLF w hooku → `exit 127` pod WSL-owym `dash`).
- CI `.github/workflows/ci.yml` — job `ci`: `astro sync` → `lint` → `check` → `test` → `build`; job `integration`: pgTAP + testy integracyjne. Nazwy jobów `ci`/`integration` są **publicznym kontraktem** wymaganych checków rulesetu „Protect" (`lessons.md:81-86`) — plugin agentowy ich nie dotyka.
- `.kilo/.gitignore` — ignoruje w `.kilo/` m.in. `node_modules`, `package.json`, `package-lock.json`, `agent-manager.json`. To spójne z tym, że Kilo dla katalogu konfiguracji z folderem `plugin/` tworzy własny `package.json` i robi `bun install` — artefakty instalacji nie idą do repo.

### 6. Kontekst decyzyjny z historii projektu

- `test-plan.md:95` — jedyna bramka lokalna ma nazwę **„hook po zapisie pliku"**, lokalizację **„lokalnie (pętla agenta)"**, status **„zalecana"** (słabszy niż wymagane bramki CI) i opis realizacji: husky `lint-staged` + `npm run check`. Per-edit hook jest więc **dookreśleniem istniejącej intencji**, a nie nową bramką.
- `test-plan.md:53-58` — wszystkie 4 fazy §3 rollout test-planu są `complete`; brak oczekującego wiersza na per-edit. Zmiana wymagałaby nowego change'a / `test-plan --refresh`, nie „dokończenia fazy".
- Grep po całym `context/` na `pre-edit`, `post-edit`, `per-edit`, `PostToolUse`: **zero trafień** — nikt tego wcześniej nie rozstrzygał (pytanie zostało otwarte w `context/archive/2026-09-14-testing-quality-gates/research.md:172` i domknięte wężsko: tylko husky + `astro check` przy commicie).
- `context/archive/2026-09-14-testing-quality-gates/plan.md:59` — explicite: **bez nowych zależności** i bez `pre-push`. `plan.md:46,200` — `@astrojs/check` nie przyjmuje argumentów, ~21 s; nie wolno go w `lint-staged`.
- `lessons.md:53-58` — typ dryf, który przeszedł `sync`+`lint`+`build`, a wyszedł dopiero w E2E; reguła: uruchamiać `npx astro check` obok reszty. To uzasadnia, dlaczego typecheck nie może zniknąć — może tylko zmienić warstwę.
- `lessons.md:39-44` — pytania decyzyjne do użytkownika prostym językiem (użytkownik to właściciel produktu, nie developer) — ma zastosowanie do decyzji „czy dokładamy ~8–23 s na edycję".
- `roadmap.md` — brak wpisu o DX / hookach / pętli agenta; prd/tech-stack też czyste. Nie ma więc konfliktu z zaplanowanym zakresem produktu.

## Code References

### Repo (permalinki na `6fc4d08`)

- [.husky/pre-commit:1-2](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/.husky/pre-commit#L1-L2) — `npx lint-staged` + `npm run check` (cała warstwa pre-commit).
- [package.json:5-19](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/package.json#L5-L19) — skrypty `lint`, `lint:fix`, `format`, `check`, `test`, `test:integration`.
- [package.json:67-74](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/package.json#L67-L74) — konfiguracja `lint-staged` (bez testów, bez `astro check`).
- [eslint.config.js:20-24](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/eslint.config.js#L20-L24) — `projectService: true` (źródło ~10 s podłogi lintu; wyjaśnia słabą korzyść z zawężania do pliku).
- [tsconfig.json:3](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/tsconfig.json#L3) — `include: [".astro/types.d.ts", "**/*"]` i dlaczego `tsc` i tak nie widzi `.astro`.
- [.gitattributes:1-2](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/.gitattributes#L1-L2) — pinowanie LF dla `.husky/*`.
- [.kilo/kilo.json:1-13](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/.kilo/kilo.json#L1-L13) — projektowa konfiguracja Kilo (dziś bez `plugin`).
- [.kilo/.gitignore:1-8](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/.kilo/.gitignore#L1-L8) — dlaczego artefakty instalacji pluginu nie trafią do repo.
- [.github/workflows/ci.yml](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/.github/workflows/ci.yml) — joby `ci` i `integration` (bramka nie do ruszenia przy tym zadaniu).
- [context/foundation/test-plan.md:95](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/context/foundation/test-plan.md#L95) — wiersz bramki „hook po zapisie pliku / lokalnie (pętla agenta)".
- [context/foundation/test-plan.md:53-58](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/context/foundation/test-plan.md#L53-L58) — wszystkie fazy §3 `complete`.
- [context/foundation/lessons.md:53-58](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/context/foundation/lessons.md#L53-L58) — dryf typów przeszły `sync`+`lint`+`build`.
- [context/foundation/lessons.md:88-92](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/context/foundation/lessons.md#L88-L92) — LF w `.husky/`, `astro check` poza `lint-staged`.
- [context/foundation/lessons.md:15-23](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/context/foundation/lessons.md#L15-L23) — `npm test`/`check` z PowerShell, Supabase tylko z WSL.
- [context/archive/2026-09-14-testing-quality-gates/plan.md:46,59,200](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/context/archive/2026-09-14-testing-quality-gates/plan.md#L46) — brak argumentów `astro check`, zakaz nowych zależności, `astro check` poza `lint-staged`.
- [context/archive/2026-09-14-testing-quality-gates/research.md:172](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/context/archive/2026-09-14-testing-quality-gates/research.md#L172) — otwarte pytanie o zakres lokalnego hooka.

### Poza repo (globalna instalacja Kilo)

- `C:\Users\gwladowska\.config\kilo\node_modules\@kilocode\plugin\dist\index.d.ts:173-317` — interfejs `Hooks`; `:249-258` to `tool.execute.after`, `:235-241` `tool.execute.before`.
- `C:\Users\gwladowska\.config\kilo\node_modules\@kilocode\plugin\dist\index.d.ts:36-56` — `PluginInput`, `PluginOptions`, `Plugin`, `PluginModule`.
- `C:\Users\gwladowska\.config\kilo\node_modules\@kilocode\plugin\dist\shell.d.ts:7-34` — `BunShell` wstrzykiwany jako `$`.
- `C:\Users\gwladowska\.config\kilo\package.json:3` — `"@kilocode/plugin": "7.4.1"` w globalnej konfiguracji.
- `C:\Users\gwladowska\AppData\Local\JetBrains\Rider2026.2\kilo\cli\7.5.15\windows-x64\bin\kilo.exe` — pojedynczy bundle Bun; w nim skan `{plugin,plugins}/*.{ts,js}`, walidator eksportu (`module.default` + `server`), `Plugin.trigger` (sekwencyjnie, await, mutacja `output`), registry narzędzi (`edit`/`write`/`apply_patch`) i schematy args.
- `C:\Users\gwladowska\.local\share\kilo\kilo.db` — realne wywołania narzędzi (`tool":"edit"` z `input.filePath`, `tool":"apply_patch"` z `output.metadata.files[].filePath`).
- `https://kilo.ai/docs/automate/extending/plugins` — oficjalna dokumentacja pluginów (rejestracja, kontrakt `export default { id, server }`, kolejność ładowania, `KILO_PURE`).

## Architecture Insights

1. **Hooki Kilo to pluginy in-process, nie skrypty z kodami wyjścia.** To fundamentalna różnica względem modelu z zadania: nie ma procesu potomnego, nie ma `exit 2`, nie ma „matchera `Write|Edit`". Jest JS-owy hook z `input.tool`/`input.args` i mutowalnym `output`. Projektując bramkę, myśli się w kategoriach „dopisz do output / rzuć wyjątek", nie „zwróć kod".
2. **Zawężanie do pliku w tym projekcie prawie nie oszczędza.** Type-aware ESLint + `astro check` całościowo + brak sensownego `vitest related` sprawiają, że podział „per-edit vs pre-commit" trzeba oprzeć nie na liczbie plików, lecz na **tym, czy narzędzie w ogóle umie pracować per plik** i **jak drogi jest jego start**. Per-edit wygrywa ESLint (umie per plik, ~10 s) ; `astro check` (nie umie, ~23 s) i testy (per plik bez sygnału, ~18 s) należą do pre-commit.
3. **Silnik bramki = istniejące skrypty, zero nowych zależności.** Plugin nie potrzebuje npm-owych importów (wg dokumentacji przy braku importów nie potrzebuje nawet `.kilo/package.json`), a wywołanie lintu to ten sam `eslint`, którego używa `lint-staged`. Zachowuje to zakaz z `plan.md:59`.
4. **Uwaga na pętlę i na mutacje pliku.** `eslint --fix` w hooku po edycji zmienia plik po tym, jak agent już go zapisał — agent zobaczy treść poprawioną tylko przy następnym odczycie; bezpieczniejszy start to eslint **bez** `--fix` (raport błędów), a fix pozostawić `lint-staged`. Hook nie wywołuje kolejnych hooków (reaguje wyłącznie na wywołania narzędzi), więc nie ma rekurencji, ale trzeba pilnować, by nie lintować plików spoza `worktree`.
5. **Podwójna rola hooków jest komplementarna, nie konkurencyjna.** Per-edit = feedback „teraz", wyłącznie dla ścieżki agenta; pre-commit = arbitraż na staged files, obejmuje człowieka i pliki zmienione bez agenta. Żadna z warstw nie zastępuje CI, które pozostaje jedynym twardym wymuszeniem (`ci` + `integration` z rulesetu „Protect").
6. **Weryfikacja jest wbudowana w treść zadania i da się ją zautomatyzować jako scenariusz manualny:** utworzyć plugin → zrestartować sesję Kilo (pluginy ładują się przy starcie) → poprosić agenta o edycję pliku z celowym błędem lintu → sprawdzić, że w wyniku narzędzia pojawia się dopisany blok z ESLintem. To odpowiednik „poproś agenta o edycję pliku i sprawdź, czy hooki się odpalają".

## Minimalny szkielet pluginu (do wykorzystania w fazie 1 planu)

Rejestracja przez auto-discovery — **bez zmian w `kilo.json`**:

```ts
// .kilo/plugin/quality-on-edit.ts
// Auto-odkrywany: każdy .ts/.js w <configdir>/plugin/ ładuje się przy starcie Kilo.
// Wymagany kontrakt: default export = { id, server }. id obowiązkowe dla pliku lokalnego.
// Bez importów npm (unikamy auto-generowanego .kilo/package.json) — typy celowo luźne.
export default {
  id: "quality-on-edit",
  server: async ({ $, directory, worktree }: any) => ({
    "tool.execute.after": async (input: any, output: any) => {
      const files = collectTouchedFiles(input, worktree);
      if (files.length === 0) return;

      const res = await $(`npx eslint ${files.join(" ")}`)
        .cwd(directory)
        .nothrow()
        .quiet();
      const text = `${res.stdout?.toString?.() ?? ""}${res.stderr?.toString?.() ?? ""}`.trim();
      if (!text) return;

      output.output += `\n\n[eslint: ${files.length} plik(i), exit ${res.exitCode}]\n${text}`;
    },
  }),
};

function collectTouchedFiles(input: any, worktree: string): string[] {
  const inside = (p: string) => p.toLowerCase().startsWith(worktree.toLowerCase());
  const lintable = (p: string) => /\.(ts|tsx|js|jsx|mjs|cjs|astro)$/i.test(p);

  if (input.tool === "edit" || input.tool === "write") {
    const p = input.args?.filePath;
    return typeof p === "string" && inside(p) && lintable(p) ? [p] : [];
  }
  if (input.tool === "apply_patch") {
    const files = input.output?.metadata?.files ?? input.metadata?.files ?? [];
    const fromMeta = files.map((f: any) => f?.filePath).filter((p: any) => typeof p === "string");
    if (fromMeta.length) return fromMeta.filter((p: string) => inside(p) && lintable(p));
    const text = input.args?.patchText ?? "";
    return [...text.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)]
      .map((m) => m[1].trim())
      .filter((p) => inside(p) && lintable(p));
  }
  return [];
}
```

Zalecana jawna rejestracja (jeśli auto-discovery zostanie zakłócone przez kolejność ładowania) — ścieżka względna do katalogu pliku konfiguracji:

```jsonc
// .kilo/kilo.json — dodać obok mcp/permission
"plugin": ["./plugin/quality-on-edit.ts"]
```

**Rzeczy oznaczone jako niezweryfikowane na żywo** (do potwierdzenia w fazie weryfikacji planu): ergonomia `$` z `.cwd().nothrow().quiet()` pod Windows (Bun shell vs `npx.cmd`); dokładna nazwa wywoływanego pliku `eslint` przy braku `--fix`; czy `input.output` w `apply_patch` jest naprawdę tym samym obiektem co drugi argument hooka (w szkieletu czytam oba defensywnie); zachowanie hooka przy edycji plików poza repo (guard `worktree` jest po to, by nie odpalać lintu na cudzych repozytoriach).

## Historical Context (from prior changes)

- `context/foundation/test-plan.md:95` — bramka „hook po zapisie pliku / lokalnie (pętla agenta)", status „zalecana — wdrożona lokalnie (husky: `lint-staged` + `npm run check`)". Nazwa mówi o pętli agenta, realizacja jest commit-time → to luka, którą domyka ten change.
- `context/foundation/test-plan.md:53-58` — §3 rollout: 4/4 fazy `complete`; brak wiersza na per-edit hooks.
- `context/foundation/test-plan.md:87-96` — tabela bramek; wszystkie twarde bramki (lint, `astro check`, unit, integration, pgTAP, build) są „wymagane i wymuszone w CI"; jedyną miękką jest hook lokalny.
- `context/archive/2026-09-14-testing-quality-gates/research.md:172` — otwarte pytanie #6: czy faza 4 ma rozszerzyć `lint-staged` o `astro check`, czy zostawić hook poza zakresem. Rozstrzygnięto: husky wpięty, `astro check` osobną linią, nic więcej.
- `context/archive/2026-09-14-testing-quality-gates/plan.md:46,59,200` — `@astrojs/check` bez argumentów (~21 s), zakaz nowych zależności i pre-push, `astro check` poza `lint-staged`.
- `context/archive/2026-09-14-testing-quality-gates/plan.md:170-221` — pełny projekt fazy 3 (LF, `"prepare": "husky"`, `npm run check`) — wzorzec, jak ten projekt dokumentuje i testuje hooki.
- `context/archive/2026-09-14-testing-quality-gates/change.md:22` — intencja wymuszenia: „lint, `npx astro check`, unit, integration, pgTAP, build — plus realne wymuszenie w ochronie gałęzi".
- `context/foundation/lessons.md:53-58,88-92` — dwie lekcje bezpośrednio kształtujące projekt: `astro check` łapie dryf typów, którego nie łapią `sync`/`lint`/`build`; pliki hooków na LF; komendy bez argumentów plikowych poza `lint-staged`.
- `context/changes/bootstrap-verification/verification.md:59` — `.husky/` przyszło ze scaffolda (48 plików przeniesionych w move-up) — pochodzenie obecnej warstwy hooków.

## Related Research

- `context/archive/2026-09-14-testing-quality-gates/research.md` — stan CI/bramek i lokalnego hooka przed fazą 4 (ten sam problem z innej strony: wymuszenie, nie per-edit).
- `context/archive/2026-09-14-testing-core-logic/research.md` — kontekst testów jednostkowych i definicji bramek „wymagane od Fazy 1".
- `context/archive/2026-09-14-testing-server-side-rules/research.md` — testy integracyjne (dlaczego nie nadają się na per-edit: wymagają bazy).
- `context/archive/2026-09-14-testing-database-isolation/research.md` — pgTAP (wymaga Dockera/WSL; poza per-edit).

## Open Questions

1. **Czy typecheck ma być per-edit, czy zostać w pre-commit?** Twarde dane: `tsc --noEmit` ~8 s, ale nie widzi `.astro`; `astro check` ~23 s, widzi wszystko, nie da się zawęzić. Do decyzji użytkownika po fazie 1 (lint), na podstawie odczuwalnego spowolnienia.
2. **`eslint` w hooku: z `--fix` czy bez?** Bez `--fix` = czysty raport; z `--fix` = agent dostaje plik poprawiony, ale hook mutuje plik po edycji i wynik narzędzia opisuje stan sprzed poprawki. Rekomendacja startowa: bez `--fix`.
3. **Testy jednostkowe per-edit:** dane pokazują brak sensownego zawężania (`vitest related` ~11–16 s bez sygnału dla plików bez testów, pełny `npm test` ~18–21 s). Czy w ogóle włączać, czy zostawić w pre-commit i CI?
4. **Czy ostrzeżenia traktować jak błędy?** (`--max-warnings=0`). Wpływa na to, czy hook zadziała blokująco (`throw`) — a to jest odpowiednik „exit 2".
5. **Zasięg `apply_patch`:** limit liczby plików / czy lintować wszystkie dotknięte pliki przy N sięgającym 6 (największe zaobserwowane wywołanie) i więcej.
6. **Windows/Bun:** czy `$` + `npx eslint` działa bez zmian pod PowerShell/Windows, czy trzeba wołać `npx.cmd` albo `node_modules/.bin/eslint`. Do potwierdzenia empirycznego w fazie 1.
7. **Gdzie udokumentować:** `AGENTS.md` (sekcja o hookach wewnętrznej pętli) i `test-plan.md` (rozróżnienie „hook pętli agenta" vs „hook commitowy") — czy to część tego change'a, czy osobny change dokumentacyjny.

## Szkic planu (do `/10x-plan`, nie plan wykonawczy)

**P0 — decyzja zakresu (bramka przed kodem).** Wybór, które sprawdzenia idą per-edit (rekomendacja: tylko ESLint na dotkniętych plikach), czy typecheck ma tryb per-edit (opcje: brak / `tsc` ~8 s ślepy na `.astro` / `astro check` ~23 s pełny), czy dołączyć testy jednostkowe. Kryterium: odczuwalne spowolnienie pętli agenta vs pokrycie.

**F1 — szkielet pluginu i rejestracja.** `.kilo/plugin/quality-on-edit.ts` (auto-discovery, `export default { id, server }`, zero importów npm), hook `tool.execute.after`, mapowanie `edit`/`write`/`apply_patch` → ścieżki, guardy (`worktree`, rozszerzenia, `ignore`), wywołanie ESLint **bez** `--fix` na dotkniętych plikach, dopisanie wyniku do `output.output`. Kryterium: plugin ładuje się, hook odpala się przy edycji, brak efektów ubocznych na plikach i na hooku pre-commit.

**F2 — feedback i semantyka bramki.** Decyzja: nieblokujący dopisek vs `throw` (odpowiednik „exit 2"); `--max-warnings=0`; obsługa `apply_patch` z wieloma plikami; zachowanie przy plikach poza repo; odporność na brak ESLint/`node_modules`.

**F3 — weryfikacja (scenariusz z zadania).** Zrestartować sesję Kilo, poprosić agenta o edycję pliku z celowym błędem lintu, potwierdzić blok `[eslint …]` w wyniku narzędzia; sprawdzić przypadek „czysty plik → brak hałasu" i „plik poza repo → brak akcji". Ewentualnie logi startu Kilo na potwierdzenie ładowania pluginu.

**F4 — decyzja o typechecku i dokumentacja.** Jeśli typecheck per-edit zaakceptowany: dołożyć drugi hook/tryb z jawnym pomiarem kosztu; jeśli nie — zostaje w `npm run check` w pre-commit i w CI, a decyzja ląduje w `AGENTS.md` i w `test-plan.md` (wiersz bramki dostaje rozróżnienie: warstwa pętli agenta = lint per-edit, warstwa commitowa = `lint-staged` + `astro check`). Opcjonalnie lekcja do `context/foundation/lessons.md`, jeśli wyjdzie nieoczywisty trap (np. Windows/Bun shell albo koszt `projectService`).

**Poza zakresem:** zmiany w `.husky/` i `lint-staged`, `pre-push`, CI i ruleset, jakiekolwiek nowe zależności — zgodnie z precedensem `context/archive/2026-09-14-testing-quality-gates/plan.md:59`.
