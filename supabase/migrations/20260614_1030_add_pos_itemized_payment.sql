-- Itemized P.O.S payment support. Non-destructive and idempotent.

alter table public.folio_items
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists paid_at timestamptz,
  add column if not exists paid_bill_id uuid references public.folio_payments(id),
  add column if not exists paid_amount numeric(12,2) not null default 0;

create index if not exists idx_folio_items_payment_status
  on public.folio_items (payment_status);

create index if not exists idx_folio_items_paid_bill_id
  on public.folio_items (paid_bill_id);

create table if not exists public.folio_payment_items (
  id uuid primary key default gen_random_uuid(),
  folio_payment_id uuid not null references public.folio_payments(id) on delete restrict,
  folio_id uuid not null references public.folios(id) on delete cascade,
  folio_item_id uuid not null references public.folio_items(id) on delete restrict,
  description text not null,
  item_type text not null,
  qty numeric(10,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_folio_payment_items_payment_id
  on public.folio_payment_items (folio_payment_id);

create index if not exists idx_folio_payment_items_folio_id
  on public.folio_payment_items (folio_id);

create index if not exists idx_folio_payment_items_folio_item_id
  on public.folio_payment_items (folio_item_id);

create unique index if not exists idx_folio_payment_items_unique_paid_item
  on public.folio_payment_items (folio_item_id)
  where folio_item_id is not null;

alter table public.folio_payment_items enable row level security;

drop policy if exists "authenticated read folio payment items" on public.folio_payment_items;
create policy "authenticated read folio payment items" on public.folio_payment_items
  for select to authenticated using (true);

drop policy if exists "authenticated manage folio payment items" on public.folio_payment_items;
create policy "authenticated manage folio payment items" on public.folio_payment_items
  for all to authenticated using (true) with check (true);
