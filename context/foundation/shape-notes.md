---
project: JanuszexGrafikPro
context_type: greenfield
created: 2026-09-06
updated: 2026-09-06
product_type: web-app
target_scale:
  users: medium
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-09-14
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "procedural friction — manual weekly scheduling is the dominant cost"
    - topic: "insight vs status quo"
      decision: "visual gap coverage; spreadsheets/notes do not show opening-hours coverage directly"
    - topic: "primary persona scope"
      decision: "business-owner role across independent businesses (accounts for owners only in MVP)"
    - topic: "auth strategy"
      decision: "email + password, open registration — each owner registers and manages their own business (single venue); multiple venues per owner deferred"
    - topic: "role model"
      decision: "flat single-role model (owner only); each owner sees only their business"
    - topic: "business ownership"
      decision: "one business belongs to exactly one owner; not shared between owners in v1"
    - topic: "v1 scope down"
      decision: "image/PNG export deferred to v2; v1 shares schedule via copyable text view"
    - topic: "MVP effort"
      decision: "3 weeks after-hours accepted; full v1 additionally confirmed to ship by 2026-09-14 (compressed)"
    - topic: "device context"
      decision: "owner works mainly on desktop computer; phone is not the v1 scheduling target"
    - topic: "password reset"
      decision: "password self-service reset deferred beyond v1 (accepted risk, recorded under FR-002)"
  frs_drafted: 12
  quality_check_status: accepted
---

## Timeline acknowledgment

- Acknowledged on 2026-09-06: effort estimate is a 3-week MVP (after-hours). Hard deadline confirmed by the user: full v1 must work by 2026-09-14 (8 days away at capture time). The user accepted the compressed effort; `mvp_weeks` stays 3 as the honest effort estimate, `hard_deadline` is 2026-09-14.

## Vision & Problem Statement

Janusz — właściciel kawiarni pod Zakopanem — co tydzień traci czas na ręczne układanie grafiku zmian z godzin dostępności przysyłanych przez ~5 pracowników. Musi pilnować dwóch rzeczy naraz: każda godzina otwarcia lokalu musi być obsadzona (dziura = zamknięty lokal w godzinach otwarcia = utracony przychód) oraz na zmianie nie może być nadmiaru osób. Pomyłka kosztuje realny przychód, a każdy tydzień zaczyna się od tej samej żmudnej układanki.

Status quo — notatki, arkusze, grupowy Messenger — nie pokazuje wprost, które godziny otwarcia są pokryte, a które nie. Szef musi to wyliczać sam. Wartość rozwiązania to wizualizacja pokrycia godzin otwarcia i asysta przy układaniu grafiku — a nie algorytmiczna optymalizacja, która jest świadomie poza zakresem MVP.

Nota o skali: reguła domenowa jest skalioodporna — przy 100× liczbie właścicieli (tysiące lokali) sama logika "pilnowania pokrycia" się nie zmienia; skalowalność to kwestia izolacji danych między biznesami, nie ewolucji reguły.

## Non-Goals

- Bez optymalizacji algorytmicznej (rozwiązywanie konfliktów, minimalizacja kosztów) — draft jest prostą, pomocną bazą; pełna optymalizacja byłaby droga i poza sednem v1.
- Bez auto-importu dostępności (ankiety, zewnętrzne kalendarze) — dostępność wprowadza szef ręcznie.
- Bez logowania pracowników — brak kont i ról pracowniczych w v1; załoga dostaje skopiowany widok tekstowy.
- Bez wielu menedżerów / współdzielenia biznesu — jeden biznes należy do dokładnie jednego właściciela.
- Bez natywnych aplikacji mobilnych — web w przeglądarce (głównie desktop) wystarcza v1.
- Bez eksportu grafiku jako obrazka (PNG/PDF) w v1 — tekstowy widok do skopiowania; obrazek odłożony do v2.

## User & Persona

### Persona główna: Janusz — właściciel małego lokalu gastronomicznego

- Rola: właściciel/właścicielka niezależnej kawiarni lub podobnego lokalu (kilka punktów pod jednym właścicielem jest możliwe, ale MVP zakłada obsługę jednego biznesu na konto).
- Kontekst: zespół ~5 pracowników, brak działu HR, brak systemów kadrowych. Wszystko trzyma "w głowie" + Messenger + notatki.
- Moment: pod koniec tygodnia zbiera od pracowników godziny dostępności i układa grafik na nadchodzący tydzień.
- Pracownicy NIE logują się do systemu w zakresie MVP — dostępność wprowadza szef.

## Access Control

- Logowanie: e-mail + hasło, otwarta rejestracja — każdy właściciel biznesu może sam założyć konto.
- Model ról: płaski — jedna rola "właściciel". Brak kont pracowników, brak wielu menedżerów na jeden biznes w MVP.
- Izolacja danych: każdy właściciel widzi i zarządza wyłącznie danymi swojego biznesu. Jeden biznes = dokładnie jeden właściciel; biznes nie jest współdzielony między właścicielami w v1.
- Niezalogowany użytkownik: może się zarejestrować lub zalogować; grafik i dane są dostępne tylko po zalogowaniu.

## Success Criteria

### Primary
- Janusz przenosi do systemu dostępność 5 pracowników, układa kompletny grafik i pokrywa wszystkie godziny otwarcia lokalu w czasie krótszym niż 10 minut.
- Gotowy grafik udostępnia załodze przez skopiowany tekstowy widok (jedno kliknięcie) bez dodatkowych narzędzi.

### Secondary
- Eksport grafiku jako ładny obrazek (PNG/PDF) do wrzucenia na Messengera/WhatsAppa — odłożony do v2 (scope-down).

### Guardrails
- Interfejs chroni Janusza przed pomyłkami: próba ułożenia zmiany na godzinach niedostępności pracownika jest zawsze sygnalizowana przed zapisem.
- Nieobsadzone godziny otwarcia są zawsze widoczne w widoku grafiku — dziura nie może "zniknąć" z ekranu ani zostać zapisana po cichu.

## Functional Requirements

### Authentication
- FR-001: Właściciel może założyć konto e-mailem i hasłem. Priority: must-have
  > Socrates: Kontrargument rozważony: "rejestracja to zbędny koszt w v1, wystarczy jedno konto". Rezolucja: FR zostaje — otwarta rejestracja to fundament produktu dla wielu właścicieli. Przy okazji doprecyzowano własność: biznes należy do dokładnie jednego właściciela (np. "Kawiarnia Sowa" = tylko Janusz) i w v1 nie jest współdzielony między właścicielami.
- FR-002: Właściciel może zalogować się do swojego konta. Priority: must-have
  > Socrates: Kontrargument rozważony: "login bez obsługi zapomnianego hasła zablokuje zapominalskiego właściciela". Rezolucja: ryzyko świadomie zaakceptowane — reset hasła NIE wchodzi do v1 (odłożony do v2). Świadoma zgoda na ryzyko.

### Business & godziny otwarcia
- FR-003: Właściciel może założyć swój biznes (jeden lokal) przy koncie. Priority: must-have
  > Socrates: Brak kontrargumentu; FR stoi bez zmian (jeden biznes na właściciela w v1, więcej lokali później).
- FR-004: Właściciel może zdefiniować godziny otwarcia lokalu na każdy dzień tygodnia. Priority: must-have
  > Socrates: Brak kontrargumentu; FR stoi bez zmian.

### Pracownicy i dostępność
- FR-005: Właściciel może dodać pracownika do swojego biznesu. Priority: must-have
  > Socrates: Brak kontrargumentu; FR stoi bez zmian.
- FR-006: Właściciel może dodawać, przeglądać, edytować i usuwać dostępność pracownika (wprowadzaną ręcznie). Priority: must-have
  > Socrates: Brak kontrargumentu; FR stoi bez zmian.

### Generowanie i edycja grafiku
- FR-007: Właściciel może wygenerować bazowy draft grafiku. Priority: must-have
  > Socrates: Brak kontrargumentu; FR stoi bez zmian.
- FR-008: Właściciel widzi nieobsadzone godziny otwarcia ("dziury") w widoku grafiku. Priority: must-have
  > Socrates: Brak kontrargumentu; FR stoi bez zmian.
- FR-009: Właściciel może ręcznie modyfikować draft — przesuwać i zmieniać pracowników na zmianach. Priority: must-have
  > Socrates: Brak kontrargumentu; FR stoi bez zmian.
- FR-010: System ostrzega właściciela, gdy zmiana w grafiku koliduje z niedostępnością pracownika. Priority: must-have
  > Socrates: Brak kontrargumentu; FR stoi bez zmian. (Uwaga: ostrzeżenie vs twardy blok do rozstrzygnięcia na etapie projektowania.)
- FR-011: Właściciel może zapisać gotowy grafik. Priority: must-have
  > Socrates: Brak kontrargumentu; FR stoi bez zmian. (Pytanie otwarte: czy zapisany grafik ma pozostać edytowalny — do rozstrzygnięcia.)

### Wyjście grafiku
- FR-012: Właściciel może skopiować tekstowy widok zapisanego grafiku do wysłania załodze. Priority: must-have
  > Socrates: Brak kontrargumentu; FR stoi bez zmian.

## User Stories

### US-01: Właściciel układa kompletny grafik tygodnia

- **Given** zalogowany właściciel, który ma zdefiniowany biznes z godzinami otwarcia, 5 pracowników i ich dostępności w systemie
- **When** generuje bazowy draft i ręcznie koryguje grafik
- **Then** widzi kompletny grafik pokrywający godziny otwarcia i zapisuje go

#### Acceptance Criteria
- Przed zapisem wszystkie godziny otwarcia mają przypisanego pracownika (brak dziur)
- Ułożenie pracownika na godziny jego niedostępności nie przechodzi bez ostrzeżenia

### US-02: Właściciel udostępnia grafik załodze

- **Given** zapisany kompletny grafik tygodnia
- **When** właściciel kopiuje tekstowy widok grafiku
- **Then** ma w schowku czytelny tekst i może wkleić go na grupowy Messenger/WhatsApp

#### Acceptance Criteria
- Kopiowanie tekstowego widoku jest jedną akcją
- Tekst jest zrozumiały dla pracownika bez logowania do aplikacji (kto, kiedy, godziny)
- W v1 tekst zastępuje eksport obrazka (PNG/PDF odłożony do v2)

### US-03: System ostrzega przed kolizją z niedostępnością

- **Given** właściciel edytuje draft, a pracownik ma zaznaczoną niedostępność w danym czasie
- **When** właściciel próbuje przypisać tego pracownika do zmiany w tym czasie
- **Then** system sygnalizuje kolizję, zanim zmiana zostanie zapisana

#### Acceptance Criteria
- Ostrzeżenie pojawia się przy próbie przypisania pracownika na godziny jego niedostępności
- Żadna kolizja nie zostaje zapisana po cichu

## Business Logic

Aplikacja pilnuje, aby każda godzina otwarcia lokalu miała przypisanego pracownika: draft powstaje z przypisań dostępnych pracowników do godzin otwarcia, a godziny, których nie da się obsadzić z dostępności, pozostają widoczne jako "dziury" do ręcznego uzupełnienia. Kolizje z niedostępnością pracownika są zawsze sygnalizowane przed zapisem.

Reguła konsumuje dwa rodzaje danych podawanych przez właściciela: godziny otwarcia lokalu na każdy dzień tygodnia oraz godziny dostępności każdego pracownika. Jej wyjściem jest bazowy draft grafiku — propozycja, które godziny pokrywa który pracownik. Janusz spotyka regułę w przepływie: generuje draft, widzi wynikające z niego dziury, ręcznie uzupełnia lub koryguje przypisania (z ostrzeżeniami przy kolizjach), a następnie zapisuje kompletny grafik. Nie ma tu pełnej optymalizacji — draft ma być pomocną bazą, nie automatycznym rozwiązaniem konfliktów.

## Non-Functional Requirements

- Ułożenie kompletnego grafiku tygodnia dla 5 pracowników zajmuje właścicielowi < 10 minut.
- Próba przypisania pracownika na godziny jego niedostępności otrzymuje odpowiedź (ostrzeżenie) natychmiast, bez odświeżania widoku.
- Główny przepływ (układanie grafiku) jest w pełni użyteczny na komputerze w dwóch najnowszych wersjach głównych przeglądarek desktopowych.
- Skopiowany tekstowy widok grafiku pozostaje czytelny po wklejeniu do Messengera/WhatsAppa (układ się nie łamie).
- Zapisany grafik i dane właściciela nie znikają między sesjami ani po wylogowaniu (trwałość danych).
