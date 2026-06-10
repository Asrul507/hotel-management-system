create extension if not exists "pgcrypto";

-- Roles
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('super_admin','manager','receptionist','housekeeping','cashier');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


DO $$ BEGIN
  CREATE TYPE room_status AS ENUM ('available','unavailable','occupied','dirty','cleaning','maintenance','out_of_order');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE room_status ADD VALUE IF NOT EXISTS 'unavailable';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE reservation_status AS ENUM ('reserved','checked_in','checked_out','cancelled','no_show');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE reservation_status ADD VALUE IF NOT EXISTS 'reserved';
  ALTER TYPE reservation_status ADD VALUE IF NOT EXISTS 'booked';
  ALTER TYPE reservation_status ADD VALUE IF NOT EXISTS 'confirmed';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('unpaid','partial','paid','refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE maintenance_status AS ENUM ('reported','in_progress','done');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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

-- Room configuration
create table if not exists room_types (
  id uuid primary key default gen_random_uuid(),
  code text unique,
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
update room_types set code = upper(regexp_replace(coalesce(code, name, id::text), '[^a-zA-Z0-9]+', '_', 'g')) where code is null or code = '';
update room_types set base_rate = base_price where coalesce(base_rate, 0) = 0 and coalesce(base_price, 0) > 0;
update room_types set base_price = base_rate where coalesce(base_price, 0) = 0 and coalesce(base_rate, 0) > 0;
alter table room_types alter column code set not null;
create unique index if not exists room_types_code_unique on room_types(code);

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
alter table rooms add column if not exists is_active boolean not null default true;
update rooms set hk_status = case status when 'occupied' then 'OC' when 'dirty' then 'VD' when 'maintenance' then 'OOS' when 'out_of_order' then 'OOO' else coalesce(hk_status, 'VC') end;
update rooms set fo_status = case when hk_status in ('OOO','OOS') or status in ('maintenance','out_of_order') then 'unavailable' else 'available' end;

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
  nik text unique,
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
update guests set nik = id_number where (nik is null or nik = '') and id_number is not null;
create unique index if not exists guests_nik_unique on guests(nik) where nik is not null and nik <> '';
create index if not exists guests_phone_idx on guests(phone);
create index if not exists guests_search_idx on guests(full_name, nik, phone);

-- Reservations and actual stays
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_number text unique,
  reservation_code text unique,
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
alter table reservations add column if not exists adults integer not null default 1;
alter table reservations add column if not exists children integer not null default 0;
alter table reservations add column if not exists room_rate numeric(12,2) not null default 0;
alter table reservations add column if not exists notes text;
update reservations set reservation_number = coalesce(reservation_number, reservation_code) where reservation_number is null;
update reservations set reservation_code = coalesce(reservation_code, reservation_number) where reservation_code is null;
update reservations set check_in_date = checkin_date where check_in_date is null and checkin_date is not null;
update reservations set check_out_date = checkout_date where check_out_date is null and checkout_date is not null;
update reservations set checkin_date = check_in_date where checkin_date is null and check_in_date is not null;
update reservations set checkout_date = check_out_date where checkout_date is null and check_out_date is not null;
create unique index if not exists reservations_number_unique on reservations(reservation_number) where reservation_number is not null;
alter table reservations drop constraint if exists reservations_status_check;
alter table reservations add constraint reservations_status_check check (status in ('reserved','booked','confirmed','checked_in','checked_out','cancelled','no_show')) not valid;

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
update stays set actual_check_in = checkin_at where actual_check_in is null and checkin_at is not null;
update stays set actual_check_out = checkout_at where actual_check_out is null and checkout_at is not null;

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

alter table profiles enable row level security;
alter table room_types enable row level security;
alter table rooms enable row level security;
alter table guests enable row level security;
alter table reservations enable row level security;
alter table stays enable row level security;

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

insert into hotel_settings (hotel_name,address,phone,tax_percent,service_charge_percent)
select 'Hotel Management System','Jakarta','+62 21 0000',10,5
where not exists (select 1 from hotel_settings);

insert into room_types (code,name,base_rate,base_price,max_occupancy,facilities) values
('STD','Standard',450000,450000,2,'["AC","WiFi","TV"]'),
('DLX','Deluxe',700000,700000,2,'["AC","WiFi","TV","Mini Bar"]'),
('STE','Suite',1250000,1250000,4,'["Living Room","Bathtub","Smart TV"]')
on conflict (code) do nothing;

insert into rooms (room_number,room_type_id,floor,fo_status,hk_status,status)
select '10'||g::text, rt.id, '1', 'available', 'VC', 'available'
from generate_series(1,5) g cross join lateral (select id from room_types where code='STD' limit 1) rt
on conflict (room_number) do nothing;
