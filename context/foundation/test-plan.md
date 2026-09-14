# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-14

## 1. Strategy

Testy w tym projekcie trzymają się trzech zasad, których nie wolno omijać:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje prawdziwy sygnał dla danego ryzyka. Nie promujemy do testu „od początku do końca", bo „wydaje się bezpieczniejszy". Nie dokładamy modelu rozpoznawania obrazu tam, gdzie zwykłe porównanie już łapie regresję.
2. **Obawy użytkownika są pełnoprawnym dowodem.** Ryzyko oparte na „zespół boi się X, a awaria objawiłaby się gdzieś w obszarze Y" waży tyle samo, co linia w opisie produktu albo dane o częstych zmianach.
3. **Ryzyka to scenariusze, nie miejsca w kodzie.** Ten plan opisuje *co może się zepsuć* i *dlaczego uważamy to za prawdopodobne* — na podstawie dokumentów, wywiadu i *sygnałów* z kodu (częstotliwość zmian, struktura, stan testów). Plan NIE twierdzi, że wie, która linia kodu odpowiada za awarię. Tę wiedzę produkuje `/10x-research` w każdym etapie robót. Jeśli plan i research nie zgadzają się co do miejsca awarii — wiążący jest research.

Zakres skanowania częstych zmian (do oceny prawdopodobieństwa): `src/` (bez dokumentów, bez `supabase/`, bez archiwum, bez bibliotek i plików generowanych). Okres: ostatnie 30 dni, 87 zmian.

## 2. Risk Map

Najważniejsze scenariusze awarii, od najgroźniejszego (ryzyko = waga × prawdopodobieństwo). Ryzyka to scenariusze w języku użytkownika i biznesu, nie nazwy testów. Kolumna „Skąd wiemy" podaje *dowód, który wywindował ryzyko* — nigdy konkretny plik jako „miejsce awarii" (to zadanie researchu, patrz §1 zasada 3).

| # | Ryzyko (scenariusz awarii) | Waga | Prawdopodobieństwo | Skąd wiemy |
|---|----------------------------|------|--------------------|------------|
| 1 | Grafik zapisuje się, mimo że brakuje obsady albo jest kolizja (poza dostępnością / nakładka tej samej osoby), albo ekran i serwer nie zgadzają się, czy grafik jest kompletny | Wysoka | Wysoka | Gwarancje z `prd.md` (dziura nie może zniknąć po cichu); `archive/2026-09-13-save-complete-schedule` oznacza brak testów tej reguły jako dług; wywiad Q1; hot-spot `src/pages/api` (24/30 dni) |
| 2 | Logika obsady/dziur liczy źle albo dostaje dane w złym kształcie — ekran pokazuje pusty grafik, fałszywe dziury lub ogólnikowy błąd bez przyczyny | Wysoka | Wysoka | Wywiad Q2 (błąd ukryty za pustym ekranem, winą nieprzekazany parametr) i Q3; `lessons.md` — rozjazd kształtu danych z bazy przeszedł wszystkie bramki; hot-spot `src/lib/services` (37/30 dni) |
| 3 | Zasady czasu (który to tydzień, kiedy tydzień jest zamknięty, północ, zmiana czasu) policzone źle → obsada lub dziura na złym dniu | Wysoka | Średnia | Wywiad Q3; `infrastructure.md` rejestr ryzyk ostrzega przed różnicami stref czasowych na Cloudflare/workerd; hot-spot `src/lib/week.ts` (4/30 dni) |
| 4 | Izolacja między właścicielami psuje się po zmianie polityk lub migracji — dziś sprawdzana tylko ręcznie | Wysoka | Średnia | `prd.md` Access Control (izolacja danych per właściciel); `archive/2026-09-12-domain-schema-rls` — CI nie sprawdza SQL, a test jest ręczny |
| 5 | **Nadużycie:** właściciel A wysyła żądanie z identyfikatorem zasobu właściciela B (pracownik/grafik/zmiana) i odczytuje lub zmienia cudze dane | Wysoka | Średnia | `prd.md` Access Control; hot-spot `src/pages/api` (24/30 dni); konfiguracja ochrony tras wymienia tylko strony, nie adresy API |
| 6 | Zmiana wspólnego pomocnika/serwisu psuje inną, pozornie niezwiązaną ścieżkę — kody i komunikaty odpowiedzi się rozjeżdżają | Średnia | Wysoka | `lessons.md` — duplikaty zaczęły się rozjeżdżać (komunikaty widoczne dla użytkownika); hot-spot `src/lib/http.ts` (9/30 dni) |
| 7 | Tekst grafiku dla załogi wychodzi z surowymi znacznikami, w złej kolejności albo bez dni nieczynnych — nieczytelny u pracownika | Średnia | Średnia | Kryterium sukcesu US-02 w `prd.md`; `archive/2026-09-13-schedule-text-export` — formatowanie jest „best-effort" i zależy od telefonu odbiorcy |

Scenariusze o dużej wadze, ale znikomym prawdopodobieństwie i poza naszą kontrolą (awaria Cloudflare, wyczerpanie darmowego limitu 100 tys. żądań/dobę, awaria Supabase) należą do **alarmów i monitoringu**, nie do testów — świadomie pominięte.

### Risk Response Guidance

| Ryzyko | Co musi zostać udowodnione | Założenie, które trzeba podważyć | Co najpierw ustalić | Najtańszy sensowny rodzaj testu | Czego nie robić |
|--------|----------------------------|----------------------------------|---------------------|--------------------------------|-----------------|
| #1 | Zapis grafiku z brakującą godziną lub kolizją jest odrzucany przez serwer (nie tylko przez przycisk), a komunikat mówi, co blokuje | „Zielony przycisk = serwer też pozwoli"; „ostrzeżenie o kolizji to to samo co blokada przy zapisie" | Gdzie zapada decyzja o zapisie; czy sprawdzenie jest atomowe przy dwóch równoległych zapisach; czy serwer liczy kompletność z tych samych danych co ekran | unit (czysta reguła) + integration (adres zapisu) | Oczekiwana wartość skopiowana z kodu produkcyjnego (test zawsze zielony); sprawdzanie tylko szczęśliwej ścieżki |
| #2 | Dla danych dostępności i godzin otwarcia logika zwraca dokładnie oczekiwane zmiany i dziury; złe lub pominięte dane widać jako błąd, nie jako pusty ekran | „Dane z bazy mają te same nazwy pól co logika"; „brak wyniku = brak grafiku"; „pusta lista = brak dostępności" (tak samo wygląda zerwany filtr) | Kształt danych na granicy bazy i logiki; pola wymagane; reprezentacja błędu ustalona jako `500 ERROR_SERVER` (nie `fieldErrors`); gwarancja leży na granicy trasy API, nie w czystej logice | unit (parsery kształtu) + kontrola na granicy trasy GET/POST/PATCH | Test napisany pod to, co zwraca kod (problem wyroczni); asertowanie implementacji zamiast reguły z opisu produktu; poleganie na czystym teście jednostkowym tam, gdzie pusta lista jest nieodróżnialna od legalnego stanu |
| #3 | Dla dat granicznych funkcje zwracają właściwy tydzień i właściwą decyzję „zamknięte/otwarte" w strefie Europe/Warsaw, nie w strefie serwera | „Serwer działa w czasie lokalnym użytkownika"; „tydzień liczy się wszędzie tak samo" | Jak wyznaczany jest początek tygodnia; w jakiej strefie działa reguła zamrożenia; czy strefy są podane jawnie; że produkcyjne wywołania pomijają wstrzykiwany zegar (`now`/`reference`), więc warstwa integracyjna wymaga fake timers | unit (funkcje czasu z ustalonymi datami) | Test zależny od „dzisiaj" i od strefy maszyny (raz zielony, raz czerwony); brak przypadków brzegowych |
| #4 | Konto drugiego właściciela nie odczyta i nie zapisze niczego z pierwszego lokalu — a test da się uruchomić jedną komendą, także w automacie | „Zielone CI wystarcza, skoro nie sprawdza SQL"; „RLS działa, bo tak było przy tworzeniu schematu" | Jak uruchomić test na lokalnej bazie; które tabele i operacje pokryć; jak wstawić konta i przełączyć kontekst | database test (pgTAP) przez lokalne CLI | Jednorazowy skrypt „od święta"; test tylko na odczyt bez próby zapisu |
| #5 | Żądanie z cudzym identyfikatorem zasobu jest odrzucane; żądanie bez zalogowania nie zmienia danych | „Skoro ekran tego nie pokazuje, nikt tego nie wyśle"; „chroni nas warstwa bazy, więc adres API nie musi sprawdzać" | Które adresy API przyjmują identyfikatory; czy nieznajomy identyfikator jest odrzucany; gdzie sprawdzana jest przynależność zasobu | integration (wywołanie adresu w kontekście dwóch właścicieli) | Test tylko szczęśliwej ścieżki właściciela; poleganie na ukryciu przycisku w interfejsie |
| #6 | Po zmianie wspólnej funkcji kluczowe odpowiedzi pozostają takie same na kilku różnych ścieżkach | „Zmiana dotyczy jednego miejsca"; „komunikaty błędów są nieistotne" | Które ścieżki korzystają z tego samego pomocnika; wspólny kształt odpowiedzi; gdzie żyją stałe komunikatów | integration (kilka adresów API naraz) | Test przyklejony do jednej trasy, który nie zauważy rozjazdu kształtu odpowiedzi na innej |
| #7 | Tekst ma dni w kolejności, zmiany posortowane po godzinie, dni nieczynne obecne, a wariant „bez formatowania" nie zawiera żadnych znaczników | „Formatowanie działa wszędzie"; „skoro na ekranie wygląda dobrze, to w schowku też" | Skąd brane są dni i godziny; jak oznaczane są dni nieczynne; czym różnią się oba warianty tekstu | unit (czysta funkcja budująca tekst) | Poprawianie oczekiwanego tekstu pod to, co zwraca kod; test tylko jednego dnia tygodnia |

## 3. Phased Rollout

Każdy wiersz to osobny etap, który otworzy własny folder zmian przez `/10x-new`. Status przesuwa się od lewej do prawej; orchestrator aktualizuje go, gdy na dysku pojawiają się kolejne pliki.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Uruchomienie testów + czysta logika grafiku i czasu | Uruchomić narzędzie do testów i pokryć najtańszą warstwę: obsadę, dziury, reguły czasu i składanie tekstu | #2, #3, #7, część #1 | unit | complete | context/changes/testing-core-logic/ |
| 2 | Reguły po stronie serwera: zapis, zamrożenie, uprawnienia | Udowodnić, że serwer odrzuca niekompletny/cudzy zapis niezależnie od interfejsu | #1 (serwer), #3, #5, #6 | integration | change opened | context/changes/testing-server-side-rules/ |
| 3 | Izolacja danych jako powtarzalny test | Zamienić ręczny test izolacji w komendę uruchamianą w automacie | #4 | database (pgTAP) | not started | — |
| 4 | Bramki jakości w automacie | Wpiąć testy i `npx astro check` w CI, by czerwona zmiana nie trafiła na produkcję | wszystkie | gates | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

Klasyczna baza testowa projektu. Narzędzia zależne od dostawcy noszą datę `checked:`, by przyszły czytelnik wiedział, co wymaga ponownej weryfikacji.

| Warstwa | Narzędzie | Wersja | Uwagi |
|---------|-----------|--------|-------|
| unit (czysta logika, tekst, czas) | Vitest | none yet — see §3 Phase 1 | Pasuje do Astro/Vite/TypeScript; brak jakiegokolwiek runnera w repo |
| integration (adresy API na Workers) | `@cloudflare/vitest-pool-workers` | none yet — see §3 Phase 2 | Otwarta beta; w sierpniu 2026 przemianowane na wersję 1; izolacja magazynu per plik testowy |
| database / RLS | pgTAP przez `supabase test db` | none yet — see §3 Phase 3 | Plik testowy musi trafić do `supabase/tests/database/`; wymaga lokalnego stacku (Docker + CLI z WSL) |
| e2e | brak — patrz §5 | n/a | Testy „od początku do końca" nie są teraz uzasadnione kosztem; najpierw warstwy tańsze |
| AI-native | brak | n/a | Nie ma potrzeby: reguły są deterministyczne, taniej złapie je zwykły test |

**Stack grounding tools (current session):**
- Docs: brak w tej sesji (dostępny jest wyłącznie serwer dokumentacji VOCS, nie dotyczący tego projektu) — oparto się na lokalnych manifestach i oficjalnej dokumentacji; checked: 2026-09-14
- Search: wbudowane wyszukiwanie w sieci — sprawdzono aktualny status narzędzi Cloudflare i Supabase; checked: 2026-09-14
- Runtime/browser: brak w tej sesji (nie ma narzędzia Playwright) — nieużywane; checked: 2026-09-14
- Provider/platform: Linear, Jenkins, Jira (zakładanie zgłoszeń / sygnał bramki) oraz CLI GitHub i Wrangler — potencjalne znaczenie dla przyszłych bramek jakości; nieużywane w tym etapie; checked: 2026-09-14

Rekomendacje w tej sekcji opierają się na lokalnych manifestach i konfiguracji oraz na narzędziach faktycznie dostępnych w tej sesji. Jeśli przydatne narzędzie do dokumentacji (np. Context7) jest niedostępne, mówimy to wprost, zamiast zakładać dostęp.

## 5. Quality Gates

Pełny zestaw bramek, które muszą przejść, zanim zmiana trafi na produkcję. „Wymagane po etapie N" znaczy, że bramka działa od momentu wdrożenia danego etapu; wcześniej jest `planowana`.

| Bramka | Gdzie | Wymagana? | Co łapie |
|--------|-------|-----------|----------|
| lint | lokalnie + CI | wymagana (działa) | dryf składni i stylu |
| typecheck (`npx astro check`) | lokalnie + CI | wymagana po §3 Phase 1 | rozjazd typów i kształtu danych między modułami (przeszedł sync+lint+build) |
| testy jednostkowe | lokalnie + CI | wymagana po §3 Phase 1 | błędy logiki obsady, dziur, czasu i tekstu |
| testy integracyjne | lokalnie + CI | wymagana po §3 Phase 2 | obejście bramki zapisu, uprawnienia, rozjazd odpowiedzi |
| izolacja danych (pgTAP) | lokalnie + CI | wymagana po §3 Phase 3 | przeciek danych między właścicielami |
| build | lokalnie + CI | wymagana (działa) | błędy budowania |
| hook po zapisie pliku | lokalnie (pętla agenta) | zalecana po §3 Phase 3 | regresje w momencie edycji |
| smoke przed produkcją | między merge a produkcją | opcjonalna | awarie specyficzne dla środowiska |

Uwaga: publikację robi Cloudflare Workers Builds po mergu na `master`, a istniejący `ci.yml` jest tylko sygnałem jakości. Dlatego bramki w CI muszą być wymagane w ochronie gałęzi GitHuba — inaczej czerwona zmiana i tak trafi na produkcję.

## 6. Cookbook Patterns

Jak dodawać nowe testy w tym projekcie. Każda podsekcja wypełnia się po wdrożeniu odpowiedniego etapu; wcześniej czyta się „TBD — patrz §3 Phase N".

### 6.1 Adding a unit test

- **Gdzie:** obok modułu — `src/…/<moduł>.test.ts` (np. `src/lib/week.test.ts`, `src/lib/services/schedule-export.test.ts`).
- **Jak:** importuj `describe`/`it`/`expect` jawnie z `vitest` (bez globali w `tsconfig`/ESLint) i importuj testowany moduł przez alias `@/…`. Środowisko to Node — nie zakładaj `window`/`document`.
- **Uruchomienie:** `npm test` (jednorazowo) / `npm run test:watch` (lokalnie). Konfiguracja: `vitest.config.ts` (alias `@/*` → `src/`, `include: ["src/**/*.test.ts"]`).
- **Wzorzec referencyjny:** `src/lib/format.test.ts`.
- **Czego tu nie robić:** modułów dotykających Supabase/Astro bez mocka ani tras API — to §6.4 (Faza 2).

### 6.2 Adding a test for schedule/time logic

- **Gdzie:** `src/lib/week.test.ts` (logika tygodnia, zamrożenia, strefy) oraz `src/lib/services/schedule-generation.test.ts` (obsada, dziury, kolizje).
- **Jak:** nie mockuj zegara — `todayInWarsaw`/`currentWeekStart`/`isFrozenWeek` przyjmują `now`/`reference`, więc podawaj konkretną chwilę (`new Date("2026-03-29T23:30:00Z")`). Daty trzymaj jako stringi `YYYY-MM-DD` i asertuj dokładne literały.
- **Uruchomienie:** `npm test`. Wzorzec referencyjny: `src/lib/week.test.ts` (tabela dni tygodnia + przypadki brzegowe: przełom roku, dzień przestępny, zmiana czasu 2026-03-29 i 2026-10-25, nieistniejący dzień miesiąca).
- **Pamiętaj:** `week.ts` nie waliduje kalendarza — `2026-02-30` przestawia się na `2026-03-02`. Walidację dat trzymamy na granicy API (§6.4).

### 6.3 Adding a test for the staff text export

- **Gdzie:** `src/lib/services/schedule-export.test.ts`.
- **Jak:** buduj `ScheduleExportInput` jako literały camelCase (nigdy wiersze bazy — kształt snake_case jest odrzucany na granicy, patrz §6.4). Asertuj dokładny tekst: kolejność dni Pn–Nd, dni nieczynne w miejscu chronologicznym, sortowanie zmian po `startTime`, `—` dla nieznanego nazwiska, brak końcowego newline.
- **Warianty:** `plain` i `formatted` pochodzą z jednego źródła struktury — test sprawdza to przez `formatted.replaceAll("*","").replaceAll("`","") === plain`, a nie przez odcinanie znaczników regexem.
- **Uruchomienie:** `npm test`. Wzorzec referencyjny: `src/lib/services/schedule-export.test.ts`.

### 6.4 Adding an integration test for an API endpoint

- TBD — patrz §3 Phase 2 (wzorzec dla bramki zapisu, uprawnień i wspólnego kształtu odpowiedzi).

### 6.5 Adding a database / RLS isolation test

- TBD — patrz §3 Phase 3 (wzorzec dla `supabase/tests/database/`, uruchamiany przez `supabase test db`).

### 6.6 Per-rollout-phase notes

(Opcjonalne. Po każdym wdrożonym etapie `/10x-implement` dopisuje tu 2–3 linie: co zaskoczyło, czego potrzebowały testy.)

## 7. What We Deliberately Don't Test

Wyłączenia ustalone podczas wywiadu (pytanie Q5). Przyszli autorzy powinni je uszanować, dopóki założenie się nie zmieni.

- **Rzeczy poza zakresem produktu** — eksport obrazka, logowanie pracowników, optymalizacja algorytmiczna, integracje, których nie ma. Ponowna ocena, gdy któryś z tych obszarów wejdzie do zakresu. (Źródło: wywiad Q5.)
- **Logowanie i konta** — rozwiązane i stabilne; wracamy, gdy pojawi się realna regresja. (Źródło: wywiad Q5.)
- **Wygląd i styl ekranów** — łatwe do wychwycenia i poprawienia ręcznie; testy wizualne dopiero, gdy pojawi się krytyczny ekran. (Źródło: wywiad Q5.)
- **Awarie poza kontrolą** — Cloudflare, Supabase, darmowe limity. Należą do monitoringu i alarmów, nie do testów. (Źródło: wywiad Q5 + analiza.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-14
- Stack versions last verified: 2026-09-14
- AI-native tool references last verified: 2026-09-14
- §3 Etap 1 (uruchomienie testów + czysta logika grafiku i czasu) wdrożony: 2026-09-14, zmiana `testing-core-logic`. Vitest 4 w środowisku Node (`vitest.config.ts`), 99 testów w `src/**/*.test.ts`, bramki `npm test` i `npm run check` dopisane do CI. Ryzyka #2, #3, #7 i serwerowa część #1 mają pokrycie jednostkowe. Etap 2 z §3 (testy integracyjne na Workers) pozostaje otwarty — walidacja granicy z tej zmiany jest pokryta testami jednostkowymi, nie integracyjnymi.

Refresh (`/10x-test-plan --refresh`) gdy:

- z roadmapy lub archiwum wypłynie nowe ryzyko z pierwszej trójki,
- data `checked:` zalecanego narzędzia jest starsza niż trzy miesiące,
- zmienia się technologia projektu (nowy framework, nowy runner testów),
- §7 „czego nie testujemy" przestaje zgadzać się z tym, w co wierzy zespół.
