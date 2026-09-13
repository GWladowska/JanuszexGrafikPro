# Tekstowy widok grafiku do skopiowania (S-07) — Plan Brief

> Full plan: `context/changes/schedule-text-export/plan.md`
> Roadmap: `context/foundation/roadmap.md` (S-07; zaktualizowane założenia S-08)

## What & Why

Właściciel kopiuje jednym kliknięciem czytelny tekstowy widok **zapisanego** grafiku i wkleja go na grupowy Messenger/WhatsApp — to drugie kryterium primary PRD („Gotowy grafik udostępnia załodze przez skopiowany tekstowy widok") i realizacja FR-012 oraz US-02. Tekst trzeba podać w dwóch wariantach, bo formatowanie czatu jest wrażliwe na urządzenie: właściciel testował i na PC/iPhone działa i pogrubienie, i monospace, ale na Samsungu żaden znacznik się nie renderuje.

## Starting Point

S-04–S-06 dostarczyły cały edytor grafiku: czystą logikę pokrycia/kolizji, serwis, endpointy i islandę `ScheduleBoard`, która dla statusu `saved` pokazuje widok read-only z plakietką „Zapisany grafik" i „Odblokuj do edycji". Wszystkie dane potrzebne do tekstu (pracownicy, przypisania, godziny otwarcia, tydzień) są już w islandzie — brakuje wyłącznie warstwy składania tekstu i akcji kopiowania.

## Desired End state

W widoku zapisanego grafiku, obok plakietki i przycisku odblokowania, pojawia się podgląd tekstu oraz dwa przyciski: „Kopiuj z formatowaniem" (pogrubione dni + monospace godziny, z ikoną „?" ostrzegającą, że może nie działać na wszystkich urządzeniach) i „Kopiuj bez formatowania" (identyczny układ, zero znaczników — działa wszędzie). Tekst zawiera nagłówek z zakresem tygodnia, dni Pn–Nd, zmiany posortowane po godzinie startu oraz dni nieczynne **w kolejności chronologicznej**. Kopiowanie to jedna akcja, z feedbackiem inline.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Zakres przycisku | Tylko grafiki `saved` | US-02 mówi o zapisanym grafiku; chroni przed wysłaniem niedokończonego draftu | Plan (pytanie) |
| Układ tekstu | Dniem: dzień → zmiany w kolejności godzin | Pasuje do układu ekranu i pytania załogi „co mam w poniedziałek?" | Plan (pytanie) |
| Formatowanie | Dwa przyciski: z formatowaniem (bold + backticki) i bez (bez znaczników) | Formatowanie pęka na części urządzeń (Samsung), a nie da się wykryć aplikacji docelowej | Plan (pytanie + test użytkownika) |
| Ikona „?" | Podpowiedź przy wariancie z formatowaniem | Uprzedza, że pogrubienie/monospace może nie działać wszędzie | Plan (pytanie) |
| UX | Podgląd (wersja z formatowaniem) + dwa przyciski + feedback | „What you see is what you copy", a podgląd jest zapasowym trybem ręcznego skopiowania | Plan (pytanie) |
| Nagłówek | Tylko zakres tygodnia | Pracownicy wiedzą, gdzie pracują; nazwa biznesu zbędna | Plan (pytanie) |
| Dni nieczynne | Dzień po dniu, w kolejności chronologicznej | Kompletny obraz tygodnia bez rozdzielania informacji na koniec | Plan (pytanie) |
| Wariant plain | Identyczny układ, tylko bez znaczników | Oba warianty różnią się wyłącznie znacznikami — przewidywalne | Plan (pytanie) |
| Miejsce logiki | Czysty moduł `src/lib/services/schedule-export.ts` | S-08 ma reużywać tekstowego widoku; czysta funkcja wejdzie pod przyszłe testy | Research (roadmap S-08) |

## Scope

**In scope:** czysty moduł `schedule-export.ts` (`buildScheduleDays`, `buildScheduleText`) + `weekdayLong` w `week.ts`; sekcja podglądu i dwóch przycisków kopiowania w widoku `saved`; helper schowka z fallbackiem; feedback inline; sprzątanie stanu przy nawigacji.

**Out of scope:** kopiowanie draftów; zmiany S-08/archiwum; nowy endpoint lub migracje; eksport obrazka (v2); automatyczne testy; nazwa biznesu/emoji w treści.

## Architecture / Approach

```
ScheduleBoard (island, gałąź isSaved)
  ├─ buildScheduleText({ weekStart, assignments: toDraftPieces(...), employees, openingHours })
  │     └─ buildScheduleDays → ScheduleExportDay[] (Pn–Nd, dni nieczynne z braku openingHours)
  │           └─ { formatted, plain }  ← bold()/mono() przełączane flagą wariantu
  ├─ podgląd: readonly textarea (wersja formatted)
  └─ „Kopiuj z formatowaniem" / „Kopiuj bez formatowania"
        └─ navigator.clipboard.writeText → fallback: ukryty textarea + execCommand("copy")
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Czysta logika eksportu | `buildScheduleDays` + `buildScheduleText`, pełne nazwy dni | Dni nieczynne w kolejności; warianty z jednego źródła (bez regexowego zdejmowania znaczników) |
| 2. Podgląd i kopiowanie | Sekcja w `isSaved`, dwa przyciski, ikona „?", feedback, fallback schowka | Warunki widoczności (`isSaved`), czyszczenie feedbacku przy nawigacji, zachowanie schowka na urządzeniach |

**Prerequisites:** S-06 zmergowane (jest); lokalny Supabase + seed (`owner@example.com` / `haslo12345`).
**Estimated effort:** ~1–2 sesje w 2 fazach; brak migracji i nowych zależności (ikony z `lucide-react` już są).

## Open Risks & Assumptions

- Renderowanie formatowania zależy od aplikacji i urządzenia — wariant z formatowaniem jest świadomie best-effort; gwarancję daje przycisk „bez formatowania" (NFR „układ się nie łamie" spełniony przez ten wariant).
- Składnia monospace różni się między WhatsApp (potrójny backtick) i Messengerem (pojedynczy) — wybrano pojedynczy (działa na PC/iPhone w teście); nie da się jednym stringiem zadowolić obu.
- Brak automatycznych testów na czystej logice eksportu to świadomy dług do `testing-runner-core-logic`.

## Success Criteria (Summary)

- Zapisany grafik da się skopiować jednym kliknięciem w dwóch wariantach, a tekst jest zrozumiały dla pracownika bez logowania (kto, kiedy, godziny).
- Wariant „bez formatowania" wygląda identycznie na PC, iPhone i Samsungu — bez surowych znaczników i bez łamania układu.
- Dni nieczynne i kolejność zmian w dniu są zgodne z chronologią; draft i brak grafiku nie pokazują sekcji kopiowania.
