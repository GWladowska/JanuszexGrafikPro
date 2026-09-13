# Tekstowy widok grafiku do skopiowania (S-07) — Implementation Plan

## Overview

Właściciel kopiuje jednym kliknięciem czytelny tekstowy widok **zapisanego** grafiku tygodnia i wkleja go na grupowy Messenger/WhatsApp. Tekst powstaje w dwóch wariantach: **z formatowaniem** (pogrubione dni + monospace godziny — najlepszy wygląd tam, gdzie aplikacja renderuje znaczniki) oraz **bez formatowania** (identyczny układ, zero znaczników — działa wszędzie, m.in. na telefonie Samsung). Kopiowanie realizuje FR-012 i US-02 (AC: jedna akcja, tekst zrozumiały bez logowania, w v1 zastępuje eksport obrazka).

## Current State Analysis

- Zapisany grafik (S-06) renderuje się read-only z zieloną plakietką „Zapisany grafik" i przyciskiem „Odblokuj do edycji" — `ScheduleBoard.tsx:546` (`isSaved`) i `:981-1031`. To naturalne miejsce na sekcję kopiowania.
- Wszystkie dane do zbudowania tekstu są już po stronie klienta: `employees` (`{id, name}[]`, prop), `openingHours` (`OpenDay[]`, prop), `weekData.assignments` (`AssignmentRow[]`), `weekStart` (stan). **Nie potrzeba nowego endpointu ani migracji.**
- Widok nie ma pojęcia dnia nieczynnego w eksporcie — dzień nieczynny wynika z **braku wpisu** w `openingHours` dla danego `weekday` (schemat: `WEEKDAYS = 1..7`, `OpenDay` z `business-validation.ts:1-8`; mapa `openingByWeekday` już istnieje w `ScheduleBoard.tsx:535`).
- Helpery tygodnia: `addDays`, `isoWeekday`, `weekdayShort`, `formatDayLabel`, `formatWeekLabel` (`src/lib/week.ts`). Brak pełnych nazw dni („Poniedziałek") — `WEEKDAY_SHORT` daje tylko `Pn`/`Wt`.
- Przypisania to `AssignmentRow` (snake_case); kontrakt czystej logiki operuje na `DraftPiece` (camelCase) — mapowanie robi istniejące `toDraftPiece`/`toDraftPieces` (`ScheduleBoard.tsx:134-140`). Lekcja `lessons.md`: nie przepuszczać surowych wierszy bazy do czystej logiki.
- **Formatowanie czatu jest wrażliwe na urządzenie** (potwierdzone testem użytkownika: na PC/iPhone renderują się bold i backticki, na Samsungu żaden znacznik). Dlatego dwa przyciski zamiast jednego, a wariant „bez formatowania" jest gwarantowanym fallbackiem.
- Roadmapa S-08 ma reużywać „tekstowy widok z S-07" → logika tekstu musi być czystym, współdzielonym modułem, nie inline w islandzie.
- Wzorce: `cn()` (`src/lib/utils.ts`), `ServerError` (`src/components/auth/ServerError.tsx`), sprzątanie stanów w `closeEditingForms()` (`ScheduleBoard.tsx:240-249`), ikony z `lucide-react`.

## Desired End State

Na `/schedules`, gdy wyświetlany grafik ma status `saved`:
1. W sekcji akcji, obok plakietki „Zapisany grafik" i „Odblokuj do edycji", pojawia się sekcja „Tekstowy widok do wysłania załodze":
   - podgląd — pole tylko do odczytu z **wersją z formatowaniem** (widoczne surowe `*` i backticki — tak trafi do schowka),
   - przycisk **„Kopiuj z formatowaniem"** (pogrubione dni + monospace godziny) z ikoną **„?"** (podpowiedź: może nie działać na wszystkich urządzeniach/aplikacjach),
   - przycisk **„Kopiuj bez formatowania"** (identyczny układ, bez znaczników),
   - feedback inline: „Skopiowano (z formatowaniem)" / „Skopiowano (bez formatowania)" lub komunikat błędu schowka.
2. Tekst zawiera: nagłówek = zakres tygodnia (`Pn 15.09 – Nd 21.09`); dni Pn–Nd w kolejności; dla każdego dnia otwartego — zmiany posortowane po godzinie startu w formie `Imię · HH:MM – HH:MM`; dla dnia nieczynnego — linia `Dzień DD.MM — nieczynne` **w miejscu chronologicznym**.
3. Dla draftu, tygodnia bez grafiku i tygodnia w trakcie nawigacji sekcja kopiowania jest nieobecna; feedback i podgląd resetują się przy zmianie tygodnia.
4. Oba przyciski działają na PC, iPhone i Samsungu (wariant bez formatowania); wariant z formatowaniem jest best-effort, oznaczony podpowiedzią.

### Key Discoveries:

- `isSaved` (`ScheduleBoard.tsx:546`) rządzi całym blokiem read-only — sekcję kopiowania wystarczy dodać wewnątrz tego gałęzienia, bez zmiany warunków widoczności akcji edycji.
- Warianty muszą powstawać z **jednego strukturalnego źródła** (lista dni → zmiany) przez helpery `bold()`/`mono()`, a nie przez regexowe zdejmowanie znaczników — inaczej treść obu wariantów mogłaby się rozjechać.
- Na skopiowanie składa się `navigator.clipboard.writeText` z fallbackiem `document.execCommand("copy")` na ukrytym polu — dla przeglądarek/kontekstów bez Clipboard API (podgląd textarea jest dodatkowym ręcznym ratunkiem).
- WhatsApp i Messenger różnią się składnią monospace (potrójny vs pojedynczy backtick); wybieramy pojedynczy (działa na PC/iPhone w teście) i świadomie akceptujemy best-effort na Androidzie — stąd ikona „?".

## What We're NOT Doing

- Kopiowania w widoku draftu — tylko `saved` (decyzja: US-02 mówi o zapisanym grafiku).
- Zmian w S-08 / archiwum (osobny slice; nowe założenia S-08 są już w roadmapie: read-only dla tygodni ≤ bieżący, historyczne godziny otwarcia).
- Nowego endpointu API, migracji, zmian schematu/seedu, `npm run db:types`.
- Eksportu jako obrazek (PNG/PDF) — Non-Goal v2.
- Automatycznych testów — brak runnera (decyzja z S-01–S-06); logika pisana czysto, wejdzie pod testy w `testing-runner-core-logic`.
- Bogacenia treści ponad US-02 (np. nazwa biznesu w nagłówku, uwagi, emoji) — decyzja: nagłówek to tylko zakres tygodnia.
- Generowania wariantu „z formatowaniem" na serwerze — tekst jest derywowany po stronie klienta z już pobranych danych.

## Implementation Approach

Dwa etapy po wzorcu S-06. Najpierw **czysty moduł** `src/lib/services/schedule-export.ts`, który z `weekStart`, przypisań (`DraftPiece[]`), pracowników i godzin otwarcia buduje strukturę dni (`buildScheduleDays`) i składa z niej oba warianty tekstu (`buildScheduleText`). Struktura jest reużywalna przez S-08, a składanie znaków oddzielone od układu — wariant plain i formatted różnią się wyłącznie obecnością `*`/backticków. Następnie **islanda** zyskuje sekcję podglądu i dwóch przycisków kopiowania w gałęzi `isSaved`, z helperem schowka (Clipboard API + fallback) i sprzątaniem stanu w `closeEditingForms()`.

## Critical Implementation Details

- **Jeden układ, dwa renderingi:** linie buduj w formie strukturalnej (`ScheduleExportDay[]`), a znaki dodawaj przez `bold(text)` / `mono(text)` przełączane flagą wariantu. Nie buduj wariantu plain przez usuwanie `*`/backticków z gotowego stringa.
- **Dni nieczynne w kolejności:** iteruj pełne 7 dni Pn–Nd; nieczynny = brak wpisu `openingHours` dla `isoWeekday(day)`. Linia nieczynnego dnia trafia między dni otwarte (nie na koniec tekstu).
- **Monospace jest best-effort:** używamy pojedynczego backticka (test: PC/iPhone). Nie próbuj dopasowywać składni pod WhatsApp (potrójny backtick) — nie da się jednym stringiem obsłużyć obu aplikacji; to jest właśnie powód istnienia przycisku „bez formatowania" i ikony „?".
- **Podgląd to `readonly` textarea, nie `<pre>`:** świadomie pokazuje surowe znaczniki („what you see is what you copy") i pozwala ręcznie zaznaczyć tekst jako fallback schowka.
- **`closeEditingForms()` czyści też feedback kopiowania** — inaczej po zmianie tygodnia zostałoby „Skopiowano".

## Phase 1: Czysta logika eksportu tekstu

### Overview

Moduł zamieniający tydzień grafiku w strukturę dni i dwa warianty tekstu — bez I/O, gotowy do reużycia przez S-08 i do przyszłych testów jednostkowych.

### Changes Required:

#### 1. Pełne nazwy dni tygodnia

**File**: `src/lib/week.ts`

**Intent**: Dodać pełne, polskie nazwy dni używane przez nagłówki dni w eksporcie, w tej samej konwencji co istniejące `WEEKDAY_SHORT`/`weekdayShort`.

**Contract**: `export function weekdayLong(date: string): string` — zwraca `"Poniedziałek"`…`"Niedziela"` na podstawie `getUTCDay()`; tablica `WEEKDAY_LONG` zdefiniowana obok `WEEKDAY_SHORT`.

#### 2. Czysty budowniczy tekstu eksportu

**File**: `src/lib/services/schedule-export.ts` (nowy)

**Intent**: Z `weekStart`, przypisań, pracowników i godzin otwarcia zbudować uporządkowaną strukturę dni, a następnie dwa warianty tekstu (z formatowaniem i bez) o identycznym układzie. Cała logika to czyste funkcje na danych wejściowych — jedyne miejsce dotykające tego kształtu.

**Contract**:

```ts
export interface ScheduleExportDay {
  workDate: string; // YYYY-MM-DD
  closed: boolean; // brak wpisu openingHours dla tego dnia
  shifts: { name: string; startTime: string; endTime: string }[]; // posortowane po startTime
}

export interface ScheduleTextResult {
  formatted: string; // nagłówek i dni bold (*...*), godziny monospace (`...`)
  plain: string; // identyczny układ bez znaczników
}

export function buildScheduleDays(input: {
  weekStart: string;
  assignments: DraftPiece[];
  employees: { id: string; name: string }[];
  openingHours: { weekday: number; opensAt: string; closesAt: string }[];
}): ScheduleExportDay[];

export function buildScheduleText(input: {
  weekStart: string;
  assignments: DraftPiece[];
  employees: { id: string; name: string }[];
  openingHours: { weekday: number; opensAt: string; closesAt: string }[];
}): ScheduleTextResult;
```

Kontrakt układu tekstu: pierwsza linia = `formatWeekLabel(weekStart)` (nagłówek, bez nazwy biznesu); pusta linia; potem bloki dni Pn–Nd — dzień otwarty: linia `weekdayLong(day) formatDayLabel(day)` + linie zmian `Imię · HH:MM – HH:MM`; dzień nieczynny: linia `weekdayLong(day) formatDayLabel(day) — nieczynne`. Bloki oddzielone pustymi liniami, brak końcowego znaku nowej linii. Imię z `employees` po `employeeId`; brak dopasowania → `—` (spójnie z resztą UI). Sortowanie zmian po `startTime` (`localeCompare`). Zero przypisań jest legalne (zapisany grafik w tygodniu w pełni zamkniętym — `createScheduleWithAssignments` zwraca pustą listę, a bramka zapisu nie widzi dziur) → wszystkie 7 dni trafia jako nieczynne.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi bez błędów typów
- `npm run lint` bez błędów
- `npx astro check` bez błędów typów (lekcja: sync/lint/build nie łapią rozjazdu kontraktów)
- `npm run build` kończy się sukcesem

---

## Phase 2: Podgląd i kopiowanie w ScheduleBoard

### Overview

Sekcja „Tekstowy widok do wysłania załodze" w widoku zapisanego grafiku: podgląd wariantu z formatowaniem, dwa przyciski kopiowania (z ikoną „?" przy formatowanym), feedback i fallback schowka.

### Changes Required:

#### 1. Sekcja kopiowania w islandzie

**File**: `src/components/schedules/ScheduleBoard.tsx`

**Intent**: W gałęzi `isSaved` (`:981-1031`) dodać podgląd i dwa przyciski kopiowania. Tekst liczony przy renderze z już dostępnych danych (`buildScheduleText` z `toDraftPieces(weekData.assignments)`, `employees`, `openingHours`, `weekStart`) — tylko gdy `isSaved`. Dodać ikonę „?" z podpowiedzią o ograniczeniach formatowania. Feedback inline (sukces per wariant / błąd), czyszczony w `closeEditingForms()`.

**Contract**:
- Nowe stany: `copiedVariant: "formatted" | "plain" | null`, `copyError: string | null`, `copyPending: boolean`, `helpOpen: boolean`; `setCopiedVariant(null)`, `setCopyError(null)` i `setHelpOpen(false)` dopisać do `closeEditingForms()` (`:240-249`); `copyPending` dopisać do `actionsPending` (`:548-555`).
- Helper schowka: `async function copyToClipboard(text: string): Promise<boolean>` — `navigator.clipboard?.writeText(text)` w `try`; przy braku/błędzie fallback na ukryty `<textarea>` + `document.execCommand("copy")`; zwraca sukces.
- Handler `submitCopy(variant: "formatted" | "plain")` — wybiera `scheduleText.formatted`/`.plain`, woła helper, ustawia feedback lub błąd.
- Podgląd: `readonly` `<textarea>` z `value={scheduleText.formatted}`, styl ciemny spójny z `controlClass` (np. `font-mono text-xs`), bez edycji.
- Ikona „?" z `lucide-react` (`HelpCircle`) — klik/tap przełącza `helpOpen`, pokazując/ukrywając pod spodem linijkę-łagodnik (działa też na telefonach, bez hovera); `aria-label` („Informacja o formatowaniu") i `title` na PC; treść generyczna: „Formatowanie może nie być widoczne na wszystkich urządzeniach i we wszystkich aplikacjach. Jeśli nie masz pewności, wybierz „Kopiuj bez formatowania"."; klasy przez `cn()`.
- Etykiety przycisków: „Kopiuj z formatowaniem" i „Kopiuj bez formatowania"; feedback: „Skopiowano (z formatowaniem)." / „Skopiowano (bez formatowania)." / komunikat błędu w stylu czerwonym (jak `ServerError`).
- Sekcja renderowana wyłącznie gdy `isSaved`, `scheduleText !== null` i `!navPending` — podczas ładowania tygodnia `setWeekStart` wyprzedza dane, więc podgląd zniknąłby na moment jako mieszanka nowego nagłówka i starych przypisań; dla draftu, braku grafiku i nawigacji sekcja nieobecna.
- **Umiejscowienie**: sekcję dodaj w gałęzi `isSaved` jako **rodzeństwo** po `<ServerError message={unlockApi.serverError} />` (`ScheduleBoard.tsx:1030`), poza ternary `{unlockConfirming ? … : …}` — inaczej zniknie na czas otwartego potwierdzenia odblokowania.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` przechodzi
- `npm run lint` bez błędów
- `npx astro check` bez błędów typów
- `npm run build` kończy się sukcesem

#### Manual Verification:

- Scenariusz A: świeże konto — zapis kompletnego grafiku pokazuje podgląd z poprawną treścią (nagłówek zakresu, dni Pn–Pt, dni nieczynne w kolejności)
- Scenariusz B: „Kopiuj z formatowaniem" na PC — wklejenie do Messengera daje pogrubione dni i monospace godzin
- Scenariusz C: „Kopiuj bez formatowania" na PC/iPhone/Samsungu — wszędzie identyczny czysty tekst bez znaczników
- Scenariusz D: ikona „?" pokazuje podpowiedź o ograniczeniach formatowania
- Scenariusz E: sekcja nieobecna dla draftu i tygodnia bez grafiku; powrót do zapisanego tygodnia resetuje feedback
- Scenariusz F: ręczne zaznaczenie i skopiowanie z podglądu działa jako fallback schowka
- Scenariusz G: kolejność zmian w dniu i dni nieczynne zgodne z chronologią

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Świadomie brak (decyzja użytkownika, brak runnera). `buildScheduleDays`/`buildScheduleText` pisane czysto, bez I/O — wejdą pod testy w `testing-runner-core-logic` bez refaktoru.

### Integration Tests:

- Brak; brak nowego kontraktu API. Weryfikacja E2E przez UI.

### Manual Testing Steps:

Scenariusze klik-po-kliku. Punkt startowy wspólny: z WSL w katalogu projektu `supabase start` + `supabase db reset` (seed: `owner@example.com` / `haslo12345`), z PowerShell `npm run dev`; przeglądarka `http://localhost:4321`.

**A. Świeże konto — kompletny grafik i podgląd:**
1. Wyloguj się. Zarejestruj nowe konto, załóż biznes „Kawiarnia Testowa". Godziny otwarcia: Pn–Pt `09:00–17:00`, So i Nd zamknięte.
2. Dodaj pracownika „Anna Testowa" z dostępnością Pn–Pt `09:00–17:00`.
3. Wejdź na „Grafik" → dla następnego tygodnia kliknij „Generuj draft". Oczekiwane: każdy dzień Pn–Pt ma zmianę Anny `09:00–17:00`, brak dziur i kolizji; przycisk „Zapisz grafik" aktywny.
4. Kliknij „Zapisz grafik" → potwierdź. Oczekiwane: widok read-only z plakietką „Zapisany grafik", przyciskiem „Odblokuj do edycji" oraz nową sekcją z podglądem tekstu i dwoma przyciskami kopiowania.
5. Sprawdź podgląd. Oczekiwane: pierwsza linia `*Pn DD.MM – Nd DD.MM*`; po pustej linii dni `*Poniedziałek DD.MM*` … `*Piątek DD.MM*`, pod każdym `Anna Testowa · \`09:00 – 17:00\``; na końcu w kolejności `*Sobota DD.MM* — nieczynne` i `*Niedziela DD.MM* — nieczynne` (surowe gwiazdki/backticki widoczne w polu).

**B. Kopiowanie z formatowaniem (PC):**
1. Kliknij „Kopiuj z formatowaniem". Oczekiwane: inline feedback „Skopiowano (z formatowaniem).".
2. Wklej do Messengera (Web/PC). Oczekiwane: nagłówek i dni pogrubione, godziny w monospace, dni nieczynne między piątkiem a niedzielą; układ nie łamie się.
3. Wklej do WhatsApp Web. Oczekiwane: sprawdź, co renderuje się na tej wersji; jeśli backticki pokazują się dosłownie — to akceptowalne (best-effort), wariant bez formatowania pozostaje alternatywą.

**C. Kopiowanie bez formatowania (PC / iPhone / Samsung):**
1. Kliknij „Kopiuj bez formatowania". Oczekiwane: feedback „Skopiowano (bez formatowania).".
2. Wklej na PC, iPhone i Samsungu (Messenger i/lub WhatsApp). Oczekiwane: **wszędzie identyczny** czysty tekst — bez `*` i backticków, dni i zmiany czytelne, dni nieczynne w kolejności.

**D. Ikona „?" (klik, nie hover):**
1. Na PC kliknij ikonę „?" obok „Kopiuj z formatowaniem". Oczekiwane: pod spodem pojawia się linijka „Formatowanie może nie być widoczne na wszystkich urządzeniach i we wszystkich aplikacjach. Jeśli nie masz pewności, wybierz „Kopiuj bez formatowania"."; ponowny klik ją ukrywa.
2. Na telefonie (Samsung/iPhone) dotknij ikony. Oczekiwane: linijka również się pokazuje (brak zależności od hovera).

**E. Tylko zapisane + nawigacja:**
1. Na świeżym koncie z kroku A przejdź na tydzień bez grafiku. Oczekiwane: brak sekcji kopiowania oraz brak podglądu.
2. Wygeneruj draft w kolejnym tygodniu (nie zapisuj). Oczekiwane: brak sekcji kopiowania (draft).
3. Wróć na tydzień z zapisanym grafikiem i skopiuj jeden z wariantów, następnie przejdź ‹ na inny tydzień i wróć. Oczekiwane: sekcja wraca, a feedback „Skopiowano…" jest wyczyszczony (brak nieaktualnego komunikatu).

**F. Ręczny fallback schowka:**
1. Kliknij w pole podglądu i zaznacz całość (Ctrl+A). Skopiuj ręcznie (Ctrl+C) i wklej na Messengera. Oczekiwane: treść zgodna z podglądem (wariant z formatowaniem, surowe znaczniki).

**G. Kolejność zmian i dni nieczynnych:**
1. Świeże konto: biznes z godzinami Pn `09:00–17:00`, Wt–Nd zamknięte; pracownicy: Anna `09:00–12:00` i Bogdan `12:00–17:00` w poniedziałek.
2. Wygeneruj draft na następny tydzień i zapisz. Skopiuj „bez formatowania" i wklej. Oczekiwane: poniedziałek ma Annę `09:00 – 12:00` przed Bogdanem `12:00 – 17:00`; wtorek–niedziela to kolejne linie `… — nieczynne`.
3. Brzeg — tydzień w pełni zamknięty: zmień godziny otwarcia na wszystkie dni zamknięte, wygeneruj draft na kolejny tydzień (zero przypisań) i zapisz go. Oczekiwane: zapis przechodzi (bramka nie widzi dziur); eksport składa się z nagłówka i 7 linii `… — nieczynne`.

## Performance Considerations

Skala MVP (~5 pracowników, ≤ kilkanaście zmian/tydzień): `buildScheduleText` to kilka przejść po dziesiątkach pozycji, liczone raz przy renderze widoku zapisanego grafiku; brak nowych zapytań, indeksów i optymalizacji (main_goal=speed).

## Migration Notes

Brak migracji i zmian schematu — `schedules`/`assignments` i enum `schedule_status` istnieją od F-01; tekst derywowany po stronie klienta. `npm run db:types` zbędne, seed bez zmian.

## References

- Roadmap: `context/foundation/roadmap.md` (S-07; zaktualizowane założenia S-08 — read-only dla tygodni ≤ bieżący, historyczne godziny otwarcia), PRD: `context/foundation/prd.md` (FR-012, US-02, NFR „skopiowany tekst pozostaje czytelny… układ się nie łamie")
- Poprzedni plan: `context/archive/2026-09-13-save-complete-schedule/plan.md` (wzorzec faz, widok read-only `isSaved`, sprzątanie `closeEditingForms`)
- Wzorce kodu: `src/components/schedules/ScheduleBoard.tsx:981-1031` (gałąź `isSaved`), `:240-249` (sprzątanie), `:134-140` (`toDraftPiece`), `src/lib/week.ts`, `src/lib/utils.ts` (`cn`), `src/components/auth/ServerError.tsx`
- Lekcje: `context/foundation/lessons.md` (helpery w `src/lib/`, `npx astro check` w bramce, mapowanie snake_case→camelCase na granicy serwisu, scenariusze E2E klik-po-kliku, pytania bez żargonu)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Czysta logika eksportu tekstu

#### Automated

- [x] 1.1 `npx astro sync` przechodzi bez błędów typów — 90359b9
- [x] 1.2 `npm run lint` bez błędów — 90359b9
- [x] 1.3 `npx astro check` bez błędów typów — 90359b9
- [x] 1.4 `npm run build` kończy się sukcesem — 90359b9

### Phase 2: Podgląd i kopiowanie w ScheduleBoard

#### Automated

- [x] 2.1 `npx astro sync` przechodzi — 84a1d8c
- [x] 2.2 `npm run lint` bez błędów — 84a1d8c
- [x] 2.3 `npx astro check` bez błędów typów — 84a1d8c
- [x] 2.4 `npm run build` kończy się sukcesem — 84a1d8c

#### Manual

- [x] 2.5 Scenariusz A: świeże konto — zapis kompletnego grafiku pokazuje podgląd z poprawną treścią (nagłówek zakresu, dni Pn–Pt, dni nieczynne w kolejności) — 84a1d8c
- [x] 2.6 Scenariusz B: „Kopiuj z formatowaniem" na PC — wklejenie do Messengera daje pogrubione dni i monospace godzin — 84a1d8c
- [x] 2.7 Scenariusz C: „Kopiuj bez formatowania" na PC/iPhone/Samsungu — wszędzie identyczny czysty tekst bez znaczników — 84a1d8c
- [x] 2.8 Scenariusz D: ikona „?" pokazuje podpowiedź o ograniczeniach formatowania — 84a1d8c
- [x] 2.9 Scenariusz E: sekcja nieobecna dla draftu i tygodnia bez grafiku; powrót do zapisanego tygodnia resetuje feedback — 84a1d8c
- [x] 2.10 Scenariusz F: ręczne zaznaczenie i skopiowanie z podglądu działa jako fallback schowka — 84a1d8c
- [x] 2.11 Scenariusz G: kolejność zmian w dniu i dni nieczynne zgodne z chronologią — 84a1d8c
