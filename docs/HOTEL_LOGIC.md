# Hotel Management Logic

## Room Inventory

Inventory kamar dihitung dari kamar yang `is_active = true` dan `fo_status = available`. Kamar occupied tetap bagian dari inventory fisik; occupancy dihitung dari stays/reservations, bukan dari FO unavailable.

## FO Status

- `available`: kamar masuk inventory penjualan.
- `unavailable`: kamar tidak masuk inventory penjualan.

## HK Status

- `VR`: vacant ready.
- `VC`: vacant clean.
- `VD`: vacant dirty.
- `OR`: occupied ready.
- `OC`: occupied clean.
- `OD`: occupied dirty.
- `OOO`: out of order, otomatis FO unavailable.
- `OOS`: out of service, otomatis FO unavailable.
- `DND`, `SLEEP OUT`, `ONL`: kondisi occupied/physical khusus.

## Room Picker Ready

Reservation/check-in hanya menampilkan kamar yang:

- `is_active = true`
- `fo_status = available`
- `hk_status` `VR` atau `VC`
- bukan `OOO/OOS`
- tidak overlap reservation `reserved/checked_in`
- tidak sedang stay `checked_in`

Jika tidak ada kamar, UI menampilkan pesan: "Tidak ada kamar ready untuk tanggal ini."

## Reservation Overlap

Room-specific double booking ditolak jika:

```text
existing.check_in_date < new.check_out_date
AND existing.check_out_date > new.check_in_date
AND existing.status in ('reserved','checked_in')
```

Stay aktif juga dicek agar kamar in-house tidak muncul di room picker.

## Reservation Nights

Nights adalah input utama:

- `nights = 1` membuat checkout = check-in + 1 hari.
- `nights = 2` membuat checkout = check-in + 2 hari.
- Jika checkout diubah manual, nights dihitung ulang.
- Nights minimal 1.

## Check-in

1. Hanya reservasi `reserved` yang bisa check-in.
2. Jika belum ada room_id, user wajib pilih kamar ready.
3. Check-in membuat/mengupdate stay `checked_in`.
4. Reservation menjadi `checked_in`.
5. Folio dibuat/dihubungkan.
6. Room charge diposting ke folio satu kali.
7. Deposit diposting sebagai payment jika ada.
8. HK room menjadi `OC` dan FO tetap `available`.

## Check-out

1. Hanya stay `checked_in` yang bisa check-out.
2. Stay/reservation menjadi `checked_out`.
3. Folio ditutup; jika balance masih ada status menjadi `debt`.
4. Kamar menjadi `VD`.
5. Invoice legacy tetap dibuat untuk kompatibilitas.

## Housekeeping Bulk Update

Housekeeping mendukung checkbox per room, select all hasil filter, dan bulk update target HK status.

Rules:

- Role housekeeping hanya update HK status.
- Housekeeping tidak boleh update kamar FO unavailable.
- OOO/OOS hanya manager/super admin.
- OOO/OOS otomatis membuat FO unavailable.
- Mengembalikan OOO/OOS ke VC/VD/VR hanya manager/super admin.
- Bulk update memakai konfirmasi dan audit log aman.

## Billing/Folio

Billing utama memakai folio:

- folio item untuk room charge, laundry/resto/minibar/other, cancellation fee, adjustment.
- folio payment untuk cash/non tunai dan refund.
- discount percent mengurangi grand total.
- debt tetap bisa dibayar setelah checkout.

## Forecast

Forecast memakai reservations/stays untuk occupancy dan rooms FO/HK untuk inventory:

- OOO/OOS tidak masuk inventory.
- Maintenance/unavailable tidak muncul sebagai room ready.
- Available negatif diberi warning karena mengindikasikan data bentrok atau oversell.

## Update v0.3.0-folio: Reservation, Room Status, dan Folio

### Nights reservasi

- `nights` tetap menjadi input utama di UI.
- UI menghitung `check_out_date` dari `check_in_date + nights`.
- Jika user mengubah `check_out_date` manual, UI menghitung ulang nilai nights.
- Service reservations tidak mengirim field `nights` ke Supabase karena kolom ini dapat berupa generated column.
- Database menyimpan tanggal check-in/check-out; nights dianggap derived/generated.

### Room picker reservasi

Kamar yang muncul di picker reservasi harus memenuhi semua syarat berikut:

- `rooms.is_active = true`
- `rooms.fo_status = available`
- `rooms.hk_status in ('VR','VC')`
- bukan `OOO`/`OOS`
- bukan occupied (`OR`,`OC`,`OD`)
- tidak overlap dengan reservation lain status `reserved`/`checked_in`
- tidak punya stay aktif status `checked_in`
- jika room type dipilih, `room.room_type_id` harus sama

### FO/HK status

- FO status hanya `available` atau `unavailable`.
- Vacant HK group: `VR`, `VD`, `VC`, `OOO`.
- Occupied HK group: `OR`, `OD`, `OC`, `OOO`.
- `OOS` diperlakukan sebagai out of inventory/maintenance dan tidak muncul di reservasi.
- Housekeeping hanya bisa update HK dalam group yang sama dan tidak bisa set `OOO`/`OOS` secara default.
- Manager/super admin bisa set `OOO`/`OOS` dan mengembalikan kamar ke status vacant.
- Check-in adalah proses yang mengubah vacant ke occupied (`OC`).
- Check-out adalah proses yang mengubah occupied ke vacant dirty (`VD`).

## Update UX dan Billing Status

- Input reservasi utama dipindahkan ke `Folio / Billing` agar setiap reservasi terhubung ke folio/no bill.
- Menu `Reservations` hanya untuk list, filter, detail ringkas, cancel, dan no-show.
- Check-in/out menampilkan billing status dari folio terbaru:
  - `paid` jika balance folio nol atau paid amount sudah menutup grand total.
  - `partial` jika sudah ada pembayaran tetapi masih ada balance.
  - `unpaid` jika belum ada pembayaran.
  - `debt` jika folio ditutup sebagai debt.

## Advanced Operations: Housekeeping Bulk Update

Housekeeping now supports selecting multiple rooms from the filtered result and applying one HK status in a single action.

Rules enforced by UI and service:
- `housekeeping`, `manager`, and `super_admin` may run housekeeping updates.
- `housekeeping` can only move within the same HK group:
  - vacant: `VR`, `VD`, `VC`
  - occupied: `OR`, `OD`, `OC`
- `OOO`/`OOS` can only be set by `manager` or `super_admin` and require notes.
- `OOO`/`OOS` automatically set FO status to `unavailable`.
- Returning from `OOO`/`OOS` to `VR`/`VD`/`VC` is limited to `manager` or `super_admin`.
- Housekeeping users cannot edit rooms whose FO status is `unavailable`.
- Bulk updates use a partial-success approach so one failed room does not hide successful updates.

## Advanced Operations: Room Move Flow

Room move is available from Check-in/out for in-house guests and is limited to `receptionist`, `manager`, and `super_admin`.

Flow:
1. Open Check-in/out and find the in-house guest.
2. Click the room-move action.
3. Select a ready room (`is_active`, FO `available`, HK `VR`/`VC`, not `OOO`/`OOS`, not occupied, and not date-conflicted).
4. Enter a required reason.
5. Confirm the move.

System effects:
- Updates `stays.room_id` to the new room.
- Updates linked `reservations.room_id` when available.
- Marks the old room `VD`.
- Marks the new room `OC`.
- Inserts `room_move_logs` when the table/policy is available.
- Writes an audit-log event when audit logging is available.

## Forecast Arrival/Departure Logic

Forecast keeps the existing room inventory metrics and adds movement metrics:
- Expected Arrival: reservations with `status = reserved` and `check_in_date` on the forecast date.
- Expected Departure: reservations/stays expected to leave on `check_out_date` and not already fully excluded from active logic.
- Arrival: stays with actual `actual_check_in`/`checkin_at` on the forecast date.
- Departure: stays with actual `actual_check_out`/`checkout_at` on the forecast date.

If stay data is empty or unavailable, movement values display as `0` instead of blocking the forecast table.
