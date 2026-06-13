-- ============================================================================
-- DANGER: MANUAL RESET SCRIPT ONLY. DO NOT RUN IN PRODUCTION WITHOUT BACKUP.
-- Purpose: remove hotel operational/testing transactions while preserving login
-- users, roles, and master data needed by the application.
--
-- Safe placement: this file lives under supabase/manual_sql so Supabase migration
-- runners should not execute it automatically. Review and run selected sections
-- manually in the Supabase SQL Editor only after a backup is available.
--
-- KEEP_USER_LOGIN (never touched here):
--   - auth.users
--   - public.profiles (app login profile/role table)
--
-- KEEP_MASTER_DATA (never deleted here):
--   - public.hotel_settings
--   - public.room_types
--   - public.rooms
--
-- DELETE_TRANSACTION_DATA (deleted by the RESET section):
--   - public.room_move_logs
--   - public.maintenance_reports
--   - public.housekeeping_tasks
--   - public.payments
--   - public.invoice_items
--   - public.invoices
--   - public.folio_payments
--   - public.folio_items
--   - public.stays
--   - public.reservations
--   - public.folios
--   - public.audit_logs
--
-- UNCERTAIN_NEED_REVIEW (not deleted by default):
--   - public.guests: guest database may be useful CRM/master data, but test guest
--     rows can be removed manually after review if the hotel wants a fully clean
--     guest database.
--   - public.rooms operational status fields (fo_status/hk_status/status): rooms
--     are kept; optional status reset is provided as a commented template below.
--
-- Recommended workflow:
--   1. Run only SECTION 1 (PREVIEW COUNTS) first.
--   2. Export/backup data if any count is not expected.
--   3. Run SECTION 2 (RESET DATA) only when approved.
--   4. Run SECTION 3 and SECTION 4 to verify transaction rows are empty while
--      login/master data still exists.
-- ============================================================================

-- ============================================================================
-- SECTION 1: PREVIEW COUNTS BEFORE RESET
-- Highlight and run this SELECT first. It does not delete or update anything.
-- ============================================================================
select 'audit_logs' as table_name, count(*) as total_rows from public.audit_logs
union all select 'folio_items', count(*) from public.folio_items
union all select 'folio_payments', count(*) from public.folio_payments
union all select 'folios', count(*) from public.folios
union all select 'housekeeping_tasks', count(*) from public.housekeeping_tasks
union all select 'invoice_items', count(*) from public.invoice_items
union all select 'invoices', count(*) from public.invoices
union all select 'maintenance_reports', count(*) from public.maintenance_reports
union all select 'payments', count(*) from public.payments
union all select 'reservations', count(*) from public.reservations
union all select 'room_move_logs', count(*) from public.room_move_logs
union all select 'stays', count(*) from public.stays
order by table_name;

-- Optional review-only counts for data intentionally kept by default.
select 'profiles_keep_login' as table_name, count(*) as total_rows from public.profiles
union all select 'hotel_settings_keep_master', count(*) from public.hotel_settings
union all select 'room_types_keep_master', count(*) from public.room_types
union all select 'rooms_keep_master', count(*) from public.rooms
union all select 'guests_uncertain_review_only', count(*) from public.guests
order by table_name;

-- ============================================================================
-- OPTIONAL BACKUP TEMPLATES (commented out intentionally)
-- Uncomment and run only the tables you want to back up before resetting.
-- ============================================================================
-- create table public.backup_reservations_20260613 as select * from public.reservations;
-- create table public.backup_stays_20260613 as select * from public.stays;
-- create table public.backup_folios_20260613 as select * from public.folios;
-- create table public.backup_folio_items_20260613 as select * from public.folio_items;
-- create table public.backup_folio_payments_20260613 as select * from public.folio_payments;
-- create table public.backup_invoices_20260613 as select * from public.invoices;
-- create table public.backup_invoice_items_20260613 as select * from public.invoice_items;
-- create table public.backup_payments_20260613 as select * from public.payments;
-- create table public.backup_housekeeping_tasks_20260613 as select * from public.housekeeping_tasks;
-- create table public.backup_maintenance_reports_20260613 as select * from public.maintenance_reports;
-- create table public.backup_room_move_logs_20260613 as select * from public.room_move_logs;
-- create table public.backup_audit_logs_20260613 as select * from public.audit_logs;

-- ============================================================================
-- SECTION 2: RESET DATA
-- This section deletes transaction rows only. It uses DELETE in foreign-key-safe
-- order instead of broad TRUNCATE ... CASCADE, so user login and master data are
-- not accidentally removed through cascading relationships.
-- ============================================================================
begin;

-- Operational logs and task rows that point to rooms/profiles/reservations/stays.
delete from public.room_move_logs;
delete from public.maintenance_reports;
delete from public.housekeeping_tasks;

-- Legacy invoice/payment transaction stack. Child rows are deleted before parent rows.
delete from public.payments;
delete from public.invoice_items;
delete from public.invoices;

-- Folio/P.O.S transaction stack. Child rows are deleted before parent folios.
delete from public.folio_payments;
delete from public.folio_items;

-- Stay and reservation rows are deleted before folios because reservations/stays
-- may reference folio_id in existing deployments.
delete from public.stays;
delete from public.reservations;
delete from public.folios;

-- Testing audit trail. Kept out of auth/profile data by design.
delete from public.audit_logs;

commit;

-- Optional room operational-status reset after review. This keeps room master rows
-- but normalizes their operational state for a clean hotel start.
-- update public.rooms
-- set fo_status = 'available',
--     hk_status = 'VC',
--     status = 'available',
--     updated_at = now();

-- Optional guest cleanup after review. Do not run if guest database should be kept.
-- delete from public.guests;

-- ============================================================================
-- SECTION 3: VERIFY COUNTS AFTER RESET
-- Transaction tables below should return 0 after SECTION 2 succeeds.
-- ============================================================================
select 'audit_logs' as table_name, count(*) as total_rows from public.audit_logs
union all select 'folio_items', count(*) from public.folio_items
union all select 'folio_payments', count(*) from public.folio_payments
union all select 'folios', count(*) from public.folios
union all select 'housekeeping_tasks', count(*) from public.housekeeping_tasks
union all select 'invoice_items', count(*) from public.invoice_items
union all select 'invoices', count(*) from public.invoices
union all select 'maintenance_reports', count(*) from public.maintenance_reports
union all select 'payments', count(*) from public.payments
union all select 'reservations', count(*) from public.reservations
union all select 'room_move_logs', count(*) from public.room_move_logs
union all select 'stays', count(*) from public.stays
order by table_name;

-- ============================================================================
-- SECTION 4: VERIFY LOGIN AND MASTER DATA STILL EXISTS
-- These counts should remain unchanged by the reset section.
-- ============================================================================
select 'profiles_keep_login' as table_name, count(*) as total_rows from public.profiles
union all select 'hotel_settings_keep_master', count(*) from public.hotel_settings
union all select 'room_types_keep_master', count(*) from public.room_types
union all select 'rooms_keep_master', count(*) from public.rooms
union all select 'guests_uncertain_review_only', count(*) from public.guests
order by table_name;

-- Optional auth.users verification if your SQL role can read auth schema:
-- select 'auth_users_keep_login' as table_name, count(*) as total_rows from auth.users;
