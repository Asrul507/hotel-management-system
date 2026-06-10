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
update reservations set nights = greatest((check_out_date - check_in_date), 0) where check_in_date is not null and check_out_date is not null;
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

insert into room_types (code,name,base_rate,base_price,max_occupancy,facilities) values
('STD','Standard',450000,450000,2,'["AC","WiFi","TV"]'),
('DLX','Deluxe',700000,700000,2,'["AC","WiFi","TV","Mini Bar"]'),
('STE','Suite',1250000,1250000,4,'["Living Room","Bathtub","Smart TV"]')
on conflict (code) do update set
  name = excluded.name,
  base_rate = excluded.base_rate,
  base_price = excluded.base_price,
  max_occupancy = excluded.max_occupancy,
  facilities = excluded.facilities,
  updated_at = now();

insert into rooms (room_number,room_type_id,floor,fo_status,hk_status,status)
select '10'||g::text, rt.id, '1', 'available', 'VC', 'available'
from generate_series(1,5) g
cross join lateral (select id from room_types where code='STD' limit 1) rt
on conflict (room_number) do nothing;
