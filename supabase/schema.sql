create extension if not exists "pgcrypto";

do $$ begin
  create type app_role as enum ('super_admin','manager','receptionist','housekeeping','cashier');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type room_status as enum ('available','occupied','dirty','cleaning','maintenance','out_of_order');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type reservation_status as enum ('booked','confirmed','checked_in','checked_out','cancelled','no_show');
exception when duplicate_object then null;
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
create table if not exists room_types (
  id uuid primary key default gen_random_uuid(), name text unique not null, base_price numeric(12,2) not null, facilities jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(), room_number text unique not null, room_type_id uuid not null references room_types(id), floor text,
  status room_status not null default 'available', notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists guests (
  id uuid primary key default gen_random_uuid(), full_name text not null, email text, phone text, id_type text, id_number text, address text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(), reservation_code text unique not null, guest_id uuid not null references guests(id), room_type_id uuid references room_types(id), room_id uuid references rooms(id),
  checkin_date date not null, checkout_date date not null, nights int generated always as (checkout_date-checkin_date) stored,
  status reservation_status not null default 'booked', deposit_amount numeric(12,2) default 0, special_notes text, created_by uuid references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists stays (
  id uuid primary key default gen_random_uuid(), reservation_id uuid references reservations(id), guest_id uuid not null references guests(id), room_id uuid not null references rooms(id),
  checkin_at timestamptz, checkout_at timestamptz, deposit_amount numeric(12,2) default 0, status reservation_status not null default 'checked_in',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(), stay_id uuid not null references stays(id), invoice_number text unique not null, subtotal numeric(12,2) default 0, tax_amount numeric(12,2) default 0,
  service_amount numeric(12,2) default 0, total_amount numeric(12,2) default 0, deposit_applied numeric(12,2) default 0, balance_due numeric(12,2) default 0,
  status invoice_status not null default 'unpaid', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references invoices(id) on delete cascade, item_type text not null, description text not null,
  qty numeric(10,2) not null default 1, unit_price numeric(12,2) not null default 0, line_total numeric(12,2) generated always as (qty*unit_price) stored,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists payments (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references invoices(id), payment_method text not null, amount numeric(12,2) not null, paid_at timestamptz default now(),
  reference_number text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists housekeeping_tasks (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references rooms(id), assigned_to uuid references profiles(id),
  status text not null check (status in ('dirty','cleaning','clean','inspected')),
  notes text, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists maintenance_reports (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references rooms(id), reported_by uuid references profiles(id),
  status maintenance_status not null default 'reported', issue text not null, fix_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid references profiles(id), action text not null, table_name text not null, record_id uuid, payload jsonb,
  created_at timestamptz not null default now());

alter table profiles enable row level security;
alter table rooms enable row level security;
alter table reservations enable row level security;

drop policy if exists "authenticated read profiles" on profiles;
drop policy if exists "users update own profile" on profiles;
drop policy if exists "authenticated read rooms" on rooms;
drop policy if exists "authenticated manage rooms" on rooms;
drop policy if exists "authenticated read reservations" on reservations;
drop policy if exists "authenticated manage reservations" on reservations;

create policy "authenticated read profiles" on profiles for select to authenticated using (true);
create policy "users update own profile" on profiles for update to authenticated using (auth.uid()=id);
create policy "authenticated read rooms" on rooms for select to authenticated using (true);
create policy "authenticated manage rooms" on rooms for all to authenticated using (true) with check (true);
create policy "authenticated read reservations" on reservations for select to authenticated using (true);
create policy "authenticated manage reservations" on reservations for all to authenticated using (true) with check (true);

insert into hotel_settings (hotel_name,address,phone,tax_percent,service_charge_percent)
select 'Hotel Management System','Jakarta','+62 21 0000',10,5
where not exists (select 1 from hotel_settings);
insert into room_types (name,base_price,facilities) values
('Standard',450000,'["AC","WiFi","TV"]'),('Deluxe',700000,'["AC","WiFi","TV","Mini Bar"]'),('Suite',1250000,'["Living Room","Bathtub","Smart TV"]')
on conflict (name) do nothing;
insert into rooms (room_number,room_type_id,floor,status)
select '10'||g::text, rt.id, '1', 'available'::room_status from generate_series(1,5) g cross join lateral (select id from room_types limit 1) rt
on conflict (room_number) do nothing;
