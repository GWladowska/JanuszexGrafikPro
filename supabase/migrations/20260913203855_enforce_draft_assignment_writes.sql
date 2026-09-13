-- Migracja: blokada zapisu przypisań do zapisanego grafiku (S-06)
-- Trigger pilnuje invariantu: przypisania można dodawać, edytować i usuwać
-- tylko wtedy, gdy rodzic (schedules.status) jest draftem. Aplikacja sprawdza
-- status wcześniej; trigger zamyka wyścig między odczytem a zapisem
-- (druga karta zapisuje grafik w oknie między sprawdzeniem a mutacją).
-- Kod błędu '23000' (klasa 23) PostgREST mapuje na HTTP 409.
-- Przy kasowaniu grafiku/biznesu wiersz schedules może już nie istnieć —
-- wtedy parent_status jest NULL i zapis przechodzi (kaskada).

create or replace function public.enforce_draft_assignment_writes()
returns trigger
language plpgsql
as $$
declare
  parent_status public.schedule_status;
begin
  select status into parent_status
  from public.schedules
  where id = coalesce(new.schedule_id, old.schedule_id);

  if parent_status is not null and parent_status <> 'draft' then
    raise exception 'Grafik jest już zapisany i nie można go zmieniać'
      using errcode = '23000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_assignments_enforce_draft
  before insert or update or delete on public.assignments
  for each row execute function public.enforce_draft_assignment_writes();
