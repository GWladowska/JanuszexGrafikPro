-- =============================================================================
-- SEED — JanuszexGrafikPro (F-01, domain-schema-rls)
--
-- ⚠️  LOCAL ONLY — NIE URUCHAMIAĆ NA ZDALNYM PROJEKCIE ⚠️
-- Ten plik wstawia wiersze bezpośrednio do auth.users i auth.identities.
-- Bezpieczny wyłącznie w lokalnym stacku przez `npx supabase db reset`
-- (reset odtwarza bazę od zera i aplikuje seed po migracjach). Uruchomienie
-- na projekcie zdalnym tworzy nieodwracalnie zepsuty stan konta — seed nigdy
-- nie trafia na produkcję (`db push` go nie uruchamia).
--
-- Poświadczenia testowe: owner@example.com / haslo12345
--
-- Dane: konto właściciela + kawiarnia „Kawiarnia Januszex":
-- godziny otwarcia pon–sob (niedziela celowo pominięta = zamknięta),
-- 5 pracowników, dostępności na bieżący tydzień (od poniedziałka
-- date_trunc('week', now())::date), jeden grafik w statusie draft
-- z przypisaniami zmian.
-- =============================================================================

-- Konto właściciela (stały UUID, hasło przez bcrypt, potwierdzony e-mail,
-- puste łańcuchy — nie NULL — w kolumnach tokenów, jak oczekuje GoTrue).
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change_token_current,
  reauthentication_token,
  email_change,
  phone,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'owner@example.com',
  crypt('haslo12345', gen_salt('bf', 10)),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

-- Powiązana tożsamość e-mail (GoTrue loguje się po auth.identities, nie tylko
-- po auth.users — bez tego wiersza logowanie hasłem nie zadziała).
insert into auth.identities (
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  u.id,
  u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.email = 'owner@example.com';

-- Biznes
insert into public.businesses (id, owner_id, name)
values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Kawiarnia Januszex');

-- Godziny otwarcia: pon–sob; niedziela (7) pominięta = dzień zamknięty
insert into public.opening_hours (business_id, weekday, opens_at, closes_at)
values
  ('00000000-0000-4000-8000-000000000002', 1, '08:00', '18:00'),
  ('00000000-0000-4000-8000-000000000002', 2, '08:00', '18:00'),
  ('00000000-0000-4000-8000-000000000002', 3, '08:00', '20:00'),
  ('00000000-0000-4000-8000-000000000002', 4, '08:00', '20:00'),
  ('00000000-0000-4000-8000-000000000002', 5, '08:00', '22:00'),
  ('00000000-0000-4000-8000-000000000002', 6, '10:00', '22:00');

-- Pracownicy (kontakt, nie konta logowania)
insert into public.employees (id, business_id, name, contact_email)
values
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Anna Kowalska', 'anna.kowalska@example.com'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'Piotr Nowak', 'piotr.nowak@example.com'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002', 'Maria Wiśniewska', 'maria.wisniewska@example.com'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000002', 'Tomasz Zieliński', 'tomasz.zielinski@example.com'),
  ('00000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000002', 'Katarzyna Lewandowska', 'katarzyna.lewandowska@example.com');

-- Dostępności na bieżący tydzień (poniedziałek = date_trunc('week', now()))
insert into public.availabilities (business_id, employee_id, work_date, start_time, end_time)
values
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', date_trunc('week', now())::date,       '08:00', '16:00'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', date_trunc('week', now())::date + 1,   '08:00', '16:00'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', date_trunc('week', now())::date,       '12:00', '20:00'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', date_trunc('week', now())::date + 2,   '12:00', '20:00'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005', date_trunc('week', now())::date + 1,   '08:00', '16:00'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005', date_trunc('week', now())::date + 3,   '08:00', '16:00'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000006', date_trunc('week', now())::date + 4,   '08:00', '22:00'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000007', date_trunc('week', now())::date + 5,   '10:00', '22:00');

-- Grafik szkic na bieżący tydzień
insert into public.schedules (id, business_id, week_start, status)
values ('00000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000002', date_trunc('week', now())::date, 'draft');

-- Przypisania zmian (pon–śr; nakładanie się zmian nie jest blokowane w bazie —
-- ostrzeżenia policzy dopiero logika domenowa z kolejnych kroków roadmapy)
insert into public.assignments (business_id, schedule_id, employee_id, work_date, start_time, end_time)
values
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000003', date_trunc('week', now())::date,       '08:00', '14:00'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000004', date_trunc('week', now())::date,       '13:00', '18:00'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000005', date_trunc('week', now())::date + 1,   '08:00', '14:00'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000006', date_trunc('week', now())::date + 1,   '14:00', '18:00'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000007', date_trunc('week', now())::date + 2,   '08:00', '12:00'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000003', date_trunc('week', now())::date + 2,   '12:00', '20:00');
