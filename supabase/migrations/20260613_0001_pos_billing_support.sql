-- POS / Kasir support for bill numbers and minus-value folio adjustments.
-- Safe to run repeatedly in Supabase SQL Editor.

alter table public.folio_payments
  add column if not exists bill_no text,
  add column if not exists cashier_id uuid,
  add column if not exists payment_status text not null default 'posted';

create unique index if not exists idx_folio_payments_bill_no
  on public.folio_payments (bill_no)
  where bill_no is not null;

create index if not exists idx_folio_payments_folio_id
  on public.folio_payments (folio_id);

create index if not exists idx_folio_payments_created_at
  on public.folio_payments (created_at);

create index if not exists idx_folio_payments_payment_status
  on public.folio_payments (payment_status);

alter table public.folio_items drop constraint if exists folio_items_unit_price_non_negative_check;
alter table public.folio_items add constraint folio_items_unit_price_amount_check
  check (unit_price <> 0) not valid;

alter table public.folio_items drop constraint if exists folio_items_type_check;
alter table public.folio_items add constraint folio_items_type_check
  check (item_type in (
    'room','extra_bed','breakfast','early_checkin','late_checkout','laundry','restaurant','minibar','other',
    'discount','cancellation_fee','no_show_fee','refund','adjustment','correction','discount_adjustment','other_adjustment'
  )) not valid;
