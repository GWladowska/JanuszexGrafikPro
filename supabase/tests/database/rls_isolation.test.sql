-- =============================================================================
-- Test izolacji RLS — JanuszexGrafikPro (Etap 3 planu testów, ryzyko #4)
--
-- ⚠️  LOCAL / CI ONLY — ten plik wstawia wiersze bezpośrednio do auth.users.
--     Nigdy nie uruchamiać na zdalnym projekcie (`supabase test db --linked`)
--     ani nie wgrywać na produkcję. Bezpieczny wyłącznie lokalnie i w CI,
--     gdzie baza jest odtwarzana przez `supabase db reset`.
--
-- Uruchomienie (z WSL, w katalogu projektu, po `supabase start`):
--   supabase db reset      # migracje + seed na czysto
--   supabase test db       # plik jest wycofywany transakcją (rollback)
--
-- Co dowodzi (ryzyko #4) — dla każdej z 6 tabel domenowych:
--   * odczyt:     właściciel A widzi wyłącznie wiersze swojego biznesu,
--   * zapis:      A nie doda cudzego (42501), nie zmieni i nie usunie cudzego
--                 (0 zmienionych wierszy — RLS po cichu filtruje, nie rzuca błędu),
--   * pozytywnie: A może czytać i pisać swoje (test nie przechodzi „wszystko zablokowane"),
--   * stan zamków: polityki nadal istnieją i ochrona wierszy jest włączona,
--   * anon:       0 wierszy we wszystkich tabelach.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

-- Strefa reguł domenowych: trigger dostępności liczy tydzień w Europe/Warsaw
-- (migracja 20260913212151). Bez tego test czerwienieje w niedzielę
-- 22:00–24:00 UTC, gdy Warszawa jest już w następnym tygodniu ISO.
set local timezone = 'Europe/Warsaw';

-- Deterministyczne rozwiązywanie funkcji pgTAP (schema extensions) na wypadek,
-- gdyby produkcyjny search_path nie zawierał `extensions`.
set local search_path = public, extensions;

-- plan(51) = 12 strukturalne (6× policies_are + 6× relrowsecurity)
--          +  6 odczyt właściciela A
--          + 18 zapis zablokowany (6 tabel × insert/update/delete)
--          +  8 kontrola pozytywna (5× insert + 2× update + 1× delete)
--          +  1 symetria właściciela B
--          +  6 anon = 51
select plan(51);

-- -----------------------------------------------------------------------------
-- Fixtures: właściciele A i B (po jednym biznesie) oraz konto C bez biznesu.
-- C jest wyłącznie celem ataku INSERT na `businesses`: `unique (owner_id)`
-- uniemożliwia celowanie w B (drugi biznes tego samego właściciela nie powstanie).
-- Wstawiamy jako rola uprzywilejowana (pg_prove łączy się jako postgres, który
-- omija RLS), PRZED przełączeniem na `authenticated`.
-- -----------------------------------------------------------------------------
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'rls-a@example.com', crypt('haslo-a', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'rls-b@example.com', crypt('haslo-b', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'rls-c@example.com', crypt('haslo-c', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Kawiarnia A (test izolacji)'),
  ('bbbbbbbb-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Kawiarnia B (test izolacji)');

insert into public.opening_hours (id, business_id, weekday, opens_at, closes_at) values
  ('99999999-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 1, '08:00', '18:00'),
  ('99999999-2222-2222-2222-222222222222', 'bbbbbbbb-2222-2222-2222-222222222222', 1, '08:00', '18:00');

insert into public.employees (id, business_id, name, contact_email) values
  ('cccccccc-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 'Pracownik A', 'pracownik.a@example.com'),
  ('cccccccc-2222-2222-2222-222222222222', 'bbbbbbbb-2222-2222-2222-222222222222', 'Pracownik B', 'pracownik.b@example.com');

-- Dostępności na bieżący tydzień (trigger przepuszcza bieżący i przyszłe).
insert into public.availabilities (id, business_id, employee_id, work_date, start_time, end_time) values
  ('ffffffff-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 'cccccccc-1111-1111-1111-111111111111', date_trunc('week', now())::date, '08:00', '16:00'),
  ('ffffffff-2222-2222-2222-222222222222', 'bbbbbbbb-2222-2222-2222-222222222222', 'cccccccc-2222-2222-2222-222222222222', date_trunc('week', now())::date, '08:00', '16:00');

-- Grafiki bieżącego tygodnia w statusie draft (trigger przypisań puszcza tylko draft).
insert into public.schedules (id, business_id, week_start, status) values
  ('dddddddd-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', date_trunc('week', now())::date, 'draft'),
  ('dddddddd-2222-2222-2222-222222222222', 'bbbbbbbb-2222-2222-2222-222222222222', date_trunc('week', now())::date, 'draft');

insert into public.assignments (id, business_id, schedule_id, employee_id, work_date, start_time, end_time) values
  ('eeeeeeee-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 'dddddddd-1111-1111-1111-111111111111', 'cccccccc-1111-1111-1111-111111111111', date_trunc('week', now())::date, '08:00', '16:00'),
  ('eeeeeeee-2222-2222-2222-222222222222', 'bbbbbbbb-2222-2222-2222-222222222222', 'dddddddd-2222-2222-2222-222222222222', 'cccccccc-2222-2222-2222-222222222222', date_trunc('week', now())::date, '08:00', '16:00');

-- -----------------------------------------------------------------------------
-- Pomocnik: wykonuje próbę zapisu bieżącą rolą (RLS działa) i zwraca liczbę
-- zmienionych wierszy. Wbudowany pgTAP 1.2.0 nie potrafi otworzyć
-- `update/delete ... returning` jako kursora („cannot open EXECUTE query as
-- cursor"), więc „zapis bez efektu" dowodzimy licznikiem: 0 = nic nie zmieniono.
-- Sekcja pozytywna poniżej waliduje pomocnika (oczekuje 1), więc test nie może
-- przejść fałszywie, gdyby licznik zawsze zwracał 0.
-- -----------------------------------------------------------------------------
create function pg_temp.rls_affected(sql text) returns integer
language plpgsql
as $$
declare
  affected integer;
begin
  execute sql;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- -----------------------------------------------------------------------------
-- Stan zamków (rola uprzywilejowana): komplet polityk i ochrona wierszy.
-- To łapie migrację, która usuwa politykę albo wyłącza RLS — nawet gdy część
-- zachowań nadal wygląda poprawnie.
-- -----------------------------------------------------------------------------
select policies_are('public', 'businesses', array['businesses_select_owner', 'businesses_insert_owner', 'businesses_update_owner', 'businesses_delete_owner']::name[], 'businesses: komplet polityk RLS');
select policies_are('public', 'opening_hours', array['opening_hours_select_owner', 'opening_hours_insert_owner', 'opening_hours_update_owner', 'opening_hours_delete_owner']::name[], 'opening_hours: komplet polityk RLS');
select policies_are('public', 'employees', array['employees_select_owner', 'employees_insert_owner', 'employees_update_owner', 'employees_delete_owner']::name[], 'employees: komplet polityk RLS');
select policies_are('public', 'availabilities', array['availabilities_select_owner', 'availabilities_insert_owner', 'availabilities_update_owner', 'availabilities_delete_owner']::name[], 'availabilities: komplet polityk RLS');
select policies_are('public', 'schedules', array['schedules_select_owner', 'schedules_insert_owner', 'schedules_update_owner', 'schedules_delete_owner']::name[], 'schedules: komplet polityk RLS');
select policies_are('public', 'assignments', array['assignments_select_owner', 'assignments_insert_owner', 'assignments_update_owner', 'assignments_delete_owner']::name[], 'assignments: komplet polityk RLS');

select results_eq($$select relrowsecurity from pg_class where oid = 'public.businesses'::regclass$$, array[true], 'businesses: ochrona wierszy włączona');
select results_eq($$select relrowsecurity from pg_class where oid = 'public.opening_hours'::regclass$$, array[true], 'opening_hours: ochrona wierszy włączona');
select results_eq($$select relrowsecurity from pg_class where oid = 'public.employees'::regclass$$, array[true], 'employees: ochrona wierszy włączona');
select results_eq($$select relrowsecurity from pg_class where oid = 'public.availabilities'::regclass$$, array[true], 'availabilities: ochrona wierszy włączona');
select results_eq($$select relrowsecurity from pg_class where oid = 'public.schedules'::regclass$$, array[true], 'schedules: ochrona wierszy włączona');
select results_eq($$select relrowsecurity from pg_class where oid = 'public.assignments'::regclass$$, array[true], 'assignments: ochrona wierszy włączona');

-- -----------------------------------------------------------------------------
-- Właściciel A — kontekst uwierzytelniony.
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

-- ===== Odczyt: A widzi wyłącznie swoje =====
select results_eq('select distinct owner_id from public.businesses', array['11111111-1111-1111-1111-111111111111'::uuid], 'A widzi tylko swój biznes');
select results_eq('select distinct business_id from public.opening_hours', array['aaaaaaaa-1111-1111-1111-111111111111'::uuid], 'A widzi tylko swoje godziny otwarcia');
select results_eq('select distinct business_id from public.employees', array['aaaaaaaa-1111-1111-1111-111111111111'::uuid], 'A widzi tylko swoich pracowników');
select results_eq('select distinct business_id from public.availabilities', array['aaaaaaaa-1111-1111-1111-111111111111'::uuid], 'A widzi tylko swoje dostępności');
select results_eq('select distinct business_id from public.schedules', array['aaaaaaaa-1111-1111-1111-111111111111'::uuid], 'A widzi tylko swoje grafiki');
select results_eq('select distinct business_id from public.assignments', array['aaaaaaaa-1111-1111-1111-111111111111'::uuid], 'A widzi tylko swoje przypisania');

-- ===== Zapis cudzego odrzucony (6 tabel × insert/update/delete) =====

-- businesses — INSERT celuje w konto C bez biznesu, żeby uniknąć kolizji
-- z unique (owner_id) i mieć deterministyczny błąd RLS (42501), nie 23505.
select throws_ok($$insert into public.businesses (owner_id, name) values ('33333333-3333-3333-3333-333333333333', 'Biznes C (atak)')$$, '42501', NULL, 'A nie doda biznesu innemu właścicielowi');
select is(pg_temp.rls_affected($$update public.businesses set name = 'przechwycone' where owner_id = '22222222-2222-2222-2222-222222222222'$$), 0, 'A nie zmieni cudzego biznesu (0 wierszy)');
select is(pg_temp.rls_affected($$delete from public.businesses where owner_id = '22222222-2222-2222-2222-222222222222'$$), 0, 'A nie usunie cudzego biznesu (0 wierszy)');

-- opening_hours — atak na weekday 5 (B ma zajęty tylko 1 → brak kolizji z unique).
select throws_ok($$insert into public.opening_hours (business_id, weekday, opens_at, closes_at) values ('bbbbbbbb-2222-2222-2222-222222222222', 5, '09:00', '17:00')$$, '42501', NULL, 'A nie doda godzin do cudzego biznesu');
select is(pg_temp.rls_affected($$update public.opening_hours set opens_at = '07:00' where business_id = 'bbbbbbbb-2222-2222-2222-222222222222'$$), 0, 'A nie zmieni cudzych godzin otwarcia (0 wierszy)');
select is(pg_temp.rls_affected($$delete from public.opening_hours where business_id = 'bbbbbbbb-2222-2222-2222-222222222222'$$), 0, 'A nie usunie cudzych godzin otwarcia (0 wierszy)');

-- employees — unikalne nazwisko „Intruz" (B nie ma takiego pracownika).
select throws_ok($$insert into public.employees (business_id, name) values ('bbbbbbbb-2222-2222-2222-222222222222', 'Intruz')$$, '42501', NULL, 'A nie doda pracownika do cudzego biznesu');
select is(pg_temp.rls_affected($$update public.employees set name = 'przechwycone' where business_id = 'bbbbbbbb-2222-2222-2222-222222222222'$$), 0, 'A nie zmieni cudzych pracowników (0 wierszy)');
select is(pg_temp.rls_affected($$delete from public.employees where business_id = 'bbbbbbbb-2222-2222-2222-222222222222'$$), 0, 'A nie usunie cudzych pracowników (0 wierszy)');

-- availabilities — inna data niż fixture B (środa bieżącego tygodnia), więc brak
-- kolizji z regułą wykluczającą nakładki; employee_id należy do B (złożony FK).
select throws_ok($$insert into public.availabilities (business_id, employee_id, work_date, start_time, end_time) values ('bbbbbbbb-2222-2222-2222-222222222222', 'cccccccc-2222-2222-2222-222222222222', date_trunc('week', now())::date + 2, '08:00', '10:00')$$, '42501', NULL, 'A nie doda dostępności w cudzym biznesie');
select is(pg_temp.rls_affected($$update public.availabilities set start_time = '09:00' where business_id = 'bbbbbbbb-2222-2222-2222-222222222222'$$), 0, 'A nie zmieni cudzych dostępności (0 wierszy)');
select is(pg_temp.rls_affected($$delete from public.availabilities where business_id = 'bbbbbbbb-2222-2222-2222-222222222222'$$), 0, 'A nie usunie cudzych dostępności (0 wierszy)');

-- schedules — następny poniedziałek (B ma grafik tylko na bieżący tydzień),
-- więc unique (business_id, week_start) nie koliduje.
select throws_ok($$insert into public.schedules (business_id, week_start, status) values ('bbbbbbbb-2222-2222-2222-222222222222', date_trunc('week', now())::date + 7, 'draft')$$, '42501', NULL, 'A nie doda grafiku w cudzym biznesie');
select is(pg_temp.rls_affected($$update public.schedules set status = 'saved' where business_id = 'bbbbbbbb-2222-2222-2222-222222222222'$$), 0, 'A nie zmieni cudzego grafiku (0 wierszy)');
select is(pg_temp.rls_affected($$delete from public.schedules where business_id = 'bbbbbbbb-2222-2222-2222-222222222222'$$), 0, 'A nie usunie cudzego grafiku (0 wierszy)');

-- assignments — wskazuje szkic i pracownika B (złożone FK), trigger draft puszcza,
-- więc pierwsza blokuje polityka RLS.
select throws_ok($$insert into public.assignments (business_id, schedule_id, employee_id, work_date, start_time, end_time) values ('bbbbbbbb-2222-2222-2222-222222222222', 'dddddddd-2222-2222-2222-222222222222', 'cccccccc-2222-2222-2222-222222222222', date_trunc('week', now())::date + 2, '08:00', '10:00')$$, '42501', NULL, 'A nie doda przypisania w cudzym grafiku');
select is(pg_temp.rls_affected($$update public.assignments set start_time = '09:00' where business_id = 'bbbbbbbb-2222-2222-2222-222222222222'$$), 0, 'A nie zmieni cudzych przypisań (0 wierszy)');
select is(pg_temp.rls_affected($$delete from public.assignments where business_id = 'bbbbbbbb-2222-2222-2222-222222222222'$$), 0, 'A nie usunie cudzych przypisań (0 wierszy)');

-- ===== Kontrola pozytywna: A pisze swoje (wolny tydzień / wolne dni) =====
-- Bez tej sekcji test przechodziłby także wtedy, gdyby RLS blokował wszystko.
select lives_ok($$insert into public.opening_hours (business_id, weekday, opens_at, closes_at) values ('aaaaaaaa-1111-1111-1111-111111111111', 4, '09:00', '17:00')$$, 'A doda własne godziny otwarcia');
select lives_ok($$insert into public.employees (business_id, name, contact_email) values ('aaaaaaaa-1111-1111-1111-111111111111', 'Nowy Pracownik A', 'nowy.a@example.com')$$, 'A doda własnego pracownika');
select lives_ok($$insert into public.availabilities (id, business_id, employee_id, work_date, start_time, end_time) values ('ffffffff-1111-1111-1111-00000000000f', 'aaaaaaaa-1111-1111-1111-111111111111', 'cccccccc-1111-1111-1111-111111111111', date_trunc('week', now())::date + 7, '08:00', '10:00')$$, 'A doda własną dostępność (przyszły tydzień)');
select lives_ok($$insert into public.schedules (business_id, week_start, status) values ('aaaaaaaa-1111-1111-1111-111111111111', date_trunc('week', now())::date + 7, 'draft')$$, 'A doda własny grafik (przyszły tydzień)');
select lives_ok($$insert into public.assignments (business_id, schedule_id, employee_id, work_date, start_time, end_time) values ('aaaaaaaa-1111-1111-1111-111111111111', 'dddddddd-1111-1111-1111-111111111111', 'cccccccc-1111-1111-1111-111111111111', date_trunc('week', now())::date + 3, '10:00', '12:00')$$, 'A doda własne przypisanie do szkicu');
select is(pg_temp.rls_affected($$update public.businesses set name = 'Kawiarnia A (po zmianie)' where owner_id = '11111111-1111-1111-1111-111111111111'$$), 1, 'A zmieni własny biznes (1 wiersz)');
select is(pg_temp.rls_affected($$update public.employees set name = 'Pracownik A (po zmianie)' where id = 'cccccccc-1111-1111-1111-111111111111'$$), 1, 'A zmieni własnego pracownika (1 wiersz)');
select is(pg_temp.rls_affected($$delete from public.availabilities where id = 'ffffffff-1111-1111-1111-00000000000f'$$), 1, 'A usunie własną dostępność (1 wiersz)');

-- -----------------------------------------------------------------------------
-- Symetria: właściciel B widzi wyłącznie swoje.
-- -----------------------------------------------------------------------------
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

select results_eq('select distinct business_id from public.employees', array['bbbbbbbb-2222-2222-2222-222222222222'::uuid], 'B widzi tylko swoich pracowników');

-- -----------------------------------------------------------------------------
-- Anon (brak JWT → auth.uid() = null): 0 wierszy we wszystkich tabelach.
-- -----------------------------------------------------------------------------
reset request.jwt.claims;
reset request.jwt.claim.sub;
reset role;
set local role anon;

select is_empty('select 1 from public.businesses', 'anon: 0 wierszy w businesses');
select is_empty('select 1 from public.opening_hours', 'anon: 0 wierszy w opening_hours');
select is_empty('select 1 from public.employees', 'anon: 0 wierszy w employees');
select is_empty('select 1 from public.availabilities', 'anon: 0 wierszy w availabilities');
select is_empty('select 1 from public.schedules', 'anon: 0 wierszy w schedules');
select is_empty('select 1 from public.assignments', 'anon: 0 wierszy w assignments');

-- -----------------------------------------------------------------------------
-- Werdykt i wycofanie transakcji (baza bez śladów — można uruchamiać wielokrotnie).
-- -----------------------------------------------------------------------------
reset role;
reset request.jwt.claims;
reset request.jwt.claim.sub;

select * from finish();
rollback;
