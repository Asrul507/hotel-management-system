-- Front Office, Folio overview, and Dashboard helper migration.
-- Safe to copy-paste to Supabase SQL Editor. Idempotent and non-destructive.

alter table if exists public.stays
  add column if not exists actual_check_in timestamptz,
  add column if not exists actual_check_out timestamptz,
  add column if not exists checkin_at timestamptz,
  add column if not exists checkout_at timestamptz,
  add column if not exists folio_id uuid;

alter table if exists public.reservations
  add column if not exists checkin_date date,
  add column if not exists checkout_date date,
  add column if not exists folio_id uuid;

create index if not exists idx_reservations_room_date_status
  on public.reservations (room_id, check_in_date, check_out_date, status);

create index if not exists idx_reservations_check_in_status
  on public.reservations (check_in_date, status);

create index if not exists idx_reservations_check_out_status
  on public.reservations (check_out_date, status);

create index if not exists idx_stays_room_status_checkout
  on public.stays (room_id, status, actual_check_out, checkout_at);

create index if not exists idx_stays_actual_check_in
  on public.stays (actual_check_in, checkin_at);

create index if not exists idx_stays_actual_check_out
  on public.stays (actual_check_out, checkout_at);

create index if not exists idx_folio_items_folio_void_type
  on public.folio_items (folio_id, is_void, item_type);
