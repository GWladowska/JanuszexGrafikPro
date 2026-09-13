-- Migracja: twarda blokada duplikatów pracowników w ramach biznesu
-- Decyzja z triage /10x-impl-review (F4): para (imię i nazwisko, e-mail)
-- musi być unikalna per biznes. Normalizacja w wyrażeniu indeksu odpowiada
-- regułą z formularza: trim + zredukowane spacje + lower.
-- contact_email jest nullable — wiersze bez e-maila (poza aplikacją) nie
-- kolidują (NULL nie konfliktuje w indeksie unikalnym).

create unique index uq_employees_business_identity
  on public.employees (
    business_id,
    lower(regexp_replace(trim(name), '\s+', ' ', 'g')),
    lower(btrim(contact_email))
  );
