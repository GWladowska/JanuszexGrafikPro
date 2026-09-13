-- Migracja: twarda blokada nachodzących dostępności (addendum z triage
-- /10x-impl-review, decision: fix). Postgres nie ma wbudowanego typu
-- zakresu nad `time`, więc definiujemy własny timerange; btree_gist
-- umożliwia regułę wykluczającą na (employee_id, work_date, timerange) —
-- baza odrzuca nachodzące wpisy niezależnie od ścieżki zapisu (TOCTOU:
-- check-then-insert w API miał okno wyścigu). Domyślny kształt zakresu
-- to '[start, end)' — stykające się przedziały (end = start sąsiada)
-- są dozwolone, zgodnie z regułą aplikacyjną aStart < bEnd && bStart < aEnd.

create extension if not exists btree_gist;

create type public.timerange as range (subtype = time);

alter table public.availabilities
  add constraint excl_availabilities_no_overlap
  exclude using gist (
    employee_id with =,
    work_date with =,
    timerange(start_time, end_time) with &&
  );
