# Folio Billing

## Jawaban audit menu billing saat ini

1. **Input billing/folio ada di menu `Folio / Billing`** (`/billing`). Menu ini sekarang menjadi workspace folio, bukan lagi form invoice legacy.
2. **Cara input billing/folio sekarang:**
   - Buka `Folio / Billing`.
   - Klik **New Folio** dan pilih guest untuk membuat nomor folio/no bill dengan status `open`.
   - Pilih folio di daftar kiri.
   - Gunakan tab kanan:
     - **Summary** untuk melihat total dan apply discount persen.
     - **Reservations** untuk input reservasi yang otomatis membawa `folio_id`.
     - **Charges** untuk room charge dan additional charge.
     - **Payments** untuk payment cash/non tunai.
     - **Refund / Debt** untuk refund dan close/mark debt.
3. **Billing utama memakai folio baru.** Invoice lama tetap dipertahankan sebagai legacy compatibility saat check-out, tetapi operasional billing harian menggunakan tabel `folios`, `folio_items`, dan `folio_payments`.
4. Flow hotel diperjelas menjadi **Folio Workspace**: satu folio dapat berisi satu atau beberapa reservasi/kamar, charge tambahan, payment, refund, discount, dan debt. Folio tidak dipaksa satu kamar.

## Konsep Folio

Folio adalah rekening operasional tamu. Satu folio dapat menampung satu atau lebih reservasi, beberapa kamar, room charge, additional charge, discount, payment, refund, cancellation fee, dan debt.

## Folio vs Invoice Legacy

- **Folio baru** adalah sumber utama untuk menu `Folio / Billing`.
- **Invoice lama** tetap ada agar data lama tidak rusak dan check-out lama tetap kompatibel.
- Check-out masih dapat membuat/update invoice legacy, tetapi total yang ditampilkan di menu billing berasal dari folio.

## Cara membuat Folio Baru

1. Buka menu `Folio / Billing`.
2. Pada panel kiri, pilih guest di form **Buat Folio Baru**.
3. Isi notes bila perlu.
4. Klik **New Folio**.
5. Sistem membuat `folio_number` otomatis dan status awal `open`.

## Cara input Reservasi dari Folio

1. Pilih folio.
2. Klik tab **Reservations** atau tombol **Add Reservation**.
3. Isi room type, check-in, dan `nights`.
4. UI menghitung `check_out_date = check_in_date + nights`.
5. Pilih kamar ready bila ingin assign kamar langsung.
6. Simpan reservasi.
7. Frontend **tidak mengirim field `nights` ke Supabase** karena beberapa database memakai `reservations.nights` sebagai generated column. Yang disimpan adalah `check_in_date` dan `check_out_date`; DB boleh menghitung nights sendiri.
8. Reservasi tersimpan dengan `folio_id` dan room charge dibuat sekali di `folio_items`.

## Room Charge

Room charge memakai `folio_items` dengan:

- `item_type = room`
- `reservation_id` terhubung ke reservasi
- `room_id` jika kamar sudah dipilih
- `description = Room charge room_number x nights malam`
- `qty = nights`
- `unit_price = room_rate`

Service `addRoomChargeOnce` mencegah room charge double untuk reservasi/stay yang sama.

## Additional Charge

Additional charge ditambahkan dari tab **Charges** dan dapat ditambah walaupun belum ada reservasi. Default item:

- Extra Bed (`extra_bed`)
- Breakfast (`breakfast`)
- Early Check In (`early_checkin`)
- Late Check Out (`late_checkout`)
- Laundry (`laundry`)
- Restaurant (`restaurant`)
- Minibar (`minibar`)
- Other (`other`)

Validasi:

- `description` wajib.
- `qty > 0`.
- `unit_price >= 0`.
- `posting_date` default hari ini.

Setelah disimpan, item masuk ke `folio_items` dan total folio direcalculate.

## Payment, Discount, Refund, Debt

- Discount persen diinput dari tab **Summary**.
- Payment ada di tab **Payments**.
- Payment group:
  - `cash`
  - `non_tunai`
- Untuk `non_tunai`, metode wajib salah satu:
  - `qris`
  - `transfer`
  - `debit_card`
  - `credit_card`
  - `e_wallet`
  - `other`
- Payment non tunai wajib `reference_number` / no reff.
- `card_or_account_number` tersedia untuk no kartu/no ID/no akun.
- Refund tidak boleh melebihi paid amount yang belum direfund.
- Saat close folio, jika `balance_due > 0`, status menjadi `debt`; jika sudah lunas, status menjadi `closed`.

## SQL penting

Jalankan `supabase/schema.sql` terbaru di Supabase SQL Editor. Migration bersifat idempotent dan menambahkan/mengecek:

- `reservations.folio_id`
- `reservations.cancellation_reason`
- `reservations.cancellation_fee`
- `folios`
- `folio_items`
- `folio_payments`
- RLS folio dan audit log
- index folio/reservation/room ready lookup
- constraint item type additional charge baru

## Catatan nights

`reservations.nights` diperlakukan sebagai derived/generated value. Frontend tetap menyediakan input nights sebagai helper UI, tetapi payload insert/update tidak mengirim `nights` ke Supabase. Ini menghindari error PostgreSQL: `cannot insert a non-DEFAULT value into column nights`.

## Update Add Charge dan Void Transaksi

Add Charge di Folio/Billing sekarang mengirim payload aman ke `folio_items`:

- Tidak mengirim `id`.
- Tidak mengirim `line_total` karena `line_total` adalah generated column (`qty * unit_price`).
- `folio_id` wajib ada dari folio yang sedang dipilih.
- `item_type` wajib salah satu tipe yang valid.
- `description` wajib diisi.
- `qty` dikonversi ke number dan harus `> 0`.
- `unit_price` dikonversi ke number dan harus `>= 0`.
- `posting_date` default hari ini jika kosong dan harus format `YYYY-MM-DD`.

Default additional charge types yang dikirim UI:

- `extra_bed` = Extra Bed
- `breakfast` = Breakfast
- `early_checkin` = Early Check In
- `late_checkout` = Late Check Out
- `laundry` = Laundry
- `restaurant` = Restaurant
- `minibar` = Minibar
- `other` = Other

Jika Add Charge masih gagal dengan constraint `item_type`, jalankan ulang `supabase/schema.sql` terbaru agar constraint `folio_items_type_check` menerima daftar item baru.

### Edit dan Hapus/Void Folio Item

Edit dan hapus transaksi hanya boleh untuk `super_admin`.

- Tombol **Edit** dan **Hapus/Void** hanya tampil untuk `profile.role === 'super_admin'`.
- Service juga menolak role selain `super_admin`, jadi permission tidak hanya disembunyikan di UI.
- Edit hanya mengubah `item_type`, `description`, `qty`, `unit_price`, dan `posting_date`.
- Edit tidak mengubah `id`, `folio_id`, `line_total`, atau `created_at`.
- Hapus memakai soft delete/void, bukan hard delete:
  - `is_void = true`
  - `void_reason`
  - `voided_by`
  - `voided_at`
- Item void tetap terlihat dengan badge `VOID` untuk audit hotel.
- Recalculate folio totals mengabaikan `folio_items.is_void = true`.

### SQL untuk void item

Jalankan `supabase/schema.sql` terbaru. Migration tambahan bersifat idempotent dan menambahkan:

```sql
alter table folio_items add column if not exists is_void boolean not null default false;
alter table folio_items add column if not exists void_reason text;
alter table folio_items add column if not exists voided_by uuid references profiles(id);
alter table folio_items add column if not exists voided_at timestamptz;
```

## Update UX Folio Overview

Menu `Folio / Billing` sekarang membuka workspace dengan daftar folio dan detail folio terpilih. Form **Buat Folio Baru** tidak lagi tampil terus menerus:

1. Klik **Tambah Folio Baru** untuk membuka form.
2. Pilih guest dan simpan.
3. Setelah berhasil, form otomatis tertutup.
4. Folio baru otomatis terpilih.
5. Tab **Overview** langsung menampilkan ringkasan folio baru.

Overview menampilkan folio number, guest, status folio, billing status, subtotal, discount, tax/service, grand total, paid, refund, balance, serta quick actions untuk Add Reservation, Add Charge, Payment, Refund, dan Discount.

## Reservations list-only

Menu `Reservations` sekarang diposisikan sebagai halaman monitoring/list dan filter. Reservasi baru dibuat dari `Folio / Billing` agar otomatis terhubung ke folio/no bill. Tombol dari halaman Reservations diarahkan ke menu Folio.

## Billing status

Billing status memakai helper `getBillingStatus(folio)`:

- `debt` jika folio status `debt`.
- `refunded` jika folio status `refunded`.
- `paid` jika `balance_due <= 0` atau `paid_amount >= grand_total`.
- `partial` jika `paid_amount > 0` dan `balance_due > 0`.
- `unpaid` jika belum ada pembayaran.

Check-in / Check-out mengambil status folio terbaru, bukan invoice legacy, sehingga folio lunas tampil `PAID`.

## Operasional Folio: Extend Stay dan Bayar Debt

### Extend Stay / Tambah Hari
1. Buka menu **Front Office** atau **Folio / Billing Workspace** lalu pilih folio tamu.
2. Masuk tab **Add Reservation** dan gunakan tombol **Extend Stay** pada baris reservasi.
3. Isi tanggal checkout baru dan tarif tambahan per malam. Jika rate kamar belum tersedia, tarif manual wajib diisi.
4. Sistem menolak extend jika tanggal checkout baru tidak lebih besar dari checkout lama atau kamar bentrok dengan reservasi lain pada rentang tambahan.
5. Setelah berhasil, tanggal checkout reservasi diperbarui dan charge tambahan masuk ke folio.

### Bayar Debt
1. Pilih folio yang masih memiliki **Balance Due** atau status **debt**.
2. Klik tombol **Bayar Debt** pada header folio atau tab **Add Payment**.
3. Isi nominal pembayaran, group/metode pembayaran, tanggal pembayaran, referensi jika non-tunai, dan catatan.
4. Pembayaran sebagian akan mengurangi balance dan status tetap debt/partial sesuai sisa tagihan; pembayaran penuh akan menutup balance dan folio akan dihitung ulang sebagai lunas/closed.
5. Tombol submit otomatis disabled saat proses agar tidak double submit.

## P.O.S / Kasir

Mulai versi ini, Folio dipakai sebagai pusat tagihan dan P.O.S / Kasir dipakai sebagai pusat payment/settlement.

### Cara bayar folio
1. Buka **Folio / Billing Workspace** lalu pilih folio.
2. Klik **Bayar di P.O.S** atau **Open P.O.S**.
3. P.O.S akan membuka folio yang sama lewat query `folio_id`.
4. Isi nominal, metode pembayaran, tanggal/jam, referensi jika non-tunai, dan catatan.
5. Setelah submit, sistem membuat nomor bill format `BILL-YYYYMMDD-0001`, menyimpan payment history, dan menghitung ulang balance folio.

### Correction / refund nominal minus
1. Di P.O.S pilih folio.
2. Gunakan form **Adjustment / Refund / Correction**.
3. Pilih tipe transaksi, isi nominal minus seperti `-100000`, dan wajib isi keterangan.
4. Sistem membuat line adjustment baru di folio ledger; transaksi lama tidak dihapus.

### Receipt
Setelah payment berhasil, P.O.S menampilkan receipt sederhana berisi no bill, no folio, tamu, metode, nominal, balance setelah payment, dan tombol print.
