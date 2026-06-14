-- Add hotel tax mode so folio totals can support exclusive and inclusive tax.
alter table public.hotel_settings
  add column if not exists tax_mode text not null default 'exclusive';

alter table public.hotel_settings
  drop constraint if exists hotel_settings_tax_mode_check;

alter table public.hotel_settings
  add constraint hotel_settings_tax_mode_check
  check (tax_mode in ('exclusive', 'inclusive'));
