# Bramki jakości w automacie — plan implementacji

## Overview

Domknięcie Etapu 4 planu testów: sprawić, żeby czerwona zmiana nie trafiała na produkcję. Wszystkie sześć bramek (lint, `astro check`, unit, integration, pgTAP, build) **już działa w CI** — brakuje warstwy wymuszenia, determinizmu i lokalnej pętli. Zmiana robi cztery rzeczy: (1) ruleset `Protect` na `master` wymaga obu statusów CI (`ci` **i** `integration`), (2) `ci.yml` dostaje minimalne uprawnienia i przypiętą wersję Supabase CLI, (3) lokalny hook commitów zaczyna realnie działać i sprawdza typy, (4) dokumentacja przestaje mówić nieprawdę o bramkach.

Zmiana nie dotyka kodu aplikacji ani testów — wszystkie suites już istnieją i są zielone.

## Current State Analysis

- **Sześć bramek jest wpięte w CI.** Job `ci`: `npx astro sync` → `npm run lint` → `npm run check` → `npm test` → `npm run build` (`.github/workflows/ci.yml:19-26`). Job `integration`: `supabase start` → `supabase db reset` → `supabase test db` → `npm run test:integration` (`.github/workflows/ci.yml:37-49`). Joby biegną **równolegle** (brak `needs:`).
- **Ruleset wymaga tylko połowy.** Aktywny ruleset `Protect` (id `22480162`) na `refs/heads/master` ma `required_status_checks = [{context: "ci"}]` — job `integration` (pgTAP + 24 testy integracyjne, czyli ryzyka #4, #5 i część #1/#3/#6) nie jest wymagany. `strict_required_status_checks_policy: false`.
- **Obejście admina zostaje** (`bypass_actors: [{actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always"}]`, `current_user_can_bypass: "always"`) — decyzja użytkownika. To znaczy, że dla właściciela repo bramka jest **dobrowolna**; twardo blokuje wyłącznie aktorów bez roli admin. Ryzyko rezydualne jest świadome i musi być opisane w dokumentacji, nie ukryte.
- **Publikacja nie konsultuje się z CI.** Produkcję publikuje Cloudflare **Workers Builds** po pushu na `master` (konfiguracja w panelu Cloudflare, poza repo — `wrangler.jsonc` nie ma sekcji builds/deploy). Workers Builds nie czyta wyników GitHub Actions, więc jedynym realnym miejscem zatrzymania zmiany jest GitHub (`context/deployment/deploy-plan.md:131`, `context/foundation/test-plan.md:97`).
- **Nazwa joba jest kontraktem.** `required_status_checks.context` dopasowuje **nazwę check runa**, czyli dla zwykłego workflow nazwę joba (`ci`, `integration`) — bez `name:`. Zmiana nazwy joba cicho rozbraja bramkę.
- **Hook lokalny nie działa i nie ma go jak uruchomić.** `package.json` nie ma skryptu `prepare`, nie ma `.husky/_`, `core.hooksPath` nie jest ustawiony nigdzie (local/global/system) — jedyny plik `.husky/pre-commit` (`npx lint-staged`) nigdy się nie odpala.
- **Pułapka CRLF ↔ WSL.** `core.autocrlf=true` jest ustawiony **globalnie**, repo nie ma `.gitattributes`, a `.husky/pre-commit` ma w katalogu roboczym CRLF przy LF w indeksie (`git ls-files --eol` → `i/lf w/crlf`). Husky uruchamia hook przez `sh -e`, więc commit z WSL (dash) kończy się `exit 127` — a commit z PowerShella przechodzi. Bez poprawki hook działa połowicznie.
- **Martwa referencja sekretów.** Krok `build` w CI dostaje `secrets.SUPABASE_URL/KEY` (`.github/workflows/ci.yml:24-26`), ale repo nie ma żadnych sekretów (`gh secret list` puste), a `astro:env` deklaruje oba pola jako `optional: true` (`astro.config.mjs:21-26`). Wszystkie strony są renderowane na żądanie (brak `prerender`), a `@astrojs/cloudflare` v13 czyta te wartości w **runtime** z bindingów Workera — więc `env` w kroku build nie robi nic.
- **Ograniczenie zakresu (twarde):** wszystkie zmiany są **repo-scoped**. Zero `git config --global`, zero globalnego `.gitattributes`, zero rulesetów organizacyjnych (repo jest prywatnego właściciela, nie organizacji), zero wpływu na inne repozytoria.
- **Odłożone z Etapów 1–3:** wymuszenie bramek jawnie odłożono do Etapu 4 (`archive/2026-09-14-testing-core-logic/plan.md:76-77,189`, `plan-brief.md:96-97`; `archive/2026-09-14-testing-server-side-rules/plan.md:471-473`). Etap 3 nie przypiął wersji CLI (`version: latest`).

## Desired End State

Po tej zmianie:

1. **Merge do `master` wymaga zielonych `ci` i `integration`** — dla każdego, kto nie ma roli admin. PR pokazuje oba checki; jeśli którykolwiek jest czerwony, scalenie jest zablokowane.
2. **Obejście admina jest jawnym, udokumentowanym wyjątkiem** — właściciel repo nadal może je ominąć, ale wie o tym z dokumentacji, a nie z cichego zachowania.
3. **Konfiguracja rulesetu jest odtwarzalna** — pełny docelowy payload leży w repo; można go zastosować jedną komendą i cofnąć przez `git checkout` + PUT.
4. **CI jest deterministyczne i minimalnie uprzywilejowane** — przypięta wersja Supabase CLI (zgodna z lockfilem), `permissions: contents: read`, brak martwej referencji sekretów.
5. **Commit lokalnie sprawdza typy** — hook realnie się uruchamia w tym klonie, przechodzi przez `eslint --fix` + `prettier` + `astro check` i działa identycznie z PowerShella i z WSL.
6. **Dokumentacja mówi prawdę**: `AGENTS.md`, `test-plan.md` (§5, §8) i `deploy-plan.md` opisują faktyczny stan bramek, wraz z zastrzeżeniem o obejściu admina.

### Weryfikacja stanu docelowego

- `gh api repos/GWladowska/JanuszexGrafikPro/rulesets/22480162` pokazuje w wymaganych kontekstach `ci` i `integration`, a `bypass_actors` oraz `conditions.ref_name.include` są nietknięte.
- Przykładowy PR pokazuje check runy `ci` i `integration` na tym samym commicie; oba kończą się `success`.
- `git ls-files --eol .husky/pre-commit` pokazuje `w/lf`.
- `git config --local --get core.hooksPath` zwraca `.husky/_`, a `git config --global --list` nie zawiera nic nowego.
- Commit z celowym błędem typów jest blokowany przez hook, z PowerShella i z WSL.

### Key Discoveries:

- Ruleset aktualizuje się **tylko** przez `PUT /repos/{owner}/{repo}/rulesets/{id}` (nie ma `PATCH`); pole jest opcjonalne, ale semantyka jest częściowo-zastępująca — dlatego wysyłamy **pełną docelową reprezentację**, żeby `bypass_actors` i `conditions` nie zniknęły.
- `gh` 2.100 na tej maszynie wywala się na złożonych filtrach `--jq` (np. zagnieżdżone `select(...)` + indeksowanie) — działają proste filtry i `ConvertFrom-Json`. Zweryfikowane komendy są w Fazie 1.
- Husky v9: instalatorem jest skrypt `prepare` o treści `husky`; tworzy `.husky/_/` (z własnym `.gitignore` zawierającym `*`) i ustawia **lokalne** `core.hooksPath=.husky/_`. Istniejąca treść `.husky/pre-commit` jest już poprawna dla v9 (bez shebanga).
- `@astrojs/check` **nie przyjmuje pozycyjnych argumentów** — nieznany argument jest po cichu ignorowany (`NodeModules/@astrojs/check` parser yargs bez pozycji). Nie wolno wrzucać `astro check` do `lint-staged`, bo lint-staged dokleja nazwy plików do komendy. Cały projekt: ~21 s, domyślnie blokuje tylko błędy (6 hintów nie blokuje).
- `supabase/setup-cli@v1` przyjmuje tylko `version` i `github-token`; `version-file` nie istnieje, a zakresy (`2.x`) nie działają. Wersja `2.117.0` = lockfile (`package-lock.json`) = aktualne stabilne wydanie; przypięcie CLI przypina też obrazy Dockera w CI (bo `supabase/config.toml` nie ma tagów obrazów, a `.temp/` jest gitignore'owane).

## What We're NOT Doing

- **Nie usuwamy obejścia admina** z rulesetu (świadoma decyzja użytkownika). Ryzyko rezydualne opisujemy w dokumentacji.
- **Nie włączamy** `strict_required_status_checks_policy`.
- **Nie dodajemy** do `ci.yml`: `concurrency`, `timeout-minutes`, uploadu artefaktów, `workflow_dispatch`.
- **Nie dodajemy** sekretów repo `SUPABASE_URL`/`SUPABASE_KEY` (usuwamy martwą referencję zamiast ją zasilać).
- **Nie zmieniamy globalnej konfiguracji gita** (`core.autocrlf` zostaje `true` globalnie), nie tworzymy globalnego `.gitattributes`, nie tworzymy rulesetów organizacyjnych, nie dotykamy innych repozytoriów ani ich ustawień.
- **Nie zmieniamy** `astro check --minimumFailingSeverity` — 6 istniejących hintów ma nie blokować commitów.
- **Nie zmieniamy** kodu aplikacji, migracji ani testów — żadna nowa bramka nie powstaje.
- **Nie ruszamy** konfiguracji Workers Builds w panelu Cloudflare.
- **Nie zmieniamy** commit-hooka w kierunku `pre-push` ani nie dodajemy nowych zależności poza tym, co już jest w `devDependencies` (husky/lint-staged są zainstalowane).

## Implementation Approach

Cztery fazy, w kolejności od najważniejszej (wymuszenie) przez determinizm CI i pętlę lokalną do dokumentacji. Faza 1 wykonuje mutację poza repo (ruleset) — dlatego najpierw zapisujemy stan „przed" i docelowy payload w repo, żeby zmiana była odtwarzalna i odwracalna. Faza 3 musi wprowadzić `.gitattributes` **razem** ze zmianą hooka, bo bez LF commit z WSL się wysypie.

Kolejność faz nie jest kosmetyczna: wymaganie `integration` (Faza 1) ma sens tylko wtedy, gdy ten job jest zielony na typowym PR-ze — a jest (Etap 2 i 3 domknęły jego zawartość).

## Critical Implementation Details

- **PUT na ruleset wysyła pełną reprezentację.** Payload docelowy musi zawierać wszystkie cztery reguły (`deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`), `conditions.ref_name.include: ["refs/heads/master"]` oraz `bypass_actors` przepisane **bez zmian z odczytu** (`actor_id: 5`, `actor_type: "RepositoryRole"`, `bypass_mode: "always"`). Identyfikator roli admina (`5`) celowo nie jest zgadywany z pamięci — bierzemy go z GET-a sprzed zmiany.
- **`integration_id: 15368`** (GitHub Actions) wpisujemy jawnie przy obu kontekstach, tak jak jest przy istniejącym `ci`. Pominięcie pola oznaczałoby „dowolne źródło"; błędna wartość zablokowałaby merge komunikatem o niespełnionym checku.
- **Kolejność w Fazie 3:** `.gitattributes` (LF dla `.husky/*`) musi wylądować i zostać zrenormalizowane **przed** uznaniem hooka za działający. W przeciwnym razie hook „działa" z PowerShella, a psuje commity z WSL (`exit 127`), co jest najgorszym możliwym trybem awarii.
- **Weryfikacja stanu rulesetu przez PowerShell:** `gh api <url> --jq ".rules | length"` działa, ale złożone filtry z `select(...)` i indeksowaniem wywalają się na tej wersji `gh` — dlatego w kryteriach są komendy z `ConvertFrom-Json` (zweryfikowane) albo prosty `--jq`.
- **Nazwy `ci` i `integration` są kontraktem zewnętrznym.** Każda przyszła zmiana `ci.yml` musi zachować te identyfikatory jobów albo zaktualizować ruleset w tym samym commicie.

## Phase 1: Ruleset wymusza `ci` + `integration`

### Overview

Zapisać docelowy payload rulesetu w repo, zapisać stan „przed" jako dowód, zastosować zmianę przez API i potwierdzić ją odczytem. Zostawić jawny opis ryzyka rezydualnego (obejście admina).

### Changes Required:

#### 1. Docelowy payload rulesetu

**File**: `context/deployment/ruleset-protect.json`

**Intent**: Jedno odtwarzalne źródło konfiguracji bramki gałęzi — pełna reprezentacja rulesetu z **dwoma** wymaganymi kontekstami (`ci`, `integration`), zachowanymi `bypass_actors` i warunkiem gałęzi. Plik nie jest niczym egzekwowany — służy do zastosowania i cofnięcia zmiany jedną komendą.

**Contract**: JSON zgodny ze schematem „Update a repository ruleset": `name`, `target`, `enforcement`, `bypass_actors`, `conditions.ref_name.include`, `rules` (cztery reguły). W `required_status_checks.parameters` dodana pozycja `{"context": "integration", "integration_id": 15368}` obok istniejącej `ci`.

#### 2. Instrukcja zastosowania i weryfikacji

**File**: `context/deployment/deploy-plan.md`

**Intent**: Dopisać w „Podsumowaniu wykonania" zwięzłą notkę: gdzie leży plik referencyjny, jaką komendą go zastosować, jaką zweryfikować i jak cofnąć. Skorygować kryterium akceptacji `:167` („scalenie z czerwonym CI jest niemożliwe") tak, by mówiło prawdę: wymagane są `ci` i `integration`, a rola admin ma jawne, udokumentowane obejście.

**Contract**: Sekcja tekstowa w istniejącym dokumencie — bez zmiany struktury pliku.

### Success Criteria:

#### Automated Verification:

- Stan „przed" zapisany jako dowód: `gh api repos/GWladowska/JanuszexGrafikPro/rulesets/22480162 > context/changes/testing-quality-gates/ruleset-before.json` (plik w folderze zmiany, nie w produkcyjnym drzewie konfiguracji)
- Payload zastosowany: `gh api repos/GWladowska/JanuszexGrafikPro/rulesets/22480162 --method PUT --input context/deployment/ruleset-protect.json`
- Wymagane konteksty to dokładnie `ci,integration` (odczyt przez `ConvertFrom-Json`, jak w Critical Implementation Details)
- `strict_required_status_checks_policy` nadal `false`; `bypass_actors` nadal `RepositoryRole:5:always`; `conditions.ref_name.include` nadal `refs/heads/master`
- Plik referencyjny przechodzi parsowanie JSON: `Get-Content -Raw context/deployment/ruleset-protect.json | ConvertFrom-Json`

#### Manual Verification:

- Otwórz PR z nietrywialną zmianą i zobacz na nim **oba** check runy: `ci` oraz `integration`, na tym samym commicie — i oba zielone przed scaleniem.
- Sprawdź, że scalenie PR-a jest możliwe (fałszywa blokada „Expected — Waiting for status to be reported" oznaczałaby literówkę w nazwie kontekstu).
- Potwierdź świadomie, że przy obecnym obejściu admina **Twój** merge z czerwonym checkiem nadal przeszedłby — i że jest to udokumentowane jako ryzyko rezydualne, a nie przypadkowo działająca luka.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Twardnienie `ci.yml`

### Overview

Minimalne uprawnienia tokenu, deterministyczna wersja Supabase CLI (zgodna z lockfilem) i usunięcie martwej referencji sekretów.

### Changes Required:

#### 1. Minimalne uprawnienia workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Ograniczyć token workflowu do odczytu treści — standard minimalnych uprawnień, tani i bez wpływu na działanie jobów.

**Contract**: Blok `permissions: contents: read` na poziomie workflow (nad `jobs:`).

#### 2. Przypięta wersja Supabase CLI

**File**: `.github/workflows/ci.yml`

**Intent**: Zamienić `version: latest` na stałą wersję zgodną z `package-lock.json`, żeby zachowanie `supabase test db` (i obrazów Dockera) było deterministyczne; dodać guard, który wywali CI, gdy stała rozjedzie się z lockfilem.

**Contract**: Zmienna `env: SUPABASE_CLI_VERSION: "2.117.0"` w jobie `integration`, wykorzystana w `with: version: ${{ env.SUPABASE_CLI_VERSION }}`, plus krok porównujący ją z wersją `node_modules/supabase` z `package-lock.json`.

#### 3. Usunięcie martwej referencji sekretów

**File**: `.github/workflows/ci.yml`

**Intent**: Usunąć `env: SUPABASE_URL/KEY` z kroku `build` — te wartości nie istnieją jako sekrety repo, a `astro:env` deklaruje je jako opcjonalne i czyta w runtime z bindingów Workera, więc w budowaniu nic nie robią.

**Contract**: Usunięcie bloku `env:` spod kroku `npm run build`; krok zostaje bez zmian merytorycznych.

### Success Criteria:

#### Automated Verification:

- Workflow ma `permissions: contents: read`: sprawdź w pliku i że `npm run lint` przechodzi (`npm run lint`)
- CI joba `ci` nadal zielony lokalnie: `npm run check`; `npm test`; `npm run build`
- W pliku nie ma już `secrets.SUPABASE_`: `Select-String -Path .github/workflows/ci.yml -Pattern "secrets.SUPABASE"`
- W jobie `integration` nie ma `version: latest`: `Select-String -Path .github/workflows/ci.yml -Pattern "latest"`
- Przebieg CI na PR-ze zmiany jest zielony w obu jobach i krok pinowania pokazuje wersję `2.117.0`

#### Manual Verification:

- Otwórz log joba `integration` i potwierdź, że zainstalowana wersja CLI to `2.117.0` (nie „latest"), oraz że `supabase test db` i `npm run test:integration` nadal przechodzą.
- Potwierdź, że build w CI nie zgłasza ostrzeżeń o brakujących `SUPABASE_URL/KEY` (zmienne są opcjonalne — brak ostrzeżeń oznacza, że usunięcie `env` było neutralne).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Lokalny hook commitów

### Overview

Sprawić, by hook rzeczywiście się uruchamiał, sprawdzał typy i działał tak samo z PowerShella i z WSL — bez dotykania globalnej konfiguracji gita.

### Changes Required:

#### 1. Wymuszenie LF dla plików hooka

**File**: `.gitattributes` (nowy)

**Intent**: Koniec z CRLF w plikach hooka — husky uruchamia je przez `sh -e`, a WSL-owy `dash` nie toleruje `\r`, przez co commit z WSL kończy się `exit 127`. Reguła jest repo-scoped; globalne `core.autocrlf=true` zostaje bez zmian.

**Contract**: Jedna reguła: `.husky/* text eol=lf`. Po dodaniu pliku jednorazowa renormalizacja: `git add --renormalize .husky`, tak by `git ls-files --eol .husky/pre-commit` pokazało `w/lf`.

#### 2. Instalacja hooków przez `prepare`

**File**: `package.json`

**Intent**: Dodać brakujące ogniwo — bez skryptu `prepare` husky nigdy się nie instaluje w klonie i hook nie działa.

**Contract**: Nowy wpis w `scripts`: `"prepare": "husky"` (husky 9). Efekt uboczny: `npm install` w tym repo tworzy `.husky/_/` i ustawia **lokalne** `core.hooksPath=.husky/_`. W istniejącym klonie trzeba raz wykonać `npm run prepare`.

#### 3. Typy w bramce commita

**File**: `.husky/pre-commit`

**Intent**: Po dotychczasowych `eslint --fix` + `prettier` (przez `lint-staged`) dołożyć pełny typecheck projektu — dokładnie ten rozjazd typów, który kiedyś przeszedł sync + lint + build i wyszedł dopiero w ręcznych testach.

**Contract**: Druga linia hooka: `npm run check`. `astro check` nie może trafić do `lint-staged` (brak obsługi argumentów plikowych, lint-staged dokleja nazwy plików).

### Success Criteria:

#### Automated Verification:

- `.husky/pre-commit` ma końcówki LF: `git ls-files --eol .husky/pre-commit` pokazuje `w/lf`
- Hook zainstalowany w tym klonie: `git config --local --get core.hooksPath` zwraca `.husky/_`
- Katalog `.husky/_` istnieje i zawiera własny `.gitignore`
- **Zero zmian globalnych**: `git config --global --get core.hooksPath` puste; `git config --global --get core.autocrlf` nadal `true`; brak nowego globalnego `core.attributesfile`
- `npm run check` przechodzi bez błędów (istniejące 6 hintów nie blokuje)

#### Manual Verification:

- Zrób commit z PowerShella przy poprawnych typach — hook przechodzi, commit powstaje, widać wywołanie typechecku.
- Zrób commit z WSL w tym samym klonie — hook przechodzi bez `exit 127` (dowód, że LF działa).
- Wprowadź celowy błąd typów i spróbuj zacommitować — commit zostaje zablokowany przez `astro check`; po naprawie przechodzi. (Ścieżka obejścia `git commit --no-verify` istnieje — potwierdź, że o tym wiesz, i nie używaj jej na co dzień.)
- Potwierdź, że commit zawierający tylko pliki `.md` nie uruchamia typechecku zbędnie albo że jego koszt jest akceptowalny (hook odpala się zawsze, także gdy `lint-staged` nie ma nic do roboty).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Dokumentacja i domknięcie Etapu 4

### Overview

Uwiecznić kontrakt bramek i ryzyko rezydualne w dokumentach, które czyta zarówno człowiek, jak i agent — i przekazać pałeczkę orchestratorowi planu testów.

### Changes Required:

#### 1. Kontrakt bramek dla agenta

**File**: `AGENTS.md`

**Intent**: Dopisać do sekcji Commits & PRs / Security, Config & CI zdania, których agent nie zgadnie z kodu: że wymagane konteksty to dokładnie `ci` i `integration`, że nazwy jobów są kontraktem z ochroną gałęzi, że rola admin ma obejście (bramka jest dobrowolna dla właściciela), oraz że hook sprawdza typy i wymaga LF w `.husky/*`.

**Contract**: 3–5 linii tekstu w istniejącej sekcji; bez nowych nagłówków.

#### 2. Stan bramek w planie testów

**File**: `context/foundation/test-plan.md`

**Intent**: Zaktualizować tabelę §5 (bramki: „wymagana (działa) — wymuszona w rulesecie" dla lint/check/unit/integration/pgTAP/build) i dopisać wpis do §8 Freshness Ledger dla Etapu 4 z faktami: ruleset wymaga `ci` + `integration`, przypięte CLI `2.117.0`, hook lokalny działa, obejście admina pozostaje jako ryzyko rezydualne.

**Contract**: Edycja komórek w istniejącej tabeli §5 + jedna linia w liście §8. **Nie** zmieniać statusu wiersza 4 w §3 — to zadanie orchestratora (`/10x-test-plan`), zgodnie z lekcją o kolejności archiwizacji (`lessons.md:74-79`).

#### 3. Lekcje z tej zmiany

**File**: `context/foundation/lessons.md`

**Intent**: Dopisać dwie reguły, które kosztowały realne rozpoznanie: (a) nazwa joba w `ci.yml` jest publicznym kontraktem wymaganych checków — zmiana nazwy bez zmiany rulesetu cicho rozbraja bramkę; (b) pliki hooków muszą mieć LF (`.gitattributes` + renormalizacja), bo commit z WSL wysypuje się na `\r`.

**Contract**: Dwa appendy w formacie Context/Problem/Rule/Applies to (istniejący format pliku).

#### 4. Zastosowanie i weryfikacja rulesetu

**File**: `context/deployment/deploy-plan.md`

**Intent**: (uzupełnienie z Fazy 1) odnotować w podsumowaniu wykonania faktyczny stan: dwa wymagane konteksty, plik referencyjny, komenda apply/verify, oraz jawnie zapisać ryzyko rezydualne obejścia admina.

**Contract**: Dopisanie pozycji do listy „Podsumowanie wykonania" + korekta kryterium `:167`.

### Success Criteria:

#### Automated Verification:

- `AGENTS.md` wymienia oba konteksty: `Select-String -Path AGENTS.md -Pattern "integration"` trafia w opis bramek
- `test-plan.md` §8 zawiera wpis dla Etapu 4; §5 nie zawiera już sformułowań „po §3 Phase N" dla bramek, które są wymuszone
- `deploy-plan.md` nie zawiera nieskorygowanej deklaracji z `:167`
- `ruleset-protect.json` istnieje i jest zgodny z faktycznym odczytem rulesetu (dwa konteksty, to samo obejście)

#### Manual Verification:

- Uruchom `/10x-test-plan` — orchestrator widzi `plan.md` w całości `[x]`, zaznacza wiersz 4 w §3 jako `complete` i podaje następny handoff (dopiero potem wolno archiwizować zmianę — kolejność z `lessons.md:74-79`).
- Przeczytaj `AGENTS.md` i `test-plan.md` §5 świeżym okiem: czy da się z nich wywnioskować, że czerwona zmiana nie przejdzie **bez** roli admin, a właściciel może ją ominąć?
- Sprawdź, że nikt nie pomyśli, że Workers Builds czeka na CI — dokumentacja musi mówić wprost, że publikuje niezależnie od wyników.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

Ta zmiana nie pisze testów aplikacyjnych — testy już istnieją (99 unit, 24 integration, `plan(51)` pgTAP) i to one są treścią bramek. „Testem" tej zmiany jest dowód, że bramki są wymuszone.

### Unit Tests:

- Brak nowych. Istniejące suites muszą pozostać zielone — to one uzasadniają istnienie bramek.

### Integration Tests:

- Brak nowych. Job `integration` (pgTAP + 24 testy) musi pozostać zielony po przypięciu wersji CLI — to regresja, na którą ta zmiana jest wrażliwa (pin może zmienić obrazy).

### Manual Testing Steps:

1. Zastosuj payload rulesetu i odczytaj stan przez API — wymagane konteksty `ci` + `integration`, obejście i warunek gałęzi nietknięte.
2. Otwórz PR i sprawdź oba check runy na tym samym commicie; scal po zielonym.
3. Zrób commit z PowerShella z celowym błędem typów — hook blokuje; popraw i zacommituj.
4. Zrób dowolny commit z WSL — hook przechodzi (dowód LF).
5. Uruchom `/10x-test-plan` i potwierdź, że Etap 4 jest `complete`, a kolejność archiwizacji z lekcji została zachowana.

## Performance Considerations

Nieistotne dla aplikacji: zmiany nie dotykają kodu serwowanego. Jedyne koszty operacyjne: commit lokalny wydłuża się o `astro check` (~21 s, łącznie z `astro sync`), a PR czeka teraz na job `integration` z Dockerem (kilka minut) — to cena wymuszenia pgTAP i testów integracyjnych. Gdyby czas PR-a stał się uciążliwy, droga wyjścia to zbiorczy job `gates` z `needs:` (świadomie nie w tej zmianie).

## Migration Notes

- **Rollback Fazy 1**: `git checkout` poprzedniej wersji `context/deployment/ruleset-protect.json` + PUT tą samą komendą przywraca ruleset do stanu bez `integration` (plik jest pełną reprezentacją, więc działa jak migracja odwrotna). Dowód stanu „przed" leży w `context/changes/testing-quality-gates/ruleset-before.json`.
- **Rollback Fazy 2**: zwykły `git revert` commita — workflow wraca do `latest` i `env` z sekretami. Brak skutków dla produkcji (CI nie publikuje).
- **Rollback Fazy 3**: usunięcie `prepare` + `.gitattributes` i `git config --local --unset core.hooksPath` w tym repo. Zmiana jest repo-scoped, więc nie zostawia śladu w innych repozytoriach.
- **Kolejność ma znaczenie przy cofaniu Fazy 3**: najpierw zdjąć hook/instalację, potem `.gitattributes` — inaczej hook zostaje na CRLF-ie i psuje commity z WSL.

## References

- Related research: `context/changes/testing-quality-gates/research.md`
- Plan testów (bramki i etapy): `context/foundation/test-plan.md:49-97,161-175`
- Workflow CI: `.github/workflows/ci.yml:1-49`
- Plan wdrożenia (publikacja, ruleset): `context/deployment/deploy-plan.md:116-131,167,184-194`
- Rejestr ryzyk infrastruktury: `context/foundation/infrastructure.md:65,76,96,112`
- Lekcja o kolejności archiwizacji etapu: `context/foundation/lessons.md:74-79`
- Lekcja o typach poza sync/lint/build: `context/foundation/lessons.md:53-58`
- Ustawienia hooków i skrypty: `package.json:5-18,66-73`; `.husky/pre-commit`
- Odłożenie wymuszenia bramek: `context/archive/2026-09-14-testing-core-logic/plan.md:76-77,189`; `context/archive/2026-09-14-testing-server-side-rules/plan.md:471-473`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Ruleset wymusza `ci` + `integration`

#### Automated

- [x] 1.1 Zapisz stan „przed" rulesetu do `context/changes/testing-quality-gates/ruleset-before.json` — 882a599
- [x] 1.2 Utwórz `context/deployment/ruleset-protect.json` (pełna reprezentacja z `integration`) — 882a599
- [x] 1.3 Zastosuj payload przez `gh api --method PUT --input` — 882a599
- [x] 1.4 Potwierdź odczytem: konteksty `ci,integration`, `strict=false`, obejście `RepositoryRole:5:always`, ref `refs/heads/master` — 882a599
- [x] 1.5 Dopisz instrukcję zastosowania/weryfikacji/cofnięcia oraz korektę kryterium `:167` w `deploy-plan.md` — 882a599

#### Manual

- [x] 1.6 PR pokazuje oba check runy (`ci`, `integration`) i scalenie po zielonym działa — 882a599
- [x] 1.7 Świadomie potwierdzone i opisane ryzyko rezydualne obejścia admina — 882a599

### Phase 2: Twardnienie `ci.yml`

#### Automated

- [x] 2.1 Dodaj `permissions: contents: read` na poziomie workflow — a36017e
- [x] 2.2 Przypnij Supabase CLI (`SUPABASE_CLI_VERSION: "2.117.0"`) i dodaj guard zgodności z lockfilem — a36017e
- [x] 2.3 Usuń `env: secrets.SUPABASE_URL/KEY` z kroku `build` — a36017e
- [x] 2.4 Lokalne bramki nadal zielone: `npm run lint`, `npm run check`, `npm test`, `npm run build` — a36017e
- [x] 2.5 Usuń `version: latest` i martwą referencję sekretów z `ci.yml` (weryfikacja tekstowa) — a36017e

#### Manual

- [x] 2.6 Log joba `integration` pokazuje CLI `2.117.0` i zielone `supabase test db` + `npm run test:integration` — a36017e

### Phase 3: Lokalny hook commitów

#### Automated

- [x] 3.1 Dodaj `.gitattributes` z `.husky/* text eol=lf` i zrenormalizuj (`git ls-files --eol` → `w/lf`)
- [x] 3.2 Dodaj `"prepare": "husky"` do `package.json`
- [x] 3.3 Dodaj `npm run check` jako drugą linię `.husky/pre-commit`
- [x] 3.4 Zainstaluj hooki w tym klonie (`npm run prepare`) i potwierdź lokalny `core.hooksPath=.husky/_`
- [x] 3.5 Potwierdź brak zmian globalnej konfiguracji gita (`core.hooksPath` globalnie pusty, `core.autocrlf=true` nadal)

#### Manual

- [ ] 3.6 Commit z PowerShella blokuje się na celowym błędzie typów i przechodzi po naprawie
- [ ] 3.7 Commit z WSL przechodzi bez `exit 127`

### Phase 4: Dokumentacja i domknięcie Etapu 4

#### Automated

- [ ] 4.1 Dopisz kontrakt bramek do `AGENTS.md` (wymagane `ci` + `integration`, nazwy jobów jako kontrakt, obejście admina, hook i LF)
- [ ] 4.2 Zaktualizuj `test-plan.md` §5 i dopisz wpis Etapu 4 do §8 (bez ruszania statusu w §3)
- [ ] 4.3 Dopisz dwie lekcje do `context/foundation/lessons.md` (nazwa joba = kontrakt; LF w hookach)

#### Manual

- [ ] 4.4 Re-run `/10x-test-plan` zaznacza Etap 4 jako `complete` i podaje następny handoff
- [ ] 4.5 Świeżym okiem: dokumentacja jasno mówi, kto jest blokowany, kto może ominąć bramkę i że Workers Builds publikuje niezależnie od CI
