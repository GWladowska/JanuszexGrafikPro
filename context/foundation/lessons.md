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

## Subagenty: typ `general-purpose` z skilli mapuj na hostowy `general`

- **Context**: Uruchamianie sub-agentów w skillach przeglądowych (/10x-plan-review Step 3, /10x-impl-review Step 2 — treść skilli dyktuje `subagent_type: "general-purpose"`); środowisko: Kilo (to repo). Incident: dwa razy podczas review availability-management pierwszy spawn kończył się „Unknown agent type: general-purpose".
- **Problem**: Skill nie zna hosta, więc literał typu agenta z jego treści nie jest wiążący — spawn pada natychmiast z błędem, przegląd traci rundę i wymaga ręcznego retry.
- **Rule**: Przed spawnem sub-agenta sprawdź listę dostępnych typów w opisie narzędzia Task (tu: `explore` / `general`); `general-purpose` z treści skilli mapuj na `general` (deep analysis), a `explore` zostaw dla szybkiego wyszukiwania. Przy błędzie „Unknown agent type" natychmiast powtórz spawn z poprawnym typem, bez zmiany promptu.
- **Applies to**: all

## Pytania do użytkownika formułuj bez żargonu — terminy techniczne wyjaśniaj analogiami

- **Context**: Interaktywne decyzje w /10x-plan-review i /10x-impl-review (triage findingów); incident: availability-management — F1 opisany żargonem („TOCTOU", „exclusion constraint btree_gist") bez tłumaczenia; użytkownik (właściciel produktu, bez znajomości technologii) poprosił o wytłumaczenie „krowie na rowie" i zrobienie z tego lekcji.
- **Problem**: Decyzje oparte na żargonie są niemożliwe do podjęcia przez nietechnicznego właściciela — albo zatwierdza w ciemno, albo proces staje.
- **Rule**: Każde pytanie decyzyjne do użytkownika pisz prostym językiem: najpierw analogia/opis co się dzieje („drzwi na klamkę vs na klucz"), potem konkretne opcje i ich realny koszt. Żargon techniczny dozwolony tylko jako dopisek w nawiasie, nigdy jako jedyny opis.
- **Applies to**: all

## Commit message w PowerShell: bez ASCII cudzysłowu w treści (here-string, polskie „”)

- **Context**: Rytuał commitów na Windows/PowerShell 5.1 (/10x-implement, /10x-impl-review — bash-owy heredoc nie działa, wiadomość idzie przez here-string @'...'@ i zmienną). Incident: dwa razy podczas availability-management `git commit -m $msg` rozpadał się na pathspece („error: pathspec …"), gdy w treści był ASCII cudzysłów " (np. „Unknown agent type", „zero migracji").
- **Problem**: PowerShell 5.1 przy przekazywaniu zmiennej do natywnego polecenia rozbija argument na cudzysłowach ASCII — commit nie powstaje, a komunikat błędu (pathspec) nie wskazuje bezpośrednio na przyczynę, więc koszt diagnozy powtarza się za każdym razem.
- **Rule**: Treść commit message pisz w here-stringu @'...'@ (nigdy heredoc — PowerShell go nie zna) i nigdy nie używaj w niej ASCII cudzysłowu " — do cytatów używaj pary polskiej „…" (oba znaki). Po błędzie „pathspec" przy commicie najpierw sprawdź cudzysłowy w treści, nie staging.
- **Applies to**: all

## Bramkę weryfikacji fazy rozszerz o `npx astro check` — sync/lint/build nie łapią błędów typów

- **Context**: Weryfikacja automatyczna faz (/10x-implement, /10x-impl-review — plan definiuje bramki `npx astro sync` + `npm run lint` + `npm run build`); incident: schedule-draft-generation (S-04) — `getAvailabilitiesForWeek` zwracał wiersze bazy w snake_case, a `generateDraft`/`isFullyCovered`/`computeHoles` oczekiwały camelCase z kontraktu `DraftInput`; ScheduleBoard przekazywał AssignmentRow (snake_case) wprost do `computeHoles`. Rozjazd przeszedł przez wszystkie trzy bramki i wyszedł dopiero w scenariuszach E2E (pusty draft, fałszywe całodzienne dziury) — dwa round-tripy re-testów z użytkownikiem.
- **Problem**: `astro sync` tylko generuje typy, eslint nie robi pełnego typechecku między modułami, a `astro build` (Vite/esbuild) wycina typy bez ich sprawdzania — rozjazd kontraktu typów między serwisem, czystą logiką i islandą nie daje żadnego czerwonego sygnału aż do ręcznych testów, gdzie koszt diagnozy jest największy.
- **Rule**: Przy weryfikacji fazy/znaczącej zmiany uruchamiaj `npx astro check` obok sync/lint/build (i dodaj go do bramki CI). Dane z bazy (snake_case) na granicy serwisu mapuj jawnie do kształtu kontraktu (camelCase) — nigdy nie przepuszczaj surowych wierszy bazy do czystej logiki ani do islandy.
- **Applies to**: implement, impl-review

## Strefę reguły domenowej ustaw jawnie w sesji seeda, nie dziedzicz strefy kontenera

- **Context**: `supabase/seed.sql` i każde miejsce, gdzie SQL liczy tydzień/dobę (`date_trunc('week', now())`) w projekcie, którego reguła domenowa jest wyrażona w konkretnej strefie (`Europe/Warsaw` — trigger `trg_availabilities_enforce_week`). Incident: testing-core-logic (Faza 2) — seed liczył tydzień w strefie sesji kontenera (UTC), trigger w `Europe/Warsaw`.
- **Problem**: Rozjazd stref istnieje tylko w niedzielę 22:00–24:00 UTC, gdy Warszawa jest już w następnym tygodniu ISO. Wtedy `supabase db reset` pada na `23000` („Nie można zmieniać dostępności w minionych tygodniach") i blokuje całe środowisko lokalne — mimo że poza tym dwugodzinnym oknem wszystko działa, więc błąd jest trudny do odtworzenia i łatwy do zignorowania.
- **Rule**: Jeśli reguła domenowa jest wyrażona w konkretnej strefie, ustaw tę strefę jawnie na początku sesji seeda (`set timezone = 'Europe/Warsaw';`) — nigdy nie polegaj na domyślnej strefie kontenera ani nie mieszaj `now()` bez strefy ze strefowym odpowiednikiem w triggerze.
- **Applies to**: plan, implement, impl-review

## Mismatch hydratacji najpierw wyklucz jako rozszerzenie przeglądarki, potem szukaj w kodzie

- **Context**: Komunikaty React o rozjeździe SSR/klient („A tree hydrated but some attributes of the server rendered HTML didn't match") na polach formularzy, zwłaszcza `type="email"` i `type="password"`. Incident: `/auth/signin` w tym repo — różnica atrybutu `style` na `<input>`, którego `FormField.tsx` w ogóle nie ustawia; treść to `background-image: url("data:…")` (ikona menedżera haseł wstrzyknięta po SSR).
- **Problem**: Wstrzyknięty atrybut nie istnieje w kodzie komponentu, więc szukanie przyczyny w aplikacji prowadzi donikąd — a objaw utrzymuje się miesiącami i wygląda jak regresja, co grozi niepotrzebnym refaktorem komponentu.
- **Rule**: Zanim zaczniesz diagnozować mismatch hydratacji w kodzie, sprawdź, czy różniący się atrybut w ogóle występuje w komponencie; jeśli nie, potwierdź rozszerzenie w trybie incognito bez dodatków i zamknij temat jako artefakt przeglądarki.
- **Applies to**: research, impl-review

## Archiwizuj zmianę test-planu dopiero po /10x-test-plan i /10x-new następnej fazy

- **Context**: Cykl życia zmian /10x-implement w trybie rollout test-planu (tu: zakończony Etap 2, `testing-server-side-rules`). Orchestrator `/10x-test-plan` (m3l1, „Rollout chain") wyprowadza stan §3 Phased Rollout **wyłącznie z plików na dysku** w `context/changes/<change-id>/` — wiersz przechodzi na `complete`, gdy istnieje tam `plan.md` w pełni `[x]`, a następny handoff dobierany jest według tej samej tabeli stanów.
- **Problem**: `/10x-archive` przenosi folder do `context/archive/`, więc po archiwizacji orchestrator dla §3 wiersza tego etapu widzi „change folder missing" — zamiast `complete` zaproponuje ponowne `/10x-new` dla już wykonanej fazy, a dowody (plan.md z `[x]`) zniknęły z aktywnego drzewa, na którym stan jest liczony. Archiwizacja przed re-runem psuje sekwencję rollout, choć nic nie mówi o samej implementacji.
- **Rule**: Po wdrożeniu etapu test-planu trzymaj kolejność: najpierw `/10x-test-plan` (zaznacza §3 `complete` i podaje next handoff), potem `/10x-new` dla następnej fazy (dowody dalej żyją w `context/changes/`), a dopiero na końcu `/10x-archive` zakończonej zmiany. Nigdy nie archiwizuj etapu test-planu przed re-runem orchestratora.
- **Applies to**: all

## Nazwa joba w `ci.yml` to publiczny kontrakt wymaganych checków rulesetu

- **Context**: Zmiana `testing-quality-gates` (Etap 4 test-planu) — ruleset „Protect" na `master` wymaga kontekstów `ci` i `integration`; GitHub dopasowuje `required_status_checks.context` do **nazwy check runa** (dla zwykłego workflow = nazwa joba, nie nazwa pliku workflow ani jego `name:`).
- **Problem**: Przemianowanie joba (albo dodanie `name:` w jobie) cicho rozbraja bramkę: żaden przebieg nie pada, a scalenie z czerwonym CI staje się możliwe, bo wymagany check „znika" z listy zgłaszanych. Dryfu nie wykrywa żaden sygnał — tylko świadomy odczyt rulesetu.
- **Rule**: Zmieniając `.github/workflows/ci.yml`, traktuj identyfikatory jobów `ci` i `integration` jak publiczne API ochrony gałęzi: zachowaj nazwy 1:1 albo w tym samym commicie zaktualizuj `context/deployment/ruleset-protect.json` i zastosuj go PUT-em (pełna reprezentacja — komendy w `deploy-plan.md`). Po każdej zmianie rulesetu weryfikuj odczytem API, że wymagane konteksty zgadzają się z rzeczywistymi check runami na PR-ze.
- **Applies to**: plan, implement, impl-review

## Pliki hooków w `.husky/` muszą mieć LF — inaczej commit z WSL pada na `\r`

- **Context**: Zmiana `testing-quality-gates` (Etap 4) — wpięcie husky v9 (`"prepare": "husky"`) i rozszerzenie `.husky/pre-commit` o `npm run check`. Repo ma globalnie `core.autocrlf=true`, a commit z WSL wykonuje hook przez `sh -e` (dash).
- **Problem**: Hook z CRLF (indeks LF, roboczy CRLF) działa z PowerShella (sh.exe Git-for-Windows toleruje `\r`), ale z WSL-owego `dash` kończy się `npx lint-staged\r: not found` i `exit 127` — commit pada w sposób niewidoczny w głównej pętli (PowerShell). Osobno: commit z WSL może paść `EXIT=1` na braku linuxowych binariów w `node_modules` zainstalowanym z Windows (`@rollup/rollup-linux-x64-gnu`, npm/cli#4828) — to ograniczenie środowiska, nie hooka.
- **Rule**: Pliki w `.husky/` pinuj do LF przez `.gitattributes` (`.husky/* text eol=lf`) i zrenormalizuj jednorazowo (`git add --renormalize .husky`); nie ruszaj globalnego `core.autocrlf` — naprawa ma być repo-scoped. Komendy, które nie przyjmują argumentów plikowych (np. `astro check`), trzymaj poza `lint-staged` (dokleja nazwy plików) — pełny typecheck idzie osobną linią hooka. Commituj z PowerShella; `HUSKY=0 git commit` z WSL stosuj tylko świadomie.
- **Applies to**: plan, implement

## `.kilo/` jest w całości ignorowane przez `*.kilo` — konfiguracja i pluginy Kilo są maszynowe, a odsłonięcie ich wpada do ESLint

- **Context**: Zmiana `agent-per-edit-hooks` — pluginy hooków per-edit w `.kilo/plugin/`. `.gitignore` zawiera `*.kilo`, co dopasowuje **sam katalog** `.kilo` (nie tylko pliki z takim rozszerzeniem), więc `git ls-files .kilo` jest puste, a `kilo.json` (z konfiguracją MCP), `rules/` i `agent-manager.json` są lokalne.
- **Problem**: Odsłonięcie pluginu przez `!.kilo/` + `.kilo/*` + `!.kilo/plugin/` wciągnęło `.kilo/plugin/*.ts` do zakresu `eslint .`, bo `eslint.config.js` czyta `.gitignore` przez `includeIgnoreFile` — lint padł na „was not found by the project service" (plik nie jest w programie TS, bo include `**/*` nie schodzi do katalogów z kropką) i zepsułby krok `ci`. Git nie pozwala odzyskać pliku, gdy wykluczony jest katalog nadrzędny — `!.kilo/` musi poprzedzać `!.kilo/plugin/`.
- **Rule**: Traktuj `.kilo/` jak `.idea/` — konfiguracja maszynowa, nie repo; kod hooków agenta trzymaj tam tylko, jeśli ma być lokalny (inaczej umieść go w śledzonym katalogu). Po każdej zmianie wzorców ignorowania sprawdź zakres `eslint .` i `astro check` — `includeIgnoreFile` czyta `.gitignore`, więc odsłonięcie ścieżki zmienia też lint.
- **Applies to**: implement, impl-review

## Zmiana tekstów UI wymaga przeglądu selektorów E2E (getByLabel/getByRole)

- **Context**: `e2e/` (Playwright — `auth.setup.ts`, `seed.spec.ts`) przy zmianach tekstów w UI (`src/components/auth`, `src/pages/auth`, `src/components/schedules`).
- **Problem**: Po polonizacji UI test `auth.setup.ts` padł na `getByLabel("Password")` i `getByRole("Sign in")` — teksty w UI zmienione na polskie, selektory zostały angielskie i czerwony E2E wyszedł dopiero na przycisku. Ten sam kształt błędu powtórzy się przy każdej zmianie etykiet/tekstów przycisków.
- **Rule**: Zmieniając teksty UI (etykiety, placeholdery, treści przycisków), przeszukaj `e2e/` pod kątem `getByLabel`/`getByRole`/`getByText` odwołujących się do zmienianych stringów i zaktualizuj je w tym samym commicie, a przed mergem uruchom `npm run test:e2e`.
- **Applies to**: implement, impl-review
