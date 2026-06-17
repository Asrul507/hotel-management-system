-- Allow a distinct partial folio state so P.O.S and Folio share one payment status vocabulary.
alter table public.folios
  drop constraint if exists folios_status_check;

alter table public.folios
  add constraint folios_status_check
  check (status in ('open', 'partial', 'closed', 'cancelled', 'debt', 'refunded', 'partial_refund')) not valid;
