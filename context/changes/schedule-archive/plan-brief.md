# Archiwum zapisanych grafików (S-08) — Plan Brief

> Pełny plan: `context/changes/schedule-archive/plan.md`

## Co i dlaczego

Zapisane grafiki mają pozostać wiernym zapisem przeszłości — także wtedy, gdy właściciel później zmieni godziny otwarcia. Dziś godziny otwarcia są jednym, bieżącym zbiorem, więc edycja godzin zmienia wygląd wszystkich wcześniejszych grafików. Dodatkowo tygodnie, które już się zaczęły, mają być zamrożone: planować można wyłącznie na przyszłość.

## Punkt startowy

`/schedules` obsługuje draft i zapisany grafik (S-04–S-07): status `saved` blokuje zmiany przypisań, działa „Odblokuj do edycji" i sekcja tekstowa do wysłania załodze. Godziny otwarcia są pobierane raz, na bieżąco, i wysyłane do islandy jako prop. Nawigacja ‹ › jest nieograniczona, a kod nie zna pojęcia „tydzień bieżący".

## Stan docelowy

Tygodnie ≤ bieżący: zapisany grafik oglądasz tylko do odczytu, z godzinami otwarcia z tego tygodnia i dyskretną linijką „Archiwum — godziny otwarcia z tego tygodnia"; nie ma odblokowania ani edycji; gdy grafiku brak — komunikat zamiast generowania. Tydzień bieżący z draftem można jeszcze dokończyć. Tygodnie przyszłe działają jak dziś, a każdy zapis utrwala kopię ówczesnych godzin otwarcia.

## Kluczowe decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
| --- | --- | --- | --- |
| Przechowywanie historycznych godzin | Kopia (snapshot) godzin w kolumnie `opening_hours_snapshot` przy zapisie | Jedna kolumna i mało kodu, a archiwum przestaje dryfować | Plan (Q1) |
| Zamrożenie a draft | Zamrażamy zapisane grafiki; draft w zamrożonym tygodniu wolno dokończyć | Zapomniany draft nie zostaje uwięziony bez możliwości zapisu | Plan (Q2) |
| Stare zapisane grafiki bez kopii | Backfill w migracji + fallback w kodzie | Stare tygodnie przestają dryfować, a brak danych nie psuje odczytu | Plan (Q3) |
| Granica zamrożenia | Tydzień bieżący i minione (poniedziałek ≤ poniedziałek bieżącego, Europe/Warsaw) | Zgodne z roadmapą i chroni tydzień w toku | Plan (Q4) |
| Egzekwowanie | Twarda bramka serwera na generowanie i odblokowanie; UI dodatkowo ukrywa | Reguły nie da się obejść przez API | Plan (Q5) |
| Moment kopiowania | Przy każdym zapisie, nadpisywana przy ponownym | Kopia zawsze odpowiada chwili zamrożenia tygodnia | Plan (Q6) |
| Pusty zamrożony tydzień | Sam komunikat, bez „Generuj draft" | Spójne z regułą i bez zbędnego UI | Plan (Q7) |
| Oznaczenie archiwum | Dyskretna linijka „Archiwum…" | Użytkownik rozumie rozbieżność godzin bez żargonu | Plan (Q8) |

## Zakres

**W zakresie:** kolumna `opening_hours_snapshot` + backfill; fixture zapisanego grafiku z minionego tygodnia w seedzie; helpery tygodnia bieżącego i zamrożenia; czysty odczyt kopii; kopia godzin przy zapisie; bramka serwera na generowanie i odblokowanie; widok archiwum w islandzie z historycznymi godzinami i komunikatami.

**Poza zakresem:** wersjonowanie godzin otwarcia (osobna tabela); zmiany w `assignments.ts`; blokowanie edycji draftu w zamrożonym tygodniu; osobny ekran/spis tygodni; eksport obrazka; automatyczne testy; zmiany RLS i treści tekstu S-07.

## Architektura / podejście

Jedna nowa reguła czasu (`isFrozenWeek`, Europe/Warsaw) i jeden nowy nośnik danych (kopia godzin na wierszu grafiku) spinają trzy warstwy: migracja + seed (dane i fixture), serwis/endpoint (zapis kopii oraz 409-y dla zamrożonych tygodni) i islanda (godziny z kopii, ukrycie akcji, komunikat). Kopia godzin wraca istniejącym `select *` grafiku — bez nowego endpointu.

## Fazy w skrócie

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Dane, reguła czasu i odczyt kopii | Migracja + backfill, typy, fixture seedu, `isFrozenWeek`, `schedule-archive.ts` | Backfill to przybliżenie dla dawnych tygodni |
| 2. Serwer: kopia i bramka zamrożenia | Kopia godzin przy zapisie, 409 dla generowania/odblokowania | Pomylenie gałęzi zapisu z odblokowaniem w `PATCH` |
| 3. Islanda i strona | Historyczne godziny, linijka „Archiwum…", ukryte akcje, komunikat | Użycie kopii dla przyszłego zapisanego tygodnia |

**Wymagania wstępne:** lokalny stack Supabase z WSL (`supabase start`), Node v22, `npm run dev` z PowerShell.
**Szacowany rozmiar:** ~2–3 sesje, 3 fazy.

## Ryzyka i założenia

- Zamrożenie blokuje tworzenie grafiku na bieżący tydzień — jeśli grafik nie powstał wcześniej, zostaje tylko dokończenie draftu albo brak grafiku.
- Backfill przypisuje dawnym tygodniom bieżące godziny; prawdziwej historii nie da się odtworzyć.
- Testy archiwum zależą od fixture w seedzie, bo po zamrożeniu UI nie pozwoli utworzyć zapisanego grafiku w minionym tygodniu.
- Kopia godzin dla przyszłego, zapisanego tygodnia nie jest używana (pokazuje bieżące godziny), dopóki tydzień się nie zacznie.

## Kryteria sukcesu (skrót)

- Miniony i bieżący tydzień są tylko do odczytu dla zapisanych grafików, z godzinami otwarcia z danego tygodnia.
- Generowanie i odblokowanie w zamrożonym tygodniu są odrzucane także przez API.
- Grafik na przyszłość nadal można ułożyć, zapisać i odblokować, a zapis utrwala kopię godzin.
