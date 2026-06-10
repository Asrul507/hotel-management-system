import { supabase } from '../config/supabase';

export const ROOM_STATUSES = ['available', 'occupied', 'dirty', 'cleaning', 'maintenance', 'out_of_order'];
export const RESERVATION_STATUSES = ['booked', 'checked_in', 'checked_out', 'cancelled'];
export const PAYMENT_METHODS = ['cash', 'transfer', 'qris', 'debit', 'credit'];

const today = () => new Date().toISOString().slice(0, 10);
const reservationCode = () => `RSV-${Date.now()}`;
const invoiceNumber = () => `INV-${Date.now()}`;

function raise(error) {
  if (error) throw new Error(error.message || 'Terjadi kesalahan saat mengambil data Supabase.');
}

function nightsBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = Math.ceil((end - start) / 86400000);
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

function getReservationDates(stay) {
  const reservation = stay?.reservations;
  const checkin = reservation?.checkin_date || stay?.checkin_at?.slice(0, 10);
  const checkout = reservation?.checkout_date || stay?.checkout_at?.slice(0, 10) || today();
  return { checkin, checkout };
}

export function calculateStayBilling(stay) {
  const { checkin, checkout } = getReservationDates(stay);
  const nights = nightsBetween(checkin, checkout) || 1;
  const roomRate = Number(stay?.rooms?.room_types?.base_price || 0);
  const roomCharge = nights * roomRate;
  const paid = (stay?.invoices || []).flatMap((invoice) => invoice.payments || [])
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const balance = Math.max(roomCharge - paid, 0);
  const paymentStatus = paid <= 0 ? 'unpaid' : balance > 0 ? 'partial' : 'paid';
  return { nights, roomRate, roomCharge, paid, balance, paymentStatus };
}

const roomSelect = 'id, room_number, floor, status, notes, room_type_id, room_types(id, name, base_price, facilities)';
const reservationSelect = `
  id, reservation_code, checkin_date, checkout_date, nights, status, deposit_amount, special_notes, room_id, room_type_id, guest_id, created_at,
  guests(id, full_name, phone, email),
  rooms(${roomSelect}),
  room_types(id, name, base_price)
`;
const staySelect = `
  id, reservation_id, guest_id, room_id, checkin_at, checkout_at, deposit_amount, status, created_at,
  guests(id, full_name, phone),
  rooms(${roomSelect}),
  reservations(id, reservation_code, checkin_date, checkout_date, status),
  invoices(id, invoice_number, status, total_amount, balance_due, payments(id, payment_method, amount, paid_at, reference_number))
`;

export const roomTypesApi = {
  async list() {
    const { data, error } = await supabase.from('room_types').select('*').order('base_price');
    raise(error);
    return data || [];
  }
};

export const roomsApi = {
  async list() {
    const { data, error } = await supabase.from('rooms').select(roomSelect).order('room_number');
    raise(error);
    return data || [];
  },
  async create(payload) {
    const { data, error } = await supabase.from('rooms').insert(payload).select(roomSelect).single();
    raise(error);
    return data;
  },
  async update(id, payload) {
    const { data, error } = await supabase.from('rooms').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select(roomSelect).single();
    raise(error);
    return data;
  },
  async updateStatus(id, status) {
    return this.update(id, { status });
  }
};

export const reservationsApi = {
  async list() {
    const { data, error } = await supabase.from('reservations').select(reservationSelect).order('checkin_date', { ascending: false });
    raise(error);
    return data || [];
  },
  async arrivals(date = today()) {
    const { data, error } = await supabase.from('reservations').select(reservationSelect).eq('checkin_date', date).in('status', ['booked', 'confirmed']).order('created_at');
    raise(error);
    return data || [];
  },
  async create({ guest_name, phone, room_id, check_in_date, check_out_date, status = 'booked', deposit_amount = 0 }) {
    const { data: room, error: roomError } = await supabase.from('rooms').select('id, room_type_id').eq('id', room_id).single();
    raise(roomError);

    const { data: guest, error: guestError } = await supabase.from('guests').insert({ full_name: guest_name, phone }).select('id').single();
    raise(guestError);

    const { data, error } = await supabase.from('reservations').insert({
      reservation_code: reservationCode(),
      guest_id: guest.id,
      room_id,
      room_type_id: room.room_type_id,
      checkin_date: check_in_date,
      checkout_date: check_out_date,
      status,
      deposit_amount: Number(deposit_amount || 0)
    }).select(reservationSelect).single();
    raise(error);
    return data;
  },
  async updateStatus(id, status) {
    const { data, error } = await supabase.from('reservations').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select(reservationSelect).single();
    raise(error);
    return data;
  }
};

export const staysApi = {
  async list() {
    const { data, error } = await supabase.from('stays').select(staySelect).order('created_at', { ascending: false });
    raise(error);
    return data || [];
  },
  async active() {
    const { data, error } = await supabase.from('stays').select(staySelect).eq('status', 'checked_in').order('created_at', { ascending: false });
    raise(error);
    return data || [];
  },
  async checkIn(reservation) {
    const now = new Date().toISOString();
    const { data: stay, error } = await supabase.from('stays').insert({
      reservation_id: reservation.id,
      guest_id: reservation.guest_id,
      room_id: reservation.room_id,
      deposit_amount: Number(reservation.deposit_amount || 0),
      checkin_at: now,
      status: 'checked_in'
    }).select(staySelect).single();
    raise(error);

    await reservationsApi.updateStatus(reservation.id, 'checked_in');
    await roomsApi.updateStatus(reservation.room_id, 'occupied');
    return stay;
  },
  async checkOut(stay) {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('stays').update({ checkout_at: now, status: 'checked_out', updated_at: now }).eq('id', stay.id).select(staySelect).single();
    raise(error);

    if (stay.reservation_id) await reservationsApi.updateStatus(stay.reservation_id, 'checked_out');
    await roomsApi.updateStatus(stay.room_id, 'dirty');
    return data;
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
      const { data, error } = await supabase.from('invoices').insert({
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

    const { error: paymentError } = await supabase.from('payments').insert({
      invoice_id: invoice.id,
      payment_method,
      amount: Number(amount || 0),
      reference_number
    });
    raise(paymentError);

    const nextPaid = billing.paid + Number(amount || 0);
    const nextBalance = Math.max(total - nextPaid, 0);
    const nextStatus = nextPaid <= 0 ? 'unpaid' : nextBalance > 0 ? 'partial' : 'paid';
    const { error: invoiceError } = await supabase.from('invoices').update({
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
    const query = supabase.from('rooms').select(roomSelect).order('room_number');
    if (status !== 'all') query.eq('status', status);
    const { data, error } = await query;
    raise(error);
    return data || [];
  },
  async updateRoomStatus(roomId, status) {
    const room = await roomsApi.updateStatus(roomId, status);
    if (['dirty', 'cleaning'].includes(status)) {
      await supabase.from('housekeeping_tasks').insert({ room_id: roomId, status: status === 'dirty' ? 'dirty' : 'cleaning' });
    }
    return room;
  }
};

export const maintenanceApi = {
  async list() {
    const { data, error } = await supabase.from('maintenance_reports').select(`*, rooms(${roomSelect}), profiles(id, full_name)`).order('created_at', { ascending: false });
    raise(error);
    return data || [];
  },
  async create({ room_id, issue }) {
    const { data, error } = await supabase.from('maintenance_reports').insert({ room_id, issue, status: 'reported' }).select(`*, rooms(${roomSelect})`).single();
    raise(error);
    await roomsApi.updateStatus(room_id, 'maintenance');
    return data;
  },
  async updateStatus(report, status, fix_notes = '') {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('maintenance_reports').update({ status, fix_notes, updated_at: now }).eq('id', report.id).select(`*, rooms(${roomSelect})`).single();
    raise(error);
    if (status === 'done') await roomsApi.updateStatus(report.room_id, 'dirty');
    return data;
  }
};

export const reportsApi = {
  async summary(date = today()) {
    const [rooms, stays, arrivals, departures] = await Promise.all([
      roomsApi.list(),
      staysApi.list(),
      reservationsApi.arrivals(date),
      supabase.from('reservations').select(reservationSelect).eq('checkout_date', date).in('status', ['checked_in', 'checked_out'])
    ]);
    raise(departures.error);

    const revenueToday = (stays || []).flatMap((stay) => stay.invoices || [])
      .flatMap((invoice) => invoice.payments || [])
      .filter((payment) => payment.paid_at?.slice(0, 10) === date)
      .reduce((total, payment) => total + Number(payment.amount || 0), 0);

    return {
      totalRooms: rooms.length,
      occupied: rooms.filter((room) => room.status === 'occupied').length,
      available: rooms.filter((room) => room.status === 'available').length,
      dirty: rooms.filter((room) => room.status === 'dirty').length,
      maintenance: rooms.filter((room) => ['maintenance', 'out_of_order'].includes(room.status)).length,
      revenueToday,
      arrivalsToday: arrivals.length,
      departuresToday: departures.data?.length || 0
    };
  }
};

export const settingsApi = {
  async hotel() {
    const { data, error } = await supabase.from('hotel_settings').select('*').limit(1).maybeSingle();
    raise(error);
    return data;
  }
};

export const dashboardApi = {
  async stats() {
    return reportsApi.summary();
  }
};
