import { requireSupabase } from '../config/supabase';

export const FO_STATUSES = ['available', 'unavailable'];
export const HK_STATUSES = ['VR', 'VC', 'VD', 'OR', 'OC', 'OD', 'OOO', 'OOS', 'DND', 'SLEEP OUT', 'ONL'];
export const ROOM_STATUSES = ['available', 'unavailable', ...HK_STATUSES];
export const RESERVATION_STATUSES = ['reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show'];
export const INVOICE_STATUSES = ['unpaid', 'partial', 'paid', 'refunded'];
export const PAYMENT_METHODS = ['cash', 'transfer', 'qris', 'debit', 'credit'];

export const today = () => new Date().toISOString().slice(0, 10);
const reservationCode = () => `RSV-${Date.now()}`;
const invoiceNumber = (prefix = 'INV') => `${prefix || 'INV'}-${Date.now()}`;
const moneyValue = (value) => Number(value || 0);
export const isOutOfInventoryHk = (status) => ['OOO', 'OOS'].includes(status);
export const isOccupiedHk = (status) => ['OR', 'OC', 'OD', 'DND', 'SLEEP OUT'].includes(status);

function raise(error) {
  if (error) throw new Error(error.message || 'Terjadi kesalahan saat mengambil data Supabase.');
}

function parsePgError(error, fallback) {
  if (!error) return fallback;
  if (error.code === '23505') return 'Data sudah ada. Periksa nomor kamar, kode, NIK, atau nomor reservasi yang harus unique.';
  if (error.code === '23514') return 'Data tidak memenuhi validasi database. Periksa status, tanggal, dan nominal.';
  return error.message || fallback;
}

export function nightsBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = Math.ceil((end - start) / 86400000);
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

function eachDate(startDate, endDate) {
  const dates = [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return dates;
  for (const current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    dates.push(current.toISOString().slice(0, 10));
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
    reservations: normalizeReservation(stay.reservations)
  };
}

function normalizeRoomPayload(payload) {
  const hkStatus = payload.hk_status || 'VC';
  if (!HK_STATUSES.includes(hkStatus)) throw new Error('Status HK tidak valid.');
  const foStatus = isOutOfInventoryHk(hkStatus) ? 'unavailable' : (payload.fo_status || 'available');
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
const staySelect = '*, guests(*), rooms(*, room_types(*)), reservations(*), invoices(*, invoice_items(*), payments(*))';

export async function logAuditEvent(action, entityType, entityId, changes = {}) {
  try {
    const { data: userData } = await requireSupabase().auth.getUser();
    const { error } = await requireSupabase().from('audit_logs').insert({
      action,
      table_name: entityType,
      record_id: entityId || null,
      actor_id: userData?.user?.id || null,
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
      hotel_name: 'Hotel', address: '', phone: '', tax_percent: 0, service_charge_percent: 0,
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
    if (availableOnly) query = query.eq('fo_status', 'available').not('hk_status', 'in', '(OOO,OOS)');
    if (roomTypeId) query = query.eq('room_type_id', roomTypeId);
    const { data, error } = await query;
    raise(error);
    return (data || []).map(normalizeRoom);
  },
  async availableForStay({ check_in_date, check_out_date, room_type_id = '', exclude_reservation_id = '' }) {
    const rooms = await this.list({ availableOnly: true, roomTypeId: room_type_id });
    const active = await reservationsApi.list().catch(() => []);
    return rooms.filter((room) => !active.some((reservation) => {
      if (!reservation.room_id || reservation.room_id !== room.id) return false;
      if (exclude_reservation_id && reservation.id === exclude_reservation_id) return false;
      if (!['reserved', 'checked_in'].includes(reservation.status)) return false;
      return datesOverlap(reservation.check_in_date, reservation.check_out_date, check_in_date, check_out_date);
    }));
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
    if (!['super_admin', 'manager'].includes(role)) throw new Error('Hanya manager/super admin yang boleh mengubah FO status.');
    if (!FO_STATUSES.includes(fo_status)) throw new Error('Status FO tidak valid.');
    const { data, error } = await requireSupabase().from('rooms').update({ fo_status, status: fo_status, updated_at: new Date().toISOString() }).eq('id', id).select(roomSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal memperbarui status FO.'));
    await logAuditEvent('update_room_fo_status', 'rooms', id, { fo_status });
    return normalizeRoom(data);
  },
  async updateHkStatus(room, hk_status, { role, notes = '', fo_status } = {}) {
    if (!HK_STATUSES.includes(hk_status)) throw new Error('Status HK tidak valid.');
    const normalized = normalizeRoom(room);
    const privileged = ['super_admin', 'manager'].includes(role);
    if (role === 'cashier') throw new Error('Cashier tidak boleh mengubah status kamar.');
    if (normalized.fo_status === 'unavailable' && !privileged) throw new Error('Housekeeping hanya boleh mengubah HK status pada kamar FO available.');
    if (['OOO', 'OOS'].includes(hk_status) && !privileged) throw new Error('OOO/OOS hanya boleh diset manager atau super admin.');
    if (['OOO', 'OOS'].includes(hk_status) && !notes?.trim()) throw new Error('Catatan wajib diisi untuk status OOO/OOS.');
    const nextFo = isOutOfInventoryHk(hk_status) ? 'unavailable' : (privileged && fo_status ? fo_status : normalized.fo_status);
    const body = { hk_status, fo_status: nextFo, status: nextFo, updated_at: new Date().toISOString() };
    if (notes) body.notes = notes;
    const { data, error } = await requireSupabase().from('rooms').update(body).eq('id', normalized.id).select(roomSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal memperbarui status HK.'));
    await logAuditEvent('update_room_hk_status', 'rooms', normalized.id, body);
    return normalizeRoom(data);
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
    if (normalized.is_active === false || normalized.fo_status !== 'available' || isOutOfInventoryHk(normalized.hk_status)) {
      throw new Error('Kamar tidak tersedia karena inactive, FO unavailable, atau OOO/OOS.');
    }
    if (payload.room_type_id && normalized.room_type_id !== payload.room_type_id) throw new Error('Kamar tidak sesuai dengan room type yang dipilih.');
    const { data, error } = await requireSupabase().from('reservations').select('id,reservation_code,reservation_number,check_in_date,check_out_date,status').eq('room_id', payload.room_id).in('status', ['reserved', 'checked_in']);
    raise(error);
    const conflict = (data || []).find((reservation) => reservation.id !== id && datesOverlap(reservation.check_in_date, reservation.check_out_date, payload.check_in_date, payload.check_out_date));
    if (conflict) throw new Error(`Double booking ditolak. Kamar sudah dipakai oleh ${conflict.reservation_code || conflict.reservation_number}.`);
  }
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
  async create(payload) {
    const reservationPayload = await this.buildPayload(payload);
    await validateReservation(reservationPayload);
    const { data, error } = await requireSupabase().from('reservations').insert(reservationPayload).select(reservationSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal membuat reservasi.'));
    await logAuditEvent('create_reservation', 'reservations', data.id, reservationPayload);
    return normalizeReservation(data);
  },
  async update(id, payload) {
    const reservationPayload = await this.buildPayload(payload, id);
    Object.keys(reservationPayload).forEach((key) => reservationPayload[key] === undefined && delete reservationPayload[key]);
    await validateReservation(reservationPayload, id);
    const { data, error } = await requireSupabase().from('reservations').update({ ...reservationPayload, updated_at: new Date().toISOString() }).eq('id', id).select(reservationSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal memperbarui reservasi.'));
    await logAuditEvent('update_reservation', 'reservations', id, reservationPayload);
    return normalizeReservation(data);
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
      nights,
      adults: Number(input.adults || 1),
      children: Number(input.children || 0),
      status: input.status || 'reserved',
      deposit_amount: moneyValue(input.deposit_amount),
      room_rate: moneyValue(input.room_rate || roomRate(roomType)),
      special_notes: input.special_notes || input.notes || null,
      notes: input.notes || input.special_notes || null
    };
  },
  async createLegacy({ guest_name, phone, room_id, check_in_date, check_out_date, status = 'reserved', deposit_amount = 0 }) {
    const { data: room, error: roomError } = await requireSupabase().from('rooms').select('id, room_type_id, room_types(*)').eq('id', room_id).single();
    raise(roomError);
    const { data: guest, error: guestError } = await requireSupabase().from('guests').insert({ full_name: guest_name, phone, is_active: true }).select('id').single();
    raise(guestError);
    return this.create({ guest_id: guest.id, room_id, room_type_id: room.room_type_id, check_in_date, check_out_date, status, deposit_amount, room_rate: roomRate(room.room_types) });
  },
  async updateStatus(reservation, status) {
    const current = typeof reservation === 'object' ? reservation : { id: reservation };
    if (!RESERVATION_STATUSES.includes(status)) throw new Error('Status reservasi tidak valid.');
    if (current.status === 'checked_out' && status !== 'checked_out') throw new Error('Reservasi checked-out tidak boleh diubah statusnya.');
    if (['cancelled', 'no_show'].includes(status) && current.status === 'checked_out') throw new Error('Reservasi checked-out tidak bisa dibatalkan/no-show.');
    const { data, error } = await requireSupabase().from('reservations').update({ status, updated_at: new Date().toISOString() }).eq('id', current.id).select(reservationSelect).single();
    raise(error);
    await logAuditEvent(status === 'cancelled' ? 'cancel_reservation' : `mark_reservation_${status}`, 'reservations', current.id, { status });
    return normalizeReservation(data);
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
    await roomsApi.updateHkStatus({ id: room_id, fo_status: 'available' }, 'OC', { role: 'manager' });
    await logAuditEvent('check_in', 'stays', stay.id, { reservation_id: normalized.id, room_id });
    return normalizeStay(stay);
  },
  async checkOut(stay) {
    const normalized = normalizeStay(stay);
    if (normalized.status !== 'checked_in') throw new Error('Hanya stay checked_in yang bisa check-out.');
    const now = new Date().toISOString();
    const { data, error } = await requireSupabase().from('stays').update({ checkout_at: now, actual_check_out: now, status: 'checked_out', updated_at: now }).eq('id', normalized.id).eq('status', 'checked_in').select(staySelect).single();
    raise(error);
    if (normalized.reservation_id) await reservationsApi.updateStatus({ id: normalized.reservation_id, status: 'checked_in' }, 'checked_out');
    await roomsApi.updateHkStatus({ id: normalized.room_id, fo_status: 'available' }, 'VD', { role: 'manager' });
    const invoice = await upsertInvoiceForStay({ ...normalizeStay(data), invoices: normalized.invoices || [] }, true);
    await logAuditEvent('check_out', 'stays', normalized.id, { invoice_id: invoice?.id });
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
  async rooms({ hkStatus = 'all', floor = '', roomTypeId = '' } = {}) {
    let rooms = await roomsApi.list();
    if (hkStatus !== 'all') rooms = rooms.filter((room) => room.hk_status === hkStatus);
    if (floor) rooms = rooms.filter((room) => String(room.floor || '') === String(floor));
    if (roomTypeId) rooms = rooms.filter((room) => room.room_type_id === roomTypeId);
    return rooms;
  },
  async updateRoomStatus(room, hk_status, options = {}) {
    return roomsApi.updateHkStatus(room, hk_status, options);
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
      const available_rooms = inventory_rooms - occupied_rooms;
      const occupancy_percentage = inventory_rooms ? Math.round((occupied_rooms / inventory_rooms) * 10000) / 100 : 0;
      const warning = available_rooms < 0 ? 'Available negatif: cek double booking atau oversell unassigned.' : '';
      return { date, total_rooms, inventory_rooms, ooo_rooms, oos_rooms, occupied_rooms, expected_arrival, expected_departure, available_rooms, occupancy_percentage, warning };
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

export const reportsApi = {
  async summary(date = today()) {
    const forecast = await forecastApi.byDateRange(date, date);
    const todayRow = forecast.rows[0] || {};
    const [rooms, stays] = await Promise.all([roomsApi.list().catch(() => []), staysApi.list().catch(() => [])]);
    const invoices = stays.flatMap((stay) => stay.invoices || []);
    const payments = invoices.flatMap((invoice) => invoice.payments || []);
    const revenueToday = payments.filter((payment) => payment.paid_at?.slice(0, 10) === date).reduce((total, payment) => total + moneyValue(payment.amount), 0);
    const outstandingBalance = invoices.reduce((total, invoice) => total + moneyValue(invoice.balance_due), 0);
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
    const [forecast, stays, rooms, reservations] = await Promise.all([
      forecastApi.byDateRange(startDate, endDate),
      staysApi.list().catch(() => []),
      roomsApi.list().catch(() => []),
      reservationsApi.list({ startDate, endDate }).catch(() => [])
    ]);
    const invoices = stays.flatMap((stay) => stay.invoices || []);
    const payments = invoices.flatMap((invoice) => invoice.payments || []);
    return {
      occupancy: forecast.rows,
      revenue: {
        invoice_total: invoices.reduce((total, invoice) => total + moneyValue(invoice.total_amount), 0),
        payment_collected: payments.reduce((total, payment) => total + moneyValue(payment.amount), 0),
        outstanding_balance: invoices.reduce((total, invoice) => total + moneyValue(invoice.balance_due), 0)
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
  }
};
