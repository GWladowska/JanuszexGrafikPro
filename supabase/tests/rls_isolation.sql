-- =============================================================================
-- Test izolacji RLS — JanuszexGrafikPro (F-01, domain-schema-rls)
--
-- LOCAL ONLY — przeznaczony wyłącznie do uruchamiania na lokalnym stacku
-- (wstawia wiersze do auth.users; nigdy nie uruchamiać na projekcie zdalnym).
--
-- Uruchomienie (po `npx supabase start` + `npx supabase db reset`):
--   a) Supabase Studio (http://localhost:54323 → SQL Editor → New query →
--      wklej całość → Run), albo
--   b) psql: psql -p 54322 -d postgres -f supabase/tests/rls_isolation.sql
--      (lub: wsl -d Ubuntu -- docker exec -i supabase_db_10x-astro-starter \
--        psql -U postgres -d postgres < supabase/tests/rls_isolation.sql)
--
-- Plik jest idempotentny (insert ... on conflict do nothing) i można go
-- uruchamiać wielokrotnie. Działa w psql i w SQL Editor Studio: Studio pokazuje
-- tylko wynik ostatniego zapytania, dlatego wszystkie asercje zapisują się do
-- tabeli tymczasowej rls_results, a na końcu wyświetlana jest jedna tabela
-- werdyktów. Test zaliczony = kolumna ok = true w każdym wierszu
-- (i "WYNIK CALKOWITY": zaliczone = wszystkie, niezaliczone = 0).
--
-- Inserts "mające zostać odrzucone" są opakowane w DO/EXCEPTION — RLS raportuje
-- je jako wiersz "ODRZUCONY: ..." zamiast przerywać cały batch.
-- =============================================================================

-- Bezpieczeństwo: wymuszamy rolę superusera przed setupem (na wypadek
-- ponownego uruchomienia na sesji, która utknęła jako authenticated/anon).
reset role;
reset request.jwt.claims;

-- Tabela wyników: wiersz na każdy test; ok = true oznacza zaliczony.
-- Tabela tymczasowa (żyje tylko w tej sesji — niewidoczna dla klientów API);
-- RLS włączone z polityką allow-all, żeby linter Studio nie ostrzegał,
-- a authenticated/anon mogły dopisywać wyniki swoich testów.
drop table if exists pg_temp.rls_results;
create temp table rls_results (
  scenariusz text not null,
  test text not null,
  wynik text not null,
  ok boolean not null
);
alter table pg_temp.rls_results enable row level security;
create policy rls_results_allow_all on pg_temp.rls_results
  for all to authenticated, anon
  using (true)
  with check (true);
grant select, insert on pg_temp.rls_results to authenticated, anon;

-- -----------------------------------------------------------------------------
-- Setup: dwóch właścicieli i po jednej kawiarni (poza seedem), ustalone UUID.
-- Do każdej kawiarni: pracownik, dostępność, grafik i przypisanie — żeby
-- scenariusz D sprawdzał izolację na niepustych tabelach.
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'rls-a@example.com', crypt('haslo-a', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'rls-b@example.com', crypt('haslo-b', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

insert into public.businesses (id, owner_id, name)
values
  ('aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Kawiarnia A (test RLS)'),
  ('bbbbbbbb-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Kawiarnia B (test RLS)')
on conflict (id) do nothing;

insert into public.employees (id, business_id, name)
values
  ('cccccccc-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 'Barista A'),
  ('cccccccc-2222-2222-2222-222222222222', 'bbbbbbbb-2222-2222-2222-222222222222', 'Barista B')
on conflict (id) do nothing;

insert into public.availabilities (id, business_id, employee_id, work_date, start_time, end_time)
values
  ('ffffffff-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 'cccccccc-1111-1111-1111-111111111111', date_trunc('week', now())::date, '08:00', '16:00'),
  ('ffffffff-2222-2222-2222-222222222222', 'bbbbbbbb-2222-2222-2222-222222222222', 'cccccccc-2222-2222-2222-222222222222', date_trunc('week', now())::date, '08:00', '16:00')
on conflict (id) do nothing;

insert into public.schedules (id, business_id, week_start, status)
values
  ('dddddddd-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', date_trunc('week', now())::date, 'draft'),
  ('dddddddd-2222-2222-2222-222222222222', 'bbbbbbbb-2222-2222-2222-222222222222', date_trunc('week', now())::date, 'draft')
on conflict (id) do nothing;

insert into public.assignments (id, business_id, schedule_id, employee_id, work_date, start_time, end_time)
values
  ('eeeeeeee-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 'dddddddd-1111-1111-1111-111111111111', 'cccccccc-1111-1111-1111-111111111111', date_trunc('week', now())::date, '08:00', '16:00'),
  ('eeeeeeee-2222-2222-2222-222222222222', 'bbbbbbbb-2222-2222-2222-222222222222', 'dddddddd-2222-2222-2222-222222222222', 'cccccccc-2222-2222-2222-222222222222', date_trunc('week', now())::date, '08:00', '16:00')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Scenariusz A — izolacja odczytu: użytkownik A widzi wyłącznie swój biznes,
-- bez rekurencji RLS (czytanie businesses nie wybucha błędem)
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into rls_results
select 'A', 'odczyt businesses: tylko Kawiarnia A, bez rekurencji RLS',
       'rows=' || count(*) || '; ' || coalesce(string_agg(name, ' | '), 'brak'),
       count(*) = 1 and bool_and(name = 'Kawiarnia A (test RLS)')
from public.businesses;
-- expected: rows=1; Kawiarnia A (test RLS), ok = true

-- -----------------------------------------------------------------------------
-- Scenariusz B — odrzucenie wstawienia z cudzym business_id (użytkownik A
-- próbuje dodać pracownika do biznesu B)
-- -----------------------------------------------------------------------------
do language plpgsql $$
begin
  insert into public.employees (business_id, name)
  values ('bbbbbbbb-2222-2222-2222-222222222222', 'spy');
  insert into rls_results values ('B', 'insert employees z cudzym business_id (A -> biznes B)', 'PRZESZEDL — RLS nie dziala', false);
exception when others then
  insert into rls_results values ('B', 'insert employees z cudzym business_id (A -> biznes B)', 'ODRZUCONY: ' || sqlerrm, true);
end $$;
-- expected: ODRZUCONY (new row violates row-level security policy for table "employees"), ok = true

-- -----------------------------------------------------------------------------
-- Scenariusz C — symetria: użytkownik B widzi tylko biznes B i nie może
-- wstawić pracownika do biznesu A
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

insert into rls_results
select 'C', 'odczyt businesses: tylko Kawiarnia B (symetria)',
       'rows=' || count(*) || '; ' || coalesce(string_agg(name, ' | '), 'brak'),
       count(*) = 1 and bool_and(name = 'Kawiarnia B (test RLS)')
from public.businesses;
-- expected: rows=1; Kawiarnia B (test RLS), ok = true

do language plpgsql $$
begin
  insert into public.employees (business_id, name)
  values ('aaaaaaaa-1111-1111-1111-111111111111', 'spy');
  insert into rls_results values ('C', 'insert employees z cudzym business_id (B -> biznes A)', 'PRZESZEDL — RLS nie dziala', false);
exception when others then
  insert into rls_results values ('C', 'insert employees z cudzym business_id (B -> biznes A)', 'ODRZUCONY: ' || sqlerrm, true);
end $$;
-- expected: ODRZUCONY (new row violates row-level security policy for table "employees"), ok = true

-- -----------------------------------------------------------------------------
-- Scenariusz D — użytkownik A nie widzi danych potomnych użytkownika B
-- (tabele mają dane z setupu dla obu biznesów, więc izolacja jest wymuszona,
-- a nie trywialna)
-- -----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into rls_results
select 'D', 'employees: tylko pracownicy wlasnego biznesu', 'rows=' || count(*), count(*) = 1
from public.employees;
-- expected: rows=1 (z 2 istniejacych), ok = true

insert into rls_results
select 'D', 'availabilities: tylko dostepnosci wlasnego biznesu', 'rows=' || count(*), count(*) = 1
from public.availabilities;
-- expected: rows=1, ok = true

insert into rls_results
select 'D', 'schedules: tylko grafiki wlasnego biznesu', 'rows=' || count(*), count(*) = 1
from public.schedules;
-- expected: rows=1, ok = true

insert into rls_results
select 'D', 'assignments: tylko przypisania wlasnego biznesu', 'rows=' || count(*), count(*) = 1
from public.assignments;
-- expected: rows=1, ok = true

-- -----------------------------------------------------------------------------
-- Scenariusz E — anon dostaje 0 wierszy we wszystkich tabelach domenowych
-- (brak JWT -> auth.uid() = null -> is_business_owner zwraca false)
-- -----------------------------------------------------------------------------
set role anon;
reset request.jwt.claims;

insert into rls_results
select 'E', 'anon: businesses zwraca 0 wierszy', 'rows=' || count(*), count(*) = 0
from public.businesses;
-- expected: rows=0, ok = true

insert into rls_results
select 'E', 'anon: employees zwraca 0 wierszy', 'rows=' || count(*), count(*) = 0
from public.employees;
-- expected: rows=0, ok = true

insert into rls_results
select 'E', 'anon: availabilities zwraca 0 wierszy', 'rows=' || count(*), count(*) = 0
from public.availabilities;
-- expected: rows=0, ok = true

insert into rls_results
select 'E', 'anon: schedules zwraca 0 wierszy', 'rows=' || count(*), count(*) = 0
from public.schedules;
-- expected: rows=0, ok = true

insert into rls_results
select 'E', 'anon: assignments zwraca 0 wierszy', 'rows=' || count(*), count(*) = 0
from public.assignments;
-- expected: rows=0, ok = true

-- -----------------------------------------------------------------------------
-- Werdykt: jedyna tabela wyświetlana przez Studio SQL Editor (pokazuje ono
-- wynik ostatniego zapytania batcha); psql pokazuje dodatkowo powyższe kroki.
-- -----------------------------------------------------------------------------
reset role;
reset request.jwt.claims;

select * from rls_results order by scenariusz, test;
-- expected: 10 wierszy, wszystkie z ok = true

select '=== WYNIK CALKOWITY ===' as podsumowanie,
       (select count(*) from rls_results) as testow,
       (select count(*) from rls_results where ok) as zaliczone,
       (select count(*) from rls_results where not ok) as niezaliczone,
       (select bool_and(ok) from rls_results) as test_przeszedl;
-- expected: testow=10, zaliczone=10, niezaliczone=0, test_przeszedl=true
