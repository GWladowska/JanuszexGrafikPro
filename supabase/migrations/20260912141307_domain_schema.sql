-- Migracja: schemat domeny JanuszexGrafikPro
-- Roadmap F-01. Warstwa danych: biznes, godziny otwarcia, pracownicy,
-- dostępności, grafiki i przypisania zmian. Logika domenowa (generowanie
-- draftu, liczenie dziur, kolizje) należy do kolejnych kroków roadmapy.

-- Typ wyliczeniowy statusu grafiku
create type public.schedule_status as enum ('draft', 'saved');

-- Funkcja trigger ustawiająca updated_at przed aktualizacją
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tabela: businesses ---------------------------------------------------------
-- Jeden biznes na właściciela w v1.
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

create trigger trg_businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

-- Tabela: opening_hours ------------------------------------------------------
-- Jeden ciągły przedział na dzień tygodnia (ISO 1-7, 1 = poniedziałek).
-- Brak wiersza = dzień zamknięty.
create table public.opening_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  opens_at time not null,
  closes_at time not null,
  check (closes_at > opens_at),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, weekday)
);

create trigger trg_opening_hours_set_updated_at
  before update on public.opening_hours
  for each row execute function public.set_updated_at();

-- Tabela: employees ----------------------------------------------------------
-- contact_email to kontakt, nie konto logowania.
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  contact_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

create trigger trg_employees_set_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- Tabela: availabilities -----------------------------------------------------
-- Dostępność pracownika w danym dniu; wiele wierszy na dzień dozwolone (przerwy).
create table public.availabilities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  employee_id uuid not null,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  check (end_time > start_time),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, employee_id)
    references public.employees(business_id, id) on delete cascade
);

create index idx_availabilities_employee_date
  on public.availabilities (employee_id, work_date);
create index idx_availabilities_business_date
  on public.availabilities (business_id, work_date);

create trigger trg_availabilities_set_updated_at
  before update on public.availabilities
  for each row execute function public.set_updated_at();

-- Tabela: schedules ----------------------------------------------------------
-- Jeden grafik na biznes i tydzień (week_start = poniedziałek ISO).
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  week_start date not null,
  status public.schedule_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extract(isodow from week_start) = 1),
  unique (business_id, week_start),
  unique (business_id, id)
);

create trigger trg_schedules_set_updated_at
  before update on public.schedules
  for each row execute function public.set_updated_at();

-- Tabela: assignments --------------------------------------------------------
-- Przypisania zmian w grafiku. Brak ograniczenia nakładania się zmian
-- (decyzja: ostrzeżenia w aplikacji, nie blokada w bazie).
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  schedule_id uuid not null,
  employee_id uuid not null,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  check (end_time > start_time),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, schedule_id)
    references public.schedules(business_id, id) on delete cascade,
  foreign key (business_id, employee_id)
    references public.employees(business_id, id) on delete cascade
);

create index idx_assignments_schedule_date
  on public.assignments (schedule_id, work_date);
create index idx_assignments_employee_date
  on public.assignments (employee_id, work_date);

create trigger trg_assignments_set_updated_at
  before update on public.assignments
  for each row execute function public.set_updated_at();
