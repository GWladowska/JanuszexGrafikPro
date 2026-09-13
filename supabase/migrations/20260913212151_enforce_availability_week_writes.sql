-- Migracja: zamrożenie edycji dostępności (S-08, Faza 4)
-- Dostępności można zmieniać wyłącznie na tygodnie przyszłe oraz na tydzień bieżący,
-- dopóki grafik tego tygodnia nie jest zapisany. Miniony tydzień jest read-only.
-- Reguła egzekwowana na poziomie bazy, żeby nie dało się jej obejść bezpośrednim
-- zapisem i żeby zmiana dostępności nie ścigała się z zapisem grafiku.

create or replace function public.enforce_availability_week_writes()
returns trigger
language plpgsql
as $$
declare
  reference_week date := date_trunc('week', (now() at time zone 'Europe/Warsaw')::date)::date;
  target_business uuid := coalesce(new.business_id, old.business_id);
  candidate date;
  candidate_week date;
begin
  -- Przy INSERT/UPDATE/DELETE sprawdzamy każdą dostępną datę (przy UPDATE także
  -- poprzednią — nie wolno przenosić wpisów poza dozwolone tygodnie).
  for candidate in
    select unnest(array_remove(array[new.work_date, old.work_date], null))
  loop
    candidate_week := date_trunc('week', candidate)::date;

    if candidate_week < reference_week then
      raise exception 'Nie można zmieniać dostępności w minionych tygodniach'
        using errcode = '23000';
    end if;

    if candidate_week = reference_week
      and exists (
        select 1
        from public.schedules s
        where s.business_id = target_business
          and s.week_start = reference_week
          and s.status = 'saved'
      )
    then
      raise exception 'Grafik bieżącego tygodnia jest już zapisany — nie można zmieniać dostępności'
        using errcode = '23000';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_availabilities_enforce_week
  before insert or update or delete on public.availabilities
  for each row execute function public.enforce_availability_week_writes();
