---
change_id: testing-server-side-rules
title: Testy reguł serwerowych Etapu 2: zapis, zamrożenie, uprawnienia
status: archived
created: 2026-09-14
updated: 2026-09-14
archived_at: 2026-09-14T02:19:59Z
---

## Notes

Otwórz folder zmian dla Etapu 2 z context/foundation/test-plan.md: "Reguły po stronie serwera: zapis, zamrożenie, uprawnienia".
Ryzyka objęte: #1 (część serwerowa), #3, #5, #6. Planowane typy testów: integration.
Intencja odpowiedzi na ryzyka (z §2 Risk Response Guidance):
- #1: udowodnić, że zapis grafiku z brakującą godziną lub kolizją jest odrzucany przez serwer, a nie tylko przez przycisk, a odpowiedź mówi, co blokuje; podważyć założenie „zielony przycisk = serwer też pozwoli"; nie kopiować oczekiwanej wartości z kodu produkcyjnego.
- #3: udowodnić, że daty graniczne dają właściwy tydzień i właściwą decyzję zamknięte/otwarte w strefie Europe/Warsaw; podważyć „serwer działa w czasie lokalnym"; nie pisać testów zależnych od dzisiejszej daty ani od strefy maszyny — produkcyjne wywołania pomijają wstrzykiwany zegar, więc potrzebne są fake timers.
- #5: udowodnić, że żądanie z identyfikatorem zasobu innego właściciela jest odrzucane, a żądanie bez zalogowania nie zmienia danych; podważyć „skoro ekran tego nie pokazuje, nikt tego nie wyśle"; nie poprzestawać na szczęśliwej ścieżce właściciela.
- #6: udowodnić, że po zmianie wspólnego pomocnika kluczowe odpowiedzi pozostają takie same na kilku różnych ścieżkach; podważyć „zmiana dotyczy jednego miejsca"; nie przyklejać testu do jednej trasy.
Po utworzeniu folderu stosuj zasadę kontynuacji: research -> plan -> implement.
