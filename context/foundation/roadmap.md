---
project: JanuszexGrafikPro
version: 1
status: draft
created: 2026-09-09
updated: 2026-09-09
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: JanuszexGrafikPro

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Janusz, właściciel kawiarni, traci co tydzień czas na ręczne układanie grafiku z dostępności ~5 pracowników i musi pilnować, by każda godzina otwarcia była obsadzona. Status quo (notatki, arkusze, Messenger) nie pokazuje wprost, które godziny są pokryte, a które nie — to wylicza sam. Wartość produktu to wizualizacja pokrycia godzin otwarcia i asysta przy układaniu grafiku (draft z widocznymi "dziurami"), a świadomie nie algorytmiczna optymalizacja.

Rdzeń hipotezy produktu — założenie, że jeśli się nie sprawdzi, reszta nie ma sensu — brzmi: *draft zbudowany z dostępności plus zawsze widoczne nieobsadzone godziny pozwolą właścicielowi ułożyć kompletny grafik szybciej niż w arkuszu*. Każdy element roadmapy istnieje po to, żeby tę hipotezę udowodnić.

## North star

**US-01 (S-04 → S-06): właściciel układa i zapisuje kompletny grafik tygodnia** — najmniejsza pełna pętla, w której reguła domenowa (draft z dostępności → dziury → korekta → zapis bez dziur) spotyka się z kryterium primary (< 10 minut na kompletny grafik) i udowadnia rdzeń hipotezy produktu opisany wyżej.

> "North star" to tu pierwsza historia end-to-end, której dostarczenie potwierdza, że produkt działa — ułożona tak wcześnie, jak pozwalają zależności, bo wszystko przed nią to tylko dane wejściowe, a wszystko po niej działa tylko, jeśli ona się uda.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | domain-schema-rls | (foundation) pełny schemat domeny z migracjami i RLS, dane izolowane per właściciel | — | Access Control, Business Logic | ready |
| S-01 | business-opening-hours | założyć swój biznes i zdefiniować godziny otwarcia na każdy dzień tygodnia | F-01 | FR-003, FR-004 (FR-001, FR-002 — auth, w baseline) | proposed |
| S-02 | employee-management | dodać pracownika do swojego biznesu | S-01 | FR-005 | proposed |
| S-03 | availability-management | dodawać, przeglądać, edytować i usuwać dostępności pracownika | S-02 | FR-006, US-01 | proposed |
| S-04 | schedule-draft-generation | wygenerować bazowy draft grafiku z dostępności i zobaczyć nieobsadzone godziny (dziury) | S-03 | FR-007, FR-008, US-01 | proposed |
| S-05 | schedule-editing-collisions | ręcznie modyfikować draft; kolizje z niedostępnością są sygnalizowane przed zapisem | S-04 | FR-009, FR-010, US-01, US-03 | proposed |
| S-06 | save-complete-schedule | zapisać kompletny grafik — dziury nie mogą zostać zapisane po cichu | S-05 | FR-011, US-01, Guardrails | proposed |
| S-07 | schedule-text-export | skopiować tekstowy widok zapisanego grafiku (jedna akcja) i wkleić go na Messengera/WhatsAppa | S-06 | FR-012, US-02 | proposed |

## Baseline

Co już jest w kodzie (stan na 2026-09-09, zbadane automatycznie i potwierdzone przez użytkownika).
Foundations poniżej zakładają, że te warstwy są obecne, i NIE budują ich od nowa.

- **Frontend:** present (scaffold) — Astro 6 SSR + React 19 islands + Tailwind 4 + shadcn/ui (package.json, src/components/ui/, src/components/auth/)
- **Backend / API:** partial — pełne SSR + wzorzec route API (src/pages/api/auth/*.ts, src/middleware.ts); brak endpointów domenowych
- **Data:** partial — klient Supabase SSR podpięty (src/lib/supabase.ts, supabase/config.toml), ale zero migracji i schematu domeny (supabase/migrations/ puste)
- **Auth:** present — e-mail + hasło: strony, API, middleware z PROTECTED_ROUTES, klient cookie SSR; wdrożone do produkcji
- **Deploy / infra:** present — Cloudflare Workers (@astrojs/cloudflare v13, wrangler.jsonc), ci.yml jako quality gate; deploy produkcyjny 2026-09-07
- **Observability:** absent — brak logowania/error-tracking/metrik (bez NFR wymagającego infrastruktury obserwowalności — celowo pominięte przy main_goal=speed)

## Foundations

### F-01: Schemat domeny z migracjami i RLS

- **Outcome:** (foundation) pełny schemat domeny — biznes, godziny otwarcia, pracownicy, dostępności, grafiki z przypisaniami — z migracjami oraz politykami RLS izolującymi dane per właściciel.
- **Change ID:** domain-schema-rls
- **PRD refs:** Access Control (§izolacja danych), Business Logic, NFR trwałość danych
- **Unlocks:** S-01, S-02, S-03, S-04, S-05, S-06, S-07; usuwa lukę baseline (data=partial: brak schematu/migracji)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Jedyna poprzeczna inwestycja (main_goal=speed każe ciąć do minimum, ale RLS i izolacja per-biznes to obowiązek z Access Control). Sekwencja na start: wszystko inne na niej stoi; błąd w izolacji danych między właścicielami byłby trudny i kosztowny do naprawy po wdrożeniu.
- **Status:** ready

## Slices

### S-01: Biznes i godziny otwarcia

- **Outcome:** użytkownik (właściciel) zakłada swój biznes (jeden na konto) i definiuje godziny otwarcia lokalu na każdy dzień tygodnia.
- **Change ID:** business-opening-hours
- **PRD refs:** FR-003, FR-004, US-01 (kontekst: zalogowany właściciel); FR-001, FR-002 (auth — pokryte przez baseline present, gating dla S-01)
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** Pierwszy przekrój pionowy; kształtuje dane wejściowe reguły pokrycia (godziny otwarcia). Sekwencja najwcześniej, bo bez godzin otwarcia nie ma o czym pilnować pokrycia.
- **Status:** proposed

### S-02: Pracownicy

- **Outcome:** użytkownik dodaje pracowników do swojego biznesu.
- **Change ID:** employee-management
- **PRD refs:** FR-005
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** Prosty CRUD, ale wymaga S-01 (pracownik należy do biznesu — FK). Bez niego nie ma komu przypisywać dostępności.
- **Status:** proposed

### S-03: Dostępności pracowników

- **Outcome:** użytkownik dodaje, przegląda, edytuje i usuwa dostępności pracownika (wprowadzane ręcznie).
- **Change ID:** availability-management
- **PRD refs:** FR-006, US-01 (dane wejściowe pętli)
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** Reguła pokrycia konsumuje dostępności — bez nich draft nie ma z czego powstać. Trzymać prosty interfejs (data/godziny), bo to dane ręczne i częste.
- **Status:** proposed

### S-04: Draft grafiku i widok dziur

- **Outcome:** użytkownik generuje bazowy draft grafiku z dostępności i widzi nieobsadzone godziny otwarcia ("dziury").
- **Change ID:** schedule-draft-generation
- **PRD refs:** FR-007, FR-008, US-01 (generacja)
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** Rdzeń logiki domenowej (inwestycja "backend/logika" z ramki). Draft ma być pomocną bazą, nie optymalizacją — ryzyko to wciągnięcie rozwiązywania konfliktów (świadomie poza v1). Sekwencja przed S-05, bo to tu rodzi się wizualizacja pokrycia z Vision.
- **Status:** proposed

### S-05: Ręczna edycja draftu z ostrzeżeniami o kolizjach

- **Outcome:** użytkownik ręcznie modyfikuje draft (przesuwa i zmienia pracowników na zmianach); kolizja z niedostępnością pracownika jest sygnalizowana natychmiast, przed zapisem.
- **Change ID:** schedule-editing-collisions
- **PRD refs:** FR-009, FR-010, US-01 (korekta), US-03
- **Prerequisites:** S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy kolizja z niedostępnością pracownika ma być ostrzeżeniem czy twardym blokiem? — Owner: user. Block: no (PRD Open Q #1; do rozstrzygnięcia na etapie projektowania — US-03 AC skłania ku ostrzeżeniu).
- **Risk:** NFR "natychmiastowa odpowiedź bez odświeżania" + guardrail "żadna kolizja nie zostaje zapisana po cichu" — UX ostrzeżenia decyduje o odbiorze asysty. Decyzja ostrzeżenie-vs-blok zostaje w /10x-plan.
- **Status:** proposed

### S-06: Zapis kompletnego grafiku

- **Outcome:** użytkownik zapisuje kompletny grafik; nieobsadzone godziny otwarcia nie mogą zostać zapisane po cichu (dziury blokują zapis, dopóki nie zostaną obsadzone).
- **Change ID:** save-complete-schedule
- **PRD refs:** FR-011, US-01 (zapis), Guardrails (dziura nie może "zniknąć")
- **Prerequisites:** S-05
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy zapisany grafik ma pozostać edytowalny? — Owner: user. Block: no (PRD Open Q #2; decyzja projektowa — wpływa na status grafiku w schemacie, nie na kolejność).
- **Risk:** Tu spełnia się AC "przed zapisem brak dziur" — sedno kryterium primary (< 10 min). Sekwencja po edycji, bo zapis weryfikuje kompletność dopiero po korektach.
- **Status:** proposed

### S-07: Tekstowy widok do skopiowania

- **Outcome:** użytkownik kopiuje tekstowy widok zapisanego grafiku (jedna akcja) i wkleja go na grupowy Messenger/WhatsApp — tekst czytelny, układ się nie łamie.
- **Change ID:** schedule-text-export
- **PRD refs:** FR-012, US-02
- **Prerequisites:** S-06
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** NFR "układ nie łamie się po wklejeniu" wymaga testu z prawdziwym Messengerem/WhatsAppem. Bez tego brak udostępnienia załodze (drugie kryterium primary), dlatego po zapisie.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Issue | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|---|
| F-01 | domain-schema-rls | [#4](https://github.com/GWladowska/JanuszexGrafikPro/issues/4) | Schemat domeny: biznes, godziny, pracownicy, dostępności, grafiki + RLS | yes | Run `/10x-plan domain-schema-rls` |
| S-01 | business-opening-hours | [#5](https://github.com/GWladowska/JanuszexGrafikPro/issues/5) | Ustawienie biznesu i godzin otwarcia | no | Czeka na F-01 |
| S-02 | employee-management | [#6](https://github.com/GWladowska/JanuszexGrafikPro/issues/6) | Zarządzanie pracownikami biznesu | no | Czeka na S-01 |
| S-03 | availability-management | [#7](https://github.com/GWladowska/JanuszexGrafikPro/issues/7) | Dostępności pracowników (CRUD ręczne) | no | Czeka na S-02 |
| S-04 | schedule-draft-generation | [#8](https://github.com/GWladowska/JanuszexGrafikPro/issues/8) | Generowanie draftu grafiku i widok dziur | no | Czeka na S-03 |
| S-05 | schedule-editing-collisions | [#9](https://github.com/GWladowska/JanuszexGrafikPro/issues/9) | Edycja draftu z ostrzeżeniami o kolizjach | no | Czeka na S-04 |
| S-06 | save-complete-schedule | [#10](https://github.com/GWladowska/JanuszexGrafikPro/issues/10) | Zapis kompletnego grafiku (walidacja dziur) | no | Czeka na S-05 |
| S-07 | schedule-text-export | [#11](https://github.com/GWladowska/JanuszexGrafikPro/issues/11) | Kopiowanie tekstowego widoku grafiku | no | Czeka na S-06 |

## Open Roadmap Questions

1. **Czy kolizja z niedostępnością pracownika ma być ostrzeżeniem czy twardym blokiem?** — Owner: user. Block: dotyczy S-05 (nie blokuje kolejności; do rozstrzygnięcia na etapie projektowania).
2. **Czy zapisany grafik ma pozostać edytowalny?** — Owner: user. Block: dotyczy S-06 (nie blokuje kolejności; decyzja projektowa).

## Parked

- **Optymalizacja algorytmiczna (rozwiązywanie konfliktów, minimalizacja kosztów)** — Why parked: PRD §Non-Goals — draft to pomocna baza, nie automatyczne rozwiązanie konfliktów.
- **Auto-import dostępności (ankiety, zewnętrzne kalendarze)** — Why parked: PRD §Non-Goals — dostępność wprowadza szef ręcznie.
- **Logowanie pracowników / role pracownicze** — Why parked: PRD §Non-Goals — załoga dostaje skopiowany widok tekstowy, bez kont.
- **Wielu menedżerów / współdzielenie biznesu** — Why parked: PRD §Non-Goals — jeden biznes = jeden właściciel w v1.
- **Natywne aplikacje mobilne** — Why parked: PRD §Non-Goals — web w przeglądarce desktopowej wystarcza v1.
- **Eksport grafiku jako obrazek (PNG/PDF)** — Why parked: PRD §Non-Goals + Success Criteria Secondary — tekstowy widok zastępuje obrazek w v1; obrazek odłożony do v2.
- **Self-service reset hasła** — Why parked: PRD nota przy FR-002 — ryzyko świadomie zaakceptowane; odłożone do v2.

## Done

(Pusto przy pierwszym wygenerowaniu. `/10x-archive` dopisuje tu wpis — i zmienia Status itemu na `done` — gdy zmiana, której Change ID pasuje do itemu roadmapy, zostanie zarchiwizowana. Nie wypełniać z góry.)
