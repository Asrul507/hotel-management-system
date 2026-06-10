import { requireSupabase } from '../config/supabase';

export const FO_STATUSES = ['available', 'unavailable'];
export const HK_STATUSES = ['VR', 'VC', 'VD', 'OR', 'OC', 'OD', 'OOO', 'OOS', 'DND', 'SLEEP OUT', 'ONL'];
export const ROOM_STATUSES = ['available', 'unavailable', ...HK_STATUSES];
export const RESERVATION_STATUSES = ['reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show'];
export const PAYMENT_METHODS = ['cash', 'transfer', 'qris', 'debit', 'credit'];

const today = () => new Date().toISOString().slice(0, 10);
const reservationCode = () => `RSV-${Date.now()}`;
const invoiceNumber = () => `INV-${Date.now()}`;
const moneyValue = (value) => Number(value || 0);
const isOutOfInventoryHk = (status) => ['OOO', 'OOS'].includes(status);

function raise(error) {
  if (error) throw new Error(error.message || 'Terjadi kesalahan saat mengambil data Supabase.');
}

function parsePgError(error, fallback) {
  if (!error) return fallback;
  if (error.code === '23505') return 'Data sudah ada. Periksa kembali nomor kamar, kode, NIK, atau nomor reservasi yang harus unique.';
  return error.message || fallback;
}

function nightsBetween(startDate, endDate) {
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
  if (['maintenance', 'out_of_order'].includes(room?.status)) return 'unavailable';
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

function normalizeRoom(room) {
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
  return {
    code: payload.code?.trim().toUpperCase(),
    name: payload.name?.trim(),
    description: payload.description || null,
    base_rate: moneyValue(payload.base_rate ?? payload.base_price),
    base_price: moneyValue(payload.base_rate ?? payload.base_price),
    max_occupancy: Number(payload.max_occupancy || 2),
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
const reservationSelect = `
  *,
  guests(*),
  rooms(${roomSelect}),
  room_types(*)
`;
const staySelect = `
  *,
  guests(*),
  rooms(${roomSelect}),
  reservations(*),
  invoices(id, invoice_number, status, total_amount, balance_due, payments(id, payment_method, amount, paid_at, reference_number))
`;

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
    return data;
  },
  async update(id, payload) {
    const { data, error } = await requireSupabase().from('room_types').update(normalizeRoomTypePayload(payload)).eq('id', id).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal memperbarui tipe kamar.'));
    return data;
  }
};

export const roomsApi = {
  async list({ includeInactive = true } = {}) {
    let query = requireSupabase().from('rooms').select(roomSelect).order('room_number');
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    raise(error);
    return (data || []).map(normalizeRoom);
  },
  async create(payload) {
    if (!payload.room_number?.trim()) throw new Error('Nomor kamar wajib diisi.');
    if (!payload.room_type_id) throw new Error('Tipe kamar wajib dipilih.');
    const { data, error } = await requireSupabase().from('rooms').insert(normalizeRoomPayload(payload)).select(roomSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal membuat kamar.'));
    return normalizeRoom(data);
  },
  async update(id, payload) {
    const { data, error } = await requireSupabase().from('rooms').update(normalizeRoomPayload(payload)).eq('id', id).select(roomSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal memperbarui kamar.'));
    return normalizeRoom(data);
  },
  async updateFoStatus(id, fo_status) {
    if (!FO_STATUSES.includes(fo_status)) throw new Error('Status FO tidak valid.');
    const { data, error } = await requireSupabase().from('rooms').update({ fo_status, status: fo_status, updated_at: new Date().toISOString() }).eq('id', id).select(roomSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal memperbarui status FO.'));
    return normalizeRoom(data);
  },
  async updateHkStatus(room, hk_status, { role } = {}) {
    if (!HK_STATUSES.includes(hk_status)) throw new Error('Status HK tidak valid.');
    const normalized = normalizeRoom(room);
    const canOverrideUnavailable = ['super_admin', 'manager'].includes(role);
    if (normalized.fo_status === 'unavailable' && !canOverrideUnavailable) {
      throw new Error('Status HK hanya boleh diubah pada kamar dengan FO status available.');
    }
    const fo_status = isOutOfInventoryHk(hk_status) ? 'unavailable' : normalized.fo_status;
    const { data, error } = await requireSupabase().from('rooms').update({ hk_status, fo_status, status: fo_status, updated_at: new Date().toISOString() }).eq('id', normalized.id).select(roomSelect).single();
    if (error) throw new Error(parsePgError(error, 'Gagal memperbarui status HK.'));
    return normalizeRoom(data);
  },
  async updateStatus(id, status) {
    if (FO_STATUSES.includes(status)) return this.updateFoStatus(id, status);
    if (['maintenance', 'out_of_order'].includes(status)) {
      return this.updateHkStatus({ id, fo_status: 'available' }, status === 'out_of_order' ? 'OOO' : 'OOS', { role: 'manager' });
    }
    return this.updateFoStatus(id, status === 'available' ? 'available' : 'unavailable');
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
    return data;
  },
  async update(id, payload) {
    if (!payload.full_name?.trim()) throw new Error('Nama lengkap tamu wajib diisi.');
    const { data, error } = await requireSupabase().from('guests').update(normalizeGuestPayload(payload)).eq('id', id).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal memperbarui data tamu.'));
    return data;
  },
  async archive(id) {
    const { data, error } = await requireSupabase().from('guests').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    if (error) throw new Error(parsePgError(error, 'Gagal mengarsipkan tamu.'));
    return data;
  }
};

export const reservationsApi = {
  async list() {
    const { data, error } = await requireSupabase().from('reservations').select(reservationSelect).order('check_in_date', { ascending: false });
    raise(error);
    return (data || []).map(normalizeReservation);
  },
  async arrivals(date = today()) {
    const { data, error } = await requireSupabase().from('reservations').select(reservationSelect).eq('check_in_date', date).in('status', ['reserved', 'booked', 'confirmed']).order('created_at');
    raise(error);
    return (data || []).map(normalizeReservation);
  },
  async create({ guest_name, phone, room_id, check_in_date, check_out_date, status = 'reserved', deposit_amount = 0 }) {
    const { data: room, error: roomError } = await requireSupabase().from('rooms').select('id, room_type_id, room_types(*)').eq('id', room_id).single();
    raise(roomError);

    const { data: guest, error: guestError } = await requireSupabase().from('guests').insert({ full_name: guest_name, phone, is_active: true }).select('id').single();
    raise(guestError);

    const reservation_number = reservationCode();
    const payload = {
      reservation_number,
      reservation_code: reservation_number,
      guest_id: guest.id,
      room_id,
      room_type_id: room.room_type_id,
      check_in_date,
      check_out_date,
      checkin_date: check_in_date,
      checkout_date: check_out_date,
      status,
      deposit_amount: Number(deposit_amount || 0),
      room_rate: roomRate(room.room_types)
    };
    const { data, error } = await requireSupabase().from('reservations').insert(payload).select(reservationSelect).single();
    raise(error);
    return normalizeReservation(data);
  },
  async updateStatus(id, status) {
    const { data, error } = await requireSupabase().from('reservations').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select(reservationSelect).single();
    raise(error);
    return normalizeReservation(data);
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
  async checkIn(reservation) {
    const now = new Date().toISOString();
    const { data: stay, error } = await requireSupabase().from('stays').insert({
      reservation_id: reservation.id,
      guest_id: reservation.guest_id,
      room_id: reservation.room_id,
      deposit_amount: Number(reservation.deposit_amount || 0),
      checkin_at: now,
      actual_check_in: now,
      status: 'checked_in'
    }).select(staySelect).single();
    raise(error);

    await reservationsApi.updateStatus(reservation.id, 'checked_in');
    await roomsApi.updateHkStatus({ id: reservation.room_id, fo_status: 'available' }, 'OC', { role: 'manager' });
    return normalizeStay(stay);
  },
  async checkOut(stay) {
    const now = new Date().toISOString();
    const { data, error } = await requireSupabase().from('stays').update({ checkout_at: now, actual_check_out: now, status: 'checked_out', updated_at: now }).eq('id', stay.id).select(staySelect).single();
    raise(error);

    if (stay.reservation_id) await reservationsApi.updateStatus(stay.reservation_id, 'checked_out');
    await roomsApi.updateHkStatus({ id: stay.room_id, fo_status: 'available' }, 'VD', { role: 'manager' });
    return normalizeStay(data);
  }
};

export const billingApi = {
  async list() {
    return staysApi.list();
  },
  async recordPayment(stay, { amount, payment_method, reference_number }) {
    const billing = calculateStayBilling(stay);
    const total = billing.roomCharge;
    let invoice = stay.invoices?.[0];

    if (!invoice) {
      const { data, error } = await requireSupabase().from('invoices').insert({
        stay_id: stay.id,
        invoice_number: invoiceNumber(),
        subtotal: total,
        total_amount: total,
        deposit_applied: Number(stay.deposit_amount || 0),
        balance_due: Math.max(total - Number(amount || 0), 0),
        status: Number(amount || 0) >= total ? 'paid' : 'partial'
      }).select('id, invoice_number').single();
      raise(error);
      invoice = data;
    }

    const { error: paymentError } = await requireSupabase().from('payments').insert({
      invoice_id: invoice.id,
      payment_method,
      amount: Number(amount || 0),
      reference_number
    });
    raise(paymentError);

    const nextPaid = billing.paid + Number(amount || 0);
    const nextBalance = Math.max(total - nextPaid, 0);
    const nextStatus = nextPaid <= 0 ? 'unpaid' : nextBalance > 0 ? 'partial' : 'paid';
    const { error: invoiceError } = await requireSupabase().from('invoices').update({
      subtotal: total,
      total_amount: total,
      balance_due: nextBalance,
      status: nextStatus,
      updated_at: new Date().toISOString()
    }).eq('id', invoice.id);
    raise(invoiceError);
  }
};

export const housekeepingApi = {
  async rooms(status = 'all') {
    const rooms = await roomsApi.list();
    if (status === 'all') return rooms;
    return rooms.filter((room) => room.hk_status === status || room.fo_status === status);
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
    await roomsApi.updateHkStatus({ id: room_id, fo_status: 'available' }, 'OOS', { role: 'manager' });
    return data;
  },
  async updateStatus(report, status, fix_notes = '') {
    const now = new Date().toISOString();
    const { data, error } = await requireSupabase().from('maintenance_reports').update({ status, fix_notes, updated_at: now }).eq('id', report.id).select(`*, rooms(${roomSelect})`).single();
    raise(error);
    if (status === 'done') await roomsApi.updateHkStatus({ id: report.room_id, fo_status: 'available' }, 'VD', { role: 'manager' });
    return data;
  }
};

export const forecastApi = {
  async byDateRange(startDate, endDate) {
    const dates = eachDate(startDate, endDate);
    if (!dates.length) throw new Error('Rentang tanggal tidak valid.');

    const [rooms, reservations, stays] = await Promise.all([
      roomsApi.list(),
      reservationsApi.list().catch(() => []),
      staysApi.list().catch(() => [])
    ]);

    const rows = dates.map((date) => {
      const activeRooms = rooms.filter((room) => room.is_active !== false);
      const total_rooms = activeRooms.length;
      const ooo_rooms = activeRooms.filter((room) => room.hk_status === 'OOO').length;
      const oos_rooms = activeRooms.filter((room) => room.hk_status === 'OOS').length;
      const inventory_rooms = activeRooms.filter((room) => room.fo_status === 'available').length;
      const occupiedFromStays = new Set(stays.filter((stay) => {
        const inDate = (stay.checkin_at || stay.actual_check_in || '').slice(0, 10);
        const outDate = (stay.checkout_at || stay.actual_check_out || '').slice(0, 10);
        return stay.status === 'checked_in' && inDate <= date && (!outDate || outDate > date);
      }).map((stay) => stay.room_id));
      const occupiedFromRooms = activeRooms.filter((room) => ['OR', 'OC', 'OD'].includes(room.hk_status)).map((room) => room.id);
      const occupied_rooms = new Set([...occupiedFromStays, ...occupiedFromRooms]).size;
      const expected_arrival = reservations.filter((reservation) => reservation.check_in_date === date && ['reserved', 'booked', 'confirmed'].includes(reservation.status)).length;
      const expected_departure = reservations.filter((reservation) => reservation.check_out_date === date && ['checked_in', 'reserved', 'booked', 'confirmed'].includes(reservation.status)).length;
      const available_rooms = Math.max(inventory_rooms - occupied_rooms - expected_arrival, 0);
      const occupancy_percentage = inventory_rooms ? Math.round((occupied_rooms / inventory_rooms) * 10000) / 100 : 0;

      return { date, total_rooms, inventory_rooms, ooo_rooms, oos_rooms, occupied_rooms, expected_arrival, expected_departure, available_rooms, occupancy_percentage };
    });

    const totals = rows.reduce((acc, row) => {
      Object.keys(row).forEach((key) => {
        if (key !== 'date') acc[key] = (acc[key] || 0) + row[key];
      });
      return acc;
    }, {});
    const average_occupancy_percentage = rows.length ? Math.round((totals.occupancy_percentage / rows.length) * 100) / 100 : 0;

    return { rows, summary: { ...totals, days: rows.length, average_occupancy_percentage } };
  }
};

export function calculateStayBilling(stay) {
  const reservation = normalizeReservation(stay?.reservations || {});
  const checkin = reservation?.check_in_date || stay?.checkin_at?.slice(0, 10) || stay?.actual_check_in?.slice(0, 10);
  const checkout = reservation?.check_out_date || stay?.checkout_at?.slice(0, 10) || stay?.actual_check_out?.slice(0, 10) || today();
  const nights = nightsBetween(checkin, checkout) || 1;
  const rate = roomRate(stay?.rooms?.room_types);
  const roomCharge = nights * rate;
  const paid = (stay?.invoices || []).flatMap((invoice) => invoice.payments || [])
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const balance = Math.max(roomCharge - paid, 0);
  const paymentStatus = paid <= 0 ? 'unpaid' : balance > 0 ? 'partial' : 'paid';
  return { nights, roomRate: rate, roomCharge, paid, balance, paymentStatus };
}

export const reportsApi = {
  async summary(date = today()) {
    const forecast = await forecastApi.byDateRange(date, date);
    const todayRow = forecast.rows[0] || {};
    const stays = await staysApi.list().catch(() => []);
    const revenueToday = (stays || []).flatMap((stay) => stay.invoices || [])
      .flatMap((invoice) => invoice.payments || [])
      .filter((payment) => payment.paid_at?.slice(0, 10) === date)
      .reduce((total, payment) => total + Number(payment.amount || 0), 0);

    return {
      totalRooms: todayRow.total_rooms || 0,
      inventoryRooms: todayRow.inventory_rooms || 0,
      occupied: todayRow.occupied_rooms || 0,
      available: todayRow.available_rooms || 0,
      dirty: (await roomsApi.list()).filter((room) => ['VD', 'OD'].includes(room.hk_status)).length,
      maintenance: (todayRow.ooo_rooms || 0) + (todayRow.oos_rooms || 0),
      revenueToday,
      arrivalsToday: todayRow.expected_arrival || 0,
      departuresToday: todayRow.expected_departure || 0
    };
  }
};

export const settingsApi = {
  async hotel() {
    const { data, error } = await requireSupabase().from('hotel_settings').select('*').limit(1).maybeSingle();
    raise(error);
    return data;
  }
};

export const dashboardApi = {
  async stats() {
    return reportsApi.summary();
  }
};
