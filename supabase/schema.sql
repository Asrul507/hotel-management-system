-- Hotel Management System schema (safe to run more than once in Supabase SQL Editor)
-- This version avoids referencing legacy columns until they are created/normalized.

create extension if not exists "pgcrypto";

-- Keep existing enum types compatible for older databases, but app-facing status columns below use text.
do $$ begin
  create type app_role as enum ('super_admin','manager','receptionist','housekeeping','cashier');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type room_status as enum ('available','unavailable','occupied','dirty','cleaning','maintenance','out_of_order');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type room_status add value if not exists 'unavailable';
exception when undefined_object then null;
end $$;

do $$ begin
  create type reservation_status as enum ('reserved','checked_in','checked_out','cancelled','no_show');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type reservation_status add value if not exists 'reserved';
  alter type reservation_status add value if not exists 'booked';
  alter type reservation_status add value if not exists 'confirmed';
exception when undefined_object then null;
end $$;

do $$ begin
  create type invoice_status as enum ('unpaid','partial','paid','refunded');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type maintenance_status as enum ('reported','in_progress','done');
exception when duplicate_object then null;
end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role app_role not null default 'receptionist',
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hotel_settings (
  id uuid primary key default gen_random_uuid(),
  hotel_name text not null,
  address text,
  phone text,
  logo_url text,
  tax_percent numeric(5,2) not null default 0,
  service_charge_percent numeric(5,2) not null default 0,
  invoice_prefix text default 'INV',
  default_checkin_time time default '14:00',
  default_checkout_time time default '12:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Room types
create table if not exists room_types (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text not null,
  description text,
  base_rate numeric(12,2) not null default 0,
  base_price numeric(12,2) not null default 0,
  max_occupancy integer not null default 2,
  is_active boolean not null default true,
  facilities jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table room_types add column if not exists code text;
alter table room_types add column if not exists description text;
alter table room_types add column if not exists base_rate numeric(12,2) not null default 0;
alter table room_types add column if not exists base_price numeric(12,2) not null default 0;
alter table room_types add column if not exists max_occupancy integer not null default 2;
alter table room_types add column if not exists is_active boolean not null default true;
alter table room_types add column if not exists facilities jsonb default '[]'::jsonb;

update room_types
set code = upper(left(regexp_replace(coalesce(nullif(name, ''), id::text), '[^a-zA-Z0-9]+', '_', 'g'), 40) || '_' || left(id::text, 8))
where code is null or trim(code) = '';

update room_types set base_rate = base_price where coalesce(base_rate, 0) = 0 and coalesce(base_price, 0) > 0;
update room_types set base_price = base_rate where coalesce(base_price, 0) = 0 and coalesce(base_rate, 0) > 0;
alter table room_types alter column code set not null;
create unique index if not exists room_types_code_unique on room_types(code);

-- Rooms. The legacy `status` column is kept as text compatibility only.
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text unique not null,
  room_type_id uuid not null references room_types(id),
  floor text,
  fo_status text not null default 'available',
  hk_status text not null default 'VC',
  status text not null default 'available',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table rooms add column if not exists fo_status text not null default 'available';
alter table rooms add column if not exists hk_status text not null default 'VC';
alter table rooms add column if not exists status text not null default 'available';
alter table rooms alter column status drop default;
alter table rooms alter column status type text using status::text;
alter table rooms alter column status set default 'available';
alter table rooms alter column status set not null;
alter table rooms add column if not exists is_active boolean not null default true;
alter table rooms add column if not exists notes text;

-- Migrate old single status values to the new FO/HK split. Safe after status is guaranteed to exist.
update rooms
set hk_status = case coalesce(status, 'available')
  when 'occupied' then 'OC'
  when 'dirty' then 'VD'
  when 'maintenance' then 'OOS'
  when 'out_of_order' then 'OOO'
  else coalesce(hk_status, 'VC')
end
where hk_status is null or hk_status not in ('VR','VC','VD','OR','OC','OD','OOO','OOS','DND','SLEEP OUT','ONL');

update rooms
set fo_status = case
  when hk_status in ('OOO','OOS') or coalesce(status, 'available') in ('maintenance','out_of_order','unavailable') then 'unavailable'
  else 'available'
end
where fo_status is null or fo_status not in ('available','unavailable');

update rooms set status = fo_status where status is distinct from fo_status;

alter table rooms drop constraint if exists rooms_fo_status_check;
alter table rooms add constraint rooms_fo_status_check check (fo_status in ('available','unavailable')) not valid;
alter table rooms drop constraint if exists rooms_hk_status_check;
alter table rooms add constraint rooms_hk_status_check check (hk_status in ('VR','VC','VD','OR','OC','OD','OOO','OOS','DND','SLEEP OUT','ONL')) not valid;
alter table rooms drop constraint if exists rooms_ooo_oos_unavailable_check;
alter table rooms add constraint rooms_ooo_oos_unavailable_check check (hk_status not in ('OOO','OOS') or fo_status = 'unavailable') not valid;

create or replace function sync_room_inventory_status()
returns trigger as $$
begin
  if new.hk_status in ('OOO', 'OOS') then
    new.fo_status := 'unavailable';
  end if;

  -- Keep old app code compatible while the new app uses fo_status/hk_status.
  new.status := new.fo_status;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_room_inventory_status on rooms;
create trigger trg_sync_room_inventory_status
before insert or update on rooms
for each row execute function sync_room_inventory_status();

-- Guests
create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  nik text,
  phone text,
  email text,
  address text,
  city text,
  birth_date date,
  gender text,
  notes text,
  is_blacklisted boolean not null default false,
  is_active boolean not null default true,
  id_type text,
  id_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table guests add column if not exists nik text;
alter table guests add column if not exists phone text;
alter table guests add column if not exists email text;
alter table guests add column if not exists address text;
alter table guests add column if not exists city text;
alter table guests add column if not exists birth_date date;
alter table guests add column if not exists gender text;
alter table guests add column if not exists notes text;
alter table guests add column if not exists is_blacklisted boolean not null default false;
alter table guests add column if not exists is_active boolean not null default true;
alter table guests add column if not exists id_type text;
alter table guests add column if not exists id_number text;
update guests set nik = id_number where (nik is null or trim(nik) = '') and id_number is not null;
create unique index if not exists guests_nik_unique on guests(nik) where nik is not null and trim(nik) <> '';
create index if not exists guests_phone_idx on guests(phone);
create index if not exists guests_full_name_idx on guests(full_name);

-- Reservations. New columns are paired with legacy column names for current app compatibility.
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_number text,
  reservation_code text,
  guest_id uuid not null references guests(id),
  room_type_id uuid references room_types(id),
  room_id uuid references rooms(id),
  check_in_date date,
  check_out_date date,
  checkin_date date,
  checkout_date date,
  nights int,
  status text not null default 'reserved',
  adults integer not null default 1,
  children integer not null default 0,
  room_rate numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) default 0,
  notes text,
  special_notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table reservations add column if not exists reservation_number text;
alter table reservations add column if not exists reservation_code text;
alter table reservations add column if not exists check_in_date date;
alter table reservations add column if not exists check_out_date date;
alter table reservations add column if not exists checkin_date date;
alter table reservations add column if not exists checkout_date date;
alter table reservations add column if not exists nights int;
alter table reservations add column if not exists adults integer not null default 1;
alter table reservations add column if not exists children integer not null default 0;
alter table reservations add column if not exists room_rate numeric(12,2) not null default 0;
alter table reservations add column if not exists deposit_amount numeric(12,2) default 0;
alter table reservations add column if not exists notes text;
alter table reservations add column if not exists special_notes text;
alter table reservations add column if not exists status text not null default 'reserved';
alter table reservations alter column status drop default;
alter table reservations alter column status type text using status::text;
alter table reservations alter column status set default 'reserved';
alter table reservations alter column status set not null;

update reservations set reservation_number = coalesce(reservation_number, reservation_code, 'RSV-' || left(id::text, 8)) where reservation_number is null or trim(reservation_number) = '';
update reservations set reservation_code = coalesce(reservation_code, reservation_number) where reservation_code is null or trim(reservation_code) = '';
update reservations set check_in_date = checkin_date where check_in_date is null and checkin_date is not null;
update reservations set check_out_date = checkout_date where check_out_date is null and checkout_date is not null;
update reservations set checkin_date = check_in_date where checkin_date is null and check_in_date is not null;
update reservations set checkout_date = check_out_date where checkout_date is null and check_out_date is not null;
-- Some older schemas define `nights` as a generated column, so only backfill it when it is a normal column.
do $$ begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.reservations'::regclass
      and attname = 'nights'
      and attgenerated = ''
      and not attisdropped
  ) then
    update reservations
    set nights = greatest((check_out_date - check_in_date), 0)
    where check_in_date is not null and check_out_date is not null;
  end if;
end $$;
update reservations set status = 'reserved' where status in ('booked','confirmed');
create unique index if not exists reservations_number_unique on reservations(reservation_number) where reservation_number is not null;
create unique index if not exists reservations_code_unique on reservations(reservation_code) where reservation_code is not null;
alter table reservations drop constraint if exists reservations_status_check;
alter table reservations add constraint reservations_status_check check (status in ('reserved','checked_in','checked_out','cancelled','no_show')) not valid;

-- Actual stays/check-ins
create table if not exists stays (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references reservations(id),
  guest_id uuid not null references guests(id),
  room_id uuid not null references rooms(id),
  actual_check_in timestamptz,
  actual_check_out timestamptz,
  checkin_at timestamptz,
  checkout_at timestamptz,
  deposit_amount numeric(12,2) default 0,
  status text not null default 'checked_in',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table stays add column if not exists actual_check_in timestamptz;
alter table stays add column if not exists actual_check_out timestamptz;
alter table stays add column if not exists checkin_at timestamptz;
alter table stays add column if not exists checkout_at timestamptz;
alter table stays add column if not exists deposit_amount numeric(12,2) default 0;
alter table stays add column if not exists status text not null default 'checked_in';
alter table stays alter column status drop default;
alter table stays alter column status type text using status::text;
alter table stays alter column status set default 'checked_in';
alter table stays alter column status set not null;
update stays set actual_check_in = checkin_at where actual_check_in is null and checkin_at is not null;
update stays set actual_check_out = checkout_at where actual_check_out is null and checkout_at is not null;
update stays set checkin_at = actual_check_in where checkin_at is null and actual_check_in is not null;
update stays set checkout_at = actual_check_out where checkout_at is null and actual_check_out is not null;
alter table stays drop constraint if exists stays_status_check;
alter table stays add constraint stays_status_check check (status in ('checked_in','checked_out','cancelled')) not valid;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references stays(id),
  invoice_number text unique not null,
  subtotal numeric(12,2) default 0,
  tax_amount numeric(12,2) default 0,
  service_amount numeric(12,2) default 0,
  total_amount numeric(12,2) default 0,
  deposit_applied numeric(12,2) default 0,
  balance_due numeric(12,2) default 0,
  status text not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table invoices add column if not exists status text not null default 'unpaid';
alter table invoices alter column status drop default;
alter table invoices alter column status type text using status::text;
alter table invoices alter column status set default 'unpaid';

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  item_type text not null,
  description text not null,
  qty numeric(10,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) generated always as (qty*unit_price) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  payment_method text not null,
  amount numeric(12,2) not null,
  paid_at timestamptz default now(),
  reference_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id),
  assigned_to uuid references profiles(id),
  status text not null check (status in ('dirty','cleaning','clean','inspected')),
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists maintenance_reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id),
  reported_by uuid references profiles(id),
  status maintenance_status not null default 'reported',
  issue text not null,
  fix_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  table_name text not null,
  record_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- RLS policies used by the frontend. Tighten later when server-side authorization is added.
alter table profiles enable row level security;
alter table room_types enable row level security;
alter table rooms enable row level security;
alter table guests enable row level security;
alter table reservations enable row level security;
alter table stays enable row level security;
alter table invoices enable row level security;
alter table payments enable row level security;

drop policy if exists "authenticated read profiles" on profiles;
drop policy if exists "users update own profile" on profiles;
drop policy if exists "authenticated read room types" on room_types;
drop policy if exists "authenticated manage room types" on room_types;
drop policy if exists "authenticated read rooms" on rooms;
drop policy if exists "authenticated manage rooms" on rooms;
drop policy if exists "authenticated read guests" on guests;
drop policy if exists "authenticated manage guests" on guests;
drop policy if exists "authenticated read reservations" on reservations;
drop policy if exists "authenticated manage reservations" on reservations;
drop policy if exists "authenticated read stays" on stays;
drop policy if exists "authenticated manage stays" on stays;
drop policy if exists "authenticated read invoices" on invoices;
drop policy if exists "authenticated manage invoices" on invoices;
drop policy if exists "authenticated read payments" on payments;
drop policy if exists "authenticated manage payments" on payments;

create policy "authenticated read profiles" on profiles for select to authenticated using (true);
create policy "users update own profile" on profiles for update to authenticated using (auth.uid()=id);
create policy "authenticated read room types" on room_types for select to authenticated using (true);
create policy "authenticated manage room types" on room_types for all to authenticated using (true) with check (true);
create policy "authenticated read rooms" on rooms for select to authenticated using (true);
create policy "authenticated manage rooms" on rooms for all to authenticated using (true) with check (true);
create policy "authenticated read guests" on guests for select to authenticated using (true);
create policy "authenticated manage guests" on guests for all to authenticated using (true) with check (true);
create policy "authenticated read reservations" on reservations for select to authenticated using (true);
create policy "authenticated manage reservations" on reservations for all to authenticated using (true) with check (true);
create policy "authenticated read stays" on stays for select to authenticated using (true);
create policy "authenticated manage stays" on stays for all to authenticated using (true) with check (true);
create policy "authenticated read invoices" on invoices for select to authenticated using (true);
create policy "authenticated manage invoices" on invoices for all to authenticated using (true) with check (true);
create policy "authenticated read payments" on payments for select to authenticated using (true);
create policy "authenticated manage payments" on payments for all to authenticated using (true) with check (true);

-- Seed data, idempotent.
insert into hotel_settings (hotel_name,address,phone,tax_percent,service_charge_percent)
select 'Hotel Management System','Jakarta','+62 21 0000',10,5
where not exists (select 1 from hotel_settings);

with seed_room_types (code, name, base_rate, base_price, max_occupancy, facilities) as (
  values
    ('STD','Standard',450000::numeric,450000::numeric,2,'["AC","WiFi","TV"]'::jsonb),
    ('DLX','Deluxe',700000::numeric,700000::numeric,2,'["AC","WiFi","TV","Mini Bar"]'::jsonb),
    ('STE','Suite',1250000::numeric,1250000::numeric,4,'["Living Room","Bathtub","Smart TV"]'::jsonb)
)
insert into room_types (code,name,base_rate,base_price,max_occupancy,facilities)
select s.code, s.name, s.base_rate, s.base_price, s.max_occupancy, s.facilities
from seed_room_types s
where not exists (
  select 1 from room_types rt where rt.code = s.code or rt.name = s.name
);

insert into rooms (room_number,room_type_id,floor,fo_status,hk_status,status)
select '10'||g::text, rt.id, '1', 'available', 'VC', 'available'
from generate_series(1,5) g
cross join lateral (select id from room_types where code='STD' or name='Standard' order by case when code='STD' then 0 else 1 end limit 1) rt
on conflict (room_number) do nothing;

-- Hotel logic optimization indexes and compatibility checks (safe, no data deletion).
create index if not exists reservations_room_dates_status_idx on reservations(room_id, check_in_date, check_out_date, status);
create index if not exists reservations_status_dates_idx on reservations(status, check_in_date, check_out_date);
create index if not exists stays_room_status_idx on stays(room_id, status);
create index if not exists invoices_stay_status_idx on invoices(stay_id, status);
create index if not exists payments_invoice_id_idx on payments(invoice_id);
create index if not exists rooms_fo_status_idx on rooms(fo_status);
create index if not exists rooms_hk_status_idx on rooms(hk_status);
create index if not exists rooms_inventory_idx on rooms(is_active, fo_status, hk_status);
create index if not exists guests_nik_idx on guests(nik);

alter table rooms drop constraint if exists rooms_fo_status_check;
alter table rooms add constraint rooms_fo_status_check check (fo_status in ('available','unavailable')) not valid;
alter table rooms drop constraint if exists rooms_hk_status_check;
alter table rooms add constraint rooms_hk_status_check check (hk_status in ('VR','VC','VD','OR','OC','OD','OOO','OOS','DND','SLEEP OUT','ONL')) not valid;
alter table payments drop constraint if exists payments_positive_amount_check;
alter table payments add constraint payments_positive_amount_check check (amount > 0) not valid;
alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check check (status in ('unpaid','partial','paid','refunded')) not valid;

-- Folio billing system (safe/idempotent, keeps legacy invoices intact).
create table if not exists folios (
  id uuid primary key default gen_random_uuid(),
  folio_number text unique not null,
  guest_id uuid references guests(id),
  status text not null default 'open',
  subtotal numeric(12,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  service_amount numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  refund_amount numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table folios add column if not exists folio_number text;
alter table folios add column if not exists guest_id uuid references guests(id);
alter table folios add column if not exists status text not null default 'open';
alter table folios add column if not exists subtotal numeric(12,2) not null default 0;
alter table folios add column if not exists discount_percent numeric(5,2) not null default 0;
alter table folios add column if not exists discount_amount numeric(12,2) not null default 0;
alter table folios add column if not exists tax_amount numeric(12,2) not null default 0;
alter table folios add column if not exists service_amount numeric(12,2) not null default 0;
alter table folios add column if not exists grand_total numeric(12,2) not null default 0;
alter table folios add column if not exists paid_amount numeric(12,2) not null default 0;
alter table folios add column if not exists balance_due numeric(12,2) not null default 0;
alter table folios add column if not exists refund_amount numeric(12,2) not null default 0;
alter table folios add column if not exists notes text;

create table if not exists folio_items (
  id uuid primary key default gen_random_uuid(),
  folio_id uuid not null references folios(id) on delete cascade,
  reservation_id uuid references reservations(id),
  stay_id uuid references stays(id),
  room_id uuid references rooms(id),
  item_type text not null,
  description text not null,
  qty numeric(10,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) generated always as (qty * unit_price) stored,
  posting_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists folio_payments (
  id uuid primary key default gen_random_uuid(),
  folio_id uuid not null references folios(id) on delete cascade,
  payment_type text not null default 'payment',
  payment_group text not null,
  payment_method text not null,
  amount numeric(12,2) not null,
  reference_number text,
  card_or_account_number text,
  notes text,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table reservations add column if not exists folio_id uuid references folios(id);
alter table reservations add column if not exists cancellation_reason text;
alter table reservations add column if not exists cancellation_fee numeric(12,2) not null default 0;
alter table reservations add column if not exists no_show_fee numeric(12,2) not null default 0;
alter table stays add column if not exists folio_id uuid references folios(id);

create index if not exists folios_guest_id_idx on folios(guest_id);
create index if not exists folios_status_idx on folios(status);
create index if not exists folio_items_folio_id_idx on folio_items(folio_id);
create index if not exists folio_payments_folio_id_idx on folio_payments(folio_id);
create index if not exists folio_payments_paid_at_idx on folio_payments(paid_at);
create index if not exists reservations_folio_id_idx on reservations(folio_id);
create index if not exists stays_folio_id_idx on stays(folio_id);

alter table audit_logs enable row level security;
alter table folios enable row level security;
alter table folio_items enable row level security;
alter table folio_payments enable row level security;

drop policy if exists "authenticated insert audit logs" on audit_logs;
create policy "authenticated insert audit logs" on audit_logs for insert to authenticated with check (true);
drop policy if exists "authenticated read audit logs" on audit_logs;
create policy "authenticated read audit logs" on audit_logs for select to authenticated using (true);

drop policy if exists "authenticated read folios" on folios;
create policy "authenticated read folios" on folios for select to authenticated using (true);
drop policy if exists "authenticated manage folios" on folios;
create policy "authenticated manage folios" on folios for all to authenticated using (true) with check (true);
drop policy if exists "authenticated read folio items" on folio_items;
create policy "authenticated read folio items" on folio_items for select to authenticated using (true);
drop policy if exists "authenticated manage folio items" on folio_items;
create policy "authenticated manage folio items" on folio_items for all to authenticated using (true) with check (true);
drop policy if exists "authenticated read folio payments" on folio_payments;
create policy "authenticated read folio payments" on folio_payments for select to authenticated using (true);
drop policy if exists "authenticated manage folio payments" on folio_payments;
create policy "authenticated manage folio payments" on folio_payments for all to authenticated using (true) with check (true);

alter table folios drop constraint if exists folios_status_check;
alter table folios add constraint folios_status_check check (status in ('open','closed','cancelled','debt','refunded','partial_refund')) not valid;
alter table folio_items drop constraint if exists folio_items_type_check;
alter table folio_items add constraint folio_items_type_check check (item_type in ('room','restaurant','laundry','minibar','other','discount','cancellation_fee','refund','adjustment')) not valid;
alter table folio_payments drop constraint if exists folio_payments_type_check;
alter table folio_payments add constraint folio_payments_type_check check (payment_type in ('payment','refund')) not valid;
alter table folio_payments drop constraint if exists folio_payments_group_check;
alter table folio_payments add constraint folio_payments_group_check check (payment_group in ('cash','non_tunai')) not valid;
alter table folio_payments drop constraint if exists folio_payments_method_check;
alter table folio_payments add constraint folio_payments_method_check check (payment_method in ('cash','qris','transfer','debit_card','credit_card','e_wallet','other')) not valid;
alter table folio_payments drop constraint if exists folio_payments_positive_amount_check;
alter table folio_payments add constraint folio_payments_positive_amount_check check (amount > 0) not valid;
create unique index if not exists folios_number_unique on folios(folio_number) where folio_number is not null;
-- Folio table compatibility columns for partially-created environments.
alter table folio_items add column if not exists reservation_id uuid references reservations(id);
alter table folio_items add column if not exists stay_id uuid references stays(id);
alter table folio_items add column if not exists room_id uuid references rooms(id);
alter table folio_items add column if not exists item_type text;
alter table folio_items add column if not exists description text;
alter table folio_items add column if not exists qty numeric(10,2) not null default 1;
alter table folio_items add column if not exists unit_price numeric(12,2) not null default 0;
alter table folio_items add column if not exists posting_date date not null default current_date;
alter table folio_payments add column if not exists payment_type text not null default 'payment';
alter table folio_payments add column if not exists payment_group text;
alter table folio_payments add column if not exists payment_method text;
alter table folio_payments add column if not exists amount numeric(12,2);
alter table folio_payments add column if not exists reference_number text;
alter table folio_payments add column if not exists card_or_account_number text;
alter table folio_payments add column if not exists notes text;
alter table folio_payments add column if not exists paid_at timestamptz not null default now();

-- Folio/reservation/status hardening for v0.3.0-folio (safe/idempotent).
-- Do not insert/update reservations.nights from the frontend; it may be a generated column.
alter table reservations add column if not exists folio_id uuid references folios(id);
alter table reservations add column if not exists cancellation_reason text;
alter table reservations add column if not exists cancellation_fee numeric(12,2) not null default 0;
alter table reservations add column if not exists no_show_fee numeric(12,2) not null default 0;

create index if not exists reservations_folio_id_idx on reservations(folio_id);
create index if not exists reservations_room_date_status_idx on reservations(room_id, check_in_date, check_out_date, status);
create index if not exists rooms_ready_lookup_idx on rooms(room_type_id, is_active, fo_status, hk_status);
create index if not exists folio_items_folio_id_idx on folio_items(folio_id);
create index if not exists folio_payments_folio_id_idx on folio_payments(folio_id);

alter table folio_items drop constraint if exists folio_items_type_check;
alter table folio_items add constraint folio_items_type_check check (item_type in ('room','extra_bed','breakfast','early_check_in','late_check_out','restaurant','laundry','minibar','other','discount','cancellation_fee','refund','adjustment')) not valid;

alter table rooms drop constraint if exists rooms_hk_status_check;
alter table rooms add constraint rooms_hk_status_check check (hk_status in ('VR','VD','VC','OR','OD','OC','OOO','OOS')) not valid;

alter table audit_logs enable row level security;
alter table folios enable row level security;
alter table folio_items enable row level security;
alter table folio_payments enable row level security;

drop policy if exists "authenticated insert audit logs" on audit_logs;
create policy "authenticated insert audit logs" on audit_logs for insert to authenticated with check (true);
drop policy if exists "authenticated read audit logs" on audit_logs;
create policy "authenticated read audit logs" on audit_logs for select to authenticated using (true);

drop policy if exists "authenticated read folios" on folios;
create policy "authenticated read folios" on folios for select to authenticated using (true);
drop policy if exists "authenticated manage folios" on folios;
create policy "authenticated manage folios" on folios for all to authenticated using (true) with check (true);
drop policy if exists "authenticated read folio items" on folio_items;
create policy "authenticated read folio items" on folio_items for select to authenticated using (true);
drop policy if exists "authenticated manage folio items" on folio_items;
create policy "authenticated manage folio items" on folio_items for all to authenticated using (true) with check (true);
drop policy if exists "authenticated read folio payments" on folio_payments;
create policy "authenticated read folio payments" on folio_payments for select to authenticated using (true);
drop policy if exists "authenticated manage folio payments" on folio_payments;
create policy "authenticated manage folio payments" on folio_payments for all to authenticated using (true) with check (true);

-- Folio item hardening: valid charge types, void audit columns, numeric checks (safe/idempotent).
alter table folio_items add column if not exists is_void boolean not null default false;
alter table folio_items add column if not exists void_reason text;
alter table folio_items add column if not exists voided_by uuid references profiles(id);
alter table folio_items add column if not exists voided_at timestamptz;

alter table folio_items drop constraint if exists folio_items_type_check;
alter table folio_items add constraint folio_items_type_check check (item_type in ('room','extra_bed','breakfast','early_checkin','late_checkout','laundry','restaurant','minibar','other','discount','cancellation_fee','no_show_fee','refund','adjustment')) not valid;
alter table folio_items drop constraint if exists folio_items_qty_positive_check;
alter table folio_items add constraint folio_items_qty_positive_check check (qty > 0) not valid;
alter table folio_items drop constraint if exists folio_items_unit_price_non_negative_check;
alter table folio_items add constraint folio_items_unit_price_non_negative_check check (unit_price >= 0) not valid;
alter table folio_items drop constraint if exists folio_items_description_required_check;
alter table folio_items add constraint folio_items_description_required_check check (description is not null and length(trim(description)) > 0) not valid;
alter table folio_items drop constraint if exists folio_items_posting_date_required_check;
alter table folio_items add constraint folio_items_posting_date_required_check check (posting_date is not null) not valid;

create index if not exists folio_items_active_folio_id_idx on folio_items(folio_id) where is_void = false;

drop policy if exists "authenticated read folio items" on folio_items;
create policy "authenticated read folio items" on folio_items for select to authenticated using (true);
drop policy if exists "authenticated manage folio items" on folio_items;
create policy "authenticated manage folio items" on folio_items for all to authenticated using (true) with check (true);
