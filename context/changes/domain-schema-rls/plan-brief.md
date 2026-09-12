# Schemat domeny z migracjami i RLS — Plan Brief

> Full plan: `context/changes/domain-schema-rls/plan.md`

## What & Why

Budujemy fundament danych dla JanuszexGrafikPro (roadmap F‑01): pełny schemat domeny z migracjami i regułami RLS, które izolują dane każdego właściciela. Bez tego kroku żaden kolejny element roadmapy (biznes, pracownicy, dostępności, grafik) nie ma na czym stanąć. To jedyna inwestycja poprzeczna w projekcie, więc ma być kompletna, ale możliwie prosta.

## Starting Point

Repo ma gotowe uwierzytelnianie (Supabase Auth, e‑mail + hasło, middleware) i klienta Supabase na publicznym kluczu, ale **zero migracji, zero schematu domeny i zero typów bazy**. `supabase/config.toml` ma już włączone migracje i seed, których pliki dopiero powstaną. Projekt zdalny nie jest podłączony do repo.

## Desired End State

Po ukończeniu: `npx supabase db reset` odtwarza całą bazę z migracji, lokalnie działa konto testowe z przykładową kawiarnią i danymi, kod ma wygenerowane typy, a w Supabase Studio widać sześć tabel z włączonym RLS. Migracje są też zastosowane na zdalnym projekcie, więc kolejne kroki mają działający backend.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
| --- | --- | --- | --- |
| Dostępność pracownika | Konkretne daty | Odwzorowuje tygodniowe zgłoszenia załogi bez zgadywania i modelu cyklicznego. | Plan |
| Pojedyncza zmiana | Dowolne godziny od–do | Naturalne dla kawiarni i łatwe do ręcznej korekty. | Plan |
| Model czasu | Czas lokalny bez strefy | Brak pułapek z przeliczaniem stref, w tym na Cloudflare/workerd. | Plan |
| Godziny otwarcia | Jeden ciągły przedział na dzień | Najprostsze i wystarczające dla v1; brak wiersza = zamknięte. | Plan |
| Tabela właściciela | Brak — FK wprost do `auth.users` | Jedno źródło prawdy o właścicielu, bez zbędnego dublowania. | Plan |
| Spójność `business_id` | Klucze obce złożone | Baza sama odrzuca wiersz z `business_id` sprzecznym z rodzicem. | Plan |
| Strategia RLS | Funkcja `security definer` + `business_id` na tabelach | Jedna spójna reguła, brak rekurencji polityk i brak luk przy nowych tabelach. | Plan |
| Cykl życia grafiku | Status `draft`/`saved`, jeden grafik na tydzień (od poniedziałku) | Proste i zgodne z US‑01; brak historii wersji w v1. | Plan |
| Kolizje zmian i niedostępności | Ostrzeżenia w aplikacji, bez blokady w bazie | FR‑010 i guardrail nie rozstrzygają ostrzeżenie-vs-blok; nie blokujemy pracy nad szkicem. | Roadmap/PRD |
| Usuwanie danych | Twarde z kaskadą | Prosto, bez „duchów”; historia zapisanych grafików nie jest wymaganiem v1. | Plan |
| Typy bazy | Generowane i commitowane | CI oraz edytor mają typy bez generowania; odświeżanie skryptem. | Plan |
| Seed lokalny | Konto właściciela + przykładowe dane | Po `db reset` można od razu klikać kolejne kroki. | Plan |
| Zakres F‑01 | Schemat + RLS + typy (bez logiki) | Logika draftu i kolizji należy do S‑03…S‑06; fundament nie dubluje zakresów. | Roadmap |

## Scope

**In scope:** dwie migracje (schemat, RLS), typ `schedule_status`, sześć tabel, klucze obce i złożone, ograniczenia CHECK/UNIQUE, indeksy, trigger `updated_at`, funkcja `is_business_owner`, pełne polityki RLS, generowane i commitowane typy, skrypt `npm run db:types`, lokalny `seed.sql` z kontem i danymi, ręczne wdrożenie migracji na Supabase.

**Out of scope:** logika generowania draftu i liczenia dziur, walidacja kolizji w bazie, warstwa usług i typy domenowe, historia wersji grafików, UI, automatyczne migracje w CI, pgTAP/runner testów bazy.

## Architecture / Approach

Łańcuch relacyjny jest kręgosłupem integralności: Właściciel (`auth.users`) → Biznes → Pracownik → Dostępność, oraz Biznes → Grafik → Przypisanie. Dodatkowo każda tabela niesie `business_id` jako skrót do właściciela, spięty **kluczami obcymi złożonymi** (`employees`/`schedules` mają `unique (business_id, id)`, a tabele potomne wskazują tę parę). Dzięki temu polityki RLS sprowadzają się do jednego warunku `is_business_owner(business_id)`, a baza sama pilnuje spójności — bez triggerów i bez polegania na kodzie aplikacji. Cały czas lokalny, bez stref; dzień tygodnia w ISO 1–7.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migracja schematu domeny | Sześć tabel, typ, ograniczenia, indeksy, trigger | Błąd w kluczach złożonych lub ograniczeniach; `week_start`/ISO |
| 2. Migracja reguł RLS | Funkcja + pełne polityki dla każdej operacji i tabeli | Rekurencja RLS lub luka w polityce potomnej |
| 3. Typy, seed i narzędzia | `database.types.ts`, skrypt npm, `seed.sql`, dokumentacja | Zapis do `auth.users` zależny od wersji Supabase; seed tylko lokalnie |
| 4. Wdrożenie na Supabase (ręczne) | Migracje zastosowane na produkcji | Brak rollbacku DDL; krok człowiek-gated |

**Prerequisites:** Docker + `npx supabase start` do pracy lokalnej; ręczny dostęp do projektu produkcyjnego Supabase (`supabase link`) przed fazą 4; Node 22.
**Estimated effort:** ~1 sesja robocza, 4 fazy; fazy 1–3 lokalne, faza 4 to krótki krok ręczny.

## Open Risks & Assumptions

- Wstawianie do `auth.users` w seedzie zależy od wewnętrznego kształtu tabel Supabase — po aktualizacji CLI seed może wymagać drobnej korekty. Stąd minimalny, ostro komentowany zapis.
- Brak runnera testów: izolację RLS weryfikujemy ręcznymi zapytaniami SQL, więc regresję łatwo przeoczyć bez dyscypliny.
- Zielone CI nie sprawdza SQL migracji — bramka jakości nie wykryje błędu w schemacie ani w politykach.
- Otwarte pytania PRD (ostrzeżenie vs twardy blok; czy zapisany grafik pozostaje edytowalny) nie blokują F‑01: schemat toleruje oba warianty (status grafiku, brak blokady nakładania), a decyzje zapadną w S‑05/S‑06.
- Czas lokalny bez stref zakłada jedną strefę. Gdyby pojawił się lokal w innej strefie, model wymaga przebudowy.

## Success Criteria (Summary)

- `npx supabase db reset` odtwarza bazę z migracji i seeda bez błędów; logowanie kontem testowym działa lokalnie.
- Zapytania SQL na dwóch kontach potwierdzają, że właściciel nie widzi ani nie modyfikuje cudzych danych.
- `npx supabase migration list --linked` pokazuje zgodność migracji lokalnych i zdalnych, a na produkcji widać tabele z RLS.
