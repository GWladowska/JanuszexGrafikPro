# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-13

## 1. Strategy

Testy w tym projekcie podlegają trzem niepodważalnym zasadom:

1. **Cost × signal.** Wygrywa najtańszy test dający realny sygnał dla
   danego ryzyka. Nie promuj do e2e, bo e2e "czuje się bezpieczniej". Nie
   kładź modelu wizyjnego na deterministyczny visual diff, który już łapie
   regresję.
2. **Obawy użytkownika są dowodem pierwszej klasy.** Ryzyka zakotwiczone w
   "<zespół boi się X, a awaria wyszłaby w <obszar>>" mają tę samą wagę co
   linie PRD czy dane hot-spotów.
3. **Risks are scenarios, not code locations.** Ten plan dokumentuje *co
   może się zepsuć* i *dlaczego wierzymy, że to prawdopodobne* — z
   dokumentów, wywiadu i *sygnału* z kodu (churn, struktura, test base). Nie
   twierdzi, która linia odpowiada za awarię. Ta wiedza powstaje w
   `/10x-research` podczas każdej fazy rolloutu. Gdy plan i research się
   różnią co do miejsca awarii, research jest źródłem prawdy.

Zakres hot-spotów do ważenia prawdopodobieństwa: `src/`, `supabase/`
(migracje + seed), 16 commits/30d.

## 2. Risk Map

Topowe scenariusze awarii, uporządkowane po ryzyku = impact × likelihood.
Ryzyka to scenariusze w języku użytkownika/biznesu, nie nazwy testów. Kolumna
Source cytuje *dowód, który wydobył to ryzyko* — nigdy konkretny plik jako
"miejsce awarii" (to zadanie researchu, patrz §1 zasada 3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Grafik zapisany z nieobsadzoną godziną otwarcia — dziura znika po cichu, lokal domyślnie zamknięty | High | High | interview Q1; PRD Guardrails + US-01 AC; roadmap S-06 |
| 2 | Zmiana na niedostępność pracownika zapisana bez ostrzeżenia | High | High | interview Q1; PRD FR-010, US-03; roadmap S-05 |
| 3 | Draft pokrycia liczony błędnie (obsada poza dostępnością albo dziura mimo dostępności) | High | Medium | roadmap S-04; hot-spot `src/lib/services` (16 commits/30d); PRD Business Logic |
| 4 | Przeciek danych między biznesami przez nowy endpoint grafiku (właściciel B widzi dane właściciela A) | High | Medium | PRD Access Control; archive F-01 (RLS = jedyna warstwa izolacji, klucz publiczny); hot-spot `src/pages/api` (13 commits/30d) — abuse lens |
| 5 | Rozjazd tygodnia/strefy czasowej (kotwica poniedziałku ISO, Europe/Warsaw, SSR vs island, HH:MM:SS vs HH:MM) | Medium | High | interview Q3; archive S-03 (udokumentowane pułapki czasu); hot-spot `src/components/business` (10 commits/30d) |
| 6 | Nowe endpointy grafiku mapują błędy bazy na złe kody — surowy błąd PostgREST zamiast 404/409 z polskim komunikatem | Medium | Medium | archive S-02/S-03 (wzorce kontraktów błędów); hot-spot `src/pages/api` (13 commits/30d) |

Rubryka: High = utrata dostępu/danych/przychodu lub awaria publiczna / obszar
zmieniany co tydzień lub już tam poparzeni; Medium = degradacja z
obejściem / dotykane okazjonalnie; Low = kosmetyka / kod stabilny.

Scenariusze High-impact × Low-likelihood (np. awaria Supabase/Cloudflare)
należą do obserwowalności, nie do testów — świadomie poza mapą.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Zapis grafiku z nieobsadzoną godziną otwarcia jest odrzucany; dziury widoczne przed zapisem; nic nie zapisane po cichu | "działający draft ⇒ kompletność przy zapisie" — test musi próbować zapisu niekompletnego | punkt wejścia zapisu grafiku, miejsce walidacji kompletności (aplikacja vs baza), statusy grafiku | integration (endpoint zapisu) | happy-path-only; lustro implementacji |
| #2 | Przypisanie pracownika na godziny jego niedostępności sygnalizowane przed zapisem; żadna kolizja nie zapisana po cichu | "ostrzeżenie w UI ⇒ kontrakt serwerowy istnieje" | lokalizacja walidacji kolizji, decyzja ostrzeżenie-vs-blok (PRD Open Q1) | integration | asercja tylko finalnego statusu 200 |
| #3 | Draft obsadza wyłącznie z dostępności i zostawia dziury, gdy obsada niemożliwa; styki przedziałów obsadzane poprawnie | "pusta odpowiedź = brak danych" — pusty draft może być poprawny | algorytm generacji draftu, kształt danych (dostępności × godziny otwarcia), przypadki brzegowe (styk przedziałów, wiele wpisów/dzień) | unit (czysta logika) | oracle problem — oczekiwana obsada liczona ręcznie z fixture, nie kopiowana z kodu |
| #4 | Żądanie o cudzy business_id / cudzy zasób zwraca odmowę (pusto/403/404), nigdy dane drugiego właściciela | "zalogowany ⇒ uprawniony" — autentykacja ≠ własność | kształt polityk RLS, rozstrzyganie właściciela w endpointach, obrona kluczami kompozytowymi | integration na lokalnym Supabase (poziom SQL i API) | mockowanie klienta Supabase — mock warstwy izolacji unieważnia test |
| #5 | Tydzień kotwiczony na poniedziałek ISO w Europe/Warsaw; SSR i island zgodne; granice dnia nie przesuwają się | "działa lokalnie ⇒ poprawne strefowo" — TZ maszyny dev ≠ Warszawa | gdzie liczona kotwica tygodnia (serwer vs klient), formatowanie wyświetlania, hydratacja | unit (funkcje dat/tygodnia/czasu) | e2e dla czystej arytmetyki dat; zależność od zegara systemowego |
| #6 | Błędy bazy mapowane na udokumentowane kody (404/409) z polskim komunikatem przy nowych endpointach grafiku | "finalny status 200 ⇒ wszystko OK" — asercja kontraktu błędów, nie tylko sukcesu | wspólny helper mapowania błędów HTTP i jego stałe, wzorce z S-02/S-03 | integration | snapshot-bez-znaczenia; over-mocking |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Runner + czysta logika | Bootstrap runnera i ochrona czystej logiki (draft, tydzień/strefa) | #3, #5 | unit | change opened | context/changes/testing-runner-core-logic/ |
| 2 | Kontrakt API grafiku | Ciche złamanie reguły domenowej niemożliwe na poziomie endpointów | #1, #2, #6 | integration | not started | — |
| 3 | Izolacja danych (RLS) | Automatyczny dowód, że biznesy nie przeciekają | #4 | integration / SQL-level | not started | — |
| 4 | Quality gates w CI | Zablokowanie podłogi: `npm run test` w ci.yml jako quality gate | cross-cutting | gates | not started | — |

Faza AI-native świadomie pominięta (cost × signal): solo, mała aplikacja,
brak powierzchni wizualnej wartej review modelem; classic gates dają ten sam
sygnał taniej.

## 4. Stack

Klasyczna baza testowa. Narzędzia AI-native (jeśli w ogóle) niosą datę
`checked:`, żeby przyszły czytelnik widział, co wymaga weryfikacji.
Rekomendacje oparte na lokalnych manifestach/konfiguracjach plus narzędzia
MCP realnie dostępne w sesji. Docs-MCP (Context7) niedostępny — powiedziane
wprost, nie założony.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | none yet — see §3 Phase 1 | bootstrap w Fazie 1; Vitest natywny dla Vite/Astro |
| API mocking | — | — | integracja na lokalnym Supabase (WSL Docker); mock tylko na krawędzi HTTP, jeśli w ogóle — patrz Faza 2 |
| e2e | brak (ręczne E2E) | — | decyzja z S-01/S-02: budżet testowy tylko na rdzeń; patrz §7 |
| accessibility | — | — | poza rdzeniem (§7) |
| AI-native | pominięte | n/a | cost × signal — brak fazy |

**Stack grounding tools (current session):**
- Docs: none (Context7 niedostępny w sesji) — rekomendacje oparte na manifestach i konfiguracji repo; checked: 2026-09-13
- Search: wbudowany websearch — dostępny do weryfikacji statusu narzędzi w Fazie 1/4, jeśli zajdzie wątpliwość; checked: 2026-09-13
- Runtime/browser: none (Playwright MCP niedostępny) — nie używany; checked: 2026-09-13
- Provider/platform: Linear/Jira/Jenkins MCP (zarządzanie, nie jakość kodu); brak GitHub/Supabase/Cloudflare MCP — bramki w CI przez GitHub Actions; checked: 2026-09-13

## 5. Quality Gates

Pełny zestaw bramek, które muszą przejść przed wejściem zmiany na produkcję.
"Required for §3 Phase <N>" = brama egzekwowana, gdy ta faza ląduje; wcześniej
`planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required (wired: eslint, astro sync/build) | syntactic / type drift |
| unit + integration | local od Fazy 1; CI od Fazy 4 | required after §3 Phase 1 (CI po Fazie 4) | logic regressions |
| e2e on critical flows | manual (poza CI) | poza budżetem — patrz §7 | broken critical user paths (ręcznie) |
| post-edit hook | local (agent loop) | optional — nie planowany | regressions at edit time |
| visual diff / multimodal review | — | optional — pominięte (cost × signal) | rendering regressions |
| pre-prod smoke | manual | optional — ręczne E2E przed wdrożeniem | environment-specific failures |

## 6. Cookbook Patterns

Jak dodawać nowe testy w tym projekcie. Każda podsekcja wypełniana, gdy
dostępna faza rolloutu ląduje; wcześniej "TBD — see §3 Phase <N>".

### 6.1 Dodanie testu jednostkowego logiki domenowej

- TBD — see §3 Phase 1 (wzorzec: generacja draftu / liczenie dziur / arytmetyka tygodnia i czasu; oczekiwane wartości z ręcznych fixture, nie z kodu).

### 6.2 Dodanie testu integracyjnego endpointu

- TBD — see §3 Phase 2 (wzorzec: kontrakt żądanie → odpowiedź + efekty uboczne; asercja kodów błędów 404/409, nie tylko happy path).

### 6.3 Dodanie testu izolacji danych (RLS)

- TBD — see §3 Phase 3 (wzorzec: dwa konta właścicieli, próba dostępu do cudzych wierszy — odmowa na poziomie SQL i API; zero mocków klienta Supabase).

### 6.4 Dodanie testu dla nowego endpointu grafiku

- TBD — see §3 Phase 2 (kiedy integration wystarcza, a kiedy sięgać dalej).

### 6.5 Dodanie bramki do CI

- TBD — see §3 Phase 4 (`npm run test` w ci.yml jako quality gate).

### 6.6 Notes per rollout phase

(Faza ląduje → /10x-implement dopisuje tu 2-3 linijki o zaskoczeniach, np.
potrzebne fixture albo nowe komendy.)

## 7. What We Deliberately Don't Test

Wyłączenia ustalone w rolloucie (wywiad Phase 2, Q5). Przyszli kontrybutorzy
respektują je, dopóki nie zmieni się podstawowe założenie.

- **Wszystko poza rdzeniem (reguła domenowa + izolacja danych)** — budżet
  testowy tylko na rdzeń; resztę pokrywa ręczne E2E. (Source: Phase 2
  interview Q5.) Re-evaluate, jeśli zespół rozrośnie się poza solo albo
  ręczne E2E zacznie przepuszczać regresje.
- **Seed i dane demo** — niszczą się przez `supabase db reset`; testowana
  logika nie może zależeć od seeda. (Source: Phase 2 interview Q5.)
- **Komponenty czysto prezentacyjne i snapshoty UI** — łamią się przy każdym
  restylu i nic nie łapią. (Source: Phase 2 interview Q5.)
- **Auth pages (baseline, na produkcji od 2026-09-07)** — przetestowane
  ręcznie wdrożenie; brak logiki domenowej. (Source: Phase 2 interview Q5,
  roadmap Baseline.) Re-evaluate przy zmianie przepływu auth.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-13
- Stack versions last verified: 2026-09-13
- AI-native tool references last verified: 2026-09-13 (pominięte — brak)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
