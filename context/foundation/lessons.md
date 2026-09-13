# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Ekstrahuj zduplikowane helpery endpointów do src/lib/ zanim się rozjadą

**Context**: `context/changes/business-opening-hours` — endpointy `src/pages/api/business/index.ts` i `src/pages/api/business/opening-hours.ts`. Wzorzec: helpery HTTP (`readJsonBody`, `jsonResponse`) i stałe komunikatów błędów kopiowane między plikami endpointów.

**Problem**: Kopie zaczęły się rozjeżdżać — `ERROR_NOT_CONFIGURED` po angielsku, reszta po polsku; komunikaty trafiają wprost do UI, więc dryf widzi użytkownik. Każdy nowy endpoint zwiększa ryzyko kolejnych niespójności. AGENTS.md nakazuje wspólne helpery w `src/lib/`.

**Rule**: Nowy endpoint API korzysta z helperów ze `src/lib/http.ts`; nie kopiuje `readJsonBody`/`jsonResponse` ani stałych komunikatów błędów.

**Applies to**: implement, impl-review

## Supabase CLI zawsze jako `supabase` z WSL, nigdy `npx supabase`

**Context**: Środowisko: Windows 11 + WSL (Ubuntu — tam też Docker). CLI Supabase natywnie w `/home/gwladowska/bin/supabase` (PATH z `~/.bashrc`; w komendach zwykłe `supabase`). Repo i `node_modules` na `C:\` zainstalowane z Windows. Wystąpiło w `context/changes/employee-management` (dyktowanie `npx supabase db reset/link/db push` po naprawach z przeglądu) i wcześniej w `business-opening-hours`.

**Problem**: `npx supabase` nie działa w WSL („No matching Supabase CLI binary package found for linux-x64" — node_modules ma binarki windowsowe) ani z PowerShell (nowe CLI wymaga Dockera, którego na Windows nie ma). Podyktowane komendy z `npx` zmuszają użytkownika do ręcznego tłumaczenia ich na własny setup; mieszanie CLI z dwóch środowisk wywołało już błąd wolumenów `supabase/snippets`.

**Rule**: Komendy Supabase dyktuj i wykonuj jako `supabase <cmd>` z terminala WSL w katalogu projektu (`cd /mnt/c/Repositories/Own/JanuszexGrafikPro`); nigdy `npx supabase`. Odwrotnie dla dev-serwera: `npm run dev` zawsze z PowerShell (Windows). Nie mieszaj środowisk dla tego samego `node_modules` — przejście na drugą stronę wymaga reinstalu.

**Applies to**: all

## Kroki testowe manualne jako scenariusze E2E klik-po-kliku

- **Context**: Ręczna weryfikacja E2E w planach (/10x-plan → Manual Testing Steps, /10x-implement → bramka manualna); incident: availability-management (S-03), faza 3 — skrótowe kroki testowe zmusiły użytkownika do proszenia o rozpisanie klik-po-kliku.
- **Problem**: Terse kroki testowe (jedna linia na przypadek) nie mówią testerowi-człowiekowi, od czego zacząć: konto seeda czy świeże, który tydzień, jakie dokładnie wartości i komunikaty. Tester traci czas na rekonstrukcję scenariusza albo pomija przypadki brzegowe.
- **Rule**: Manual Testing Steps w planie pisz jako konkretne scenariusze E2E: punkt startowy (konto/URL), akcje klik-po-kliku z dokładnymi wartościami (dni, godziny, treści) oraz „Oczekiwane:" z precyzyjnym zachowaniem (w tym komunikatów błędów); grupuj per stan startowy (konto seeda vs świeże konto).
- **Applies to**: plan, implement
