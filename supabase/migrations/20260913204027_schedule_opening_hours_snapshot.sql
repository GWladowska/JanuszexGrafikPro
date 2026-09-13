-- Migracja: kopia godzin otwarcia na grafiku (S-08, schedule-archive)
-- Dodaje nośnik historycznych godzin otwarcia obowiązujących w danym tygodniu
-- oraz jednorazowo uzupełnia nim istniejące zapisane grafiki (najlepsze dostępne
-- przybliżenie — bieżące godziny biznesu; wcześniejszych wersji nie da się odtworzyć).

alter table public.schedules
  add column opening_hours_snapshot jsonb;

-- Backfill: każdemu zapisanemu grafikowi przypisz kopię aktualnych godzin otwarcia
-- jego biznesu (kształt {weekday, opensAt, closesAt}, godziny HH:MM). Brak wpisów
-- w opening_hours oznacza tydzień w pełni zamknięty → zapisujemy pustą tablicę,
-- nie NULL (NULL oznacza „brak danych" i uruchamia fallback w kodzie).
update public.schedules s
set opening_hours_snapshot = coalesce(
  (
    select jsonb_agg(
      jsonb_build_object(
        'weekday', oh.weekday,
        'opensAt', to_char(oh.opens_at, 'HH24:MI'),
        'closesAt', to_char(oh.closes_at, 'HH24:MI')
      ) order by oh.weekday
    )
    from public.opening_hours oh
    where oh.business_id = s.business_id
  ),
  '[]'::jsonb
)
where s.status = 'saved';
