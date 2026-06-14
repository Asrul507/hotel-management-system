-- Track folio item origin for charges created from P.O.S while keeping folio_items as source of truth.
alter table public.folio_items
  add column if not exists notes text,
  add column if not exists created_from text not null default 'front_office';

alter table public.folio_items
  drop constraint if exists folio_items_created_from_check;

alter table public.folio_items
  add constraint folio_items_created_from_check
  check (created_from in ('front_office', 'folio', 'pos', 'system'));

alter table public.folio_items
  drop constraint if exists folio_items_type_check;

alter table public.folio_items
  add constraint folio_items_type_check
  check (item_type in ('room','extra_bed','breakfast','early_checkin','late_checkout','laundry','restaurant','minibar','damage','other','discount','cancellation_fee','no_show_fee','refund','adjustment','correction','discount_adjustment','other_adjustment')) not valid;

create index if not exists idx_folio_items_created_from
  on public.folio_items (created_from);
