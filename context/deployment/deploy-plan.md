---
project: januszex-grafik-pro
created_at: 2026-09-07
plan_type: cloudflare-integration-deployment
source_contracts:
  - context/foundation/infrastructure.md
  - context/foundation/tech-stack.md
platform: Cloudflare Workers (plan Free, $0/mo)
auto_deploy: Workers Builds (natywna integracja Cloudflare z Gitem)
status: plan-do-akceptacji
note: Po akceptacji wykonać zgodnie z konwencją 10x m1l5 jako context/deployment/deploy-plan.md
---

# Plan: Wdrożenie aplikacji na Cloudflare Workers

## Co chcemy osiągnąć

Aplikacja ma być dostępna pod darmowym adresem `https://januszex-grafik-pro.<subdomena>.workers.dev`. Każdy push do gałęzi `master` ma automatycznie budować i publikować nową wersję. Logowanie przez Supabase ma działać end-to-end na produkcji.

Plan ma 8 faz (0–7). Każda kończy się widocznym efektem, który da się sprawdzić.

## Słowniczek (minimum, żeby czytać plan bez zagadywania do AI)

| Pojęcie | Co to znaczy w tym projekcie |
|---|---|
| **Worker** | „Aplikacja" uruchomiona na serwerach Cloudflare — dostaje zapytania HTTP i zwraca gotowe strony |
| **wrangler** | Narzędzie (wiersz poleceń) do współpracy z Cloudflare: logowanie, publikacja, logi, cofanie zmian |
| **workers.dev** | Darmowa domena, którą Cloudflare przydziela każdej aplikacji |
| **build / „zbudowanie"** | Zamiana kodu źródłowego w gotowy do uruchomienia pakiet (`npm run build` → katalog `dist/`) |
| **build-time vs runtime** | Wartość „wypieczona" w pakiecie podczas budowania vs wartość odczytywana w trakcie działania aplikacji. Nasze sekrety są wypiekane przy budowaniu — zmiana = trzeba zbudować od nowa |
| **Workers Builds** | Usługa Cloudflare, która sama buduje i publikuje aplikację po każdym pushu do `master` (zamiennik GitHub Actions do deployu) |
| **astro:env** | Mechanizm Astro do przekazywania sekretów do kodu serwerowego; u nas wypieka je przy budowaniu |
| **Site URL (Supabase)** | Adres, na który Supabase wysyła użytkownika po kliknięciu linku z maila potwierdzającego |

## Najważniejsza pułapka: lokalne vs produkcyjne wartości Supabase

**Twoje lokalne `.env` zawiera wartości deweloperskie, które NADAJĄ SIĘ TYLKO do pracy na Twoim komputerze:**

```
SUPABASE_URL=http://127.0.0.1:54321        ← lokalny Supabase (npx supabase start)
SUPABASE_KEY=sb_publishable_...            ← klucz lokalnego projektu
```

Jeśli te wartości trafią do buildu publikowanego na Cloudflare, logowanie na produkcji nie zadziała — aplikacja będzie próbowała rozmawiać z „Supabasem" na własnym komputerze 127.0.0.1, którego u Cloudflare nie ma. Dlatego do buildu produkcyjnego potrzebujesz wartości z **chmurowego projektu Supabase** (jak je zdobyć → Faza 0).

---

## Faza 0 — Skąd wziąć SUPABASE_URL i SUPABASE_KEY + przygotowanie lokalne

### Krok A: Zdobądź produkcyjne wartości Supabase

Wartości pochodzą z panelu chmurowego Supabase (nie z lokalnego projektu):

- [ ] Jeśli masz już projekt na supabase.com → przejdź do następnego punktu. Jeśli korzystasz tylko z lokalnego Supabase (`npx supabase start`) → zaloguj się na supabase.com i załóż darmowy projekt (to krok dla człowieka, ok. 5 minut).
- [ ] W panelu Supabase otwórz swój projekt i znajdź:
  - **SUPABASE_URL** → Project Settings → **Data API** → „Project URL" (wygląda tak: `https://abcdefgh.supabase.co`),
  - **SUPABASE_KEY** → Project Settings → **API Keys** → **Publishable key** (zaczyna się od `sb_publishable_...`; w starszych projektach: „anon public key").
- [ ] Zapisz te dwie wartości u siebie (np. w menedżerze haseł). **Nigdy nie używaj do aplikacji klucza `service_role` / „secret key"** — ten klucz omija zabezpieczenia bazy i jest tylko do zadań administracyjnych.

Uwaga: klucz `publishable`/`anon` nie jest tajemnicą — jest projektowany na działanie w publicznej aplikacji. Bezpieczeństwo danych zapewniają polityki RLS w bazie.

### Krok B: Przygotuj pliki i konfigurację

- [ ] W `wrangler.jsonc` zmień nazwę aplikacji z `"10x-astro-starter"` na `"januszex-grafik-pro"`. Nazwa decyduje o adresie strony — **musi być poprawiona przed pierwszą publikacją**, bo potem zmiana nazwy tworzy drugą, pustą aplikację.
- [ ] Plik `.env` (używany przy budowaniu przez Astro) zostaw z wartościami lokalnymi (127.0.0.1) — do developmentu. Plik `.dev.vars` — też lokalny, używa go `npx wrangler dev`. Uwaga: `wrangler dev` czyta **tylko** `.dev.vars` i ignoruje `.env`.
- [ ] Zbuduj projekt **z produkcyjnymi wartościami nadpisanymi w konsoli** (nadpisanie w sesji PowerShell ma wyższy priorytet niż plik `.env`, więc pliki dev zostają nietknięte):

  ```powershell
  $env:SUPABASE_URL = "https://twoj-projekt.supabase.co"
  $env:SUPABASE_KEY = "sb_publishable_..."
  npm run build
  ```

- [ ] Sprawdź, że build przeszedł i katalog `dist/` powstał (błędy prerenderu pokazałyby się tutaj).
- [ ] Smoke test lokalny: `npm run dev` → strona główna działa; wejście na `/dashboard` przenosi na `/auth/signin`. Opcjonalnie też `npx wrangler dev` (najbliższa symulacja produkcji).
- [ ] Zrób commit i push zmiany nazwy (deploy jeszcze się nie uruchomi — Cloudflare nie zna jeszcze repo; to spodziewane).

## Faza 1 — Pierwsza publikacja (ręczna, kroki dla człowieka)

- [ ] W terminalu: `npx wrangler login` → otworzy się przeglądarka, zaloguj się na konto Cloudflare. Token zostaje zapisany lokalnie (`%USERPROFILE%\.wrangler`).
- [ ] Nadal w tej samej sesji PowerShell (żeby produkcyjne `$env:` były ustawione!): `npx wrangler deploy`. Cloudflare tworzy aplikację i darmowy adres `https://januszex-grafik-pro.<subdomena-konta>.workers.dev`. **Zanotuj ten adres — będzie potrzebny w Fazie 2.**
- [ ] Sprawdź w przeglądarce: strona główna otwiera się, `/dashboard` przenosi na `/auth/signin`, formularz logowania się renderuje. (Logowanie **jeszcze nie zadziała** — Supabase nie zna nowego adresu; naprawiamy to w Fazie 2.)

## Faza 2 — Podłączenie Supabase do nowego adresu (krytyczne, inaczej rejestracja nie działa)

**Jak działa rejestracja dzisiaj (krok po kroku):**

1. Użytkownik wypełnia formularz rejestracji → aplikacja pyta Supabase o utworzenie konta.
2. Supabase wysyła maila z linkiem potwierdzającym.
3. Użytkownik klika link → Supabase potwierdza konto i **przekierowuje przeglądarkę na adres zapisany w panelu jako „Site URL"** (kod aplikacji nie podaje własnego adresu, więc Supabase bierze ten domyślny).
4. Użytkownik ląduje na stronie głównej **niezalogowany** i musi sam wejść w „Sign in" i wpisać email + hasło.

Do wykonania:

- [ ] W panelu Supabase → Authentication → **URL Configuration** ustaw:
  - **Site URL** = adres produkcyjny z Fazy 1 (`https://januszex-grafik-pro.<sub>.workers.dev`),
  - **Redirect URLs** = ten sam adres produkcyjny + `http://localhost:4321` (potrzebne do pracy lokalnej).
- [ ] Bez tego kroku link potwierdzający z maila będzie wskazywał stary/lokalny adres i rejestracja na produkcji będzie wyglądać na „zepsutą".
- [ ] **Świadome ograniczenie MVP — brak „callback route"**: nasza aplikacja nie ma strony typu `/auth/callback`, która po kliknięciu w mail odbierałaby token, logowała użytkownika i przerzucała go od razu do `/dashboard`. Dziś po kliknięciu w link użytkownik ląduje na stronie głównej i musi się zalogować ręcznie (punkt 4 wyżej). To działa, ale jest mniej wygodne. Lepszy flow to mała zmiana w kodzie (przekazanie `emailRedirectTo` w rejestracji + dodanie strony `/auth/callback`) — odnotowane jako przyszłe ulepszenie, poza zakresem tego planu.
- [ ] Edge case — limity maili: darmowy plan Supabase ma twardy limit wysyłanych maili (kilka na godzinę). Podczas testów nie wysyłaj rejestracji w kółko; przy realnych użytkownikach trzeba będzie podłączyć własną skrzynkę SMTP (poza zakresem MVP).
- [ ] Edge case — baza danych: zmiany schematu bazy robimy ręcznie i tylko świadomie (brak automatycznych migracji w MVP).

## Faza 4 czyta wartości z chmury — sekrety w Cloudflare (build-time)

*(Faza 3 w poprzedniej wersji)*

Pamiętasz: sekrety są „wypiekane" w aplikację podczas budowania. Cloudflare buduje aplikację na swoim serwerze, więc to **jemu** musimy podać wartości:

- [ ] Panel Cloudflare → Workers & Pages → `januszex-grafik-pro` → Settings → **Build** → *Build variables and secrets* → dodaj:
  - `SUPABASE_URL` — typ **Text** (to nie jest sekret),
  - `SUPABASE_KEY` — typ **Secret** (Cloudflare ukryje wartość).
- [ ] Uwaga na mylące pole: w ustawieniach Workera jest też sekcja *Variables and Secrets* (runtime). **Nie ona** steruje naszą aplikacją — wartości z tamtąd kod nie czyta. Zawsze Settings → **Build**.
- [ ] Rotacja klucza w przyszłości = zmiana wartości w *Build variables* + nowy push (Cloudflare odbuduje aplikację). Komenda `npx wrangler secret put` **nie zadziała** dla tej aplikacji — dopisz to do dokumentacji (Faza 7).
- [ ] Wyzwól przebudowanie (push lub przycisk „Retry build") i sprawdź na produkcji, że aplikacja już nie pokazuje „Supabase is not configured".

## Faza 5 — Automatyczne publikowanie po pushu (Workers Builds)

- [ ] Panel Cloudflare → Worker → Settings → **Builds** → **Connect** → wybierz repozytorium `GWladowska/JanuszexGrafikPro` (konto GitHub jest już połączone), gałąź produkcyjna: `master`.
- [ ] Build command: `npm run build`; Deploy command: `npx wrangler deploy` (wartości domyślne — zostaw).
- [ ] Push testowy na `master` → w panelu (zakładka Deployments) zobaczysz przebieg budowania i publikacji; strona dalej działa.
- [ ] **Opcjonalne, zalecane**: włącz *non-production branch builds* — push na inny branch stworzy podglądową wersję (preview URL) z komentarzem/status na Pull Requestcie, nie dotykając produkcji. Od tej chwili budowanie lokalne nie jest już potrzebne do publikacji — robi to Cloudflare.

## Faza 6 — Zamek na gałęzi `master` (ochrona przed wypuszczeniem błędu)

Dlaczego: publikacja następuje automatycznie po pushu. Jeśli ktoś wypchnie błędny kod bez testów, trafi on na produkcję. Jedyną zaporą jest CI (GitHub Actions: synchronizacja typów + lint + build).

- [ ] GitHub → Settings → Branches → dodaj regułę ochrony dla `master`:
  - wymagany zielony status **CI** przed scaleniem,
  - wymuś Pull Request zamiast bezpośredniego pusha.
- [ ] Opcjonalnie: dodaj `SUPABASE_URL`/`SUPABASE_KEY` (produkcyjne) jako repo secrets w GitHub — pola są opcjonalne, więc CI przejdzie i bez nich, ale build będzie wierniejszy produkcyjnemu.
- [ ] Zasada stała: **GitHub Actions nigdy nie publikuje** — to robi wyłącznie Workers Builds.

## Faza 7 — Sprawdzenie produkcji

- [ ] Test end-to-end: rejestracja → mail → klik w link → logowanie → `/dashboard` z zalogowanym użytkownikiem. (Pierwszy mail może trafić do SPAM-u.)
- [ ] W terminalu: `npx wrangler tail` — podgląda logi działającej aplikacji na żywo; powtórz smoke test i popatrz, czy nie ma wyjątków.
- [ ] Panel Cloudflare → Analytics: zanotuj bazowy poziom zużycia CPU na zapytanie i dzienną liczbę zapytań. Limity darmowego planu: 10ms czasu procesora na zapytanie i 100 tys. zapytań/dzień (po przekroczeniu aplikacja zwraca błąd 1027, bez płacenia „nadwyżki").
- [ ] **Przećwicz raz cofanie wersji**: po testowym pushu wykonaj `npx wrangler rollback` — aplikacja wraca do poprzedniej wersji. Zapamiętaj: rollback cofa **tylko kod**. Jeśli w międzyczasie zmieniła się baza Supabase, to naprawiasz ręcznie.

## Faza 7.5 — Porządki w dokumentacji

- [ ] `AGENTS.md` — dodaj dwie linijki: (1) „Deploy target = Cloudflare Workers przez `@astrojs/cloudflare` v13+; Cloudflare Pages jest wycofywane — nie używać komend `wrangler pages`"; (2) „Rotacja klucza Supabase = zmiana Build variables (Settings → Build) + push; `wrangler secret put` nie wpływa na `astro:env`".
- [ ] `tech-stack.md` — popraw frontmatter: `deployment_target: cloudflare-pages` → `cloudflare-workers` (dokument twierdzi coś innego niż realny kod — usunięcie sprzeczności, o której pisze `infrastructure.md`).
- [ ] Dopisz do `tech-stack.md`: publikację robi Workers Builds, nie GitHub Actions (`ci_provider` w nagłówku = tylko quality gate).

---

## Ściągawka awaryjna (edge case'y)

| # | Objaw / scenariusz | Co się stało | Co zrobić |
|---|---|---|---|
| E1 | Błąd **1027** / aplikacja odmawia przy dużym ruchu | Przekroczony darmowy limit: 100 tys. zapytań/dzień albo 10ms CPU na zapytanie | Sprawdź w Analytics, który limit; odchudź SSR (ciężkie widoki renderuj w przeglądarce); przy realnym ruchu: plan Workers Standard ($5/mo, **bez zmian w kodzie**) |
| E2 | Błąd **1101** / „Worker threw exception" — zwłaszcza po dodaniu nowej biblioteki | Biblioteka wymaga Node.js, a Cloudflare używa lżejszego środowiska (workerd) | Odtwórz lokalnie przez `npx wrangler dev`; zamień bibliotekę na taką, która działa w edge (przykład bezpiecznej: `@supabase/ssr`) |
| E3 | Build się wywala, w treści `sharp` / `fs` / `satori` | Znane tarcia workerd przy prerenderze (withastro/astro #15684, #16553, #17346); w Astro 6 prerender domyślnie działa w workerd | W `astro.config.mjs` dodaj do konfiguracji adaptera opcję `prerenderEnvironment: 'node'` (dotyczy tylko prerenderu; SSR dalej workerd) |
| E4 | Mail potwierdzający prowadzi na localhost / redirect odrzucony | Supabase nie zna nowego adresu produkcji | Faza 4 — uzupełnij **Site URL** i **Redirect URLs** |
| E5 | Strona działa, ale „Supabase is not configured" na produkcji | Sekrety wpisane w złej sekcji (runtime zamiast build) albo nie było przebudowania | Przenieś do Settings → **Build** → Build variables i wymuś rebuild pushem |
| E6 | Zmiana klucza przez `wrangler secret put` „nie działa" | Kod czyta wartość wypieczoną przy budowaniu, nie z sekretów runtime | Zmień wartość w Build variables + push (Faza 4); `wrangler secret put` zacznie mieć sens dopiero przy ewentualnej migracji kodu na runtime-env |
| E7 | Błędy hydratacji („Hydration mismatch") na własnej domenie | Opcja Cloudflare „Auto Minify" psuje JS na strefie | Wyłącz Auto Minify w ustawieniach strefy (na gołym `*.workers.dev` problem nie występuje) |
| E8 | Złe daty/tygodnie w grafiku na produkcji, choć lokalnie dobrze | Środowisko workerd inaczej obsługuje strefy czasowe/`Intl` niż Node | Testy dat z jawnym locale; przed pierwszym live grafikiem sprawdź wyrenderowany tydzień w `npx wrangler dev` |
| E9 | Klient kawiarni chce własną domenę (np. grafik.kawiarnia.pl) | Cloudflare wymaga, żeby DNS domeny był prowadzony w ich strefie | Dodaj domenę jako strefę Cloudflare → Worker → Settings → Domains & Routes; domena z zewnętrznego rejestratora bez migracji DNS nie zadziała |
| E10 | W przyszłości użycie `Astro.session` powoduje błąd | Sesje na Cloudflare wymagają magazynu KV o nazwie `SESSION` | Utwórz KV namespace i dodaj binding `SESSION` w `wrangler.jsonc` (obecnie nieużywane — potwierdzone grepem) |

## Kryteria akceptacji

- [ ] `https://januszex-grafik-pro.<sub>.workers.dev` odpowiada poprawnie (200).
- [ ] Pełny przepływ działa na produkcji: rejestracja → potwierdzenie z maila → logowanie → `/dashboard`.
- [ ] Push na `master` sam buduje i publikuje; scalenie z czerwonym CI jest niemożliwe.
- [ ] Rotacja klucza przetestowana raz (Build variable + rebuild).
- [ ] Rollback przetestowany raz.
- [ ] `AGENTS.md` i `tech-stack.md` zaktualizowane — dokumentacja nie sugeruje nigdzie Cloudflare Pages.

## Poza zakresem tego planu

- Własna domena (E9 to tylko ściąga na przyszłość), plan płatny, osobny Supabase staging.
- Deploy z GitHub Actions (celowo zastąpiony Workers Builds).
- Przepięcie sekretów na runtime (`cloudflare:workers` env bridge) — wrócić, jeśli klucze będą się często zmieniać.
- Zautomatyzowane migracje bazy Supabase (MVP: ręcznie, po decyzji człowieka).

## Otwarte pytania

1. Finalna subdomena `*.workers.dev` znana dopiero po pierwszej publikacji (Faza 1) — podmień placeholder `<subdomena-konta>` w notatkach.
2. Czy włączyć podglądowe wersje dla PR-ów od razu? Rekomendacja: **tak** — darmowe, izolowane od produkcji.
