import { requireSupabase } from '../config/supabase';
import { getFriendlySupabaseError, handleSupabaseError, isRateLimitError, safeSupabaseQuery } from '../utils/supabaseError';
import { normalizePOSStatus } from '../utils/posStatus';
import { buildRoomChartCells, buildRoomChartDateRange, mergeRoomChartCells } from '../utils/roomChart';
import {
  FO_STATUSES,
  HK_STATUSES,
  OUT_OF_INVENTORY_HK_STATUSES,
  canTransitionHkStatus,
  deriveFoStatusFromHkStatus,
  isOccupiedStatus,
  isOutOfInventoryStatus,
  isReadyForReservation
} from '../utils/roomStatus';

export { FO_STATUSES, HK_STATUSES, getFriendlySupabaseError, handleSupabaseError, isRateLimitError, safeSupabaseQuery, normalizePOSStatus };
export const ROOM_STATUSES = ['available', 'unavailable', ...HK_STATUSES];
export const RESERVATION_STATUSES = ['reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show'];
export const INVOICE_STATUSES = ['unpaid', 'partial', 'paid', 'refunded'];
export const PAYMENT_GROUPS = ['cash', 'non_tunai'];
export const NON_CASH_METHODS = ['qris', 'transfer', 'debit_card', 'credit_card', 'e_wallet', 'other'];
export const PAYMENT_METHODS = ['cash', ...NON_CASH_METHODS];
export const FOLIO_STATUSES = ['open', 'partial', 'closed', 'debt', 'cancelled', 'refunded', 'partial_refund'];
export const FOLIO_ITEM_TYPES = ['room', 'extra_bed', 'breakfast', 'early_checkin', 'late_checkout', 'restaurant', 'laundry', 'minibar', 'damage', 'other', 'discount', 'cancellation_fee', 'no_show_fee', 'refund', 'adjustment', 'correction', 'discount_adjustment', 'other_adjustment'];
export const ADDITIONAL_CHARGE_TYPES = [
  ['extra_bed', 'Extra Bed'],
  ['breakfast', 'Breakfast'],
  ['early_checkin', 'Early Check In'],
  ['late_checkout', 'Late Check Out'],
  ['laundry', 'Laundry'],
  ['restaurant', 'Restaurant'],
  ['minibar', 'Minibar'],
  ['damage', 'Damage'],
  ['other', 'Other']
];

export function formatLocalDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
export const today = () => formatLocalDate(new Date());
const reservationCode = () => `RSV-${Date.now()}`;
const invoiceNumber = (prefix = 'INV') => `${prefix || 'INV'}-${Date.now()}`;
const folioNumber = () => `FOL-${Date.now()}`;
const billDatePart = (value = new Date()) => formatLocalDate(value).replaceAll('-', '');
const moneyValue = (value) => Number(value || 0);
let cachedAuthUser = null;
let cachedAuthUserAt = 0;
async function getCachedAuthUser() {
  const now = Date.now();
  if (cachedAuthUser && now - cachedAuthUserAt < 30000) return cachedAuthUser;
  try {
    const { data, error } = await requireSupabase().auth.getSession();
    if (error) {
      handleSupabaseError(error, 'AUTH_AUDIT_SESSION');
      return cachedAuthUser;
    }
    cachedAuthUser = data?.session?.user || null;
    cachedAuthUserAt = now;
    return cachedAuthUser;
  } catch (error) {
    handleSupabaseError(error, 'AUTH_AUDIT_SESSION');
    return cachedAuthUser;
  }
}
export const isOutOfInventoryHk = isOutOfInventoryStatus;
export const isOccupiedHk = isOccupiedStatus;

function raise(error) {
  if (error) {
    handleSupabaseError(error, 'API');
    throw new Error(getFriendlySupabaseError(error));
  }
}

function parsePgError(error, fallback) {
  if (!error) return fallback;
  const detail = [error.message, error.details, error.hint].filter(Boolean).join(' ');
  const lowerDetail = detail.toLowerCase();
  if (isRateLimitError(error)) return getFriendlySupabaseError(error);
  if (error.code === '23505') return 'Data sudah ada. Periksa nomor kamar, kode, NIK, folio, atau nomor reservasi yang harus unique.';
  if (error.code === '23514') return `${fallback} Data belum sesuai. Periksa status, tanggal, qty, dan nominal.`;
  if (error.code === '23502') return `${fallback} Field wajib belum lengkap. Detail: ${detail || 'not-null violation.'}`;
  if (error.code === '42501') return `${fallback} Akses ditolak. Pastikan role user memiliki izin untuk aksi ini.`;
  if (lowerDetail.includes('generated') || lowerDetail.includes('line_total')) return `${fallback} Data transaksi tidak valid. Silakan muat ulang halaman lalu coba lagi.`;
  return detail || fallback;
}

export function nightsBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = Math.ceil((end - start) / 86400000);
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

export function addDaysToDate(date, days) {
  if (!date) return '';
  const value = new Date(`${date}T00:00:00`);
  if (!Number.isFinite(value.getTime())) return '';
  value.setDate(value.getDate() + Number(days || 0));
  return formatLocalDate(value);
}

function eachDate(startDate, endDate) {
  const dates = [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return dates;
  for (const current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    dates.push(formatLocalDate(current));
  }
  return dates;
}

function roomRate(roomType) {
  return moneyValue(roomType?.base_rate ?? roomType?.base_price);
}

function getRoomFoStatus(room) {
  if (room?.fo_status) return room.fo_status;
  if (['maintenance', 'out_of_order', 'unavailable'].includes(room?.status)) return 'unavailable';
  return 'available';
}

function getRoomHkStatus(room) {
  if (room?.hk_status) return room.hk_status;
  if (room?.status === 'occupied') return 'OC';
  if (room?.status === 'dirty') return 'VD';
  if (room?.status === 'maintenance') return 'OOS';
  if (room?.status === 'out_of_order') return 'OOO';
  return 'VC';
}

export function normalizeRoom(room) {
  if (!room) return room;
  return {
    ...room,
    fo_status: getRoomFoStatus(room),
    hk_status: getRoomHkStatus(room),
    status: room.status || getRoomFoStatus(room),
    room_types: room.room_types ? {
      ...room.room_types,
      base_price: room.room_types.base_price ?? room.room_types.base_rate ?? 0,
      base_rate: room.room_types.base_rate ?? room.room_types.base_price ?? 0
    } : room.room_types
  };
}

function normalizeReservation(reservation) {
  if (!reservation) return reservation;
  return {
    ...reservation,
    reservation_code: reservation.reservation_code || reservation.reservation_number,
    reservation_number: reservation.reservation_number || reservation.reservation_code,
    checkin_date: reservation.checkin_date || reservation.check_in_date,
    checkout_date: reservation.checkout_date || reservation.check_out_date,
    check_in_date: reservation.check_in_date || reservation.checkin_date,
    check_out_date: reservation.check_out_date || reservation.checkout_date,
    status: reservation.status === 'booked' || reservation.status === 'confirmed' ? 'reserved' : reservation.status,
    rooms: normalizeRoom(reservation.rooms)
  };
}

function normalizeStay(stay) {
  if (!stay) return stay;
  return {
    ...stay,
    checkin_at: stay.checkin_at || stay.actual_check_in,
    checkout_at: stay.checkout_at || stay.actual_check_out,
    actual_check_in: stay.actual_check_in || stay.checkin_at,
    actual_check_out: stay.actual_check_out || stay.checkout_at,
    rooms: normalizeRoom(stay.rooms),
    reservations: normalizeReservation(stay.reservations),
    folios: normalizeFolio(stay.folios || stay.reservations?.folios)
  };
}

function normalizeRoomPayload(payload) {
  const hkStatus = payload.hk_status || 'VC';
  if (!HK_STATUSES.includes(hkStatus)) throw new Error('Status HK tidak valid.');
  const foStatus = deriveFoStatusFromHkStatus(hkStatus, payload.fo_status || 'available');
  if (!FO_STATUSES.includes(foStatus)) throw new Error('Status FO tidak valid.');

  return {
    room_number: payload.room_number?.trim(),
    room_type_id: payload.room_type_id,
    floor: payload.floor || null,
    fo_status: foStatus,
    hk_status: hkStatus,
    status: foStatus,
    is_active: payload.is_active ?? true,
    notes: payload.notes || null,
    updated_at: new Date().toISOString()
  };
}

function normalizeRoomTypePayload(payload) {
  const rate = moneyValue(payload.base_rate ?? payload.base_price);
  if (rate < 0) throw new Error('Base rate tidak boleh negatif.');
  return {
    code: payload.code?.trim().toUpperCase(),
    name: payload.name?.trim(),
    description: payload.description || null,
    base_rate: rate,
    base_price: rate,
    max_occupancy: Number(payload.max_occupancy || 2),
    facilities: Array.isArray(payload.facilities) ? payload.facilities : String(payload.facilities || '').split(',').map((item) => item.trim()).filter(Boolean),
    is_active: payload.is_active ?? true,
    updated_at: new Date().toISOString()
  };
}

function normalizeGuestPayload(payload) {
  return {
    full_name: payload.full_name?.trim(),
    nik: payload.nik?.trim() || null,
    phone: payload.phone?.trim() || null,
    email: payload.email?.trim() || null,
    address: payload.address || null,
    city: payload.city || null,
    birth_date: payload.birth_date || null,
    gender: payload.gender || null,
    notes: payload.notes || null,
    is_blacklisted: payload.is_blacklisted ?? false,
    is_active: payload.is_active ?? true,
    updated_at: new Date().toISOString()
  };
}

const roomSelect = '*, room_types(*)';
const reservationSelect = '*, guests(*), rooms(*, room_types(*)), room_types(*)';
const invoiceSelect = '*, invoice_items(*), payments(*)';
const folioSelect = '*, guests(*), reservations(*, rooms(*, room_types(*)), room_types(*)), folio_items(*, rooms(*, room_types(*))), folio_payments(*)';
const staySelect = '*, guests(*), rooms(*, room_types(*)), reservations(*, guests(*), rooms(*, room_types(*)), room_types(*)), invoices(*, invoice_items(*), payments(*))';

export async function logAuditEvent(action, entityType, entityId, changes = {}) {
  try {
    const user = await getCachedAuthUser();
    const { error } = await requireSupabase().from('audit_logs').insert({
      action,
      table_name: entityType,
      record_id: entityId || null,
      actor_id: user?.id || null,
      payload: changes
    });
    if (error) console.warn('Audit log gagal disimpan:', error.message);
  } catch (error) {
    console.warn('Audit log dilewati:', error.message);
  }
}

export const hotelSettingsApi = {
  async get() {
    const { data, error } = await requireSupabase().from('hotel_settings').select('*').order('created_at').limit(1).maybeSingle();
    raise(error);
    return data || {
      hotel_name: 'Hotel', address: '', phone: '', tax_percent: 0, tax_mode: 'exclusive', service_charge_percent: 0,
      invoice_prefix: 'INV', default_checkin_time: '14:00', default_checkout_time: '12:00'
    };
  },
  async save(payload) {
    if (!payload.hotel_name?.trim()) throw new Error('Nama hotel wajib diisi.');
    const current = await this.get();
    const body = {
      hotel_name: payload.hotel_name.trim(),
      address: payload.address || null,
      phone: payload.phone || null,
      tax_percent: moneyValue(payload.tax_percent),
      tax_mode: payload.tax_mode === 'inclusive' ? 'inclusive' : 'exclusive',
      service_charge_percent: moneyValue(payload.service_charge_percent),
      invoice_prefix: payload.invoice_prefix?.trim() || 'INV',
      default_checkin_time: payload.default_checkin_time || '14:00',
      default_checkout_time: payload.default_checkout_time || '12:00',
      updated_at: new Date().toISOString()
    };
    const query = current?.id
      ? requireSupabase().from('hotel_settings').update(body).eq('id', current.id)
      : requireSupabase().from('hotel_settings').insert(body);
    const { data, error } = await query.select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal menyimpan hotel settings.'));
    await logAuditEvent('update_hotel_settings', 'hotel_settings', data.id, body);
    return data;
  }
};

export const roomTypesApi = {
  async list({ includeInactive = true } = {}) {
    let query = requireSupabase().from('room_types').select('*').order('name');
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    raise(error);
    return data || [];
  },
  async create(payload) {
    if (!payload.code?.trim()) throw new Error('Kode tipe kamar wajib diisi.');
    if (!payload.name?.trim()) throw new Error('Nama tipe kamar wajib diisi.');
    const { data, error } = await requireSupabase().from('room_types').insert(normalizeRoomTypePayload(payload)).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal membuat tipe kamar.'));
    await logAuditEvent('create_room_type', 'room_types', data.id, payload);
    return data;
  },
  async update(id, payload) {
    const { data, error } = await requireSupabase().from('room_types').update(normalizeRoomTypePayload(payload)).eq('id', id).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal memperbarui tipe kamar.'));
    await logAuditEvent('update_room_type', 'room_types', id, payload);
    return data;
  }
};

export const roomsApi = {
  async list({ includeInactive = true, availableOnly = false, roomTypeId = '' } = {}) {
    let query = requireSupabase().from('rooms').select(roomSelect).order('room_number');
    if (!includeInactive || availableOnly) query = query.eq('is_active', true);
    if (availableOnly) query = query.eq('fo_status', 'available').eq('hk_status', 'VR');
    if (roomTypeId) query = query.eq('room_type_id', roomTypeId);
    const { data, error } = await query;
    raise(error);
    return (data || []).map(normalizeRoom);
  },
  async availableForStay({ check_in_date, check_out_date, room_type_id = '', exclude_reservation_id = '' }) {
    const rooms = (await this.list({ availableOnly: true, roomTypeId: room_type_id }))
      .filter(isReadyForReservation);
    if (!check_in_date || !check_out_date || check_out_date <= check_in_date) return rooms;
    const [activeReservations, activeStays] = await Promise.all([
      reservationsApi.list().catch(() => []),
      staysApi.active().catch(() => [])
    ]);
    return rooms.filter((room) => {
      const reservationConflict = activeReservations.some((reservation) => {
        if (!reservation.room_id || reservation.room_id !== room.id) return false;
        if (exclude_reservation_id && reservation.id === exclude_reservation_id) return false;
        if (!['reserved', 'checked_in'].includes(reservation.status)) return false;
        return datesOverlap(reservation.check_in_date, reservation.check_out_date, check_in_date, check_out_date);
      });
      const stayConflict = activeStays.some((stay) => stay.room_id === room.id && stay.status === 'checked_in');
      return !reservationConflict && !stayConflict;
    });
  },
  async create(payload) {
    if (!payload.room_number?.trim()) throw new Error('Nomor kamar wajib diisi.');
    if (!payload.room_type_id) throw new Error('Tipe kamar wajib dipilih.');
    const { data: type } = await requireSupabase().from('room_types').select('id,is_active').eq('id', payload.room_type_id).maybeSingle();
    if (!type || type.is_active === false) throw new Error('Room type inactive tidak boleh dipakai untuk kamar baru.');
    const { data, error } = await requireSupabase().from('rooms').insert(normalizeRoomPayload(payload)).select(roomSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal membuat kamar.'));
    await logAuditEvent('create_room', 'rooms', data.id, payload);
    return normalizeRoom(data);
  },
  async update(id, payload) {
    if (!payload.room_type_id) throw new Error('Tipe kamar wajib dipilih.');
    const { data, error } = await requireSupabase().from('rooms').update(normalizeRoomPayload(payload)).eq('id', id).select(roomSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal memperbarui kamar.'));
    await logAuditEvent('update_room', 'rooms', id, payload);
    return normalizeRoom(data);
  },
  async updateFoStatus(id, fo_status, role = '') {
    if (!['super_admin', 'admin', 'manager'].includes(role)) throw new Error('Hanya admin/manager/super admin yang boleh mengubah FO status.');
    if (!FO_STATUSES.includes(fo_status)) throw new Error('Status FO tidak valid.');
    const { data, error } = await requireSupabase().from('rooms').update({ fo_status, status: fo_status, updated_at: new Date().toISOString() }).eq('id', id).select(roomSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal memperbarui status FO.'));
    await logAuditEvent('update_room_fo_status', 'rooms', id, { fo_status });
    return normalizeRoom(data);
  },
  async updateHkStatus(room, hk_status, { role, notes = '', fo_status, allowGroupChange = false, hasCheckedInStay = false } = {}) {
    if (!HK_STATUSES.includes(hk_status)) throw new Error('Status HK tidak valid.');
    const normalized = normalizeRoom(room);
    const privileged = ['super_admin', 'admin', 'manager'].includes(role);
    if (['cashier', 'receptionist', 'frontdesk'].includes(role)) throw new Error('Role ini tidak boleh mengubah status kamar manual.');
    if (role === 'housekeeping' && normalized.fo_status === 'unavailable') throw new Error('Kamar FO unavailable tidak boleh diubah oleh housekeeping.');
    if (!canTransitionHkStatus(normalized, hk_status, role, { allowGroupChange, hasCheckedInStay })) {
      throw new Error('Transisi HK status tidak valid. Perubahan vacant ↔ occupied harus lewat check-in/check-out.');
    }
    if (OUT_OF_INVENTORY_HK_STATUSES.includes(hk_status) && !privileged) throw new Error('OOO/OOS hanya boleh diset admin, manager, atau super admin.');
    if (OUT_OF_INVENTORY_HK_STATUSES.includes(hk_status) && !notes?.trim()) throw new Error('Catatan wajib diisi untuk status OOO/OOS.');
    if (isOccupiedStatus(hk_status) && isOutOfInventoryStatus(normalized.hk_status) && !hasCheckedInStay && !allowGroupChange) {
      throw new Error('Kembali dari OOO/OOS ke status occupied hanya boleh jika ada stay checked-in.');
    }
    const derivedFo = deriveFoStatusFromHkStatus(hk_status, normalized.fo_status);
    const nextFo = privileged && fo_status && !isOutOfInventoryStatus(hk_status) ? fo_status : derivedFo;
    const body = { hk_status, fo_status: nextFo, status: nextFo, updated_at: new Date().toISOString() };
    if (notes) body.notes = notes;
    const { data, error } = await requireSupabase().from('rooms').update(body).eq('id', normalized.id).select(roomSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal memperbarui status HK.'));
    await logAuditEvent('update_room_hk_status', 'rooms', normalized.id, body);
    return normalizeRoom(data);
  },
  async bulkUpdateHkStatus(roomIds, targetStatus, notes = '', role = '') {
    if (!Array.isArray(roomIds) || roomIds.length === 0) throw new Error('Pilih minimal satu kamar untuk bulk update.');
    if (!HK_STATUSES.includes(targetStatus)) throw new Error('Target HK status tidak valid.');
    const privileged = ['super_admin', 'admin', 'manager'].includes(role);
    if (['cashier', 'receptionist', 'frontdesk'].includes(role)) throw new Error('Role ini tidak boleh bulk update housekeeping.');
    if (OUT_OF_INVENTORY_HK_STATUSES.includes(targetStatus) && !privileged) throw new Error('OOO/OOS hanya boleh diset admin, manager, atau super admin.');
    if (OUT_OF_INVENTORY_HK_STATUSES.includes(targetStatus) && !notes?.trim()) throw new Error('Catatan wajib untuk bulk update OOO/OOS.');

    const rooms = await this.list();
    const targetRooms = roomIds.map((id) => rooms.find((room) => room.id === id)).filter(Boolean);
    if (targetRooms.length !== roomIds.length) throw new Error('Sebagian kamar tidak ditemukan. Refresh halaman lalu coba lagi.');

    const settled = await Promise.allSettled(targetRooms.map(async (room) => {
      if (role === 'housekeeping' && room.fo_status === 'unavailable') throw new Error(`Kamar ${room.room_number}: FO unavailable tidak boleh diubah housekeeping.`);
      return this.updateHkStatus(room, targetStatus, { role, notes });
    }));
    const succeeded = [];
    const failed = [];
    settled.forEach((result, index) => {
      const room = targetRooms[index];
      if (result.status === 'fulfilled') succeeded.push(result.value);
      else failed.push({ room_id: room.id, room_number: room.room_number, error: result.reason?.message || 'Gagal update.' });
    });
    await logAuditEvent('bulk_update_housekeeping', 'rooms', null, { room_ids: roomIds, target_hk_status: targetStatus, notes, success: succeeded.length, failed }).catch(() => {});
    return { succeeded, failed, total: targetRooms.length };
  },
  async updateStatus(id, status, role = 'manager') {
    if (FO_STATUSES.includes(status)) return this.updateFoStatus(id, status, role);
    if (['maintenance', 'out_of_order'].includes(status)) {
      return this.updateHkStatus({ id, fo_status: 'available' }, status === 'out_of_order' ? 'OOO' : 'OOS', { role, notes: 'Maintenance update' });
    }
    return this.updateFoStatus(id, status === 'available' ? 'available' : 'unavailable', role);
  }
};

export const guestsApi = {
  async list({ search = '', status = 'active' } = {}) {
    let query = requireSupabase().from('guests').select('*').order('full_name');
    if (status === 'active') query = query.eq('is_active', true);
    if (status === 'archived') query = query.eq('is_active', false);
    if (search.trim()) {
      const value = search.trim().replaceAll('%', '');
      query = query.or(`full_name.ilike.%${value}%,nik.ilike.%${value}%,phone.ilike.%${value}%`);
    }
    const { data, error } = await query;
    raise(error);
    return data || [];
  },
  async create(payload) {
    if (!payload.full_name?.trim()) throw new Error('Nama lengkap tamu wajib diisi.');
    const { data, error } = await requireSupabase().from('guests').insert(normalizeGuestPayload(payload)).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal membuat data tamu.'));
    await logAuditEvent('create_guest', 'guests', data.id, payload);
    return data;
  },
  async update(id, payload) {
    if (!payload.full_name?.trim()) throw new Error('Nama lengkap tamu wajib diisi.');
    const { data, error } = await requireSupabase().from('guests').update(normalizeGuestPayload(payload)).eq('id', id).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal memperbarui data tamu.'));
    await logAuditEvent('update_guest', 'guests', id, payload);
    return data;
  },
  async archive(id) {
    const { data, error } = await requireSupabase().from('guests').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal mengarsipkan tamu.'));
    await logAuditEvent('archive_guest', 'guests', id, {});
    return data;
  }
};

function datesOverlap(existingStart, existingEnd, newStart, newEnd) {
  return existingStart < newEnd && existingEnd > newStart;
}

async function validateReservation(payload, id = '') {
  if (!payload.guest_id) throw new Error('Tamu wajib dipilih.');
  if (!payload.room_type_id) throw new Error('Room type wajib dipilih.');
  if (!payload.check_in_date || !payload.check_out_date) throw new Error('Tanggal check-in/check-out wajib diisi.');
  if (payload.check_out_date <= payload.check_in_date) throw new Error('Tanggal check-out harus setelah check-in.');
  if (moneyValue(payload.room_rate) < 0) throw new Error('Room rate tidak boleh negatif.');
  if (moneyValue(payload.deposit_amount) < 0) throw new Error('Deposit tidak boleh negatif.');

  if (payload.room_id) {
    const { data: room, error: roomError } = await requireSupabase().from('rooms').select(roomSelect).eq('id', payload.room_id).single();
    raise(roomError);
    const normalized = normalizeRoom(room);
    if (!isReadyForReservation(normalized)) {
      throw new Error('Kamar tidak ready untuk reservasi. Pastikan active, FO available, HK VR, dan tidak OOO/OOS/occupied.');
    }
    if (payload.room_type_id && normalized.room_type_id !== payload.room_type_id) throw new Error('Kamar tidak sesuai dengan room type yang dipilih.');

    const { data, error } = await requireSupabase().from('reservations').select('id,reservation_code,reservation_number,check_in_date,check_out_date,status').eq('room_id', payload.room_id).in('status', ['reserved', 'checked_in']);
    raise(error);
    const conflict = (data || []).find((reservation) => reservation.id !== id && datesOverlap(reservation.check_in_date, reservation.check_out_date, payload.check_in_date, payload.check_out_date));
    if (conflict) throw new Error(`Double booking ditolak. Kamar sudah dipakai oleh ${conflict.reservation_code || conflict.reservation_number}.`);
    const activeStays = await staysApi.active().catch(() => []);
    const stayConflict = activeStays.find((stay) => stay.room_id === payload.room_id && stay.status === 'checked_in' && stay.reservation_id !== id);
    if (stayConflict) throw new Error('Kamar sedang in-house dan tidak boleh dipilih.');
  }
}

export function sanitizeReservationPayload(payload) {
  const { nights, ...safePayload } = payload;
  Object.keys(safePayload).forEach((key) => safePayload[key] === undefined && delete safePayload[key]);
  return safePayload;
}

export const reservationsApi = {
  async list(filters = {}) {
    let query = requireSupabase().from('reservations').select(reservationSelect).order('check_in_date', { ascending: false });
    if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
    if (filters.startDate) query = query.gte('check_out_date', filters.startDate);
    if (filters.endDate) query = query.lte('check_in_date', filters.endDate);
    const { data, error } = await query;
    raise(error);
    let rows = (data || []).map(normalizeReservation);
    if (filters.search?.trim()) {
      const value = filters.search.trim().toLowerCase();
      rows = rows.filter((reservation) => [reservation.reservation_code, reservation.guests?.full_name, reservation.rooms?.room_number]
        .some((field) => String(field || '').toLowerCase().includes(value)));
    }
    return rows;
  },
  async arrivals(date = today()) {
    const { data, error } = await requireSupabase().from('reservations').select(reservationSelect).eq('check_in_date', date).in('status', ['reserved', 'booked', 'confirmed']).order('created_at');
    raise(error);
    return (data || []).map(normalizeReservation);
  },
  async listByView(view = 'all', filters = {}) {
    const startDate = filters.startDate || today();
    const endDate = filters.endDate || startDate;
    const inRange = (value) => {
      const date = String(value || '').slice(0, 10);
      return date && date >= startDate && date <= endDate;
    };
    if (view === 'arrival' || view === 'departure') {
      const stays = await staysApi.list().catch(() => []);
      let rows = stays.filter((stay) => view === 'arrival' ? inRange(stay.actual_check_in || stay.checkin_at) : inRange(stay.actual_check_out || stay.checkout_at));
      if (view === 'departure') rows = rows.filter((stay) => stay.status === 'checked_out' || stay.actual_check_out || stay.checkout_at);
      return rows.map((stay) => {
        const reservation = normalizeReservation(stay.reservations || {});
        return normalizeReservation({
          ...reservation,
          id: reservation.id || stay.reservation_id || stay.id,
          stay_id: stay.id,
          guest_id: stay.guest_id,
          guests: stay.guests || reservation.guests,
          room_id: stay.room_id,
          rooms: stay.rooms || reservation.rooms,
          status: stay.status,
          actual_check_in: stay.actual_check_in || stay.checkin_at,
          actual_check_out: stay.actual_check_out || stay.checkout_at,
          folio_id: stay.folio_id || reservation.folio_id
        });
      });
    }
    const rows = await this.list({ ...filters, status: view === 'expected_arrival' ? 'reserved' : filters.status });
    if (view === 'expected_arrival') return rows.filter((reservation) => inRange(reservation.check_in_date) && reservation.status === 'reserved');
    if (view === 'expected_departure') return rows.filter((reservation) => inRange(reservation.check_out_date) && ['reserved', 'checked_in'].includes(reservation.status));
    return rows;
  },
  async create(payload) {
    const reservationPayload = await this.buildPayload(payload);
    await validateReservation(reservationPayload);
    const { data, error } = await requireSupabase().from('reservations').insert(sanitizeReservationPayload(reservationPayload)).select(reservationSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal membuat reservasi.'));
    if (data.folio_id) await foliosApi.addRoomChargeOnce(data.folio_id, normalizeReservation(data)).catch((err) => console.warn('Room charge folio belum dibuat:', err.message));
    await logAuditEvent('create_reservation', 'reservations', data.id, reservationPayload);
    return normalizeReservation(data);
  },
  async update(id, payload) {
    const reservationPayload = await this.buildPayload(payload, id);
    const safePayload = sanitizeReservationPayload(reservationPayload);
    await validateReservation(safePayload, id);
    const { data, error } = await requireSupabase().from('reservations').update({ ...safePayload, updated_at: new Date().toISOString() }).eq('id', id).select(reservationSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal memperbarui reservasi.'));
    await logAuditEvent('update_reservation', 'reservations', id, reservationPayload);
    return normalizeReservation(data);
  },
  async updateFromFolio(id, payload, role = '') {
    if (!['admin', 'super_admin'].includes(role)) throw new Error('Hanya admin/super admin yang boleh edit reservasi dari Folio.');
    const current = await this.list({ status: 'all' }).then((rows) => rows.find((row) => row.id === id));
    if (!current) throw new Error('Reservasi tidak ditemukan.');
    if (payload.guest_name?.trim() && current.guest_id) await guestsApi.update(current.guest_id, { ...current.guests, full_name: payload.guest_name.trim() });
    const updated = await this.update(id, { ...current, ...payload, guest_id: current.guest_id });
    if (updated.folio_id) await foliosApi.syncReservationRoomCharge(updated.folio_id, updated);
    return updated;
  },
  async cancelFromFolio(reservation, role = '', reason = '') {
    if (!['admin', 'super_admin'].includes(role)) throw new Error('Hanya admin/super admin yang boleh hapus/cancel reservasi dari Folio.');
    const normalized = normalizeReservation(reservation);
    return this.updateStatus(normalized, 'cancelled', { cancellation_reason: reason || 'Cancelled from Folio', cancellation_fee: 0 });
  },
  async buildPayload(input, id = '') {
    const nights = nightsBetween(input.check_in_date, input.check_out_date);
    const generatedCode = id ? undefined : reservationCode();
    let roomType = null;
    if (input.room_type_id) {
      const { data, error } = await requireSupabase().from('room_types').select('*').eq('id', input.room_type_id).maybeSingle();
      raise(error);
      roomType = data;
      if (!roomType || roomType.is_active === false) throw new Error('Room type inactive tidak boleh dipakai untuk reservasi baru.');
    }
    return {
      reservation_number: input.reservation_number || input.reservation_code || generatedCode,
      reservation_code: input.reservation_code || input.reservation_number || generatedCode,
      guest_id: input.guest_id,
      room_id: input.room_id || null,
      room_type_id: input.room_type_id,
      check_in_date: input.check_in_date,
      check_out_date: input.check_out_date,
      checkin_date: input.check_in_date,
      checkout_date: input.check_out_date,
      adults: Number(input.adults || 1),
      children: Number(input.children || 0),
      status: input.status || 'reserved',
      deposit_amount: moneyValue(input.deposit_amount),
      room_rate: input.room_rate === '' || input.room_rate == null ? 0 : moneyValue(input.room_rate),
      special_notes: input.special_notes || input.notes || null,
      notes: input.notes || input.special_notes || null,
      ...(input.folio_id ? { folio_id: input.folio_id } : {})
    };
  },
  async createLegacy({ guest_name, phone, room_id, check_in_date, check_out_date, status = 'reserved', deposit_amount = 0 }) {
    const { data: room, error: roomError } = await requireSupabase().from('rooms').select('id, room_type_id, room_types(*)').eq('id', room_id).single();
    raise(roomError);
    const { data: guest, error: guestError } = await requireSupabase().from('guests').insert({ full_name: guest_name, phone, is_active: true }).select('id').single();
    raise(guestError);
    return this.create({ guest_id: guest.id, room_id, room_type_id: room.room_type_id, check_in_date, check_out_date, status, deposit_amount, room_rate: roomRate(room.room_types) });
  },
  async updateStatus(reservation, status, options = {}) {
    const current = typeof reservation === 'object' ? reservation : { id: reservation };
    if (!RESERVATION_STATUSES.includes(status)) throw new Error('Status reservasi tidak valid.');
    if (current.status === 'checked_out' && status !== 'checked_out') throw new Error('Reservasi checked-out tidak boleh diubah statusnya.');
    if (['cancelled', 'no_show'].includes(status) && ['checked_out', 'checked_in'].includes(current.status)) throw new Error('Reservasi yang sudah check-in/check-out tidak bisa dibatalkan/no-show.');
    const body = { status, updated_at: new Date().toISOString() };
    if (status === 'cancelled') {
      body.cancellation_reason = options.cancellation_reason || null;
      body.cancellation_fee = moneyValue(options.cancellation_fee);
    }
    if (status === 'no_show') body.no_show_fee = moneyValue(options.no_show_fee);
    const { data, error } = await requireSupabase().from('reservations').update(body).eq('id', current.id).select(reservationSelect).single();
    raise(error);
    const normalized = normalizeReservation(data);
    if (status === 'cancelled') await foliosApi.applyCancellation(normalized, options).catch((err) => console.warn('Folio cancellation gagal:', err.message));
    if (status === 'no_show') await foliosApi.applyNoShow(normalized, options).catch((err) => console.warn('Folio no-show gagal:', err.message));
    await logAuditEvent(status === 'cancelled' ? 'cancel_reservation' : `mark_reservation_${status}`, 'reservations', current.id, { ...body, options });
    return normalized;
  }
};

async function upsertInvoiceForStay(stay, forceStatus = false) {
  const normalizedStay = normalizeStay(stay);
  const existing = normalizedStay.invoices?.[0];
  const hotel = await hotelSettingsApi.get().catch(() => ({}));
  const billing = calculateStayBilling(normalizedStay, hotel);
  if (existing) {
    const { data, error } = await requireSupabase().from('invoices').update({
      subtotal: billing.subtotal,
      tax_amount: billing.taxAmount,
      service_amount: billing.serviceAmount,
      deposit_applied: billing.depositApplied,
      total_amount: billing.total,
      balance_due: billing.balance,
      status: forceStatus ? billing.paymentStatus : existing.status,
      updated_at: new Date().toISOString()
    }).eq('id', existing.id).select(invoiceSelect).single();
    raise(error);
    return data;
  }

  const { data: invoice, error } = await requireSupabase().from('invoices').insert({
    stay_id: normalizedStay.id,
    invoice_number: invoiceNumber(hotel.invoice_prefix),
    subtotal: billing.subtotal,
    tax_amount: billing.taxAmount,
    service_amount: billing.serviceAmount,
    deposit_applied: billing.depositApplied,
    total_amount: billing.total,
    balance_due: billing.balance,
    status: billing.paymentStatus
  }).select(invoiceSelect).single();
  raise(error);

  const { error: itemError } = await requireSupabase().from('invoice_items').insert({
    invoice_id: invoice.id,
    item_type: 'room_charge',
    description: `Room charge ${billing.nights} malam`,
    qty: billing.nights,
    unit_price: billing.roomRate
  });
  if (itemError) console.warn('Invoice item gagal dibuat, invoice tetap tersimpan:', itemError.message);
  await logAuditEvent('create_invoice', 'invoices', invoice.id, { stay_id: normalizedStay.id });
  return invoice;
}


function normalizeFolio(folio) {
  if (!folio) return folio;
  const items = folio.folio_items || [];
  const payments = folio.folio_payments || [];
  return {
    ...folio,
    folio_items: items.map((item) => ({ ...item, is_void: item.is_void ?? false, payment_status: item.payment_status || 'unpaid', paid_amount: moneyValue(item.paid_amount), line_total: moneyValue(item.line_total ?? (moneyValue(item.qty) * moneyValue(item.unit_price))) })),
    folio_payments: payments
  };
}


export function calculateFolioTaxService(subtotal = 0, hotel = {}) {
  const safeSubtotal = moneyValue(subtotal);
  const taxPercent = moneyValue(hotel.tax_percent);
  const servicePercent = moneyValue(hotel.service_charge_percent);
  const taxMode = hotel.tax_mode === 'inclusive' ? 'inclusive' : 'exclusive';
  const taxAmount = taxMode === 'inclusive' && taxPercent > 0
    ? safeSubtotal - (safeSubtotal / (1 + taxPercent / 100))
    : safeSubtotal * taxPercent / 100;
  const serviceAmount = safeSubtotal * servicePercent / 100;
  const grandTotal = taxMode === 'inclusive'
    ? Math.max(safeSubtotal + serviceAmount, 0)
    : Math.max(safeSubtotal + taxAmount + serviceAmount, 0);
  return { taxMode, taxAmount, serviceAmount, grandTotal };
}

function dailyRoomChargeRows(reservation, stay = null, startDate = '', endDate = '') {
  const normalized = normalizeReservation(reservation);
  const first = startDate || normalized.check_in_date;
  const lastExclusive = endDate || normalized.check_out_date;
  const rate = moneyValue(normalized.room_rate);
  const roomNumber = normalized.rooms?.room_number || stay?.rooms?.room_number || '';
  return eachDate(first, addDaysToDate(lastExclusive, -1)).map((date) => ({
    reservation_id: normalized.id,
    stay_id: stay?.id || null,
    room_id: stay?.room_id || normalized.room_id || null,
    item_type: 'room',
    description: `${roomNumber ? `${roomNumber} | ` : ''}${date}`,
    qty: 1,
    unit_price: rate,
    posting_date: date
  }));
}

function validatePaymentPayload(payload) {
  const paymentGroup = payload.payment_group || (payload.payment_method === 'cash' ? 'cash' : 'non_tunai');
  const paymentMethod = paymentGroup === 'cash' ? 'cash' : payload.payment_method;
  const amount = moneyValue(payload.amount);
  if (!PAYMENT_GROUPS.includes(paymentGroup)) throw new Error('Payment group tidak valid.');
  if (paymentGroup === 'cash' && paymentMethod !== 'cash') throw new Error('Cash harus memakai payment_method cash.');
  if (paymentGroup === 'non_tunai' && !NON_CASH_METHODS.includes(paymentMethod)) throw new Error('Metode non tunai tidak valid.');
  if (paymentGroup === 'non_tunai' && !payload.reference_number?.trim()) throw new Error('Nomor referensi wajib untuk pembayaran non tunai.');
  if (amount <= 0) throw new Error('Nominal payment/refund harus lebih dari 0.');
  return { paymentGroup, paymentMethod, amount };
}


function normalizeFolioItemType(itemType) {
  const aliases = { early_check_in: 'early_checkin', late_check_out: 'late_checkout' };
  return aliases[itemType] || itemType;
}

function validateFolioItemPayload(folioId, payload) {
  if (!folioId) throw new Error('Folio wajib dipilih sebelum menambah transaksi.');
  const itemType = normalizeFolioItemType(payload.item_type);
  if (!FOLIO_ITEM_TYPES.includes(itemType)) throw new Error(`Tipe item folio tidak valid: ${payload.item_type || '-'}. Silakan pilih tipe item lain atau hubungi administrator.`);
  if (!payload.description?.trim()) throw new Error('Deskripsi item wajib diisi.');
  const qty = Number(payload.qty);
  const unitPrice = payload.unit_price === '' || payload.unit_price == null ? NaN : Number(payload.unit_price);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Qty harus angka lebih dari 0.');
  const minusTypes = ['adjustment', 'correction', 'discount_adjustment', 'other_adjustment', 'refund', 'cancellation_fee'];
  if (!Number.isFinite(unitPrice) || unitPrice === 0) throw new Error('Nominal item tidak boleh 0.');
  if (unitPrice < 0 && !minusTypes.includes(itemType)) throw new Error('Nominal minus hanya untuk adjustment/refund/correction/cancellation.');
  const postingDate = payload.posting_date || today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postingDate)) throw new Error('Posting date harus format YYYY-MM-DD.');
  return {
    reservation_id: payload.reservation_id || null,
    stay_id: payload.stay_id || null,
    room_id: payload.room_id || null,
    item_type: itemType,
    description: payload.description.trim(),
    qty,
    unit_price: unitPrice,
    posting_date: postingDate,
    notes: payload.notes?.trim() || null,
    created_from: payload.created_from || 'front_office',
    payment_status: payload.payment_status || 'unpaid'
  };
}

function assertSuperAdmin(role) {
  if (role !== 'super_admin') throw new Error('Hanya super admin yang boleh edit/hapus transaksi.');
}

async function nextBillNumber() {
  const prefix = `BILL-${billDatePart()}-`;
  const { data } = await requireSupabase().from('folio_payments').select('bill_no').ilike('bill_no', `${prefix}%`).order('bill_no', { ascending: false }).limit(1);
  const latest = data?.[0]?.bill_no || '';
  const current = Number(latest.split('-').pop() || 0);
  return `${prefix}${String((Number.isFinite(current) ? current : 0) + 1).padStart(4, '0')}`;
}

function assertPosCashier(role) {
  if (!['admin', 'super_admin', 'manager', 'cashier', 'frontdesk', 'receptionist'].includes(role)) throw new Error('Role ini tidak boleh memproses transaksi pembayaran.');
}

export const foliosApi = {
  async list({ status = 'all', search = '' } = {}) {
    let query = requireSupabase().from('folios').select(folioSelect).order('created_at', { ascending: false });
    if (status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    raise(error);
    let rows = (data || []).map(normalizeFolio);
    if (search.trim()) {
      const value = search.trim().toLowerCase();
      rows = rows.filter((folio) => [folio.folio_number, folio.guests?.full_name, folio.status].some((field) => String(field || '').toLowerCase().includes(value)));
    }
    return rows;
  },
  async getFolio(id) {
    if (!id) throw new Error('Folio wajib dipilih.');
    const { data, error } = await requireSupabase().from('folios').select(folioSelect).eq('id', id).maybeSingle();
    if (error) throw new Error(parsePgError(error, 'Gagal memuat folio.'));
    if (!data) throw new Error('Folio tidak ditemukan.');
    return normalizeFolio(data);
  },
  async createFolio({ guest_id, notes = '' }) {
    if (!guest_id) throw new Error('Guest wajib untuk folio.');
    const { data, error } = await requireSupabase().from('folios').insert({ folio_number: folioNumber(), guest_id, notes, status: 'open' }).select(folioSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal membuat folio.'));
    await logAuditEvent('create_folio', 'folios', data.id, { guest_id });
    return normalizeFolio(data);
  },
  async ensureForReservation(reservation, stay = null) {
    const normalized = normalizeReservation(reservation);
    let folio = null;
    if (normalized.folio_id) folio = await this.getFolio(normalized.folio_id).catch(() => null);
    if (!folio) {
      folio = await this.createFolio({ guest_id: normalized.guest_id, notes: `Folio ${normalized.reservation_code || normalized.reservation_number}` });
      await requireSupabase().from('reservations').update({ folio_id: folio.id, updated_at: new Date().toISOString() }).eq('id', normalized.id);
    }
    if (stay?.id) await requireSupabase().from('stays').update({ folio_id: folio.id, updated_at: new Date().toISOString() }).eq('id', stay.id);
    return folio;
  },
  async recalculateFolioTotals(folioId, nextStatus = '') {
    const folio = await this.getFolio(folioId);
    const hotel = await hotelSettingsApi.get().catch(() => ({}));
    const items = (folio.folio_items || []).filter((item) => item.is_void !== true);
    const payments = folio.folio_payments || [];
    const itemTotal = (item) => moneyValue(item.line_total ?? (moneyValue(item.qty) * moneyValue(item.unit_price)));
    const chargeSubtotal = items
      .filter((item) => item.item_type !== 'discount')
      .reduce((sum, item) => sum + itemTotal(item), 0);
    const discountPercent = Math.min(Math.max(moneyValue(folio.discount_percent), 0), 100);
    const manualDiscount = items.filter((item) => item.item_type === 'discount').reduce((sum, item) => sum + Math.abs(itemTotal(item)), 0);
    const discountAmount = Math.min(chargeSubtotal, (chargeSubtotal * discountPercent / 100) + manualDiscount);
    const taxableBase = Math.max(chargeSubtotal - discountAmount, 0);
    const { taxAmount, serviceAmount, grandTotal } = calculateFolioTaxService(taxableBase, hotel);
    const paidByItems = items.filter((item) => item.payment_status === 'paid').reduce((sum, item) => sum + Math.max(itemTotal(item), 0), 0);
    const paidAmount = payments.filter((payment) => payment.payment_type === 'payment').reduce((sum, payment) => sum + moneyValue(payment.amount), 0) || paidByItems;
    const refundAmount = payments.filter((payment) => payment.payment_type === 'refund').reduce((sum, payment) => sum + moneyValue(payment.amount), 0);
    const balanceDue = Math.max(grandTotal - paidAmount + refundAmount, 0);
    let status = nextStatus || folio.status || 'open';
    if (!nextStatus) status = balanceDue <= 0 && paidAmount > 0 ? 'closed' : paidAmount > 0 ? 'partial' : 'open';
    if (status === 'closed' && balanceDue > 0) status = 'debt';
    if (status === 'partial' && balanceDue <= 0) status = 'closed';
    if (status === 'debt' && balanceDue <= 0) status = 'closed';
    if (refundAmount >= paidAmount && paidAmount > 0 && nextStatus === 'refunded') status = 'refunded';
    const body = { subtotal: chargeSubtotal, discount_amount: discountAmount, tax_amount: taxAmount, service_amount: serviceAmount, grand_total: grandTotal, paid_amount: paidAmount, refund_amount: refundAmount, balance_due: balanceDue, status, updated_at: new Date().toISOString() };
    const { data, error } = await requireSupabase().from('folios').update(body).eq('id', folioId).select(folioSelect).single();
    raise(error);
    return normalizeFolio(data);
  },
  async addFolioItem(folioId, payload) {
    const body = validateFolioItemPayload(folioId, payload);
    const { data, error } = await requireSupabase().from('folio_items').insert({
      folio_id: folioId,
      ...body
    }).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal menambah item folio.'));
    const folio = await this.recalculateFolioTotals(folioId);
    await logAuditEvent('add_folio_item', 'folio_items', data.id, { folio_id: folioId, ...body });
    return folio;
  },
  async addPOSCharge(folioId, payload, role = '') {
    if (!['admin', 'super_admin', 'cashier', 'frontdesk', 'receptionist'].includes(role)) throw new Error('Anda tidak punya akses menambahkan tagihan.');
    if (!payload.description?.trim()) throw new Error('Keterangan wajib diisi.');
    if (payload.item_type === 'other' && payload.description.trim().length < 5) throw new Error('Keterangan item Others wajib lebih detail.');
    return this.addFolioItem(folioId, { ...payload, created_from: 'pos', payment_status: 'unpaid' });
  },
  async updateFolioItem(folioId, itemId, payload, role) {
    assertSuperAdmin(role);
    const before = await this.getFolio(folioId).then((folio) => (folio.folio_items || []).find((item) => item.id === itemId));
    if (!before) throw new Error('Folio item tidak ditemukan.');
    const body = validateFolioItemPayload(folioId, payload);
    const { data, error } = await requireSupabase().from('folio_items').update({
      item_type: body.item_type,
      description: body.description,
      qty: body.qty,
      unit_price: body.unit_price,
      posting_date: body.posting_date,
      updated_at: new Date().toISOString()
    }).eq('id', itemId).eq('folio_id', folioId).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal mengedit item folio.'));
    const folio = await this.recalculateFolioTotals(folioId);
    await logAuditEvent('edit_folio_item', 'folio_items', itemId, { before, after: data });
    return folio;
  },
  async voidFolioItem(folioId, itemId, role, reason = '') {
    assertSuperAdmin(role);
    const before = await this.getFolio(folioId).then((folio) => (folio.folio_items || []).find((item) => item.id === itemId));
    if (!before) throw new Error('Folio item tidak ditemukan.');
    const user = await getCachedAuthUser();
    const { data, error } = await requireSupabase().from('folio_items').update({
      is_void: true,
      void_reason: reason || 'Void by super admin',
      voided_by: user?.id || null,
      voided_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', itemId).eq('folio_id', folioId).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal void item folio. Pastikan role Anda memiliki izin.'));
    const folio = await this.recalculateFolioTotals(folioId);
    await logAuditEvent('void_folio_item', 'folio_items', itemId, { before, after: data, reason });
    return folio;
  },
  async addRoomChargeOnce(folioId, reservation, stay = null) {
    const folio = await this.getFolio(folioId);
    const rows = dailyRoomChargeRows(reservation, stay).filter((row) => moneyValue(row.unit_price) > 0 && !(folio.folio_items || []).some((item) => item.is_void !== true && item.item_type === 'room' && item.room_id === row.room_id && item.posting_date === row.posting_date));
    if (!rows.length) return folio;
    const { error } = await requireSupabase().from('folio_items').insert(rows.map((row) => ({ folio_id: folioId, ...validateFolioItemPayload(folioId, row) })));
    if (error) throw new Error(parsePgError(error, 'Gagal membuat room charge harian.'));
    await logAuditEvent('add_daily_room_charges', 'folio_items', null, { folio_id: folioId, reservation_id: reservation.id, count: rows.length });
    return this.recalculateFolioTotals(folioId);
  },
  async syncReservationRoomCharge(folioId, reservation) {
    return this.addRoomChargeOnce(folioId, normalizeReservation(reservation));
  },
  async extendStay(folioId, reservation, payload = {}) {
    const normalized = normalizeReservation(reservation);
    const oldCheckout = normalized.check_out_date;
    const newCheckout = payload.new_check_out_date;
    if (!newCheckout || newCheckout <= oldCheckout) throw new Error('Tanggal checkout baru harus lebih besar dari checkout lama.');
    if (normalized.room_id) {
      const { data, error } = await requireSupabase().from('reservations').select('id,reservation_code,reservation_number,check_in_date,check_out_date,status').eq('room_id', normalized.room_id).in('status', ['reserved', 'checked_in']);
      raise(error);
      const conflict = (data || []).find((item) => item.id !== normalized.id && datesOverlap(item.check_in_date, item.check_out_date, oldCheckout, newCheckout));
      if (conflict) throw new Error(`Extend stay ditolak. Kamar bentrok dengan ${conflict.reservation_code || conflict.reservation_number}.`);
    }
    const extraNights = nightsBetween(oldCheckout, newCheckout);
    const rate = payload.extra_nightly_rate === '' || payload.extra_nightly_rate == null ? moneyValue(normalized.room_rate) : moneyValue(payload.extra_nightly_rate);
    if (rate <= 0) throw new Error('Tarif tambahan per malam wajib diisi karena rate kamar belum tersedia.');
    const updated = await reservationsApi.update(normalized.id, { ...normalized, check_out_date: newCheckout, checkout_date: newCheckout });
    await this.addRoomChargeOnce(folioId, { ...updated, room_rate: rate }, null);
    await logAuditEvent('extend_stay', 'reservations', normalized.id, { old_checkout: oldCheckout, new_checkout: newCheckout, extra_nights: extraNights, rate });
    return this.getFolio(folioId);
  },
  async addFolioPayment(folioId, payload) {
    const { paymentGroup, paymentMethod, amount } = validatePaymentPayload(payload);
    const folio = await this.getFolio(folioId);
    if (payload.payment_type !== 'refund' && amount > moneyValue(folio.balance_due)) throw new Error('Payment melebihi balance due.');
    const billNo = payload.bill_no || await nextBillNumber();
    const { data, error } = await requireSupabase().from('folio_payments').insert({
      folio_id: folioId,
      payment_type: payload.payment_type || 'payment',
      payment_group: paymentGroup,
      payment_method: paymentMethod,
      amount,
      bill_no: billNo,
      cashier_id: payload.cashier_id || null,
      payment_status: payload.payment_status || 'posted',
      reference_number: payload.reference_number || null,
      card_or_account_number: payload.card_or_account_number || null,
      notes: payload.notes || null,
      paid_at: payload.paid_at || new Date().toISOString()
    }).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal menyimpan payment folio.'));
    const updated = await this.recalculateFolioTotals(folioId, payload.payment_type === 'refund' ? 'refunded' : '');
    await logAuditEvent(payload.payment_type === 'refund' ? 'refund_folio' : 'add_folio_payment', 'folio_payments', data.id, { ...payload, bill_no: billNo });
    return updated;
  },

  async addItemizedPayment(folioId, payload, role = '', cashierId = '') {
    assertPosCashier(role);
    if (!folioId) throw new Error('Pilih folio terlebih dahulu.');
    const selectedIds = [...new Set(payload.selected_item_ids || [])];
    if (selectedIds.length === 0) throw new Error('Pilih minimal 1 item tagihan.');
    const { paymentGroup, paymentMethod, amount } = validatePaymentPayload({ ...payload, amount: payload.amount });
    const folio = await this.getFolio(folioId);
    const payableItems = (folio.folio_items || []).filter((item) => {
      const total = moneyValue(item.line_total ?? moneyValue(item.qty) * moneyValue(item.unit_price));
      return selectedIds.includes(item.id) && item.folio_id === folioId && item.is_void !== true && total > 0 && !['paid', 'cancelled', 'refunded', 'void'].includes(String(item.payment_status || 'unpaid').toLowerCase());
    });
    if (payableItems.length !== selectedIds.length) throw new Error('Sebagian item tidak valid, sudah paid, void, cancelled, refunded, atau bukan milik folio ini. Muat ulang data.');
    const selectedTotal = payableItems.reduce((sum, item) => sum + moneyValue(item.line_total ?? moneyValue(item.qty) * moneyValue(item.unit_price)), 0);
    if (selectedTotal <= 0) throw new Error('Total item terpilih harus lebih dari 0.');
    if (amount !== selectedTotal) throw new Error('Pembayaran sebagian per item belum didukung. Nominal harus sama dengan total item terpilih.');
    const billNo = payload.bill_no || await nextBillNumber();
    const { data: payment, error } = await requireSupabase().from('folio_payments').insert({
      folio_id: folioId,
      payment_type: 'payment',
      payment_group: paymentGroup,
      payment_method: paymentMethod,
      amount: selectedTotal,
      bill_no: billNo,
      cashier_id: cashierId || null,
      payment_status: 'posted',
      reference_number: payload.reference_number || null,
      card_or_account_number: payload.card_or_account_number || null,
      notes: payload.notes || null,
      paid_at: payload.paid_at || new Date().toISOString()
    }).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal menyimpan payment itemized.'));
    const detailRows = payableItems.map((item) => ({
      folio_payment_id: payment.id,
      folio_id: folioId,
      folio_item_id: item.id,
      description: item.description || '-',
      item_type: item.item_type || 'charge',
      qty: moneyValue(item.qty) || 1,
      unit_price: moneyValue(item.unit_price),
      amount: moneyValue(item.line_total ?? moneyValue(item.qty) * moneyValue(item.unit_price))
    }));
    const { error: itemError } = await requireSupabase().from('folio_payment_items').insert(detailRows);
    if (itemError) throw new Error(parsePgError(itemError, 'Gagal menyimpan detail item bill. Payment header sudah dibuat; hubungi admin untuk rekonsiliasi.'));
    const markResults = await Promise.all(payableItems.map((item) => requireSupabase().from('folio_items').update({ payment_status: 'paid', paid_at: payment.paid_at, paid_bill_id: payment.id, paid_amount: moneyValue(item.line_total ?? moneyValue(item.qty) * moneyValue(item.unit_price)), updated_at: new Date().toISOString() }).eq('id', item.id).eq('folio_id', folioId)));
    const markError = markResults.find((result) => result.error)?.error;
    if (markError) throw new Error(parsePgError(markError, 'Gagal update status paid item.'));
    const updated = await this.recalculateFolioTotals(folioId);
    await logAuditEvent('add_itemized_pos_payment', 'folio_payments', payment.id, { folio_id: folioId, bill_no: billNo, selected_item_ids: selectedIds, total: selectedTotal });
    return { folio: updated, payment, items: detailRows };
  },
  async addFolioPartialPayment(folioId, payload, role = '', cashierId = '') {
    assertPosCashier(role);
    const { paymentGroup, paymentMethod, amount } = validatePaymentPayload(payload);
    const folio = await this.getFolio(folioId);
    if (amount > moneyValue(folio.balance_due)) throw new Error('Payment melebihi balance due. Overpayment belum diaktifkan.');
    const billNo = payload.bill_no || await nextBillNumber();
    const { data: payment, error } = await requireSupabase().from('folio_payments').insert({
      folio_id: folioId, payment_type: 'payment', payment_group: paymentGroup, payment_method: paymentMethod,
      amount, bill_no: billNo, cashier_id: cashierId || null, payment_status: 'posted',
      reference_number: payload.reference_number || null, card_or_account_number: payload.card_or_account_number || null,
      notes: payload.notes || null, paid_at: payload.paid_at || new Date().toISOString()
    }).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal menyimpan partial payment.'));
    const updated = await this.recalculateFolioTotals(folioId);
    await logAuditEvent('add_pos_partial_payment', 'folio_payments', payment.id, { folio_id: folioId, bill_no: billNo, amount });
    return { folio: updated, payment, items: [] };
  },
  async updateDiscount(folioId, discount_percent, role = '') {
    const folio = await this.getFolio(folioId);
    if (['closed', 'cancelled', 'refunded'].includes(folio.status) && !['super_admin', 'manager'].includes(role)) throw new Error('Discount folio closed hanya bisa diubah manager/super admin.');
    const percent = moneyValue(discount_percent);
    if (percent < 0 || percent > 100) throw new Error('Discount persen harus 0 - 100.');
    const { error } = await requireSupabase().from('folios').update({ discount_percent: percent, updated_at: new Date().toISOString() }).eq('id', folioId);
    raise(error);
    const updated = await this.recalculateFolioTotals(folioId);
    await logAuditEvent('update_folio_discount', 'folios', folioId, { discount_percent: percent });
    return updated;
  },
  async closeFolio(folioId) {
    const updated = await this.recalculateFolioTotals(folioId, 'closed');
    await logAuditEvent(updated.status === 'debt' ? 'close_folio_debt' : 'close_folio', 'folios', folioId, { status: updated.status });
    return updated;
  },

  async updateNotes(folioId, notes = '') {
    if (!folioId) throw new Error('Folio wajib dipilih.');
    const { data, error } = await requireSupabase().from('folios').update({ notes, updated_at: new Date().toISOString() }).eq('id', folioId).select(folioSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal menyimpan catatan folio.'));
    await logAuditEvent('update_folio_notes', 'folios', folioId, { notes }).catch(() => {});
    return normalizeFolio(data);
  },
  async cancelFolio(folioId, notes = '') {
    const { error } = await requireSupabase().from('folios').update({ status: 'cancelled', notes, updated_at: new Date().toISOString() }).eq('id', folioId);
    raise(error);
    await logAuditEvent('cancel_folio', 'folios', folioId, { notes });
    return this.getFolio(folioId);
  },
  async refundFolio(folioId, payload) {
    const folio = await this.getFolio(folioId);
    const amount = moneyValue(payload.amount);
    if (amount <= 0) throw new Error('Nominal refund harus lebih dari 0.');
    if (amount > moneyValue(folio.paid_amount) - moneyValue(folio.refund_amount)) throw new Error('Refund tidak boleh melebihi paid amount yang belum direfund.');
    if (!payload.notes?.trim()) throw new Error('Alasan refund wajib diisi.');
    return this.addFolioPayment(folioId, { ...payload, payment_type: 'refund', amount });
  },
  async applyCancellation(reservation, options = {}) {
    const fee = moneyValue(options.cancellation_fee);
    const folio = await this.ensureForReservation(reservation);
    if (moneyValue(reservation.deposit_amount) > 0 && !(folio.folio_payments || []).some((payment) => payment.notes === `Deposit ${reservation.reservation_code}`)) {
      await this.addFolioPayment(folio.id, { payment_group: 'cash', payment_method: 'cash', amount: reservation.deposit_amount, notes: `Deposit ${reservation.reservation_code}` });
    }
    if (fee > 0) await this.addFolioItem(folio.id, { reservation_id: reservation.id, item_type: 'cancellation_fee', description: `Cancellation fee ${reservation.reservation_code}`, qty: 1, unit_price: fee });
    if (options.refund_amount) await this.refundFolio(folio.id, { amount: options.refund_amount, payment_group: options.payment_group || 'cash', payment_method: options.payment_method || 'cash', reference_number: options.reference_number || '', notes: options.cancellation_reason || 'Cancellation refund' });
    return fee > 0 ? this.recalculateFolioTotals(folio.id) : this.cancelFolio(folio.id, options.cancellation_reason || 'Reservation cancelled');
  },
  async applyNoShow(reservation, options = {}) {
    const fee = moneyValue(options.no_show_fee);
    if (fee <= 0) return null;
    const folio = await this.ensureForReservation(reservation);
    return this.addFolioItem(folio.id, { reservation_id: reservation.id, item_type: 'no_show_fee', description: `No-show fee ${reservation.reservation_code}`, qty: 1, unit_price: fee });
  }
};


export const frontOfficeWorkflowApi = {
  async createReservationWorkflow(payload) {
    const rooms = Array.isArray(payload.rooms) ? payload.rooms : [];
    const otherCharges = Array.isArray(payload.other_charges) ? payload.other_charges : [];
    if (!payload.guest?.full_name?.trim()) throw new Error('Nama tamu wajib diisi.');
    if (!payload.booking_type) throw new Error('Booking type/segment wajib dipilih.');
    if (!payload.arrival || !payload.departure || payload.departure <= payload.arrival) throw new Error('Departure harus setelah arrival.');
    if (!rooms.length) throw new Error('Tambahkan minimal satu kamar.');
    if (['Corporate', 'Government', 'Others'].includes(payload.booking_type) && (!payload.institution?.trim() || !payload.pic_name?.trim() || !payload.pic_phone?.trim())) throw new Error('Instansi, Nama PIC, dan No Telp PIC wajib untuk segment ini.');
    if (payload.booking_type === 'OTA' && (!payload.ota_name?.trim() || !payload.ota_booking_code?.trim())) throw new Error('Nama OTA dan Kode Booking wajib untuk OTA.');

    const notes = [
      `Segment: ${payload.booking_type}`,
      payload.institution ? `Instansi: ${payload.institution}` : '',
      payload.pic_name ? `PIC: ${payload.pic_name}` : '',
      payload.pic_phone ? `Telp PIC: ${payload.pic_phone}` : '',
      payload.ota_name ? `OTA: ${payload.ota_name}` : '',
      payload.ota_booking_code ? `Kode Booking: ${payload.ota_booking_code}` : '',
      payload.notes || ''
    ].filter(Boolean).join('\n');

    let guest = null;
    if (payload.guest_id) {
      guest = await guestsApi.update(payload.guest_id, {
        full_name: payload.guest.full_name,
        phone: payload.guest.phone,
        email: payload.guest.email,
        nik: payload.guest.nik,
        address: payload.guest.address,
        notes
      });
    } else {
      const existingGuests = await guestsApi.list({ status: 'active' }).catch(() => []);
      const duplicate = existingGuests.find((row) => (payload.guest.nik && row.nik === payload.guest.nik) || (payload.guest.phone && row.phone === payload.guest.phone && String(row.full_name || '').toLowerCase() === payload.guest.full_name.trim().toLowerCase()));
      guest = duplicate || await guestsApi.create({
        full_name: payload.guest.full_name,
        phone: payload.guest.phone,
        email: payload.guest.email,
        nik: payload.guest.nik,
        address: payload.guest.address,
        notes
      });
    }
    let folio = await foliosApi.createFolio({ guest_id: guest.id, notes: `Front Office ${payload.booking_type}\n${notes}` });
    const reservations = [];
    for (const room of rooms) {
      const roomType = room.room_type_id;
      if (!roomType) throw new Error('Room type wajib diisi di setiap kamar.');
      const rate = moneyValue(room.rate_per_night);
      const reservation = await reservationsApi.create({
        guest_id: guest.id,
        room_type_id: roomType,
        room_id: room.room_id || null,
        check_in_date: payload.arrival,
        check_out_date: payload.departure,
        status: 'reserved',
        room_rate: rate,
        folio_id: folio.id,
        notes
      });
      reservations.push(reservation);
      folio = await foliosApi.addRoomChargeOnce(folio.id, reservation);
      if (payload.status === 'checked_in') await staysApi.checkIn(reservation, room.room_id || null);
    }
    for (const charge of otherCharges) {
      const qty = Number(charge.qty || 0);
      const unitPrice = moneyValue(charge.unit_price);
      if (!charge.description?.trim() && unitPrice > 0) throw new Error('Nama item other charge wajib diisi.');
      if (qty > 0 && unitPrice > 0) {
        folio = await foliosApi.addFolioItem(folio.id, {
          item_type: charge.item_type || 'other',
          description: charge.description,
          qty,
          unit_price: unitPrice,
          posting_date: charge.posting_date || payload.arrival || today(),
          notes: charge.notes,
          created_from: 'front_office',
          payment_status: 'unpaid'
        });
      }
    }
    return { guest, folio: await foliosApi.recalculateFolioTotals(folio.id), reservations };
  }
};


export const posApi = {
  async listFolios(filters = {}) {
    const rows = await foliosApi.list({ status: 'all', search: '' });
    const search = filters.search?.trim()?.toLowerCase() || '';
    const roomSearch = filters.room?.trim()?.toLowerCase() || '';
    const status = filters.status || 'all';
    const dateFrom = filters.dateFrom || '';
    const dateTo = filters.dateTo || '';
    const normalizeStatus = (value = '') => normalizePOSStatus(value).toLowerCase();
    const inDateRange = (value) => {
      const date = String(value || '').slice(0, 10);
      if (!date) return !dateFrom && !dateTo;
      return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
    };
    return rows.filter((folio) => {
      const reservations = folio.reservations || [];
      const payments = folio.folio_payments || [];
      const roomNumbers = reservations.map((reservation) => reservation.rooms?.room_number).filter(Boolean);
      const billNumbers = payments.map((payment) => payment.bill_no || payment.reference_number).filter(Boolean);
      const textOk = !search || [folio.folio_number, folio.guests?.full_name, folio.status, ...roomNumbers, ...billNumbers].some((field) => String(field || '').toLowerCase().includes(search));
      const roomOk = !roomSearch || roomNumbers.some((room) => String(room).toLowerCase().includes(roomSearch));
      const statusOk = status === 'all' || normalizeStatus(folio.status) === status;
      const candidateDates = [folio.created_at, ...payments.map((payment) => payment.paid_at || payment.created_at), ...reservations.map((reservation) => reservation.check_in_date)];
      const dateOk = (!dateFrom && !dateTo) || candidateDates.some(inDateRange);
      return textOk && roomOk && statusOk && dateOk;
    });
  },
  async getFolio(folioId) {
    if (!folioId) throw new Error('Pilih folio terlebih dahulu.');
    return foliosApi.getFolio(folioId);
  },
  buildLedger(folio) {
    const items = (folio?.folio_items || []).filter((item) => item.is_void !== true).map((item) => {
      const amount = moneyValue(item.line_total ?? moneyValue(item.qty) * moneyValue(item.unit_price));
      return {
        id: item.id,
        source: 'charge',
        bill_no: '-',
        date: item.posting_date || String(item.created_at || '').slice(0, 10),
        type: item.item_type || 'charge',
        description: item.description || '-',
        debit: amount > 0 ? amount : 0,
        credit: amount < 0 ? Math.abs(amount) : 0,
        amount,
        method: '-',
        notes: item.void_reason || '-',
        status: item.is_void ? 'void' : 'posted'
      };
    });
    const payments = (folio?.folio_payments || []).map((payment) => {
      const amount = moneyValue(payment.amount);
      const isRefund = payment.payment_type === 'refund';
      return {
        id: payment.id,
        source: 'payment',
        bill_no: payment.bill_no || payment.reference_number || '-',
        date: String(payment.paid_at || payment.created_at || '').slice(0, 16).replace('T', ' '),
        type: isRefund ? 'refund_payment' : 'payment',
        description: isRefund ? 'Refund payment' : 'Payment',
        debit: isRefund ? amount : 0,
        credit: isRefund ? 0 : amount,
        amount: isRefund ? amount : -amount,
        method: payment.payment_method || '-',
        notes: payment.notes || '-',
        status: payment.payment_status || 'posted'
      };
    });
    return [...items, ...payments].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  },
  settlement(folio) {
    const items = (folio?.folio_items || []).filter((item) => item.is_void !== true);
    const itemTotal = (item) => moneyValue(item.line_total ?? moneyValue(item.qty) * moneyValue(item.unit_price));
    const totalCharge = items.filter((item) => itemTotal(item) > 0).reduce((sum, item) => sum + itemTotal(item), 0);
    const totalAdjustment = items.filter((item) => itemTotal(item) < 0).reduce((sum, item) => sum + itemTotal(item), 0);
    const payments = folio?.folio_payments || [];
    const totalPayment = payments.filter((payment) => payment.payment_type === 'payment').reduce((sum, payment) => sum + moneyValue(payment.amount), 0);
    const totalRefund = payments.filter((payment) => payment.payment_type === 'refund').reduce((sum, payment) => sum + moneyValue(payment.amount), 0);
    const grandTotal = moneyValue(folio?.grand_total ?? totalCharge + totalAdjustment);
    const balance = moneyValue(folio?.balance_due ?? Math.max(grandTotal - totalPayment + totalRefund, 0));
    return { totalCharge, totalAdjustment, totalPayment, totalRefund, grandTotal, balance, status: folio?.status || 'open' };
  },
  async postCharge(folioId, payload, role = '') {
    if (!folioId) throw new Error('Pilih folio terlebih dahulu.');
    return foliosApi.addPOSCharge(folioId, payload, role);
  },
  async postPayment(folioId, payload, role = '', cashierId = '') {
    return (payload.selected_item_ids || []).length ? foliosApi.addItemizedPayment(folioId, payload, role, cashierId) : foliosApi.addFolioPartialPayment(folioId, payload, role, cashierId);
  },
  async postAdjustment(folioId, payload, role = '') {
    assertPosCashier(role);
    if (!folioId) throw new Error('Pilih folio terlebih dahulu.');
    const amount = moneyValue(payload.amount);
    if (amount >= 0) throw new Error('Nominal adjustment/refund/correction wajib minus.');
    if (!payload.notes?.trim()) throw new Error('Keterangan wajib diisi untuk transaksi minus.');
    return foliosApi.addFolioItem(folioId, {
      item_type: payload.adjustment_type || 'adjustment',
      description: payload.notes.trim(),
      qty: 1,
      unit_price: amount,
      posting_date: payload.posting_date || today()
    });
  },
  async shiftSummary(date = today()) {
    const folios = await foliosApi.list().catch(() => []);
    const payments = folios.flatMap((folio) => (folio.folio_payments || []).map((payment) => ({ ...payment, folio })));
    const todayRows = payments.filter((payment) => String(payment.paid_at || '').slice(0, 10) === date);
    const sum = (method) => todayRows.filter((payment) => payment.payment_method === method && payment.payment_type === 'payment').reduce((total, payment) => total + moneyValue(payment.amount), 0);
    const totalRefund = todayRows.filter((payment) => payment.payment_type === 'refund').reduce((total, payment) => total + moneyValue(payment.amount), 0);
    return { rows: todayRows, cash: sum('cash'), transfer: sum('transfer'), qris: sum('qris'), debit: sum('debit_card'), credit: sum('credit_card'), refund: totalRefund, net: todayRows.filter((payment) => payment.payment_type === 'payment').reduce((total, payment) => total + moneyValue(payment.amount), 0) - totalRefund };
  }
};

export const staysApi = {
  async list() {
    const { data, error } = await requireSupabase().from('stays').select(staySelect).order('created_at', { ascending: false });
    raise(error);
    return (data || []).map(normalizeStay);
  },
  async active() {
    const { data, error } = await requireSupabase().from('stays').select(staySelect).eq('status', 'checked_in').order('created_at', { ascending: false });
    raise(error);
    return (data || []).map(normalizeStay);
  },
  async checkIn(reservation, selectedRoomId = '') {
    const normalized = normalizeReservation(reservation);
    if (normalized.status !== 'reserved') throw new Error('Hanya reservasi reserved yang bisa check-in.');
    const room_id = selectedRoomId || normalized.room_id;
    if (!room_id) throw new Error('Pilih kamar sebelum check-in.');
    await validateReservation({ ...normalized, room_id }, normalized.id);
    const now = new Date().toISOString();
    const { data: existingStay } = await requireSupabase().from('stays').select('*').eq('reservation_id', normalized.id).maybeSingle();
    let stay;
    if (existingStay) {
      const { data, error } = await requireSupabase().from('stays').update({ room_id, status: 'checked_in', checkin_at: now, actual_check_in: now, updated_at: now }).eq('id', existingStay.id).select(staySelect).single();
      raise(error);
      stay = data;
    } else {
      const { data, error } = await requireSupabase().from('stays').insert({
        reservation_id: normalized.id,
        guest_id: normalized.guest_id,
        room_id,
        deposit_amount: Number(normalized.deposit_amount || 0),
        checkin_at: now,
        actual_check_in: now,
        status: 'checked_in'
      }).select(staySelect).single();
      raise(error);
      stay = data;
    }
    await reservationsApi.updateStatus({ id: normalized.id, status: normalized.status }, 'checked_in');
    await requireSupabase().from('reservations').update({ room_id, updated_at: now }).eq('id', normalized.id);
    const reservationForFolio = normalizeReservation({ ...normalized, room_id, rooms: normalizeRoom(stay.rooms) });
    const folio = await foliosApi.ensureForReservation(reservationForFolio, stay);
    await foliosApi.addRoomChargeOnce(folio.id, reservationForFolio, stay);
    if (moneyValue(normalized.deposit_amount) > 0 && !(folio.folio_payments || []).some((payment) => payment.notes === `Deposit ${normalized.reservation_code}`)) {
      await foliosApi.addFolioPayment(folio.id, { payment_group: 'cash', payment_method: 'cash', amount: normalized.deposit_amount, notes: `Deposit ${normalized.reservation_code}` });
    }
    await roomsApi.updateHkStatus({ id: room_id, fo_status: 'available', hk_status: 'VC' }, 'OR', { role: 'manager', allowGroupChange: true });
    await logAuditEvent('check_in', 'stays', stay.id, { reservation_id: normalized.id, room_id, folio_id: folio.id });
    return normalizeStay(stay);
  },
  async checkOut(stay, options = {}) {
    const normalized = normalizeStay(stay);
    if (normalized.status !== 'checked_in') throw new Error('Hanya stay checked_in yang bisa check-out.');
    const folio = normalized.folio_id ? await foliosApi.getFolio(normalized.folio_id).catch(() => null) : await foliosApi.ensureForReservation(normalized.reservations || { ...normalized, id: normalized.reservation_id }, normalized).catch(() => null);
    const billingStatus = folio ? (folio.status === 'debt' ? 'debt' : (moneyValue(folio.balance_due) <= 0 ? 'paid' : 'unpaid')) : 'paid';
    if (folio && moneyValue(folio.balance_due) > 0 && billingStatus !== 'debt') {
      throw new Error('Pembayaran belum lunas. Input pembayaran atau close sebagai utang/debt terlebih dahulu.');
    }
    const todayDate = today();
    const expectedCheckout = normalized.reservations?.check_out_date || normalized.reservations?.checkout_date;
    if (expectedCheckout && todayDate < expectedCheckout && !options.earlyCheckoutApproved) {
      throw new Error('EARLY_CHECKOUT_CONFIRM_REQUIRED');
    }
    const now = new Date().toISOString();
    if (normalized.reservation_id && expectedCheckout && todayDate < expectedCheckout) {
      const { error: dateError } = await requireSupabase().from('reservations').update({ check_out_date: todayDate, checkout_date: todayDate, updated_at: now }).eq('id', normalized.reservation_id);
      raise(dateError);
    }
    const { data, error } = await requireSupabase().from('stays').update({ checkout_at: now, actual_check_out: now, status: 'checked_out', updated_at: now }).eq('id', normalized.id).eq('status', 'checked_in').select(staySelect).single();
    raise(error);
    if (normalized.reservation_id) await reservationsApi.updateStatus({ id: normalized.reservation_id, status: 'checked_in' }, 'checked_out');
    await roomsApi.updateHkStatus({ id: normalized.room_id, fo_status: 'available', hk_status: normalized.rooms?.hk_status || 'OC' }, 'VD', { role: 'manager', allowGroupChange: true });
    if (folio && folio.status !== 'debt') await foliosApi.closeFolio(folio.id).catch((err) => console.warn('Close folio saat check-out gagal:', err.message));
    const invoice = await upsertInvoiceForStay({ ...normalizeStay(data), invoices: normalized.invoices || [] }, true);
    await logAuditEvent('check_out', 'stays', normalized.id, { invoice_id: invoice?.id, folio_id: folio?.id, early_checkout: expectedCheckout && todayDate < expectedCheckout });
    return normalizeStay(data);
  },
  async moveRoom(stay, newRoomId, reason = '', role = '') {
    const normalized = normalizeStay(stay);
    if (!['super_admin', 'manager', 'receptionist'].includes(role)) throw new Error('Role ini tidak boleh melakukan pindah kamar.');
    if (normalized.status !== 'checked_in') throw new Error('Hanya tamu in-house yang bisa dipindah kamar.');
    if (!newRoomId || newRoomId === normalized.room_id) throw new Error('Pilih kamar baru yang berbeda.');
    if (!reason?.trim()) throw new Error('Alasan pindah kamar wajib diisi.');
    const checkInDate = normalized.reservations?.check_in_date || formatLocalDate(normalized.actual_check_in || normalized.checkin_at || today());
    const checkOutDate = normalized.reservations?.check_out_date || addDaysToDate(today(), 1);
    const candidates = await roomsApi.availableForStay({
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      exclude_reservation_id: normalized.reservation_id || ''
    });
    const newRoom = candidates.find((room) => room.id === newRoomId);
    if (!newRoom) throw new Error('Kamar baru tidak ready atau bentrok dengan reservasi/stay lain.');
    const now = new Date().toISOString();
    const oldRoomId = normalized.room_id;
    const { data, error } = await requireSupabase().from('stays').update({ room_id: newRoomId, updated_at: now }).eq('id', normalized.id).eq('status', 'checked_in').select(staySelect).single();
    raise(error);
    if (normalized.reservation_id) {
      const { error: reservationError } = await requireSupabase().from('reservations').update({ room_id: newRoomId, updated_at: now }).eq('id', normalized.reservation_id);
      raise(reservationError);
    }
    await roomsApi.updateHkStatus({ id: oldRoomId, fo_status: 'available', hk_status: normalized.rooms?.hk_status || 'OC' }, 'VD', { role: 'manager', allowGroupChange: true, notes: `Room move: ${reason}` });
    await roomsApi.updateHkStatus(newRoom, 'OR', { role: 'manager', allowGroupChange: true, notes: `Room move: ${reason}` });
    const user = await getCachedAuthUser().catch(() => null);
    try {
      const { error: logError } = await requireSupabase().from('room_move_logs').insert({
        stay_id: normalized.id,
        reservation_id: normalized.reservation_id || null,
        guest_id: normalized.guest_id || normalized.guests?.id || null,
        old_room_id: oldRoomId,
        new_room_id: newRoomId,
        reason: reason.trim(),
        moved_by: user?.id || null
      });
      if (logError) console.warn('Room move log gagal:', logError.message);
    } catch (logError) {
      console.warn('Room move log dilewati:', logError.message);
    }
    await logAuditEvent('room_move', 'stays', normalized.id, { old_room_id: oldRoomId, new_room_id: newRoomId, reason });
    return normalizeStay(data);
  }
};

export function calculateStayBilling(stay, hotel = {}) {
  const reservation = normalizeReservation(stay?.reservations || {});
  const checkin = reservation?.check_in_date || stay?.checkin_at?.slice(0, 10) || stay?.actual_check_in?.slice(0, 10);
  const checkout = reservation?.check_out_date || stay?.checkout_at?.slice(0, 10) || stay?.actual_check_out?.slice(0, 10) || today();
  const nights = nightsBetween(checkin, checkout) || 1;
  const rate = moneyValue(reservation.room_rate || stay?.room_rate || roomRate(stay?.rooms?.room_types));
  const invoice = stay?.invoices?.[0];
  const rawSubtotal = nights * rate;
  const subtotal = invoice?.subtotal != null ? moneyValue(invoice.subtotal) : rawSubtotal;
  const taxAmount = invoice?.tax_amount != null ? moneyValue(invoice.tax_amount) : rawSubtotal * moneyValue(hotel.tax_percent) / 100;
  const serviceAmount = invoice?.service_amount != null ? moneyValue(invoice.service_amount) : rawSubtotal * moneyValue(hotel.service_charge_percent) / 100;
  const depositApplied = invoice?.deposit_applied != null ? moneyValue(invoice.deposit_applied) : Math.min(moneyValue(reservation.deposit_amount ?? stay?.deposit_amount), rawSubtotal + taxAmount + serviceAmount);
  const total = invoice?.total_amount != null ? moneyValue(invoice.total_amount) : Math.max(rawSubtotal + taxAmount + serviceAmount - depositApplied, 0);
  const paid = (stay?.invoices || []).flatMap((item) => item.payments || []).reduce((sum, payment) => sum + moneyValue(payment.amount), 0);
  const balance = Math.max(total - paid, 0);
  const paymentStatus = paid <= 0 ? 'unpaid' : balance > 0 ? 'partial' : 'paid';
  return { nights, roomRate: rate, roomCharge: subtotal, subtotal, taxAmount, serviceAmount, depositApplied, total, paid, balance, paymentStatus };
}

export const billingApi = {
  async list() {
    return staysApi.list();
  },
  async ensureInvoice(stay) {
    return upsertInvoiceForStay(stay, true);
  },
  async recordPayment(stay, { amount, payment_method, reference_number }) {
    const value = moneyValue(amount);
    if (value <= 0) throw new Error('Nominal payment harus lebih dari 0.');
    if (!PAYMENT_METHODS.includes(payment_method)) throw new Error('Metode pembayaran tidak valid.');
    const hotel = await hotelSettingsApi.get().catch(() => ({}));
    let invoice = stay.invoices?.[0] || await upsertInvoiceForStay(stay, true);
    const latestStay = { ...stay, invoices: [{ ...invoice, payments: invoice.payments || [] }] };
    const billing = calculateStayBilling(latestStay, hotel);
    if (value > billing.balance) throw new Error('Payment melebihi balance due. Overpayment belum diaktifkan.');
    const { error: paymentError } = await requireSupabase().from('payments').insert({
      invoice_id: invoice.id,
      payment_method,
      amount: value,
      reference_number: reference_number || null,
      paid_at: new Date().toISOString()
    });
    raise(paymentError);
    const nextPaid = billing.paid + value;
    const nextBalance = Math.max(billing.total - nextPaid, 0);
    const nextStatus = nextPaid <= 0 ? 'unpaid' : nextBalance > 0 ? 'partial' : 'paid';
    const { error: invoiceError } = await requireSupabase().from('invoices').update({
      subtotal: billing.subtotal,
      tax_amount: billing.taxAmount,
      service_amount: billing.serviceAmount,
      deposit_applied: billing.depositApplied,
      total_amount: billing.total,
      balance_due: nextBalance,
      status: nextStatus,
      updated_at: new Date().toISOString()
    }).eq('id', invoice.id);
    raise(invoiceError);
    await logAuditEvent('add_payment', 'invoices', invoice.id, { amount: value, payment_method });
  }
};

export const housekeepingApi = {
  async rolloverOccupiedRoomStatuses() {
    const date = today();
    const [rooms, activeStays] = await Promise.all([roomsApi.list(), staysApi.active().catch(() => [])]);
    const checkedInRoomIds = new Set(activeStays.map((stay) => stay.room_id).filter(Boolean));
    const staleOccupiedRooms = rooms.filter((room) => {
      if (!checkedInRoomIds.has(room.id)) return false;
      if (!['OR', 'OC'].includes(room.hk_status)) return false;
      const roomDate = formatLocalDate(room.updated_at || room.created_at);
      if (room.hk_status === 'OR') {
        const stay = activeStays.find((item) => item.room_id === room.id);
        const checkInDate = formatLocalDate(stay?.actual_check_in || stay?.checkin_at || stay?.reservations?.check_in_date);
        return checkInDate && checkInDate < date;
      }
      return roomDate && roomDate < date;
    });
    await Promise.all(staleOccupiedRooms.map((room) => roomsApi.updateHkStatus(room, 'OD', { role: 'manager', allowGroupChange: true, notes: 'Auto rollover occupied room to dirty for new hotel day' }).catch(() => null)));
    return staleOccupiedRooms.length;
  },
  async rooms({ hkStatus = 'all', floor = '', roomTypeId = '' } = {}) {
    await this.rolloverOccupiedRoomStatuses().catch((error) => console.warn('HK rollover gagal:', error.message));
    let rooms = await roomsApi.list();
    if (hkStatus !== 'all') rooms = rooms.filter((room) => room.hk_status === hkStatus);
    if (floor) rooms = rooms.filter((room) => String(room.floor || '') === String(floor));
    if (roomTypeId) rooms = rooms.filter((room) => room.room_type_id === roomTypeId);
    return rooms;
  },
  async updateRoomStatus(room, hk_status, options = {}) {
    return roomsApi.updateHkStatus(room, hk_status, options);
  },
  async bulkUpdate(rooms, hk_status, options = {}) {
    if (!Array.isArray(rooms) || rooms.length === 0) throw new Error('Pilih kamar untuk bulk update.');
    return roomsApi.bulkUpdateHkStatus(rooms.map((room) => room.id), hk_status, options.notes || '', options.role || '');
  }
};

export const maintenanceApi = {
  async list() {
    const { data, error } = await requireSupabase().from('maintenance_reports').select(`*, rooms(${roomSelect}), profiles(id, full_name)`).order('created_at', { ascending: false });
    raise(error);
    return data || [];
  },
  async create({ room_id, issue }) {
    const { data, error } = await requireSupabase().from('maintenance_reports').insert({ room_id, issue, status: 'reported' }).select(`*, rooms(${roomSelect})`).single();
    raise(error);
    await roomsApi.updateHkStatus({ id: room_id, fo_status: 'available' }, 'OOS', { role: 'manager', notes: issue || 'Maintenance reported' });
    await logAuditEvent('create_maintenance', 'maintenance_reports', data.id, { room_id, issue });
    return data;
  },
  async updateStatus(report, status, fix_notes = '') {
    const now = new Date().toISOString();
    const { data, error } = await requireSupabase().from('maintenance_reports').update({ status, fix_notes, updated_at: now }).eq('id', report.id).select(`*, rooms(${roomSelect})`).single();
    raise(error);
    if (status === 'done') await roomsApi.updateHkStatus({ id: report.room_id, fo_status: 'unavailable' }, 'VD', { role: 'manager', notes: fix_notes || 'Maintenance done', fo_status: 'available' });
    await logAuditEvent('update_maintenance_status', 'maintenance_reports', report.id, { status });
    return data;
  }
};


export const roomChartApi = {
  async getRoomChartData({ startDate = today(), days = 7, roomTypeId = '', floor = '', status = 'all' } = {}) {
    const dateRange = buildRoomChartDateRange(startDate, days);
    const endExclusive = addDaysToDate(dateRange[dateRange.length - 1], 1);
    const [rooms, reservations, stays, maintenance] = await Promise.all([
      roomsApi.list({ includeInactive: false, roomTypeId }),
      reservationsApi.list({ status: 'all', startDate, endDate: endExclusive }).catch(() => []),
      staysApi.list().catch(() => []),
      maintenanceApi.list().catch(() => [])
    ]);
    const filteredRooms = rooms.filter((room) => !floor || String(room.floor || '') === String(floor));
    const rows = filteredRooms.map((room) => {
      const cells = buildRoomChartCells(room, dateRange, { reservations, stays, maintenance });
      const blocks = mergeRoomChartCells(cells);
      return { room, cells, blocks };
    }).filter((row) => status === 'all' || row.cells.some((cell) => cell.status === status));
    const roomTypes = [...new Map(rooms.map((room) => room.room_types).filter(Boolean).map((type) => [type.id, type])).values()];
    const floors = [...new Set(rooms.map((room) => room.floor).filter(Boolean).map(String))].sort();
    return { dateRange, rows, roomTypes, floors };
  }
};

export const forecastApi = {
  async byDateRange(startDate, endDate) {
    const dates = eachDate(startDate, endDate);
    if (!dates.length) throw new Error('Rentang tanggal tidak valid.');
    const [rooms, reservations, stays] = await Promise.all([roomsApi.list(), reservationsApi.list().catch(() => []), staysApi.list().catch(() => [])]);
    const activeRooms = rooms.filter((room) => room.is_active !== false);
    const rows = dates.map((date) => {
      const total_rooms = activeRooms.length;
      const ooo_rooms = activeRooms.filter((room) => room.hk_status === 'OOO').length;
      const oos_rooms = activeRooms.filter((room) => room.hk_status === 'OOS').length;
      const inventory_rooms = activeRooms.filter((room) => room.fo_status === 'available').length;
      const actualOccupied = new Set(stays.filter((stay) => {
        const reservation = normalizeReservation(stay.reservations || {});
        const inDate = reservation.check_in_date || stay.checkin_at?.slice(0, 10) || stay.actual_check_in?.slice(0, 10);
        const outDate = (stay.checkout_at || stay.actual_check_out || reservation.check_out_date || '').slice(0, 10);
        return stay.status === 'checked_in' && inDate <= date && (!outDate || outDate > date);
      }).map((stay) => stay.room_id));
      const committed = new Set(reservations.filter((reservation) => reservation.room_id && ['reserved', 'checked_in'].includes(reservation.status) && reservation.check_in_date <= date && reservation.check_out_date > date).map((reservation) => reservation.room_id));
      const occupied_rooms = new Set([...actualOccupied, ...committed]).size;
      const expected_arrival = reservations.filter((reservation) => reservation.check_in_date === date && reservation.status === 'reserved').length;
      const expected_departure = reservations.filter((reservation) => reservation.check_out_date === date && ['checked_in', 'reserved'].includes(reservation.status)).length;
      const arrival = stays.filter((stay) => String(stay.actual_check_in || stay.checkin_at || '').slice(0, 10) === date).length;
      const departure = stays.filter((stay) => String(stay.actual_check_out || stay.checkout_at || '').slice(0, 10) === date).length;
      const available_rooms = inventory_rooms - occupied_rooms;
      const occupancy_percentage = inventory_rooms ? Math.round((occupied_rooms / inventory_rooms) * 10000) / 100 : 0;
      const warning = available_rooms < 0 ? 'Available negatif: cek double booking atau oversell unassigned.' : '';
      return { date, total_rooms, inventory_rooms, ooo_rooms, oos_rooms, occupied_rooms, expected_arrival, expected_departure, arrival, departure, available_rooms, occupancy_percentage, warning };
    });
    const totals = rows.reduce((acc, row) => {
      Object.entries(row).forEach(([key, value]) => {
        if (typeof value === 'number') acc[key] = (acc[key] || 0) + value;
      });
      return acc;
    }, {});
    const average_occupancy_percentage = rows.length ? Math.round((totals.occupancy_percentage / rows.length) * 100) / 100 : 0;
    return { rows, summary: { ...totals, days: rows.length, average_occupancy_percentage } };
  }
};


export const profilesApi = {
  async list({ search = '', role = 'all', status = 'all' } = {}) {
    let query = requireSupabase().from('profiles').select('*').order('created_at', { ascending: false });
    if (role !== 'all') query = query.eq('role', role);
    if (status === 'active') query = query.eq('is_active', true);
    if (status === 'inactive') query = query.eq('is_active', false);
    const { data, error } = await query;
    raise(error);
    let rows = data || [];
    if (search?.trim()) {
      const value = search.trim().toLowerCase();
      rows = rows.filter((profile) => [profile.email, profile.full_name, profile.phone, profile.role].some((field) => String(field || '').toLowerCase().includes(value)));
    }
    return rows;
  },
  async createProfile(payload, role = '') {
    assertSuperAdmin(role);
    if (!payload.email?.trim()) throw new Error('Email wajib diisi.');
    if (!payload.id?.trim()) throw new Error('User ID wajib diisi.');
    const body = {
      id: payload.id.trim(),
      email: payload.email.trim().toLowerCase(),
      full_name: payload.full_name?.trim() || payload.email.trim(),
      phone: payload.phone?.trim() || null,
      role: payload.role || 'receptionist',
      is_active: payload.is_active ?? true,
      updated_at: new Date().toISOString()
    };
    Object.keys(body).forEach((key) => body[key] === undefined && delete body[key]);
    const { data, error } = await requireSupabase().from('profiles').insert(body).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal membuat user. Pastikan data user lengkap dan role Anda memiliki izin.'));
    await logAuditEvent('create_profile_user', 'profiles', data.id, body);
    return data;
  },
  async updateProfile(id, payload, role = '') {
    assertSuperAdmin(role);
    const body = {
      email: payload.email?.trim()?.toLowerCase() || null,
      full_name: payload.full_name?.trim() || null,
      phone: payload.phone?.trim() || null,
      role: payload.role,
      is_active: payload.is_active,
      updated_at: new Date().toISOString()
    };
    Object.keys(body).forEach((key) => body[key] === undefined && delete body[key]);
    const { data, error } = await requireSupabase().from('profiles').update(body).eq('id', id).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal update profile user.'));
    await logAuditEvent('update_profile_user', 'profiles', id, body);
    return data;
  }
};

export const reportsApi = {
  async summary(date = today()) {
    const forecast = await forecastApi.byDateRange(date, date);
    const todayRow = forecast.rows[0] || {};
    const [rooms, folios] = await Promise.all([roomsApi.list().catch(() => []), foliosApi.list().catch(() => [])]);
    const payments = folios.flatMap((folio) => folio.folio_payments || []);
    const revenueToday = payments.filter((payment) => payment.payment_type === 'payment' && payment.paid_at?.slice(0, 10) === date).reduce((total, payment) => total + moneyValue(payment.amount), 0);
    const outstandingBalance = folios.filter((folio) => folio.status === 'debt' || moneyValue(folio.balance_due) > 0).reduce((total, folio) => total + moneyValue(folio.balance_due), 0);
    return {
      totalRooms: todayRow.total_rooms || 0,
      inventoryRooms: todayRow.inventory_rooms || 0,
      occupied: todayRow.occupied_rooms || 0,
      available: todayRow.available_rooms || 0,
      dirty: rooms.filter((room) => ['VD', 'OD'].includes(room.hk_status)).length,
      oooRooms: todayRow.ooo_rooms || 0,
      oosRooms: todayRow.oos_rooms || 0,
      maintenance: (todayRow.ooo_rooms || 0) + (todayRow.oos_rooms || 0),
      revenueToday,
      outstandingBalance,
      arrivalsToday: todayRow.expected_arrival || 0,
      departuresToday: todayRow.expected_departure || 0
    };
  },
  async byDateRange(startDate, endDate) {
    const [forecast, rooms, reservations, folios] = await Promise.all([
      forecastApi.byDateRange(startDate, endDate),
      roomsApi.list().catch(() => []),
      reservationsApi.list({ startDate, endDate }).catch(() => []),
      foliosApi.list().catch(() => [])
    ]);
    const payments = folios.flatMap((folio) => folio.folio_payments || []);
    const revenuePayments = payments.filter((payment) => payment.payment_type === 'payment');
    const refundPayments = payments.filter((payment) => payment.payment_type === 'refund');
    const methods = PAYMENT_METHODS.map((method) => ({ method, amount: revenuePayments.filter((payment) => payment.payment_method === method).reduce((total, payment) => total + moneyValue(payment.amount), 0) }));
    return {
      occupancy: forecast.rows,
      revenue: {
        invoice_total: folios.reduce((total, folio) => total + moneyValue(folio.grand_total), 0),
        payment_collected: revenuePayments.reduce((total, payment) => total + moneyValue(payment.amount), 0),
        outstanding_balance: folios.reduce((total, folio) => total + moneyValue(folio.balance_due), 0),
        refund_total: refundPayments.reduce((total, payment) => total + moneyValue(payment.amount), 0),
        cancellation_total: folios.flatMap((folio) => folio.folio_items || []).filter((item) => item.item_type === 'cancellation_fee' && item.is_void !== true).reduce((total, item) => total + moneyValue(item.line_total), 0),
        payment_methods: methods
      },
      arrivalsDepartures: {
        expected_arrival: reservations.filter((reservation) => reservation.status === 'reserved').length,
        expected_departure: reservations.filter((reservation) => ['reserved', 'checked_in'].includes(reservation.status)).length,
        checked_in: reservations.filter((reservation) => reservation.status === 'checked_in').length,
        checked_out: reservations.filter((reservation) => reservation.status === 'checked_out').length
      },
      roomStatus: {
        fo: FO_STATUSES.map((status) => ({ status, count: rooms.filter((room) => room.fo_status === status).length })),
        hk: HK_STATUSES.map((status) => ({ status, count: rooms.filter((room) => room.hk_status === status).length }))
      }
    };
  }
};

export const settingsApi = {
  async hotel() {
    return hotelSettingsApi.get();
  }
};

export const dashboardApi = {
  async stats() {
    return reportsApi.summary();
  },
  async todayLists(date = today()) {
    const [reservations, stays, folios] = await Promise.all([
      reservationsApi.list({ startDate: date, endDate: date }).catch(() => []),
      staysApi.list().catch(() => []),
      foliosApi.list().catch(() => [])
    ]);
    const folioFor = (row) => folios.find((folio) => folio.id === (row.folio_id || row.reservations?.folio_id)) || null;
    const withFolio = (row) => ({ ...row, folios: row.folios || folioFor(row) });
    return {
      expectedCheckins: reservations.filter((reservation) => reservation.check_in_date === date && reservation.status === 'reserved').map(withFolio),
      expectedCheckouts: reservations.filter((reservation) => reservation.check_out_date === date && ['reserved', 'checked_in'].includes(reservation.status)).map(withFolio),
      actualArrivals: stays.filter((stay) => String(stay.actual_check_in || stay.checkin_at || '').slice(0, 10) === date).map(withFolio),
      actualDepartures: stays.filter((stay) => String(stay.actual_check_out || stay.checkout_at || '').slice(0, 10) === date).map(withFolio)
    };
  }
};
