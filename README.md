# Hotel Management System

Aplikasi web manajemen hotel modern berbasis React + Supabase.

## 1) Struktur folder

- `src/` frontend React modular
- `supabase/schema.sql` schema PostgreSQL + sample data + RLS awal
- `docs/SETUP.md` panduan setup Supabase/GitHub/Deploy/testing
- `docs/NETLIFY_ENV_SETUP.md` panduan setup environment variable Supabase di Netlify

## 2) Jalankan lokal

```bash
npm install
cp .env.example .env
npm run dev
```

Isi `.env` lokal dengan URL project Supabase dan anon key milik project Anda. Jangan commit file `.env` yang berisi credential asli.

## 3) Setup Environment Variables

Project ini membutuhkan environment variable berikut:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Catatan penting: karena project memakai Vite, semua variable yang ingin dibaca frontend harus diawali `VITE_`.

Konfigurasi Supabase divalidasi di `src/config/supabase.js`. Jika ENV belum lengkap atau URL tidak diawali `https://`, aplikasi akan menampilkan pesan konfigurasi yang jelas dan tidak akan memakai fallback credential.

## 4) Deploy ke Netlify

1. Import repository ke Netlify.
2. Gunakan build command:
   ```bash
   npm run build
   ```
3. Gunakan publish directory:
   ```bash
   dist
   ```
4. Buka **Site settings** / **Site configuration** > **Environment variables**.
5. Tambahkan:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Ambil anon key dari **Supabase Dashboard** > **Project Settings** > **API** > **Project API keys** > **anon public**.
7. Setelah ENV ditambahkan atau diubah, buka **Deploys** > **Trigger deploy** > **Clear cache and deploy site**.

Panduan lengkap tersedia di `docs/NETLIFY_ENV_SETUP.md`.

## 5) Environment Supabase

Gunakan URL utama Supabase, contoh format:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
```

Jangan gunakan URL REST seperti `/rest/v1` untuk `VITE_SUPABASE_URL`.

## 6) Modul Operasional Baru

Aplikasi menyediakan menu inti hotel management berikut:

- **Master Setting** (`/master-settings`) untuk setup room type, harga dasar, max occupancy, nomor kamar, FO status, HK status, dan active/inactive.
- **Tamu** (`/guests`) untuk database tamu dengan field nama lengkap, NIK, no HP, email, alamat, kota, tanggal lahir, jenis kelamin, catatan, blacklist, dan arsip soft delete.
- **Forecast** (`/forecast`) untuk melihat forecast hunian per tanggal berdasarkan inventory room, OOO/OOS, occupied, expected arrival, expected departure, available room, dan occupancy percentage.

Jalankan atau update `supabase/schema.sql` di Supabase SQL Editor sebelum memakai menu baru agar kolom `fo_status`, `hk_status`, `base_rate`, dan data tamu lengkap tersedia.
