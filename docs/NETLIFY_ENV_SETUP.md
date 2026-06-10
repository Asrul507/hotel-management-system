# Setup ENV Supabase di Netlify

Panduan ini dipakai agar aplikasi `hotel-management-system` dapat membaca konfigurasi Supabase saat deploy ke Netlify.

## 1. Buka Netlify Dashboard

1. Login ke Netlify.
2. Buka dashboard Netlify.
3. Pilih site `hotel-management-system`.

## 2. Masuk ke halaman Environment variables

1. Buka **Site settings** / **Site configuration**.
2. Pilih menu **Environment variables**.
3. Klik **Add variable**.

## 3. Tambahkan ENV Supabase

Tambahkan dua variable berikut:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

> Jangan commit URL project asli atau anon key asli ke repository. Isi value asli hanya di Netlify dan file `.env` lokal yang tidak dicommit.

## 4. Cara mengambil anon key dari Supabase

1. Buka Supabase Dashboard.
2. Pilih project Supabase aplikasi hotel.
3. Masuk ke **Project Settings**.
4. Buka menu **API**.
5. Pada bagian **Project API keys**, salin key **anon public**.
6. Masukkan key tersebut ke variable `VITE_SUPABASE_ANON_KEY` di Netlify.

## 5. Redeploy wajib setelah ENV ditambahkan

Project ini memakai Vite. Vite membaca environment variable frontend saat proses build, bukan saat browser membuka halaman. Karena itu, setelah menambahkan atau mengubah ENV, lakukan deploy ulang:

1. Buka menu **Deploys** di Netlify.
2. Klik **Trigger deploy**.
3. Pilih **Clear cache and deploy site**.

## 6. Cara verifikasi

1. Setelah deploy selesai, buka URL site Netlify.
2. Buka browser console.
3. Pastikan pesan `Supabase belum dikonfigurasi` sudah hilang.
4. Coba login dengan akun Supabase yang sudah memiliki row di tabel `profiles`.
