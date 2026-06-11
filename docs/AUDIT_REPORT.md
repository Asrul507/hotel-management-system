# Audit Report - Hotel Management System

## Ringkasan Kondisi Aplikasi

Aplikasi sudah memiliki auth, routing, Supabase client yang aman berbasis environment, sidebar role-based, dan menu utama. Audit menemukan struktur sudah layak dilanjutkan, tetapi beberapa logic hotel masih terlalu sederhana: reservasi membuat guest baru terus-menerus, check-in tidak menangani unassigned room, billing belum menghitung tax/service/deposit secara konsisten, dashboard/report/forecast belum sepenuhnya memakai definisi FO/HK inventory.

## Masalah Logika yang Ditemukan

- Reservasi lama masih berpusat pada `room_id` wajib dan belum mendukung reservasi unassigned berdasarkan room type.
- Validasi double booking belum dilakukan sebelum insert/update reservasi.
- `rooms.status` masih berpotensi menjadi sumber logic, padahal FO status dan HK status harus dipisah.
- Check-in belum menyediakan pemilihan kamar untuk reservasi yang belum assigned.
- Check-out belum selalu membuat invoice otomatis.
- Billing belum memakai `hotel_settings.tax_percent` dan `service_charge_percent` secara utuh.
- Housekeeping belum punya filter floor/room type dan quick action operational.
- Forecast dan dashboard belum cukup eksplisit membedakan inventory, occupied, OOO, dan OOS.
- Audit log belum punya helper aman; insert gagal seharusnya tidak menggagalkan transaksi utama.
- Supabase client frontend menjalankan beberapa operasi berurutan tanpa transaksi database atomic.

## Perbaikan yang Dilakukan

- Menambahkan RLS policy audit_logs insert/select agar error 403 saat audit log tidak muncul setelah schema dijalankan.
- Menambahkan sistem folio (`folios`, `folio_items`, `folio_payments`) sebagai billing utama dengan payment cash/non tunai, discount persen, refund, cancellation fee, no-show fee, dan debt closing.
- Mengubah reservation form agar nights menjadi input utama dan room_rate bisa dikosongkan/diedit manual tanpa dioverwrite.
- Memperketat room picker agar hanya kamar ready VR/VC, FO available, aktif, dan tidak overlap reservation/stay yang muncul.
- Menambahkan housekeeping bulk update dengan checkbox, select all, target HK status, notes, konfirmasi, dan audit aman.
- Menambahkan shared business logic di service API untuk FO/HK status, reservasi, double booking, check-in/out, invoice, payment, forecast, report, dan audit log aman.
- Mengoptimalkan Master Setting menjadi tab Hotel Settings, Room Types, dan Rooms dengan filter room number/type/FO/HK.
- Mengubah reservasi agar memilih guest existing, room type aktif, room optional, validasi nights, blacklist warning, filter, edit, cancel, dan no-show.
- Mengoptimalkan check-in agar bisa memilih room eligible untuk reservasi unassigned dan menampilkan in-house + billing status.
- Mengoptimalkan check-out agar membuat invoice otomatis dan mengubah HK room menjadi `VD`.
- Mengoptimalkan Housekeeping dengan filter HK/floor/room type, notes, quick action, dan guard role.
- Mengoptimalkan Billing dengan invoice creation, room charge, tax, service, deposit, paid, balance due, dan validasi payment.
- Mengoptimalkan Forecast dengan warning available negatif dan definisi inventory berbasis FO/HK.
- Mengoptimalkan Dashboard dan Reports agar konsisten dengan forecast/billing.
- Menambahkan active sidebar, status badge tambahan, filter grid, dan quick links.
- Menambahkan indeks dan constraint safe-to-run di `supabase/schema.sql` tanpa drop data.

## Masalah yang Belum Diperbaiki Karena Butuh Keputusan Bisnis

- Overbooking untuk unassigned reservation: saat ini room-specific double booking ditolak, tetapi oversell by room type perlu aturan bisnis tambahan.
- Refund/overpayment: payment melebihi balance saat ini ditolak; perlu definisi refund/overpayment sebelum diaktifkan.
- Penentuan HK `OC` vs `OR` saat check-in: versi awal menggunakan `OC` sebagai default.
- Night audit dan posting room charge harian belum dibuat; invoice saat ini dihitung summary dari stay/reservation.
- Rate plan musiman, corporate rate, package, dan extra charge belum dibuat.
- Authorization backend/RLS granular belum dibuat; frontend sudah guard role, tetapi RLS masih permissive untuk authenticated agar app tidak gagal.

## Rekomendasi Tahap Berikutnya

1. Buat Supabase RPC transactional:
   - `rpc_check_in_reservation(reservation_id, room_id)`
   - `rpc_check_out_stay(stay_id)`
   - `rpc_create_reservation(payload)` dengan advisory lock per room/date.
2. Tambahkan RLS policy granular berdasarkan `profiles.role` untuk billing, guest PII, room status, dan master setting.
3. Tambahkan table rate plan dan room type inventory forecast untuk kontrol oversell by type.
4. Tambahkan posting invoice item non-room charge: minibar, laundry, restaurant, damage, late checkout.
5. Tambahkan audit log viewer untuk manager/super admin.
6. Tambahkan automated tests untuk date overlap, billing totals, and role guard.

## Risiko Teknis

- Operasi multi-step dari frontend tidak atomic; jika step kedua gagal setelah step pertama sukses, data bisa perlu koreksi manual. Service sudah memberi error jelas, tetapi solusi production adalah RPC transaction.
- Data legacy dengan `rooms.status` lama perlu dinormalisasi melalui `supabase/schema.sql` sebelum menjalankan app production.
- RLS audit_logs dan folio sudah dibuat permissive untuk authenticated agar frontend stabil; production sebaiknya memperketat read/manage berdasarkan profiles.role.
- Forecast memakai data dari client query dan dapat menjadi berat jika dataset besar; tahap berikutnya sebaiknya memakai view/materialized view/RPC.

## Checklist Manual Testing

- Login sebagai `super_admin` atau `manager`.
- Tambah room type aktif.
- Tambah room dengan FO `available` dan HK `VC/VR`.
- Ubah FO status menjadi `unavailable` lalu balik ke `available`.
- Ubah HK status menjadi `OOO/OOS` dan pastikan FO otomatis `unavailable`.
- Ubah OOO/OOS kembali ke `VD/VC/VR` sebagai manager/super admin dan pastikan FO dapat kembali `available`.
- Tambah tamu aktif, termasuk variasi NIK kosong dan NIK unik.
- Tandai tamu blacklist dan pastikan warning muncul saat dipilih di reservasi/check-in.
- Buat reservasi assigned room.
- Coba double booking room yang sama pada tanggal overlap dan pastikan ditolak.
- Buat reservasi unassigned berdasarkan room type.
- Check-in reservasi unassigned dengan memilih kamar eligible.
- Pastikan reservasi menjadi `checked_in`, stay dibuat, dan HK kamar menjadi `OC`.
- Check-out stay dan pastikan stay/reservation menjadi `checked_out`, kamar menjadi `VD`, invoice dibuat.
- Tambah payment dan cek status invoice `unpaid/partial/paid`.
- Buka Forecast dan cek inventory, occupied, arrival, departure, available, OOO/OOS.
- Buka Dashboard dan pastikan angka konsisten dengan Forecast.
- Login sebagai `housekeeping`, pastikan hanya bisa update HK status kamar FO available dan tidak bisa set OOO/OOS.
- Login sebagai `cashier`, pastikan dapat membuka Billing/Reports dan tidak dapat membuka Master Setting.
- Test nights input 1/2 malam dan pastikan checkout otomatis sinkron.
- Test room_rate dikosongkan, diisi 0, dan diganti manual tanpa dioverwrite.
- Test folio: tambah charge, discount persen, payment cash, payment non tunai dengan reference, refund, close sebagai debt.
- Test housekeeping bulk update VD ke VC.
- Jalankan `npm run build` dan pastikan berhasil.

## Follow-up Audit v0.3.0-folio

- Penyebab error reservasi `cannot insert a non-DEFAULT value into column nights`: service reservation sebelumnya mengirim `nights` pada insert/update, sementara beberapa schema Supabase memakai `reservations.nights` sebagai generated column. Payload sekarang disanitasi agar `nights` tidak pernah dikirim ke DB.
- Penyebab kamar ready tidak muncul: filter room picker belum terpusat pada definisi ready operasional hotel. Sekarang room picker memakai helper status kamar dan hanya menampilkan kamar active, FO available, HK `VR`/`VC`, tanpa overlap reservation/stay.
- Logika FO/HK dipusatkan di `src/utils/roomStatus.js` agar Housekeeping, Master Settings, API room update, reservation picker, dan check-in/check-out memakai aturan yang sama.
- Billing/Folio diperjelas menjadi Folio Workspace dengan tab Summary, Reservations, Charges, Payments, dan Refund/Debt.
- SQL idempotent ditambahkan untuk `reservations.folio_id`, index folio/reservation/room lookup, RLS folio/audit, dan item type additional charge.

## Follow-up Audit Add Charge / Folio Items

- Penyebab paling mungkin Add Charge gagal adalah mismatch `item_type` UI dan database constraint lama. UI sebelumnya mengirim tipe tambahan seperti `extra_bed`, sementara constraint DB lama hanya menerima sebagian tipe folio item jika migration terbaru belum dijalankan.
- Add Charge sekarang memakai payload sanitizer/validator khusus folio item dan tidak pernah mengirim `line_total`, karena `line_total` adalah generated column.
- Error Supabase sekarang dicatat ke console untuk developer dan pesan UI dibedakan untuk constraint `23514`, RLS `42501`, not-null `23502`, serta generated column.
- Edit dan Hapus transaksi folio item sekarang hanya tersedia untuk `super_admin`; hapus memakai soft void agar audit hotel tetap aman.
