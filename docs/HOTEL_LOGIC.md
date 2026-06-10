# Hotel Management Logic

Dokumen ini mendefinisikan alur operasional utama yang dipakai aplikasi.

## FO Status

FO status adalah status inventory Front Office:

- `available`: kamar aktif dan masuk inventory yang bisa dijual.
- `unavailable`: kamar aktif/inaktif tidak masuk inventory penjualan.

Inventory kamar dihitung dari `rooms.is_active = true` dan `rooms.fo_status = 'available'`. Occupied tidak mengubah FO status; kamar occupied tetap bagian dari inventory fisik yang dijual/terpakai.

## HK Status

HK status adalah kondisi fisik/housekeeping kamar:

- `VR`: vacant ready / siap jual setelah inspeksi.
- `VC`: vacant clean / bersih, belum tentu inspected.
- `VD`: vacant dirty / kotor setelah check-out.
- `OR`: occupied ready.
- `OC`: occupied clean.
- `OD`: occupied dirty.
- `OOO`: out of order, tidak masuk inventory.
- `OOS`: out of service, tidak masuk inventory.
- `DND`: do not disturb.
- `SLEEP OUT`: tamu sleep out.
- `ONL`: occupied no luggage.

Jika HK status diset menjadi `OOO` atau `OOS`, aplikasi otomatis mengubah FO status menjadi `unavailable`. Untuk mengembalikan kamar OOO/OOS ke inventory, manager/super admin memilih HK status normal seperti `VD`, `VC`, atau `VR` dan FO status `available`.

## Alur Reservation

1. User memilih tamu dari guest database.
2. User memilih room type aktif.
3. User boleh memilih room number atau membiarkan reservasi unassigned.
4. Check-out date harus setelah check-in date.
5. Jika room number dipilih, aplikasi menolak double booking dengan overlap:
   - `existing.check_in_date < new.check_out_date`
   - `existing.check_out_date > new.check_in_date`
   - status existing `reserved` atau `checked_in`.
6. Kamar inactive, FO `unavailable`, HK `OOO`, atau HK `OOS` tidak boleh dipilih.
7. Status reservasi yang digunakan: `reserved`, `checked_in`, `checked_out`, `cancelled`, `no_show`.

## Alur Check-in

1. Check-in hanya dari reservasi `reserved`.
2. Jika reservasi belum punya kamar, receptionist wajib memilih kamar eligible.
3. Kamar eligible harus aktif, FO `available`, bukan `OOO/OOS`, dan tidak overlap booking.
4. Check-in membuat atau mengupdate `stays` menjadi `checked_in`.
5. Reservasi menjadi `checked_in`.
6. HK status kamar menjadi `OC`.
7. FO status tetap `available` agar inventory tetap merepresentasikan total kamar yang bisa dijual secara fisik.

> TODO: implementasi ideal di Supabase RPC agar update reservation, stay, dan room status atomic dalam satu transaksi database.

## Alur Check-out

1. Check-out hanya untuk stay `checked_in`.
2. Stay menjadi `checked_out` dengan `checkout_at/actual_check_out`.
3. Reservasi terkait menjadi `checked_out`.
4. HK status kamar menjadi `VD`.
5. FO status tetap `available` kecuali kamar kemudian dijadikan OOO/OOS.
6. Invoice otomatis dibuat jika belum ada.

> TODO: implementasi ideal di Supabase RPC agar update stay, reservation, room, dan invoice atomic.

## Alur Housekeeping

1. Housekeeping melihat daftar kamar dengan FO/HK status.
2. Role `housekeeping` hanya boleh mengubah HK status kamar dengan FO `available`.
3. Role `housekeeping` tidak boleh mengubah FO status dan tidak boleh set `OOO/OOS`.
4. Role `manager` dan `super_admin` boleh override FO/HK status.
5. Quick action standar:
   - `VD -> VC`
   - `OD -> OC`
   - `VC -> VR`
6. Status `OOO/OOS` wajib memakai catatan.

## Alur Billing

1. Invoice berasal dari stay/reservation.
2. Room charge = `nights * room_rate`.
3. Tax dan service charge mengikuti `hotel_settings`.
4. Total = subtotal + tax + service - deposit applied.
5. Balance due = total - sum(payment).
6. Status invoice:
   - `unpaid`: belum ada payment.
   - `partial`: payment ada tetapi belum lunas.
   - `paid`: payment >= total.
   - `refunded`: disiapkan untuk logic refund berikutnya.
7. Payment method: `cash`, `transfer`, `qris`, `debit`, `credit`.
8. Overpayment saat ini ditolak agar balance tidak ambigu.

## Cara Forecast Dihitung

Per tanggal:

- `total_rooms`: semua kamar `is_active = true`.
- `inventory_rooms`: kamar `is_active = true` dan FO `available`.
- `ooo_rooms`: kamar aktif dengan HK `OOO`.
- `oos_rooms`: kamar aktif dengan HK `OOS`.
- `occupied_rooms`: gabungan stay `checked_in` actual dan reservation `reserved/checked_in` yang overlap tanggal.
- `expected_arrival`: reservasi check-in pada tanggal tersebut dengan status `reserved`.
- `expected_departure`: reservasi check-out pada tanggal tersebut dengan status `reserved/checked_in`.
- `available_rooms`: `inventory_rooms - occupied_rooms`.
- `occupancy_percentage`: `occupied_rooms / inventory_rooms * 100`, atau 0 jika inventory 0.

Jika available negatif, forecast memberi warning karena kemungkinan ada double booking, oversell, atau data legacy yang belum dibersihkan.

## Catatan Inventory

- Jangan memakai `rooms.status` untuk logic baru; kolom tersebut hanya compatibility legacy.
- `fo_status` adalah sumber inventory.
- `hk_status` adalah sumber kondisi fisik/housekeeping.
- Occupied dihitung dari stays/reservations, bukan dari FO unavailable.
