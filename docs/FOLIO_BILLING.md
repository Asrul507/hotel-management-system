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
- Early Check In (`early_check_in`)
- Late Check Out (`late_check_out`)
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
