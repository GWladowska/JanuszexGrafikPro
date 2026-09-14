---
change_id: testing-database-isolation
title: Izolacja danych jako powtarzalny test (Etap 3)
status: implementing
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

Otwórz folder zmian dla Etapu 3 z context/foundation/test-plan.md: "Izolacja danych jako powtarzalny test". Ryzyka objęte: #4. Planowane typy testów: database (pgTAP). Intencja odpowiedzi na ryzyko (z §2 Risk Response Guidance): - #4: udowodnić, że konto drugiego właściciela nie odczyta i nie zapisze niczego z pierwszego lokalu, a test da się uruchomić jedną komendą (także w automacie); podważyć „zielone CI wystarcza, skoro nie sprawdza SQL" i „RLS działa, bo tak było przy tworzeniu schematu"; nie robić jednorazowego skryptu „od święta" ani testu tylko na odczyt bez próby zapisu. Po utworzeniu folderu stosuj zasadę kontynuacji: research -> plan -> implement.
