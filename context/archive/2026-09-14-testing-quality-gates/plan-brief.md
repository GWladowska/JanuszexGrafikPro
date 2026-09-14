# Bramki jakości w automacie — Plan Brief

> Full plan: `context/changes/testing-quality-gates/plan.md`
> Research: `context/changes/testing-quality-gates/research.md`

## What & Why

Cel z planu testów (§3 Etap 4): czerwona zmiana nie może trafić na produkcję. Research pokazał, że **wszystkie sześć bramek już działa w CI** — brakuje nie kroków, lecz warstwy wymuszenia. Produkcję publikuje Cloudflare Workers Builds po pushu na `master` i nie czyta wyników CI, więc jedynym realnym miejscem zatrzymania zmiany jest GitHub.

## Starting Point

- Job `ci` (lint → `astro check` → unit → build) i job `integration` (pgTAP + 24 testy) są zielone — zawartość bramek domknęły Etapy 1–3.
- Ruleset `Protect` na `master` wymaga **tylko** statusu `ci`; `integration` nie jest wymagany.
- Rola admin ma obejście `always` — właściciel repo może ominąć PR i checki (od utworzenia rulesetu każdy commit na `master` to bezpośredni push).
- Hook lokalny nie działa: brak `prepare`, brak `.husky/_`, `core.hooksPath` nieustawiony. Dodatkowo `.husky/pre-commit` ma CRLF przy LF w indeksie.
- Krok `build` w CI referuje `secrets.SUPABASE_URL/KEY`, których repo nie ma — a i tak nic nie robią (wartości czytane w runtime z bindingów Workera).

## Desired End State

Merge do `master` wymaga zielonych `ci` **i** `integration` dla każdego bez roli admin; obejście admina jest jawnym, udokumentowanym wyjątkiem. Konfiguracja rulesetu leży w repo i da się ją zastosować/cofnąć jedną komendą. CI jest deterministyczne (przypięte CLI) i minimalnie uprzywilejowane. `git commit` realnie uruchamia `astro check` — tak samo z PowerShella i z WSL. Dokumentacja mówi prawdę o tym, kto jest blokowany, a kto nie.

## Key Decisions Made

| Decision                               | Choice                                                                       | Why (1 sentence)                                                                           | Source   |
| -------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| Wymagane statusy                       | `ci` + `integration` (dwa konteksty)                                         | pgTAP i testy integracyjne siedzą w jobie `integration` — bez niego luka zostaje otwarta   | Plan     |
| Obejście admina                        | Zostaje `always`, opisane jako ryzyko rezydualne                             | Świadoma decyzja użytkownika: bramka nie może zablokować właściciela w awarii              | Plan     |
| Dowód działania                        | Konfiguracyjny: odczyt API + check runy na PR                                | Przy zachowanym obejściu test na czerwonym PR-ze właściciela i tak by przeszedł            | Plan     |
| Twardnienie `ci.yml`                   | `permissions: contents: read` + przypięte CLI `2.117.0` (z guardem lockfile) | Determinizm pgTAP + minimalne uprawnienia; bez `concurrency`/timeoutów/artefaktów          | Plan     |
| Martwe sekrety                         | Usunąć `env` z kroku `build`                                                 | Wartości nie istnieją, a build nic z nich nie potrzebuje (strony są SSR)                   | Research |
| `strict_required_status_checks_policy` | Zostaje `false`                                                              | Mniej tarcia w jednoosobowym repo; świadomie zaakceptowana luka „zielony, ale nieaktualny" | Plan     |
| Hook lokalny                           | Husky wpięty + `astro check` przy commicie                                   | Łapie rozjazd typów — dokładnie ten, który kiedyś przeszedł sync+lint+build                | Plan     |
| Konfiguracja rulesetu                  | Plik referencyjny `context/deployment/ruleset-protect.json`                  | Odtwarzalność i odwracalność bez nowych sekretów i bez kontroli dryfu w CI                 | Plan     |
| Zasięg zmian                           | Wyłącznie repo-scoped                                                        | Twarde wymaganie: inne repozytoria mają działać dokładnie jak dotąd                        | Plan     |
| Kolejność archiwizacji                 | `/10x-test-plan` → `/10x-new` → `/10x-archive`                               | Orchestrator liczy stan wyłącznie z plików w `context/changes/`                            | Research |

## Scope

**In scope:** ruleset (dwa wymagane konteksty + plik referencyjny), `ci.yml` (uprawnienia, przypięcie CLI, usunięcie martwych sekretów), lokalny hook (`.gitattributes` LF, `prepare`, `astro check`), dokumentacja (`AGENTS.md`, `test-plan.md` §5/§8, `deploy-plan.md`, `lessons.md`).

**Out of scope:** usuwanie obejścia admina, `strict_required_status_checks_policy`, `concurrency`/`timeout-minutes`/artefakty, sekrety repo dla Supabase, zmiany w kodzie aplikacji i testach, konfiguracja Workers Builds, jakakolwiek globalna konfiguracja gita lub wpływ na inne repozytoria.

## Architecture / Approach

Trzy warstwy, jedna kolejność: **(1) wymuszenie** — ruleset w GitHubie, bo tylko on stoi między commitem a auto-deployem; **(2) determinizm CI** — workflow pozostaje sygnałem, ale przestaje zależeć od „latest" i od nieistniejących sekretów; **(3) pętla lokalna** — hook łapie błędy typów przed commitem. Faza 1 zapisuje stan „przed" i docelowy payload w repo, więc mutacja poza repozytorium jest odtwarzalna i odwracalna.

## Phases at a Glance

| Phase                                   | What it delivers                                                        | Key risk                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1. Ruleset wymusza `ci` + `integration` | Dwa wymagane konteksty + odtwarzalny payload + opis ryzyka rezydualnego | Literówka w nazwie kontekstu = fałszywa blokada „Waiting for status to be reported" |
| 2. Twardnienie `ci.yml`                 | Minimalne uprawnienia, przypięte CLI, brak martwych sekretów            | Przypięcie CLI może zmienić obrazy Dockera w CI i wysypać pgTAP                     |
| 3. Lokalny hook commitów                | Realnie działający hook z typecheckiem, spójny Windows ↔ WSL            | CRLF w `.husky/*` psuje commity z WSL (`exit 127`)                                  |
| 4. Dokumentacja i domknięcie Etapu 4    | Prawda o bramkach + wpis w ledgerze + lekcje                            | Ręczne oznaczenie `complete` przez orchestrator zamiast przez plan                  |

**Prerequisites:** uprawnienia admina do repo (są), `gh` zalogowany (jest), Docker + WSL do lokalnego `supabase` (jest).
**Estimated effort:** 4 krótkie sesje (jedna na fazę), z czego Faza 1 to głównie jedna komenda API plus dowód, a Faza 3 wymaga commita z obu środowisk.

## Open Risks & Assumptions

- **Obejście admina zostaje** — dla właściciela repo bramka jest dobrowolna; opisujemy to wprost i zostawiamy jako świadome ryzyko rezydualne.
- **PR-y będą dłuższe** — wymagany `integration` oznacza czekanie na Docker + Supabase (kilka minut) przy każdym scaleniu.
- **`strict_required_status_checks_policy: false`** — możliwe scalenie gałęzi, której wyników nie widział żaden przebieg dla aktualnego stanu kodu.
- **CRLF jest globalnie włączony** (`core.autocrlf=true`) — naprawa jest wyłącznie repo-scoped, więc na innych maszynach/klonach może wymagać tej samej renormalizacji.
- **Nazwy jobów `ci`/`integration` są zewnętrznym kontraktem** — przemianowanie ich w `ci.yml` cicho rozbraja ruleset.

## Success Criteria (Summary)

- PR nie da się scalić z czerwonym `ci` lub `integration` (dla aktora bez roli admin); oba checki widać na jednym commicie.
- Konfiguracja bramki jest odtwarzalna z repo jedną komendą i cofa się przez `git checkout` + PUT.
- Commit lokalnie blokuje się na błędzie typów i działa identycznie z PowerShella oraz z WSL; globalna konfiguracja gita pozostaje nietknięta.
