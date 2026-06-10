# Setup Lengkap

## A. Setup Supabase dari nol
1. Buat project Supabase.
2. Buka SQL Editor lalu jalankan `supabase/schema.sql`.
3. Buka Authentication > Users, buat user admin pertama.
4. Salin URL project dan anon key ke `.env`:
   - `VITE_SUPABASE_URL=https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=<anon-key>`
5. Insert role admin pertama:
```sql
insert into profiles (id, full_name, role)
values ('<auth_user_uuid>', 'Super Admin', 'super_admin');
```

## B. Setup GitHub
```bash
git init
git add .
git commit -m "feat: bootstrap hotel management system"
git branch -M main
git remote add origin <repo-url>
git push -u origin main
```

## C. Deploy Vercel / Netlify
- **Vercel**: Import repo GitHub -> Framework Vite -> set env vars -> Deploy.
- **Netlify**: New site from Git -> Build `npm run build` -> Publish `dist` -> set env vars.

## D. Checklist testing fitur
- Auth login/logout/session.
- Route protection berdasarkan role.
- Dashboard statistik kamar.
- CRUD master data (room type, room, guest, payment method).
- Reservasi + cek ketersediaan + nights otomatis.
- Check-in & check-out + invoice + payment partial/refund.
- Housekeeping & maintenance workflow.
- Report export CSV.
- Mobile responsive UI.

## E. Penjelasan file penting
- `src/config/supabase.js`: koneksi Supabase client.
- `src/contexts/AuthContext.jsx`: session/auth state.
- `src/components/ProtectedRoute.jsx`: proteksi route.
- `src/services/api.js`: helper query dashboard.
- `src/pages/*`: halaman modul.
- `supabase/schema.sql`: schema, relasi, sample data.
