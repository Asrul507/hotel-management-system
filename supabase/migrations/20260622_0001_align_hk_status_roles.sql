-- Align frontend room HK status and profile role values with database constraints.
-- Run manually in Supabase SQL editor if your project is not using the Supabase CLI.

alter type app_role add value if not exists 'admin';
alter type app_role add value if not exists 'frontdesk';

alter table rooms drop constraint if exists rooms_hk_status_check;
alter table rooms add constraint rooms_hk_status_check
  check (hk_status in ('VR','VC','VD','OR','OD','OC','OOO','OOS','DND','ONL')) not valid;

alter table rooms validate constraint rooms_hk_status_check;
