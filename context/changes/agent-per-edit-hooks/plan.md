# Per-edit hooki jakości w pętli agenta (Kilo) — plan implementacji

## Overview

Skonfigurować w tym repo natywny dla Kilo hook, który po każdej edycji pliku przez agenta uruchamia ESLint nad dotkniętymi plikami i dopisuje raport do wyniku narzędzia, oraz drugi, niezależny hook typu typecheck — domyślnie wyłączony, włączany zmienną środowiskową. Warstwą egzekwowania pozostaje commit (`.husky/pre-commit` = `lint-staged` + `npm run check`) i CI — hook per-edit jest sprzężeniem zwrotnym w pętli agenta, nie bramką.

Cel zadania kursowego: dwa hooki (lint + typecheck), przetestowane, z typecheckiem przeniesionym do pre-commit, jeśli spowalnia. Ten plan realizuje to dosłownie — oba hooki istnieją i są przetestowane, a typecheck jest wyłączony domyślnie, więc nie spowalnia, dopóki ktoś świadomie go nie włączy.

## Current State Analysis

- **Mechanizm istnieje natywnie.** `tool.execute.after` w `@kilocode/plugin` jest odpowiednikiem Claude'owego `PostToolUse`; plugin to plik `.ts`/`.js` auto-odkrywany w katalogu konfiguracji (`C:\Users\gwladowska\.config\kilo\node_modules\@kilocode\plugin\dist\index.d.ts:249-258`). Kontrakt eksportu: `export default { id, server }` — `id` obowiązkowe dla pliku lokalnego.
- **Nie ma „exit code 2".** Hooki działają w tym samym procesie co agent: feedback wraca przez mutację `output.output`, a blokadą byłby `throw`. Reguła „exit 2 blokuje, inne kody logują" z treści zadania nie dotyczy Kilo.
- **Trzy narzędzia mutujące:** `edit` (`args.filePath`), `write` (`args.filePath`, obejmuje nowe pliki), `apply_patch` (`args.patchText`, N plików; ścieżki wygodniej w `output.metadata.files[].filePath`). Nie ma `multiedit`.
- **Koszty zmierzone w tym repo** (Windows 11, PowerShell 5.1, Node v24.18.0, ESLint 9.39.4):
  - `npx eslint <1 plik>`: 9,9 s — z tego ~4 s to resolver npx.
  - `node node_modules\eslint\bin\eslint.js <1 plik>`: **5,4–6,0 s** (najtańsze wejście; `node_modules\.bin\eslint.cmd` ~5,6–5,9 s).
  - **1 wywołanie na 5 plików: 6,2–6,6 s** vs 5 osobnych wywołań: 29–32 s — dodatkowe pliki są niemal darmowe, bo koszt to budowa programu TS (`projectService: true`, `eslint.config.js:22`).
  - `tsc --noEmit` ~8 s (53 pliki `.ts/.tsx`, **0 `.astro`**); `astro check` ~23–24 s (82 pliki, bez zawężania do pliku — argument jest po cichu ignorowany).
  - Kody wyjścia ESLint: 0 = czysto, 1 = błędy lintu, 2 = ESLint nie wystartował (np. nieistniejący plik).
- **Zachowania brzegowe potwierdzone:** plik jawnie ignorowany (`src/lib/database.types.ts`) → exit 0 + ostrzeżenie „File ignored…”, a miks nadal lintuje zdrowy plik; pliki `.astro` produkują na stderr linię o `astro-eslint-parser`/`projectService` (szum, nie wynik); absolutne ścieżki Windows działają identycznie jak względne.
- **Bun shell:** interpolacja tablicy `${files}` rozwija się na osobne argumenty i jest domyślnie escapowana (ścieżki ze spacjami bezpieczne); `.quiet()` jest konieczne, by nie wypisywać ESLint na terminal użytkownika; `.text()` gubi stderr, więc trzeba `.nothrow().quiet()` i czytać `stdout`+`stderr`.
- **Pre-commit i CI już działają i nie ruszamy ich:** `.husky/pre-commit:1-2` (`npx lint-staged`, `npm run check`), `lint-staged` bez testów i bez `astro check` (`package.json:67-74`), bramki CI `ci` + `integration` wymuszane rulesetem.
- **Krytyczne odkrycie repozytoryjne:** `.gitignore:2` to `*.kilo`, co dopasowuje **sam katalog `.kilo`** — `git ls-files .kilo` jest puste, nieśledzone są dziś `.kilo/kilo.json`, `.kilo/rules/**` i `agent-manager.json`. Plugin zapisany do `.kilo/plugin/` **nie trafi do commita** bez korekty `.gitignore` (decyzja: śledzimy wyłącznie `.kilo/plugin/`).
- **Historycznie:** `test-plan.md:95` nazywa bramkę „hook po zapisie pliku / lokalnie (pętla agenta)", ale realizacją jest hook commitowy — ten change domyka tę lukę nazewniczą i funkcjonalną; zakaz nowych zależności i `pre-push` z `context/archive/2026-09-14-testing-quality-gates/plan.md:59` obowiązuje.

## Desired End State

Agent pracujący w tym repo po każdej edycji pliku widzi w wyniku narzędzia krótki blok `[eslint exit N]` z realnymi błędami lintu dla plików, które przed chwilą zmienił (jeden blok na wywołanie, także dla `apply_patch` z wieloma plikami), bez mutowania plików i bez wypisywania czegokolwiek na terminal użytkownika. Drugi hook — typecheck — istnieje w tym samym mechanizmie, jest domyślnie wyłączony i włącza się wyłącznie przez `KILO_QUALITY_TYPECHECK=tsc|check`. Oba pliki pluginu są śledzone w repo, a `AGENTS.md` i `context/foundation/test-plan.md` opisują je tak, by nowy agent (i człowiek) wiedział, że to warstwa feedbacku, a nie bramka.

Weryfikacja: świeża sesja Kilo → edycja pliku z celowym błędem lintu → blok `[eslint exit 1]` w wyniku narzędzia; edycja czystego pliku → cisza; `KILO_QUALITY_TYPECHECK=check` → błąd typu w pliku `.astro` też się raportuje.

### Key Discoveries:

- Najtańsze wejście to `node node_modules/eslint/bin/eslint.js` — omija ~4 s narzutu `npx` i ograniczenia argumentów batcha (`.cmd` odrzuca `" % & | < > ^`), bo `node.exe` to zwykły executable (pomiary: 5,4–6,0 s vs 9,9 s).
- Jedno wywołanie na wszystkie dotknięte pliki jest ~5× tańsze niż N wywołań (6,2 s vs 29–32 s dla 5 plików) — projekt hooka musi budować listę, nie pętlić.
- `apply_patch` może zawierać `*** Delete File:`; nieistniejący plik daje exit 2 („No files matching the pattern"), więc hook filtruje pliki po istnieniu, zanim zbuduje listę.
- `@kilocode/plugin` daje pluginowi `$` (Bun shell), `directory` i `worktree`; `process.env` jest dostępne w module pluginu, a hook `shell.env` służy do **wstrzykiwania** zmiennych, nie do czytania flagi.
- Jeden obiekt `Hooks` może mieć tylko jeden klucz `tool.execute.after` — „dwa hooki" znaczy dwa pliki pluginu, ładowane kolejno (kolejność: wewnętrzne → globalne → projektowe, sekwencyjnie).
- `.gitignore:2` (`*.kilo`) ignoruje całe `.kilo/`; git nie pozwala odzyskać pliku, jeśli wykluczony jest jego katalog nadrzędny, więc potrzebne jest `!.kilo/` przed `!.kilo/plugin/`.

## What We're NOT Doing

- Nie zmieniamy `.husky/pre-commit`, `lint-staged`, `ci.yml` ani rulesetu — bramki pozostają jak są (`context/archive/2026-09-14-testing-quality-gates/plan.md:59`).
- Nie dokładamy żadnych zależności npm ani nie tworzymy `.kilo/package.json`; pluginy są bezimportowe.
- Nie włączamy typechecku per-edit domyślnie (koszt ~8–23 s na edycję) — pozostaje za flagą, a arbitrem jest pre-commit.
- Nie dodajemy testów jednostkowych do hooka ani nie ruszamy `vitest.config.ts` (hook to narzędzie deweloperskie, nie kod aplikacji; `npm test` pozostaje bez zmian).
- Nie lintujemy per-edit testów integracyjnych, pgTAP ani builda — wymagają bazy/Dockera i nie pasują do pętli edycji.
- Nie wciągamy całego `.kilo/` do repo (kilo.json z MCP, `rules/`, `agent-manager.json` zostają lokalne).
- Nie ruszamy `§3` w `test-plan.md` (to domena orchestratora `/10x-test-plan`).
- Nie dodajemy `--fix` — hook nigdy nie mutuje pliku.

## Implementation Approach

Dwa niezależne pluginy auto-odkrywane z `.kilo/plugin/`, każdy z jednym hookiem `tool.execute.after`:

1. `lint-on-edit.ts` — bezwarunkowy. Mapuje wywołanie narzędzia na listę plików, filtruje je (istnieją, leżą w `worktree`, mają lintowalne rozszerzenie, bez duplikatów, limit 10), uruchamia **jedno** wywołanie ESLint przez `node …/eslint/bin/eslint.js`, czyści szum parsera `.astro`, dopisuje `[eslint exit N]` + tekst do `output.output`. Całe ciało w `try/catch` — hook nigdy nie rzuca, więc nie może zablokować edycji.
2. `typecheck-on-edit.ts` — ten sam hook, ale wczesny `return`, gdy `KILO_QUALITY_TYPECHECK` nie jest równe `tsc` ani `check`. `tsc` → `node …/typescript/bin/tsc --noEmit -p tsconfig.json`; `check` → `node …/astro/astro.js check`. Raport przycinany do ogona (ostatnie linie), żeby nie zalać kontekstu.

Oba pliki są śledzone w repo dzięki chirurgicznej korekcie `.gitignore` (odsłania wyłącznie `.kilo/plugin/`). Dokumentacja (`AGENTS.md`, `test-plan.md`) opisuje warstwę i flagę tak, by nie sugerować, że to bramka.

## Phase 1: Hook lintu po edycji

### Overview

Dostarczyć działający, śledzony plugin, który po każdej edycji/write/patchu agenta uruchamia raz ESLint nad dotkniętymi plikami i dopisuje raport do wyniku narzędzia — bez mutowania plików i bez hałasu na terminalu.

### Changes Required:

#### 1. Odsłonięcie katalogu pluginu w `.gitignore`

**File**: `.gitignore`

**Intent**: `*.kilo` (linia 2) wyklucza cały katalog `.kilo/`, więc nowy plugin nigdy nie trafiłby do repo. Odsłaniamy wyłącznie `.kilo/plugin/`, zostawiając lokalnymi `kilo.json` (konfiguracja MCP), `rules/` i `agent-manager.json`.

**Contract**: Po linii `*.kilo` dochodzą trzy reguły, w tej kolejności (kolejność jest nośna — git nie odzyska pliku, jeśli wykluczony jest katalog nadrzędny): `!.kilo/`, następnie `.kilo/*`, następnie `!.kilo/plugin/`. Efekt do potwierdzenia komendami: `git check-ignore -v .kilo/plugin/lint-on-edit.ts` nie zwraca dopasowania, `git check-ignore -v .kilo/kilo.json` nadal zwraca `*.kilo` (lub `.kilo/*`), a `git status --porcelain` pokazuje jako nowe wyłącznie ścieżki pod `.kilo/plugin/`.

#### 2. Plugin lintu

**File**: `.kilo/plugin/lint-on-edit.ts` (nowy)

**Intent**: Natywny hook Kilo, który daje agentowi natychmiastowy feedback z ESLint po edycji pliku. Bez importów (Bun transpiluje `.ts` w locie, a brak importów = brak potrzeby `.kilo/package.json` i brak nowych zależności).

**Contract**: `export default { id: "lint-on-edit", server: async ({ $, directory, worktree }) => ({ "tool.execute.after": … }) }`. Ciało hooka:

- Zbierz pliki: `edit`/`write` → `[input.args.filePath]`; `apply_patch` → najpierw `output.metadata?.files?.[].filePath`, a gdy brak — parsuj `*** (Add|Update|Delete) File:` z `input.args.patchText`.
- Odfiltruj: plik musi istnieć na dysku, leżeć pod `worktree`, mieć rozszerzenie `.{ts,tsx,js,jsx,mjs,cjs,astro}`; usuń duplikaty; utnij do 10.
- Puste → `return`. Nie mutuj niczego poza `output.output`.
- Jedno wywołanie, wejście przez `node` (nie `npx`, nie `.cmd`):

```ts
const eslint = `${directory}/node_modules/eslint/bin/eslint.js`;
const res = await $`node ${eslint} --no-color --no-warn-ignored ${files}`
  .cwd(directory)
  .nothrow() // exit 1/2 nie rzuca — kody raportujemy
  .quiet(); // nic nie idzie na terminal użytkownika
```

- Zlep `res.stdout` + `res.stderr`, wyrzuć linię szumu z `astro-eslint-parser`/`projectService`, przytrimuj; jeśli exit ≠ 0 lub tekst niepusty — dopisz `\n\n[eslint exit ${res.exitCode}]\n${tekst}`.
- Całość w `try/catch`; w razie błędu hook nic nie dopisuje (nigdy nie rzuca — nie może zablokować edycji).

### Success Criteria:

#### Automated Verification:

- `.gitignore` odsłania tylko plugin: `git check-ignore -v .kilo/plugin/lint-on-edit.ts` bez trafienia; `git check-ignore -v .kilo/kilo.json` nadal ignoruje; `git status --porcelain` nie pokazuje nic spoza `.kilo/plugin/`
- Plik pluginu jest śledzony: `git ls-files .kilo/plugin` zwraca `lint-on-edit.ts`
- Kształt modułu: import pliku zwraca `default.id === "lint-on-edit"` i `typeof default.server === "function"` (Node 24 potrafi importować `.ts` przez type-stripping; jeśli import zawiedzie, potwierdzić kształt statycznie: brak `import `, obecność `export default {`)
- Komenda ESLint z hooka działa na realnych plikach: `node node_modules\eslint\bin\eslint.js --no-color --no-warn-ignored src/lib/week.ts src/lib/format.ts` → exit 0, ~6 s
- Statyczny dowód higieny: plik nie zawiera `import `, `--fix` ani `npx`; zawiera `.nothrow()`, `.quiet()` i `try`

#### Manual Verification:

Scenariusze startują ze świeżej sesji Kilo (pluginy ładują się przy starcie; po dodaniu pliku trzeba zrestartować sesję).

- **Świeża sesja, plik z błędem:** poproś agenta o edycję `src/lib/format.ts` tak, by zostawić nieużywaną zmienną (np. dodanie `const unusedHelper = 1;`). Oczekiwane: wynik narzędzia `edit` kończy się blokiem `[eslint exit 1]` z regułą `@typescript-eslint/no-unused-vars` i ścieżką pliku; plik na dysku **nie** został zmieniony przez hook (brak `--fix`).
- **Świeża sesja, plik czysty:** poproś o edycję, która nie łamie reguł (np. dopisanie komentarza). Oczekiwane: brak bloku `[eslint …]` — hook milczy.
- **`apply_patch` wieloplikowy:** zleć zmianę dotykającą ≥2 plików, w tym jedno usunięcie. Oczekiwane: dokładnie **jeden** blok z jednym kodem wyjścia, bez `No files matching the pattern` dla usuniętego pliku.
- **Plik poza repo:** poproś o edycję pliku w katalogu tymczasowym poza `worktree`. Oczekiwane: hook milczy.
- **Terminal:** w trakcie żadnego z powyższych scenariuszy wyjście ESLint nie pojawia się bezpośrednio w terminalu — widać je tylko w wyniku narzędzia (dowód, że `.quiet()` działa).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Drugi hook — typecheck za flagą

### Overview

Dodać drugi, niezależny plugin realizujący „drugi hook z typecheckiem": domyślnie nieaktywny (koszt zerowy), włączany zmienną `KILO_QUALITY_TYPECHECK`, z dwoma trybami — tanim `tsc` i pełnym `check`.

### Changes Required:

#### 1. Plugin typechecku

**File**: `.kilo/plugin/typecheck-on-edit.ts` (nowy)

**Intent**: Dać możliwość włączenia typechecku bezpośrednio w pętli agenta (przez kogoś, kto świadomie akceptuje koszt), nie zmieniając faktu, że domyślną bramką pozostaje pre-commit. Bez importów.

**Contract**: `export default { id: "typecheck-on-edit", server: async ({ $, directory }) => ({ "tool.execute.after": … }) }`. Ciało hooka:

- Wczesny `return`, gdy `input.tool` nie jest jednym z `edit`/`write`/`apply_patch`, albo gdy tryb jest nieznany. Tryb czytaj jako `String((globalThis as any).process?.env?.KILO_QUALITY_TYPECHECK ?? "")`; akceptowane wartości to `tsc` i `check`, wszystko inne = wyłączony.
- Tryb `tsc`: `node ${directory}/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`.
- Tryb `check`: `node ${directory}/node_modules/astro/astro.js check`.
- Wywołanie z `.cwd(directory).nothrow().quiet()`; zlep `stdout`+`stderr`, utnij do ogona (np. ostatnie 40 linii / ~4 kB), a gdy wyjście puste — zostaw tylko kod.
- Dopisz `\n\n[typecheck:${tryb} exit ${res.exitCode}]\n${ogon}` do `output.output`.
- Całość w `try/catch` — hook nigdy nie rzuca.

### Success Criteria:

#### Automated Verification:

- Plik istnieje i jest śledzony: `git ls-files .kilo/plugin` zwraca oba pluginy
- Kształt modułu: `default.id === "typecheck-on-edit"` i `typeof default.server === "function"` (lub statycznie: brak `import `, obecność `export default {`)
- Bez flagi hook nic nie uruchamia: statyczny dowód, że gałąź `return` poprzedza każde wywołanie `$` (czytelne w kodzie), oraz brak nowego procesu przy edycji w scenariuszu manualnym
- Tryb `tsc` na repo: `node node_modules\typescript\bin\tsc --noEmit -p tsconfig.json` → exit 0, ~8 s
- Tryb `check` na repo: `node node_modules\astro\astro.js check` → exit 0, ~23 s (istniejące hinty nie blokują)
- Statyczny dowód higieny: brak `import `, brak `--fix`, obecność `.nothrow()`, `.quiet()`, `KILO_QUALITY_TYPECHECK` i `try`

#### Manual Verification:

- **Bez flagi:** świeża sesja Kilo bez `KILO_QUALITY_TYPECHECK`, edycja pliku — brak bloku `[typecheck …]` i brak odczuwalnego spowolnienia (porównaj czas edycji z sesją, w której plugin istnieje, ale flaga jest pusta).
- **Tryb `tsc`:** sesja z `$env:KILO_QUALITY_TYPECHECK="tsc"`, edycja pliku `.ts`, w którym zostawiono błąd typu (np. przypisanie `string` do `number`). Oczekiwane: `[typecheck:tsc exit 1]` z komunikatem o typie w wyniku narzędzia; zmierz i zapisz wall-clock edycji.
- **Tryb `check` — dowód przewagi:** sesja z `$env:KILO_QUALITY_TYPECHECK="check"`, edycja pliku `.astro` z błędem typu w frontmatterze. Oczekiwane: `[typecheck:check exit 1]` z raportem — scenariusz, którego tryb `tsc` **nie** złapie (nie widzi `.astro`); to jest uzasadnienie istnienia obu trybów.
- **Koszt zapisany:** oba zmierzone czasy (edycja z `tsc`, edycja z `check`) trafiają do Fazy 3 jako dane do dokumentacji.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Dokumentacja i domknięcie

### Overview

Uwiecznić kontrakt nowej warstwy w plikach, które czyta agent i człowiek — tak, by nikt nie pomylił feedbacku per-edit z bramką, i by wiedział, jak włączyć typecheck oraz jak dodać kolejne sprawdzenie.

### Changes Required:

#### 1. Instrukcja dla agenta

**File**: `AGENTS.md`

**Intent**: Dopisać do istniejącej sekcji Commands (lub bezpośrednio po niej) krótki blok o hookach pętli agenta: że są dwa pliki w `.kilo/plugin/`, że są auto-odkrywane przy starcie Kilo (bez wpisu w `kilo.json`), że feedback jest dopisywany do wyniku narzędzia i **nigdy nie blokuje**, że typecheck włącza się `KILO_QUALITY_TYPECHECK=tsc|check` (z kosztem ~8 s / ~23 s na edycję), a twarde bramki pozostają w pre-commicie i CI. Odwołania do plików przez `@`-ścieżki, zgodnie z konwencją pliku.

**Contract**: 4–6 linii w istniejącej sekcji; bez nowego dużego nagłówka. Musi zawierać dosłownie nazwę zmiennej `KILO_QUALITY_TYPECHECK` i ścieżki `.kilo/plugin/lint-on-edit.ts` oraz `.kilo/plugin/typecheck-on-edit.ts`.

#### 2. Rozróżnienie warstw w tabeli bramek

**File**: `context/foundation/test-plan.md` (§5)

**Intent**: Wiersz `hook po zapisie pliku` (linia 95) opisuje dziś „pętlę agenta", a realizacją jest hook commitowy — to myli. Rozdzielić jawnie: osobny wiersz dla **hooka pętli agenta (per-edit, lokalnie, zalecany, nieblokujący)** i pozostawiony wiersz dla **hooka commitowego (husky: `lint-staged` + `npm run check`, lokalnie, zalecany)**.

**Contract**: Edycja/rozszerzenie tabeli §5 (dwa wiersze zamiast jednego; istniejące „Co łapie" doprecyzowane). **Nie** zmieniać §3 ani statusów bramek wymaganych w CI.

#### 3. Cookbook: jak dodać/rozszerzyć hook pętli agenta

**File**: `context/foundation/test-plan.md` (§6)

**Intent**: Nowa podsekcja `### 6.7 Adding / extending an agent-loop hook` — gdzie mieszka plugin, czym jest `tool.execute.after`, jak mapować narzędzia na pliki, jak przetestować scenariuszem (edycja z błędem → blok w wyniku narzędzia), jak włączyć typecheck.

**Contract**: Nowy nagłówek po `### 6.6`, w formacie pozostałych podsekcji (Gdzie / Jak / Uruchomienie / Wzorzec referencyjny / Czego nie robić).

#### 4. Wpis w rejestrze świeżości

**File**: `context/foundation/test-plan.md` (§8)

**Intent**: Jedna linia dla tej zmiany z datą 2026-09-14: dwa pluginy, flaga typechecku, zmierzone koszty, decyzja że bramką pozostaje pre-commit.

**Contract**: Dopisanie jednej linii do listy §8 w istniejącym formacie; bez zmian w sekcji refresh.

#### 5. Lekcja o ignorowaniu `.kilo/`

**File**: `context/foundation/lessons.md`

**Intent**: Zarejestrować nieoczywisty trap: `*.kilo` w `.gitignore` dopasowuje sam katalog `.kilo`, więc cała konfiguracja Kilo (w tym plugin) jest nieśledzona, a git nie odzyska pliku z wykluczonego katalogu bez `!.kilo/` przed `!.kilo/plugin/`.

**Contract**: Jeden append w istniejącym formacie Context / Problem / Rule / Applies to; `Applies to: implement, impl-review`.

### Success Criteria:

#### Automated Verification:

- `Select-String -Path AGENTS.md -Pattern "KILO_QUALITY_TYPECHECK"` trafia; plik wymienia oba pliki pluginów
- `test-plan.md` §5 ma osobne wiersze dla warstwy per-edit i commit-time (grep na „pętla agenta" trafia w wiersz per-edit)
- `test-plan.md` zawiera nagłówek `### 6.7`
- `test-plan.md` §8 ma linię datowaną 2026-09-14 opisującą tę zmianę
- Sekcja §3 nietknięta: `git diff` na `test-plan.md` nie pokazuje zmian w wierszach tabeli §3 (linie ~49-58)
- `lessons.md` zawiera nowy wpis (nagłówek `## ` z regułą o `.kilo`/`*.kilo`)

#### Manual Verification:

- Świeży odczyt `AGENTS.md`: czy agent, który nigdy nie widział tej zmiany, wie (a) że hooki istnieją, (b) jak włączyć typecheck, (c) że nie blokują i że bramką jest pre-commit?
- Świeży odczyt `test-plan.md` §5: czy da się jednoznacznie odpowiedzieć, który hook działa per-edit, a który przy commicie?
- Żadne zdanie w dokumentacji nie sugeruje, że typecheck działa per-edit domyślnie.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- **Brak nowych.** Hook jest narzędziem deweloperskim, nie kodem aplikacji; `vitest.config.ts` obejmuje `src/**/*.test.ts`, a rozszerzanie runnera o `.kilo/` byłoby nową konfiguracją bez realnej wartości. Weryfikacją są: (a) offline import kształtu modułu, (b) bezpośrednie uruchomienie komend, które hook buduje, (c) scenariusze manualne.
- `npm test` pozostaje nietknięty i zielony (99 przypadków) — zmiana nie dotyka `src/`.

### Integration Tests:

- **Brak.** Hook nie dotyka bazy ani tras API; testy integracyjne wymagają lokalnego Supabase i nie mają tu zastosowania.

### Manual Testing Steps:

1. **Start świeżej sesji Kilo** po dodaniu plików pluginów (ładowanie następuje przy starcie — bez restartu hook nie istnieje).
2. **Plik z błędem lintu:** poproś agenta o edycję `src/lib/format.ts` dodającą nieużywaną zmienną. Oczekiwane: w wyniku narzędzia `edit` blok `[eslint exit 1]` z `@typescript-eslint/no-unused-vars`; `git diff src/lib/format.ts` pokazuje wyłącznie zmianę zleconą agentowi (hook nic nie dopisał do pliku).
3. **Plik czysty:** poproś o edycję, która nie łamie reguł. Oczekiwane: brak bloku `[eslint …]`.
4. **`apply_patch` wieloplikowy z usunięciem:** zleć patch na ≥2 plikach plus `*** Delete File:`. Oczekiwane: jeden blok raportu, brak błędu o niepasującym wzorcu pliku.
5. **Plik poza repo:** zleć edycję w katalogu tymczasowym poza `worktree`. Oczekiwane: brak bloku.
6. **Terminal:** w trakcie kroków 2–5 wyjście ESLint nie pojawia się w terminalu — tylko w wyniku narzędzia.
7. **Typecheck bez flagi:** sesja bez `KILO_QUALITY_TYPECHECK`, edycja pliku → brak bloku `[typecheck …]`.
8. **Typecheck `tsc`:** `$env:KILO_QUALITY_TYPECHECK="tsc"`; edycja `.ts` z błędem typu → `[typecheck:tsc exit 1]`; zapisz czas edycji.
9. **Typecheck `check`:** `$env:KILO_QUALITY_TYPECHECK="check"`; edycja `.astro` z błędem typu → `[typecheck:check exit 1]`; zapisz czas edycji (dowód, że tryb `tsc` by tego nie złapał).
10. **Repro z klona:** `git ls-files .kilo/plugin` po commicie zwraca oba pliki — hook jest odtwarzalny na innej maszynie, a `git status` nie pokazuje `.kilo/kilo.json` ani `agent-manager.json`.

## Performance Considerations

- **Lint per-edit:** ~5,5–6,5 s na jedno wywołanie narzędzia, niezależnie od tego, czy dotknęło 1 czy 10 plików (jedno wywołanie, nie pętla). Ominięcie `npx` oszczędza ~4 s na każdym wywołaniu.
- **Skala w jednej turze agenta:** tura z 10 edycjami ≈ +55–65 s. To cena feedbacku, którego agent inaczej nie dostaje — akceptowana świadomie; przy dalszym wzroście projektu punktem odcięcia jest ograniczenie listy plików albo przejście na lint wyłącznie w pre-commicie.
- **Typecheck:** domyślnie 0 s. `tsc` ~8 s (bez pokrycia `.astro`), `check` ~23–24 s (pełne pokrycie, bez zawężania do pliku). Dlatego oba są opt-in.
- **Pre-commit bez zmian:** `lint-staged` (ESLint+Prettier na staged) + `npm run check` ~21 s raz na commit — warstwa „wolna" zostaje tam, gdzie operuje na staged files i obejmuje też ręczne edycje.
- **Ryzyko:** jeśli edycja dotknie pliku, którego ESLint nie potrafi przetworzyć (np. składnia eksperymentalna), hook zaraportuje błąd parsera, ale nie zablokuje pracy (try/catch + brak `throw`).

## Migration Notes

- **Rollback całości:** usunięcie obu plików z `.kilo/plugin/`, cofnięcie hunka w `.gitignore` i hunków dokumentacyjnych — `git revert` commita wystarcza; brak skutków dla aplikacji, produkcji i CI.
- **Rollback samego typechecku:** nic nie trzeba zmieniać w kodzie — wystarczy nieustawiona/pusta `KILO_QUALITY_TYPECHECK` (flaga jest wyłącznie środowiskowa).
- **Wymagany restart:** pluginy ładują się przy starcie Kilo; po dodaniu/usunięciu pliku plugin trzeba zrestartować sesję, inaczej zmiana nie działa.
- **Efekt uboczny startu Kilo:** przy katalogu `.kilo/plugin/` Kilo tworzy `.kilo/package.json`, `node_modules` i lockfile oraz może uruchomić `bun install`. Te artefakty pozostają ignorowane (`.kilo/*` z nowej reguły + `.kilo/.gitignore`), ale pierwszy start po dodaniu pluginu może wymagać sieci.
- **Kolejność przy cofaniu `.gitignore`:** najpierw usunąć pliki pluginów, potem reguły `!.kilo/ …` — inaczej katalog `.kilo/` zostaje odsłonięty i `git status` pokaże hałas z lokalnej konfiguracji.

## References

- Related research: [`context/changes/agent-per-edit-hooks/research.md`](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/context/changes/agent-per-edit-hooks/research.md)
- Zmiana bazowa (pre-commit i ruleset): [`context/archive/2026-09-14-testing-quality-gates/plan.md:170-221`](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/context/archive/2026-09-14-testing-quality-gates/plan.md#L170-L221)
- Wiersz bramki „hook po zapisie pliku": [`context/foundation/test-plan.md:95`](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/context/foundation/test-plan.md#L95)
- Tabela bramek §5: [`context/foundation/test-plan.md:87-96`](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/context/foundation/test-plan.md#L87-L96)
- Cookbook §6: [`context/foundation/test-plan.md:100-152`](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/context/foundation/test-plan.md#L100-L152)
- Lekcje o `astro check` i hookach: [`context/foundation/lessons.md:53-58`](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/context/foundation/lessons.md#L53-L58), [`context/foundation/lessons.md:88-92`](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/context/foundation/lessons.md#L88-L92)
- Konfiguracja ESLint (koszt `projectService`): [`eslint.config.js:20-24`](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/eslint.config.js#L20-L24)
- Ignorowanie `.kilo/`: [`.gitignore:1-2`](https://github.com/GWladowska/JanuszexGrafikPro/blob/6fc4d086c3122dcc672ebc5538709218c48af315/.gitignore#L1-L2)
- Interfejs hooków Kilo: `C:\Users\gwladowska\.config\kilo\node_modules\@kilocode\plugin\dist\index.d.ts:249-258`
- Dokumentacja pluginów Kilo: https://kilo.ai/docs/automate/extending/plugins

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Hook lintu po edycji

#### Automated

- [x] 1.1 `.gitignore` odsłania wyłącznie `.kilo/plugin/` — `git check-ignore`/`git status` potwierdzają — ff29866
- [x] 1.2 `git ls-files .kilo/plugin` zwraca `lint-on-edit.ts` — ff29866
- [x] 1.3 Kształt modułu pluginu: `id === "lint-on-edit"`, `default.server` to funkcja — ff29866
- [x] 1.4 Komenda ESLint z hooka przechodzi na dwóch realnych plikach (exit 0, ~6 s) — ff29866
- [x] 1.5 Higiena statyczna: brak `import `, brak `--fix`/`npx`, obecność `.nothrow()`, `.quiet()`, `try` — ff29866

#### Manual

- [x] 1.6 Świeża sesja: edycja pliku z błędem lintu → `[eslint exit 1]` w wyniku narzędzia, plik nietknięty — ff29866
- [x] 1.7 Świeża sesja: edycja czystego pliku → brak bloku ESLint — ff29866
- [x] 1.8 `apply_patch` na ≥2 plikach z usunięciem → jeden raport, bez exit 2 na usuniętym pliku — ff29866
- [x] 1.9 Edycja pliku poza `worktree` → hook milczy — ff29866
- [x] 1.10 Wyjście ESLint nie pojawia się w terminalu (dowód `.quiet()`) — ff29866

### Phase 2: Drugi hook — typecheck za flagą

#### Automated

- [x] 2.1 `git ls-files .kilo/plugin` zwraca oba pluginy
- [x] 2.2 Kształt modułu typechecku: `id === "typecheck-on-edit"`, `default.server` to funkcja
- [x] 2.3 Statyczny dowód: gałąź `return` poprzedza każde wywołanie `$` (bez flagi nic się nie uruchamia)
- [x] 2.4 Tryb `tsc`: `node node_modules\typescript\bin\tsc --noEmit -p tsconfig.json` → exit 0, ~8 s
- [x] 2.5 Tryb `check`: `node node_modules\astro\astro.js check` → exit 0, ~23 s
- [x] 2.6 Higiena statyczna: brak `import `, brak `--fix`, obecność `.nothrow()`, `.quiet()`, `KILO_QUALITY_TYPECHECK`, `try`

#### Manual

- [x] 2.7 Sesja bez flagi: brak bloku `[typecheck …]` i brak odczuwalnego spowolnienia
- [x] 2.8 Sesja z `=tsc`: błąd typu w pliku `.ts` → `[typecheck:tsc exit 1]`; czas edycji zmierzony
- [x] 2.9 Sesja z `=check`: błąd typu w pliku `.astro` → `[typecheck:check exit 1]`; czas edycji zmierzony
- [x] 2.10 Oba zmierzone czasy przekazane do Fazy 3 jako dane dokumentacyjne

### Phase 3: Dokumentacja i domknięcie

#### Automated

- [ ] 3.1 `AGENTS.md` zawiera `KILO_QUALITY_TYPECHECK` i ścieżki obu pluginów
- [ ] 3.2 `test-plan.md` §5 rozróżnia wiersz per-edit i commit-time
- [ ] 3.3 `test-plan.md` zawiera nagłówek `### 6.7`
- [ ] 3.4 `test-plan.md` §8 ma wpis datowany 2026-09-14 dla tej zmiany
- [ ] 3.5 Sekcja §3 `test-plan.md` nietknięta (`git diff`)
- [ ] 3.6 `lessons.md` zawiera nowy wpis o `*.kilo` / odsłanianiu `.kilo/plugin/`

#### Manual

- [ ] 3.7 Świeży odczyt `AGENTS.md`: agent wie o hookach, fladze, braku blokady i o tym, że bramką jest pre-commit
- [ ] 3.8 Świeży odczyt `test-plan.md` §5: jednoznaczne rozgraniczenie per-edit vs commit-time
