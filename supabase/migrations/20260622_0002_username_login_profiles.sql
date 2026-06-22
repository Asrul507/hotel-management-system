-- Username-based login support while keeping Supabase Auth email/password internally.

alter type app_role add value if not exists 'admin';
alter type app_role add value if not exists 'frontdesk';

alter table profiles add column if not exists username text;
alter table profiles add column if not exists auth_email text;
alter table profiles add column if not exists must_change_password boolean not null default false;
alter table profiles add column if not exists is_active boolean not null default true;

update profiles
set username = lower(regexp_replace(coalesce(username, split_part(coalesce(email, auth_email, id::text), '@', 1)), '\s+', '', 'g'))
where username is null;

update profiles
set auth_email = lower(coalesce(auth_email, email, username || '@hotel.local'))
where auth_email is null and username is not null;

alter table profiles drop constraint if exists profiles_username_lower_check;
alter table profiles add constraint profiles_username_lower_check
  check (username is null or (username = lower(username) and username !~ '\s')) not valid;

create unique index if not exists profiles_username_unique_idx on profiles(username) where username is not null;
create unique index if not exists profiles_auth_email_unique_idx on profiles(auth_email) where auth_email is not null;
create index if not exists profiles_username_active_idx on profiles(username, is_active);

create or replace function public.get_auth_email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public
as $$
  select auth_email
  from public.profiles
  where username = lower(trim(p_username))
    and is_active = true
  limit 1;
$$;

grant execute on function public.get_auth_email_for_username(text) to anon, authenticated;

create or replace function public.current_user_is_admin_level()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('super_admin','admin','manager')
      and is_active = true
  );
$$;

drop policy if exists "super admin insert profiles" on profiles;
drop policy if exists "super admin update profiles" on profiles;
drop policy if exists "admin level insert profiles" on profiles;
drop policy if exists "admin level update profiles" on profiles;
create policy "admin level insert profiles" on profiles for insert to authenticated with check (public.current_user_is_admin_level());
create policy "admin level update profiles" on profiles for update to authenticated using (public.current_user_is_admin_level()) with check (public.current_user_is_admin_level());
