---
change_id: schedule-editing-collisions
title: Ręczna edycja draftu grafiku z ostrzeżeniami o kolizjach (S-05)
status: implemented
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

S-05 z @context/foundation/roadmap.md

Adaptacja fazy 3 (weryfikacja E2E 2026-09-13, decyzja użytkownika): select „Zamień na…" i select w formularzu dodawania to płaska lista (dostępni najpierw, niedostępni z dopiskiem „(poza dostępnością)") zamiast optgroup — sekcje optyczne wyglądały brzydko (biały odstęp) w ciemnym motywie. Scenariusze testowe w planie przeliczone na prawdziwy seed (Piotr: pon i śr 12:00–20:00; bez wtorku).

Poza pierwotnym zakresem faz — zgłoszone przez użytkownika 2026-09-13 i wykonane ad-hoc w ramach tego change'a (addendum w planie, objęte impl-review):
1. Dashboard: przycisk SignOut wystaje poza obramowanie karty „Kawiarnia Januszex".
2. Widok Pracownicy: przejście do dostępności dla każdego pracownika (link per wiersz).
3. Widok Dostępności: dodawanie dostępności inline przy każdym dniu tygodnia (zamiast jednego formularza na dole).
