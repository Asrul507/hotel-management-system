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
