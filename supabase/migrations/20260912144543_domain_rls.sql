-- Migracja: reguły RLS dla schematu domeny JanuszexGrafikPro
-- Izolacja danych per właściciel (PRD Access Control): każdy zalogowany
-- właściciel widzi i modyfikuje wyłącznie dane swojego biznesu. Klucz API
-- jest publiczny, więc jedyną warstwą ochrony jest RLS na poziomie bazy.
-- Anon dostaje 0 wierszy, bo auth.uid() zwraca null.

-- Helper odczytu przynależności biznesu. security definer + pusty search_path
-- przerywają rekurencję RLS: polityki tabel potomnych czytają
-- public.businesses jako właściciel funkcji (rola migracyjna omija RLS),
-- a nie przez polityki samej tabeli businesses.
create or replace function public.is_business_owner(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.businesses b
    where b.id = target_business_id
      and b.owner_id = auth.uid()
  );
$$;

-- anon/authenticated wykonują funkcję w politykach; anon dostaje false
-- (auth.uid() = null), czyli 0 wierszy zamiast błędu uprawnień.
revoke all on function public.is_business_owner(uuid) from public;
grant execute on function public.is_business_owner(uuid) to authenticated, anon;

-- Włączenie RLS na wszystkich tabelach domenowych
alter table public.businesses     enable row level security;
alter table public.opening_hours  enable row level security;
alter table public.employees      enable row level security;
alter table public.availabilities enable row level security;
alter table public.schedules      enable row level security;
alter table public.assignments    enable row level security;

-- Polityki: businesses — po owner_id (właściciel = autor wiersza) ------------
create policy "businesses_select_owner"
  on public.businesses for select
  using (owner_id = auth.uid());

create policy "businesses_insert_owner"
  on public.businesses for insert
  with check (owner_id = auth.uid());

create policy "businesses_update_owner"
  on public.businesses for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "businesses_delete_owner"
  on public.businesses for delete
  using (owner_id = auth.uid());

-- Polityki: opening_hours — po przynależności biznesu ------------------------
create policy "opening_hours_select_owner"
  on public.opening_hours for select
  using (public.is_business_owner(business_id));

create policy "opening_hours_insert_owner"
  on public.opening_hours for insert
  with check (public.is_business_owner(business_id));

create policy "opening_hours_update_owner"
  on public.opening_hours for update
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

create policy "opening_hours_delete_owner"
  on public.opening_hours for delete
  using (public.is_business_owner(business_id));

-- Polityki: employees ---------------------------------------------------------
create policy "employees_select_owner"
  on public.employees for select
  using (public.is_business_owner(business_id));

create policy "employees_insert_owner"
  on public.employees for insert
  with check (public.is_business_owner(business_id));

create policy "employees_update_owner"
  on public.employees for update
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

create policy "employees_delete_owner"
  on public.employees for delete
  using (public.is_business_owner(business_id));

-- Polityki: availabilities ----------------------------------------------------
create policy "availabilities_select_owner"
  on public.availabilities for select
  using (public.is_business_owner(business_id));

create policy "availabilities_insert_owner"
  on public.availabilities for insert
  with check (public.is_business_owner(business_id));

create policy "availabilities_update_owner"
  on public.availabilities for update
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

create policy "availabilities_delete_owner"
  on public.availabilities for delete
  using (public.is_business_owner(business_id));

-- Polityki: schedules ---------------------------------------------------------
create policy "schedules_select_owner"
  on public.schedules for select
  using (public.is_business_owner(business_id));

create policy "schedules_insert_owner"
  on public.schedules for insert
  with check (public.is_business_owner(business_id));

create policy "schedules_update_owner"
  on public.schedules for update
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

create policy "schedules_delete_owner"
  on public.schedules for delete
  using (public.is_business_owner(business_id));

-- Polityki: assignments -------------------------------------------------------
create policy "assignments_select_owner"
  on public.assignments for select
  using (public.is_business_owner(business_id));

create policy "assignments_insert_owner"
  on public.assignments for insert
  with check (public.is_business_owner(business_id));

create policy "assignments_update_owner"
  on public.assignments for update
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

create policy "assignments_delete_owner"
  on public.assignments for delete
  using (public.is_business_owner(business_id));
