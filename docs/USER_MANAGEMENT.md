# User Management

User Management is a `super_admin` only feature for maintaining application profiles and roles.

## Safe user creation model

The browser app uses the Supabase anon key. It must **not** create Supabase Auth users with a service-role key in frontend code. A service-role key bypasses Row Level Security and must only live in trusted backend environments such as Supabase Edge Functions, server-side jobs, or the Supabase Dashboard.

Because this project does not include a dedicated Edge Function/Admin API for user creation, the safe flow is:

1. Open Supabase Dashboard.
2. Go to **Authentication → Users**.
3. Create or invite the user with their email address.
4. Copy the Auth user UUID.
5. In the hotel app, login as `super_admin` and open **Users**.
6. Create or edit the matching `profiles` row:
   - `id`: Supabase Auth user UUID
   - `email`: user email
   - `full_name`: display name
   - `phone`: optional phone
   - `role`: one of `super_admin`, `manager`, `receptionist`, `housekeeping`, `cashier`
   - `is_active`: controls app-level active/inactive status

## Editing users

A `super_admin` can:
- list profiles,
- search by email/name/phone/role,
- filter by role/status,
- edit `full_name`, `phone`, `role`, `email`, and active status.

Other roles do not see the Users menu and are blocked by route protection.

## SQL required

Run the latest `supabase/schema.sql` in Supabase SQL Editor. The relevant additions are idempotent:
- `profiles.email`
- profile lookup indexes
- super-admin profile insert/update policies

## Do not do this

Never put `service_role` keys in:
- `.env` files shipped to Vite frontend,
- React components,
- browser local storage,
- public config files.

If automatic Auth user creation is needed later, implement it with a backend-only Supabase Edge Function or server API that validates the caller is a `super_admin` before using the service-role key.
