# ☕ JanuszexGrafikPro

**Układaj tygodniowy grafik zmian w kilka minut — bez arkuszy, notatek i „na oko".**

JanuszexGrafikPro to webowa aplikacja dla właścicieli małych lokali gastronomicznych (kawiarni, baru, bistra),
która zamienia ręczne układanie grafiku w szybki, bezpieczny przepływ: dostępność pracowników → **bazowy draft
grafiku** → wizualizacja nieobsadzonych godzin otwarcia („dziur") → korekta z ostrzeżeniami → zapis → **udostępnienie
załodze jednym kliknięciem** (tekst do wklejenia na Messengera/WhatsAppa).

> **Problem, który rozwiązuje:** każda godzina otwarcia lokalu musi być obsadzona, a na zmianie nie może być
> nadmiaru osób. Pomyłka = utracony przychód. Aplikacja pilnuje pokrycia godzin otwarcia za Ciebie i nie pozwala
> zapisać grafiku z dziurami **po cichu**.

Produkcja: [januszex-grafik-pro.g-wladowska.workers.dev](https://januszex-grafik-pro.g-wladowska.workers.dev)

---

## Główne funkcje

- **Konto właściciela** — otwarta rejestracja i logowanie e-mailem i hasłem (Supabase Auth), chronione trasy, izolacja danych **per właściciel** (Row-Level Security).
- **Biznes i godziny otwarcia** — założenie lokalu (jeden na konto) i definicja godzin otwarcia na każdy dzień tygodnia.
- **Zarządzanie pracownikami** — dodawanie i edycja pracowników przypisanych do Twojego biznesu.
- **Dostępności pracowników** — ręczne wprowadzanie godzin dostępności na tydzień (z blokadą zapisu do minionych tygodni).
- **Generowanie draftu grafiku** — bazowa propozycja obsady powstaje automatycznie z dostępności pracowników.
- **Widok „dziur"** — nieobsadzone godziny otwarcia są **zawsze widoczne** i nie mogą zniknąć z ekranu.
- **Ręczna edycja draftu** — przesuwanie i zmiana pracowników na zmianach z **natychmiastowymi ostrzeżeniami o kolizjach** z niedostępnością (przed zapisem).
- **Zapis kompletnego grafiku** — serwer odrzuca zapis, jeśli została dziura albo kolizja, i zwraca listę blokad.
- **Eksport tekstowy** — kopiowanie czytelnego widoku grafiku (wariant zwykły i sformatowany) jedną akcją, gotowego do wklejenia na grupowy Messenger/WhatsApp.
- **Archiwum grafików** — tygodnie minione i bieżący są zamrożone (read-only, z historycznymi godzinami otwarcia); edycja i planowanie tylko dla tygodni przyszłych.

---

## Tech Stack

| Warstwa           | Technologia                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**     | [Astro 6](https://astro.build) — pełny SSR (`output: "server"`), wyspy interaktywne                                                                              |
| **UI**            | [React 19](https://react.dev) (islands `@astrojs/react`), [Tailwind CSS 4](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com) (new-york), lucide-react |
| **Język**         | TypeScript 5.9 (strict), walidacja na granicach API                                                                                                              |
| **Baza danych**   | [Supabase](https://supabase.com) — Postgres z migracjami SQL i politykami **RLS**                                                                                |
| **Auth**          | Supabase Auth (e-mail + hasło), `@supabase/ssr` (sesja cookie)                                                                                                   |
| **Backend / API** | Astro route handlers (`src/pages/api/*`) + czyste serwisy domenowe (`src/lib/services/`)                                                                         |
| **Testy**         | [Vitest 4](https://vitest.dev) (unit + integration), [Playwright](https://playwright.dev) (E2E), pgTAP przez Supabase CLI (RLS)                                  |
| **Jakość kodu**   | ESLint 9, Prettier, `astro check`, Husky + lint-staged                                                                                                           |
| **Deployment**    | [Cloudflare Workers](https://workers.cloudflare.com) (`@astrojs/cloudflare` v13+, wrangler 4), Workers Builds (auto-deploy)                                      |
| **CI**            | GitHub Actions — jakość (lint, typecheck, testy, build), **nigdy nie publikuje**                                                                                 |

### Model danych (domena)

`businesses` → `opening_hours`, `employees` → `availabilities`, `schedules` (status `draft`/`saved`) → `assignments`.
Jeden biznes = dokładnie jeden właściciel; każda tabela jest odizolowana politykami RLS (testowane pgTAP-em).

---

## Uruchomienie lokalne

### Wymagania

- **Node.js 22.14.0** (patrz `.nvmrc`)
- **npm** (menedżer pakietów)
- **Docker + Supabase CLI** — do lokalnej bazy danych i auth (`supabase`)

### Konfiguracja zmiennych środowiskowych

Skopiuj szablon do dwóch plików:

```powershell
Copy-Item .env.example .env        # Node / astro dev i build
Copy-Item .env.example .dev.vars   # wrangler dev
```

Uzupełnij wartości:

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=sb_publishable_...
```

- Do **rozwoju lokalnego** użyj wartości z lokalnego Supabase (`supabase start`).
- Do **deployu** użyj wartości z chmurowego projektu Supabase (Project Settings → Data API / API Keys, klucz **publishable**, nigdy `service_role`).
- Oba pliki są w `.gitignore` — **nigdy nie commituj realnych kluczy**.

### Krok po kroku

**1. Zainstaluj zależności:**

```powershell
npm install
```

**2. Uruchom lokalny Supabase (z WSL, w katalogu projektu):**

```bash
supabase start
supabase db reset   # migracje + seed (konto demo: owner@example.com / haslo12345)
```

**3. Odpal dev-server (z PowerShell):**

```powershell
npm run dev
```

Aplikacja działa pod adresem **http://localhost:4321**.

### Pozostałe komendy

| Komenda                             | Opis                                                  |
| ----------------------------------- | ----------------------------------------------------- |
| `npm run build`                     | Produkcyjny build (Astro → `dist/`)                   |
| `npm run preview`                   | Podgląd zbudowanej aplikacji                          |
| `npm run check`                     | Typecheck całego projektu (`astro check`)             |
| `npm run lint` / `npm run lint:fix` | ESLint (autofix)                                      |
| `npm run format`                    | Prettier (całe repo)                                  |
| `npm run db:types`                  | Regeneracja typów bazy do `src/lib/database.types.ts` |

---

## Testy

| Rodzaj                   | Komenda                    | Wymagania                                                | Pokrycie                                                                                             |
| ------------------------ | -------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Unit** (Vitest)        | `npm test`                 | brak (bez bazy)                                          | Czysta logika: obsada/dziury, kolizje, reguły czasu, eksport tekstu                                  |
| **Unit (watch)**         | `npm run test:watch`       | brak                                                     | jw.                                                                                                  |
| **Integration** (Vitest) | `npm run test:integration` | lokalny Supabase: `supabase start` + `supabase db reset` | Reguły serwera: bramka zapisu, zamrożenie tygodni, uprawnienia/izolacja, kształty odpowiedzi API     |
| **Baza / RLS** (pgTAP)   | `supabase test db` (z WSL) | lokalny stack Supabase                                   | Izolacja danych między właścicielami — 51 asercji w `supabase/tests/database/rls_isolation.test.sql` |
| **E2E** (Playwright)     | `npm run test:e2e`         | lokalny Supabase + dev-server na `http://localhost:4321` | Ścieżki użytkownika w przeglądarce (seed test; świadomie poza CI)                                    |

Przykładowe uruchomienie jednego testu E2E:

```powershell
npm run test:e2e -- e2e/seed.spec.ts --project=chromium --reporter=line
```

> **Bramki jakości (wymagane przed mergem):** lint, `astro check`, testy jednostkowe, testy integracyjne,
> pgTAP i build — egzekwowane przez GitHub ruleset „Protect" (job-y `ci` i `integration` w CI) oraz lokalnie przez hook husky przy commicie.

---

## Deployment

Produkcja działa na **Cloudflare Workers** (plan Free, $0/mo) pod adresem:
**[https://januszex-grafik-pro.g-wladowska.workers.dev](https://januszex-grafik-pro.g-wladowska.workers.dev)**

- **Auto-deploy:** Cloudflare **Workers Builds** — każdy push/merg na `master` sam buduje (`npm run build`) i publikuje (`npx wrangler deploy`). GitHub Actions to tylko quality gate.
- **Ręczny deploy:**

  ```powershell
  npx wrangler login     # jednorazowo
  npm run build
  npx wrangler deploy
  ```

- **Sekrety produkcyjne** (`SUPABASE_URL`, `SUPABASE_KEY`) — wartości z chmurowego projektu Supabase, czytane w runtime z bindingów Workera:

  ```powershell
  npx wrangler secret put SUPABASE_URL
  npx wrangler secret put SUPABASE_KEY
  ```

  Rotacja klucza = `wrangler secret put` + redeploy.

- **Logi:** `npx wrangler tail` • **Cofnięcie wersji:** `npx wrangler rollback` (cofa tylko kod, nie zmiany bazy).

> Szczegóły procesu (fazy wdrożenia, ściągawka awaryjna, sterowanie rulesetem) znajdziesz w `context/deployment/deploy-plan.md`.

---

## Licencja i autor

- **Autor:** Gabriela Władowska
- **Licencja:** [MIT](https://opensource.org/licenses/MIT) — możesz używać, modyfikować i rozpowszechniać ten projekt, pod warunkiem zachowania informacji o prawach autorskich i licencji.

---

**Struktura repo:** `src/pages/` — trasy i API • `src/components/` — komponenty (React islands w `schedules/`, `business/`, `employees/`, `availabilities/`, `auth/`; shadcn/ui w `ui/`) • `src/lib/` — helpery i serwisy domenowe • `supabase/migrations/` — migracje SQL • `context/` — dokumentacja produktowa (PRD, roadmapa, plan testów, plany deployu).
