# Folio Billing

## Konsep Folio

Folio adalah rekening operasional tamu. Satu folio dapat menampung satu atau lebih reservasi/stay/kamar, room charge, charge tambahan, discount, tax/service, payment, refund, cancellation fee, dan debt.

## Folio vs Invoice Legacy

- `folios`, `folio_items`, dan `folio_payments` menjadi billing utama baru.
- Tabel `invoices`, `invoice_items`, dan `payments` tetap dipertahankan untuk backward compatibility dan tidak dihapus.
- Check-out masih menjaga invoice legacy agar data lama tetap dapat dibaca, tetapi Dashboard/Reports/Billing utama memakai folio.

## Room Charge

Saat check-in, aplikasi membuat/menghubungkan folio ke reservation/stay. Jika belum ada room charge untuk reservation/stay tersebut, aplikasi membuat `folio_items`:

- `item_type = room`
- `description = Room charge room_number x nights`
- `qty = nights`
- `unit_price = room_rate`

Aplikasi mengecek item yang sudah ada agar tidak membuat double room charge saat check-in/check-out diulang.

## Additional Charge

Billing page dapat menambahkan charge tambahan dengan `item_type`:

- `restaurant`
- `laundry`
- `minibar`
- `other`
- `adjustment`
- `cancellation_fee`

Laundry/resto di tahap berikutnya cukup posting ke folio yang sama melalui service `addFolioItem`.

## Payment

Payment disimpan di `folio_payments` dan memengaruhi `paid_amount` serta `balance_due`.

Payment group:

- `cash`: otomatis memakai `payment_method = cash`.
- `non_tunai`: memakai `qris`, `transfer`, `debit_card`, `credit_card`, `e_wallet`, atau `other`.

Untuk non tunai, `reference_number` wajib. `card_or_account_number` tersedia sebagai field optional.

## Discount

Discount memakai `discount_percent` pada folio:

- Minimal 0, maksimal 100.
- `discount_amount = subtotal * discount_percent / 100` plus item manual discount jika ada.
- Discount mengurangi taxable base, grand total, dan balance.
- Folio closed/cancelled/refunded hanya boleh diubah discount-nya oleh manager/super admin.

## Refund

Refund tidak menghapus payment asli. Refund dicatat sebagai `folio_payments.payment_type = refund`.

Aturan:

- Refund harus > 0.
- Refund tidak boleh melebihi paid amount yang belum direfund.
- Refund wajib memiliki alasan pada notes.
- Full refund dapat membuat status folio `refunded`.

## Debt

Saat folio ditutup:

- Jika `balance_due = 0`, status menjadi `closed`.
- Jika `balance_due > 0`, status menjadi `debt`.
- Folio debt tetap tampil di Billing dan bisa dibayar setelah checkout.
- Jika debt lunas, recalculation mengubah status menjadi `closed`.

## Cancellation Fee dan No-show

Cancellation sebelum check-in dapat membuat folio:

- Deposit reservation dicatat sebagai payment jika ada.
- Cancellation fee ditambahkan sebagai `folio_items.item_type = cancellation_fee`.
- Refund deposit dicatat sebagai refund payment jika diminta.

No-show dapat menambahkan no-show fee ke folio sebagai `cancellation_fee` agar tetap muncul di revenue/cancellation report.

## Alur Check-in / Check-out

Check-in:

1. Validasi reservasi `reserved` dan kamar ready.
2. Buat/update stay `checked_in`.
3. Buat atau hubungkan folio.
4. Tambah room charge sekali saja.
5. Catat deposit sebagai payment jika ada.
6. Ubah HK kamar menjadi `OC`.

Check-out:

1. Validasi stay `checked_in`.
2. Ubah stay/reservation menjadi `checked_out`.
3. Pastikan folio ada dan close folio.
4. Jika balance masih ada, status folio menjadi `debt`.
5. Ubah HK kamar menjadi `VD`.
