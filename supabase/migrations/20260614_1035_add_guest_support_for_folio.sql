-- Folio already uses public.guests through folios.guest_id. This migration only adds safe lookup indexes.

create index if not exists idx_guests_full_name_lookup
  on public.guests (lower(full_name));

create index if not exists idx_guests_phone_lookup
  on public.guests (phone)
  where phone is not null;

create index if not exists idx_guests_email_lookup
  on public.guests (email)
  where email is not null;

create index if not exists idx_folios_guest_id
  on public.folios (guest_id);
