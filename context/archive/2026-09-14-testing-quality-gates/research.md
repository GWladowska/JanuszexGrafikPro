---
date: 2026-09-14T09:59:32+02:00
researcher: Kilo
git_commit: 78cbfff173e18258833634bfa8866432a7747784
branch: master
repository: GWladowska/JanuszexGrafikPro
topic: "Bramki jakości w automacie — Etap 4 test-planu: realne wymuszenie wszystkich bramek, by czerwona zmiana nie trafiła na produkcję"
tags: [research, codebase, ci, gates, branch-protection, github-actions, workers-builds, husky, testing]
status: complete
last_updated: 2026-09-14
last_updated_by: Kilo
---

# Research: Bramki jakości w automacie (Etap 4)

**Date**: 2026-09-14T09:59:32+02:00
**Researcher**: Kilo
**Git Commit**: [78cbfff](https://github.com/GWladowska/JanuszexGrafikPro/commit/78cbfff173e18258833634bfa8866432a7747784)
**Branch**: master
**Repository**: GWladowska/JanuszexGrafikPro

## Research Question

Etap 4 z `context/foundation/test-plan.md` — „Bramki jakości w automacie". Ryzyka: **wszystkie (#1–#7)**. Typ testu: **gates**. Cel z §3 (`test-plan.md:58`): wpiąć testy i `npx astro check` w CI tak, by czerwona zmiana nie trafiła na produkcję. Zestaw bramek do wymuszenia z `change.md:22`: **lint, `npx astro check`, unit, integration, pgTAP (`supabase test db`), build — plus realne wymuszenie w ochronie gałęzi.**

Pytania badawcze: (a) które z tych bramek już istnieją i gdzie; (b) co dokładnie dziś nie blokuje produkcji; (c) jaki jest realny łańcuch publikacji i gdzie jest jedyny punkt wymuszenia; (d) co po drodze odłożyły etapy 1–3.

## Summary

1. **Wszystkie sześć bramek jest już wpięte w CI — brakuje nie kroków, lecz wymuszenia.** `ci.yml` ma dziś kroki lint (`ci.yml:20`), `astro check` (`:21`), unit (`:22`), build (`:23`), a w osobnym jobie `integration` pgTAP (`:42`) i testy integracyjne (`:46`). Etap 4 to warstwa egzekwowania, nie dopisywanie kroków.
2. **Ochrona gałęzi istnieje, ale jest połowiczna i obejściowalna.** Repozytorium ma aktywny ruleset „Protect" (id `22480162`) na `refs/heads/master`, który wymaga PR-a (0 wymaganych zatwierdzeń) i **tylko jednego** statusu: `ci`. Job `integration` (pgTAP + testy integracyjne) **nie jest wymagany** — może być czerwony, a merge i tak przejdzie.
3. **Administrator może obejść wszystko.** Ruleset ma `bypass_actors: [{actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always"}]` (rola admin) i API zwraca `current_user_can_bypass: "always"`. Jedyną osobą mergującą jest właściciel repo z uprawnieniami admina — dla niej bramka jest doradcza, nie twarda. To wyjaśnia, dlaczego od utworzenia rulesetu (2026-09-07) **każdy** commit na `master` to bezpośredni push, a reguła PR nie była ani raz przećwiczona.
4. **Publikacja nie konsultuje się z CI.** Produkcję publikuje Cloudflare **Workers Builds** po pushu na `master` (konfiguracja żyje w panelu Cloudflare, nie w repo — `wrangler.jsonc` nie ma sekcji builds/deploy). Workers Builds startuje na `push` i nie czyta wyników GitHub Actions. Jedynym miejscem, w którym da się zatrzymać czerwoną zmianę, jest więc zablokowanie merge'a/pusha na GitHuba.
5. **Niepokryta luka towarzysząca: `integration` nie ma własnej bramki wymaganej, a `strict_required_status_checks_policy: false`** — gałąź nie musi być aktualna względem bazy, więc zielony wynik może pochodzić sprzed ostatniego pusha.
6. **Hook lokalny praktycznie nie działa.** `.husky/pre-commit` istnieje, ale brak `prepare` w `package.json`, brak `core.hooksPath` i brak katalogu `.husky/_` — hook nie jest zainstalowany w tym klonie. Nawet po naprawie uruchamia tylko `eslint --fix` i `prettier` (bez `astro check` i bez testów), więc nie realizuje zalecenia z `test-plan.md:94`.
7. **Drobiazgi:** brak `concurrency`, `timeout-minutes`, `permissions:` i artefaktów raportów w `ci.yml`; brak przypięcia wersji Supabase CLI (`version: latest`); brak sekretów repo-level (`secret list` = puste), mimo że krok `build` referuje `secrets.SUPABASE_URL/KEY` — działa, bo `astro:env` ma oba pola jako `optional: true`.

## Detailed Findings

### 1. Co realnie istnieje w CI (stan na `78cbfff`)

`.github/workflows/ci.yml` (49 linii) — jedyny workflow w repo ([ci.yml](https://github.com/GWladowska/JanuszexGrafikPro/blob/78cbfff/.github/workflows/ci.yml)):

- Triggery: `push` i `pull_request` na `master` ([ci.yml:4-7](https://github.com/GWladowska/JanuszexGrafikPro/blob/78cbfff/.github/workflows/ci.yml#L4-L7)). Brak `workflow_dispatch`, brak `schedule`.
- Dwa joby bez `needs:` — **`ci` ([ci.yml:10](https://github.com/GWladowska/JanuszexGrafikPro/blob/78cbfff/.github/workflows/ci.yml#L10)) i `integration` ([ci.yml:28](https://github.com/GWladowska/JanuszexGrafikPro/blob/78cbfff/.github/workflows/ci.yml#L28)) biegną równolegle**; kolejność sync → lint → check → test → build jest wymuszona tylko wewnątrz joba `ci`.
- Job `ci`: `npx astro sync` → `npm run lint` → `npm run check` → `npm test` → `npm run build` z `secrets.SUPABASE_URL/KEY` ([ci.yml:19-26](https://github.com/GWladowska/JanuszexGrafikPro/blob/78cbfff/.github/workflows/ci.yml#L19-L26)).
- Job `integration`: `supabase/setup-cli@v1` z `version: latest` → `supabase start` → `supabase db reset` → `supabase test db` → odczyt klucza z `supabase status -o json` → `npm run test:integration` ([ci.yml:37-49](https://github.com/GWladowska/JanuszexGrafikPro/blob/78cbfff/.github/workflows/ci.yml#L37-L49)).
- Brak: `permissions:`, `concurrency:`, `timeout-minutes:`, uploadu raportów, jakiegokolwiek kroku deployu.

### 2. Inwentarz bramek — wszystkie sześć działa, wszystkie dają czerwony sygnał

| Bramka      | Komenda                         | Konfiguracja                                                                                                                                                                                              | Zawartość                                                                                                                                   | Lokalny warunek                                                                                                                                                 | W CI                            |
| ----------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| lint        | `npm run lint` (`eslint .`)     | [eslint.config.js](https://github.com/GWladowska/JanuszexGrafikPro/blob/78cbfff/eslint.config.js)                                                                                                         | type-aware (`strictTypeChecked` + `projectService`), `database.types.ts` wyłączony                                                          | Node                                                                                                                                                            | `ci.yml:20`                     |
| astro check | `npm run check`                 | `astro.config.mjs` (env `optional: true`)                                                                                                                                                                 | pełny typecheck między modułami                                                                                                             | Node                                                                                                                                                            | `ci.yml:21`                     |
| unit        | `npm test` (`vitest run`)       | [vitest.config.ts](https://github.com/GWladowska/JanuszexGrafikPro/blob/78cbfff/vitest.config.ts) — `environment: "node"`, `include: ["src/**/*.test.ts"]`                                                | **5 plików, 99 przypadków** (`week` 23, `schedule-generation` 44, `schedule-validation` 20, `schedule-export` 11, `format` 1)               | brak (bez bazy)                                                                                                                                                 | `ci.yml:22`                     |
| integration | `npm run test:integration`      | [vitest.integration.config.ts](https://github.com/GWladowska/JanuszexGrafikPro/blob/78cbfff/vitest.integration.config.ts) — alias `astro:env/server` → stub, `include: ["test/integration/**/*.test.ts"]` | **6 plików, 24 przypadki** (`schedule-save` 7, `availability-freeze` 5, `response-shapes` 4, `ownership` 3, `schedule-freeze` 3, `smoke` 2) | lokalny Supabase + Docker + `SUPABASE_URL`/`SUPABASE_KEY` z `.dev.vars`; **brak guardu „skip" — brak bazy rzuca wyjątek** (`test/integration/helpers.ts:45-48`) | `ci.yml:46` (job `integration`) |
| pgTAP       | `supabase test db`              | `supabase/config.toml`; plik `supabase/tests/database/rls_isolation.test.sql`                                                                                                                             | **`plan(51)`** — 6 tabel × odczyt/dodaj/zmień/usuń + kontrola pozytywna + symetria + anon + stan polityk                                    | `supabase start` + `supabase db reset` (Docker, WSL); wstawia do `auth.users` → tylko lokalnie/CI                                                               | `ci.yml:42` (job `integration`) |
| build       | `npm run build` (`astro build`) | `astro.config.mjs` + [wrangler.jsonc](https://github.com/GWladowska/JanuszexGrafikPro/blob/78cbfff/wrangler.jsonc)                                                                                        | —                                                                                                                                           | Node; sekrety nieobowiązkowe                                                                                                                                    | `ci.yml:23-26`                  |

Uwaga istotna dla planu: **`build` nie robi typechecku** — `astro check` pozostaje osobnym krokiem (`package.json:7` vs `:14`), więc obie bramki muszą istnieć równolegle.

Pokrycie ryzyk przez istniejące suites (dowód, że „wszystkie #1–#7" ma już nośnik): #1 → `test/integration/schedule-save.test.ts`; #2 → `src/lib/services/schedule-generation.test.ts` + `test/integration/response-shapes.test.ts`; #3 → `src/lib/week.test.ts` + `test/integration/availability-freeze.test.ts`; #4 → `supabase/tests/database/rls_isolation.test.sql`; #5 → `test/integration/ownership.test.ts`; #6 → `test/integration/response-shapes.test.ts`; #7 → `src/lib/services/schedule-export.test.ts`.

### 3. Warstwa wymuszenia — ruleset „Protect" (stan live, zweryfikowany API)

Zapytanie `gh api repos/GWladowska/JanuszexGrafikPro/rulesets/22480162` zwraca (skrót istotnych pól):

```json
{"id":22480162,"name":"Protect","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["refs/heads/master"]}},
 "rules":[{"type":"deletion"},{"type":"non_fast_forward"},
   {"type":"pull_request","parameters":{"required_approving_review_count":0, ...}},
   {"type":"required_status_checks","parameters":{
      "strict_required_status_checks_policy":false,
      "do_not_enforce_on_create":false,
      "required_status_checks":[{"context":"ci","integration_id":15368}]}}],
 "bypass_actors":[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}],
 "current_user_can_bypass":"always"}
```

Konsekwencje krok po kroku:

- **Wymagane jest wyłącznie `ci`** — job `integration` (a więc pgTAP i testy integracyjne, czyli ryzyka #4, #5 i część #1/#3/#6) nie jest w liście. Zielony `ci` przy czerwonym `integration` przechodzi.
- **`context` to nazwa checka = nazwa joba.** Zmiana nazwy joba `ci`/`integration` cicho rozbraja bramkę — nazwy są kontraktem, nie kosmetyką.
- **`bypass_mode: "always"` dla roli admin** + `current_user_can_bypass: "always"` → właściciel repo (jedyna osoba mergująca) może wejść na `master` bez PR-a i bez zielonych checków. Historia potwierdza: od 2026-09-07 wszystkie runy na `master` to `push`, a jedyne trzy runy `pull_request` pochodzą z dnia utworzenia rulesetu.
- **`strict_required_status_checks_policy: false`** → nie wymaga aktualności gałęzi względem `master`; zielony check może być starszy niż ostatni push.
- Endpoint klasycznej ochrony gałęzi (`/branches/master/protection`) zwraca `404 Branch not protected` — ochrona istnieje **wyłącznie** jako ruleset. To nie błąd, tylko dwa różne systemy GitHuba; warto to zapisać, żeby przyszły czytelnik nie „naprawiał" nieistniejącego problemu.
- Link panelowy: `https://github.com/GWladowska/JanuszexGrafikPro/rules/22480162`.

`context/deployment/deploy-plan.md:192` (podsumowanie po wykonaniu) odnotowuje powstanie rulesetu „Protect" z wymaganym PR + statusem `ci` — czyli stan zgodny z API. Kryterium akceptacji z `deploy-plan.md:167` („scalenie z czerwonym CI jest niemożliwe") okazuje się **aspiracyjne**, bo pomija `integration` i obejście admina.

### 4. Ścieżka publikacji — dlaczego jedynym punktem wymuszenia jest GitHub

- Produkcję publikuje **Cloudflare Workers Builds** (natywna integracja Git), nie GitHub Actions — `context/deployment/deploy-plan.md:9,31,116-121,131,175,191`; `context/foundation/tech-stack.md:24`; `AGENTS.md:22`.
- Konfiguracja: repo `GWladowska/JanuszexGrafikPro`, branch `master`, build `npm run build`, deploy `npx wrangler deploy` — **wszystko w panelu Cloudflare**, czego dowodem jest brak jakiejkolwiek sekcji builds/deploy w `wrangler.jsonc` (`name`, `main`, `compatibility_*`, `assets`, `observability`, `kv_namespaces`) i brak workflow deployu w `.github/` (istnieje wyłącznie `ci.yml`).
- Workers Builds startuje na `push` na `master` i **nie czyta wyników CI**. Sukces publikacji widać jako osobny check run na HEAD (`Workers Builds: januszex-grafik-pro` → success przy `ci` → success i `integration` → in progress).
- Dlatego „czerwona zmiana nie trafia na produkcję" da się zrealizować wyłącznie blokując wejście na `master` (ruleset), a nie modyfikując workflow. `AGENTS.md:60` i `test-plan.md:97` mówią to samo.
- Ryzyko odnotowane już wcześniej w `context/foundation/infrastructure.md`: devil's advocate #4 (`:65`), unknown-unknowns o branch protection jako jedynej zaporze (`:76`), wpis rejestru ryzyk (`:96`) i krok „Ship" (`:112`).
- Rollback `npx wrangler rollback` cofa tylko kod, nie sekrety/bindingi — `deploy-plan.md:138,193`.

### 5. Sekrety — rozjazd, który nie boli (ale myli)

`gh secret list` i `/actions/secrets` → `{"names":[],"total_count":0}`; zero zmiennych (`/actions/variables`) i zero environments. Mimo to `ci.yml:24-26` referuje `secrets.SUPABASE_URL/KEY`. Build w CI **nie pada**, bo `astro.config.mjs:21-26` deklaruje oba pola `optional: true`, a `createClient()` zwraca `null` przy braku wartości. Nie jest to więc dziura bramki, ale warto zdecydować: albo dodać sekrety repo (build bardziej produkcyjny, jak sugeruje `deploy-plan.md:130,194`), albo usunąć martwą referencję, żeby nie sugerować, że coś jest wpięte.

### 6. Hook lokalny (zalecany w `test-plan.md:94`) — realnie nie działa

- `.husky/pre-commit` zawiera jedną linię: `npx lint-staged`.
- Brak `prepare` w `package.json` (`:5-18`), brak `core.hooksPath` w `.git/config`, brak katalogu `.husky/_`, w `.git/hooks/` wyłącznie pliki `*.sample` → **hook nie jest zainstalowany w tym klonie** i nie odpala się przy commitach.
- Nawet po instalacji `lint-staged` (`package.json:66-73`) uruchamia jedynie `eslint --fix` (ts/tsx/astro) i `prettier --write` (json/css/md) — **bez `astro check` i bez testów**. Czyli „hook po zapisie pliku" z §5 planu testów nie jest zrealizowany ani treścią, ani instalacją.

### 7. Odłożone i otwarte elementy istotne dla tej fazy

- Wymuszenie bramek w ochronie gałęzi było **jawnie odłożone do Etapu 4** trzykrotnie: `archive/2026-09-14-testing-core-logic/plan.md:76-77` i `:189`, `plan-brief.md:96-97` („czerwone testy nie zatrzymają publikacji przez Workers Builds") oraz `archive/2026-09-14-testing-server-side-rules/plan.md:471-473` („tu tworzymy job, który ta faza uczyni wymaganym").
- Wersja Supabase CLI w CI pozostaje `latest` bez przypięcia — odnotowane jako ryzyko niedeterminizmu w `archive/2026-09-14-testing-database-isolation/research.md` (Open Q9) i świadomie pominięte w tamtym zakresie.
- Brak npm-owego wrappera na `supabase test db` (m.in. dlatego, że na Windows bez Dockera i tak nie zadziała) — `archive/2026-09-14-testing-database-isolation/plan.md:43`.
- Brak progów pokrycia kodu (`archive/2026-09-14-testing-core-logic/plan.md:85`).
- `@cloudflare/vitest-pool-workers` świadomie niewdrożony (Seam A zamiast) — `archive/2026-09-14-testing-server-side-rules/plan.md:74-75`.
- Żadna z trzech zakończonych faz nie zostawiła katalogu `reviews/` — brak artefaktów przeglądu do zacytowania.

## Code References

- `.github/workflows/ci.yml:1-49` — cały workflow; joby `ci` i `integration`, brak `needs`, brak permissions/concurrency/timeouts.
- `.github/workflows/ci.yml:20-23` — lint → check → test → build wewnątrz joba `ci`.
- `.github/workflows/ci.yml:40-46` — `supabase start` → `db reset` → `test db` → `test:integration`.
- `package.json:5-18` — brak `prepare`; `test`, `test:watch`, `test:integration`, `check`, `lint`, `build`.
- `package.json:66-73` — `lint-staged`: tylko eslint + prettier.
- `.husky/pre-commit` — jedna linia `npx lint-staged`, hook niezainstalowany.
- `vitest.config.ts` — unit: node, `src/**/*.test.ts`.
- `vitest.integration.config.ts:5-7,12-13,17-18` — `.dev.vars`, alias `astro:env/server` → stub, `test/integration/**`.
- `test/integration/helpers.ts:45-48,86-88` — twardy wyjątek przy braku klienta Supabase (brak cichego skipu).
- `supabase/tests/database/rls_isolation.test.sql:41` — `plan(51)`.
- `astro.config.mjs:21-26` — `SUPABASE_URL`/`SUPABASE_KEY` jako `optional: true` (dlaczego brak sekretów nie łamie builda).
- `wrangler.jsonc:1-21` — brak konfiguracji builds/deploy (Workers Builds żyje w panelu).
- `context/deployment/deploy-plan.md:116-131,167,188-194` — Workers Builds publikuje, GitHub Actions nigdy; kryterium „scalenie z czerwonym CI niemożliwe"; konfiguracja sekretów.
- `context/foundation/infrastructure.md:65,76,96,112` — rejestr ryzyk i rekomendacje o wymaganych checkach.
- `context/foundation/test-plan.md:82-97` — tabela bramek §5 + nota o ochronie gałęzi.
- `context/foundation/test-plan.md:58` — wiersz Etapu 4.
- `AGENTS.md:22-23,60` — deploy/redeploy przez Workers Builds; bramki muszą być wymagane w ochronie gałęzi.

## Architecture Insights

1. **Rozdzielenie „sygnału" od „wymuszenia" jest w tym projekcie strukturalne, nie przypadkowe.** Publikacja żyje poza GitHubem (Workers Builds, panel Cloudflare), więc cała polityka bezpieczeństwa wydania musi być wyrażona jako warunek wejścia na `master`. Wszelkie próby „dodania bramki do CI" bez zmiany rulesetu dają wyłącznie kolejny sygnał.
2. **Nazwy jobów są kontraktem API.** `required_status_checks` wskazuje na `context: "ci"` — zmiana nazwy joba rozbraja bramkę bez żadnego czerwonego sygnału. Każda przyszła reorganizacja `ci.yml` musi traktować nazwy `ci` i `integration` jako publiczne.
3. **Równoległość jobów bez `needs:` jest celowa (wolny `integration` z Dockerem nie blokuje szybkiego `ci`), ale oznacza, że „wszystkie testy" to dziś dwa niezależne statusy** — kto chce mieć pewność, musi wymagać obu (albo dodać trzeci, zbiorczy job, na który wskazywałaby ochrona).
4. **Bypass admina to realne zjawisko w repo jednoosobowym.** Dopóki właściciel ma `bypass_mode: always`, ochrona gałęzi jest instrukcją dla człowieka, nie maszyną. Zmniejszenie bypassu (np. `bypass_mode: "pull_request"` w miejsce `"always"`, albo rezygnacja z bypassu) jest jedynym sposobem, by bramka działała także dla właściciela.
5. **Brak guardów „skip" w testach integracyjnych jest zaletą dla bramki** (brak bazy = czerwono, nie cicho-zielono), ale czyni job `integration` twardo zależnym od Dockera i lokalnego stacku Supabase — dlatego wymaga osobnego joba i musi być wymagany jawnie, jeśli ma cokolwiek blokować.

## Historical Context (from prior changes)

- `context/archive/2026-09-14-testing-core-logic/` — Etap 1: dodane kroki `npm run check` i `npm test` do joba `ci` (plan `plan.md:186-188`), uzasadnione lekcją o rozjeździe typów, który przeszedł sync+lint+build (`lessons.md:53-58`). **Wymuszenie w ochronie gałęzi jawnie odłożone do Etapu 4** (`plan.md:76-77,189`; `plan-brief.md:96-97`). Odnotowane ryzyko: nowe kroki „nie blokują merge'a bez ochrony gałęzi".
- `context/archive/2026-09-14-testing-server-side-rules/` — Etap 2: powstał job `integration` (Seam A: bezpośrednie wywołanie handlerów, bez `@cloudflare/vitest-pool-workers`), skrypt `test:integration`, alias `astro:env/server` → stub, klucz w CI z `supabase status` (anon/publishable), zakaz `service_role` (`plan.md:107-122,466-473`). Kotwica wymuszenia znów odłożona: „tu tworzymy job, który ta faza uczyni wymaganym" (`plan.md:471-473`).
- `context/archive/2026-09-14-testing-database-isolation/` — Etap 3: pojedynczy krok `supabase test db` w jobie `integration`, bezpośrednio po `db reset` (`plan.md:139`); usunięcie nie-pgTAP `supabase/tests/rls_isolation.sql` (rekurencyjny skan `supabase/tests/` wysadzał przebieg); pgTAP 1.2.0 i ograniczenie `results_eq` na zapytaniach modyfikujących; `version: latest` i brak wrappera npm świadomie pominięte.
- `context/foundation/lessons.md:74-79` — **procedura archiwizacji etapu test-planu**: najpierw re-run `/10x-test-plan`, potem `/10x-new` następnej fazy, a `/10x-archive` na końcu. Ta zmiana powinna ją uszanować przy zamykaniu.
- `context/deployment/deploy-plan.md:191-193` — wykonanie: pierwszy deploy poszedł automatem po merge PR #1; rollback przećwiczony, cofa kod, nie sekrety/bindingi.

## Related Research

- `context/archive/2026-09-14-testing-core-logic/research.md` — baseline bramek przed Etapem 1 (sync/lint/build), uzasadnienie `astro check`.
- `context/archive/2026-09-14-testing-server-side-rules/research.md` — Seam A, alianse `astro:env/server`, kształt odpowiedzi, dryf helperów.
- `context/archive/2026-09-14-testing-database-isolation/research.md` — mechanika `supabase test db`, wymóg lokalnego stacku, kolizja z plikiem nie-pgTAP.
- `context/deployment/deploy-plan.md` + `context/foundation/infrastructure.md` — ścieżka publikacji i rejestr ryzyk deployu.
- `context/foundation/test-plan.md` §5 — docelowy zestaw bramek i nota o ochronie gałęzi.

## Open Questions

1. **Zakres Etapu 4: sam ruleset, czy też hardening `ci.yml`?** Bramką jest ruleset (poza repo i nie w wersjonowaniu), więc część pracy jest nieuniknienie ręczna w panelu/API. Otwarte: czy w zakresie mają być też `concurrency`, `timeout-minutes`, `permissions: contents: read`, upload raportów i przypięcie wersji Supabase CLI — to zmiany w repo i mogłyby wejść razem.
2. **Jak głęboko ciąć bypass?** Usunięcie `bypass_actors` dla roli admin oznacza, że właściciel nie wpisze awaryjnej poprawki na `master` bez PR-a. Alternatywa: `bypass_mode: "pull_request"` (PR wymagany, checki nadal wymagane) lub pozostawienie `always` i przyjęcie, że bramka chroni tylko nie-adminów — wtedy trzeba to nazwać wprost i zapisać jako ryzyko rezydualne.
3. **Czy `integration` ma być wymagany wprost, czy przez zbiorczy job?** Wymaganie dwóch kontekstów (`ci`, `integration`) jest tańsze; zbiorczy job (np. `gates` z `needs:`) jest odporniejszy na przyszłe przemianowania i daje jedno miejsce wymuszenia — ale kosztuje dodatkowy cykl i trzeba pilnować jego nazwy.
4. **`strict_required_status_checks_policy`** — włączenie wymusza rebase/merge z `master` zanim PR będzie zielony. Czy chcemy tego przy jednoosobowym repo?
5. **Los martwych sekretów w `ci.yml:24-26`** — dodać sekrety repo, czy usunąć referencję?
6. **Hook lokalny** — czy Etap 4 ma realnie wpiąć husky (`prepare` + `core.hooksPath`) i rozszerzyć `lint-staged` o `astro check`, czy hook zostaje poza zakresem (plan testów nazywa go „zalecana", nie „wymagana")?
7. **Wersja Supabase CLI `latest`** — przypiąć teraz (determinizm CI), czy zostawić jako osobny drobiazg?
8. **Zmiana rulesetu jest mutacją ustawień repo** — czy plan ma dopuszczać wykonanie jej narzędziami agenta (`gh api -X PUT`), czy zostaje ręczna w panelu z instrukcją krok-po-kroku (spójne z zasadą „rzeczy nieodwracalne robi człowiek")?
