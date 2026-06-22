# Username-based login and user creation

The frontend accepts `username + password`, looks up the internal Supabase Auth email through `public.get_auth_email_for_username(username)`, then signs in with `supabase.auth.signInWithPassword({ email, password })`.

## Required migration

Run:

```sql
supabase/migrations/20260622_0002_username_login_profiles.sql
```

This adds `profiles.username`, `profiles.auth_email`, `profiles.must_change_password`, active/unique indexes, role enum values, and the username lookup RPC.

## Creating auth users safely

The browser must **not** use the Supabase service role key. Deploy a server-side endpoint or Supabase Edge Function named `admin-create-user` that:

1. Verifies the caller is authenticated and their profile role is `super_admin`, `admin`, or `manager`.
2. Normalizes `username` to lowercase without spaces.
3. Generates `auth_email` as `${username}@hotel.local` (or another internal domain consistent with the frontend).
4. Calls `supabase.auth.admin.createUser({ email: auth_email, password, email_confirm: true })` using the service role key server-side only.
5. Inserts `profiles` with `id = createdUser.id`, `full_name`, `username`, `auth_email`, `role`, `phone`, `is_active`, and `must_change_password`.
6. Never stores the plaintext password in `profiles` or any app table.

If the Edge Function is not deployed, the User Management form will show a safe error and no password will be persisted in the database.
