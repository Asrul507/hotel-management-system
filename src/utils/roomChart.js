export const ROOM_CHART_STATUSES = ['VR', 'VC', 'VD', 'OR', 'OD', 'OC', 'DND', 'ONL', 'OOO', 'OOS', 'EA', 'ED'];

function chartToday() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); }
function addChartDays(date, days) { const value = new Date(`${date}T00:00:00+07:00`); value.setDate(value.getDate() + Number(days || 0)); return value.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); }

export function buildRoomChartDateRange(startDate = chartToday(), days = 7) {
  const safeDays = Math.min(Math.max(Number(days || 7), 1), 31);
  return Array.from({ length: safeDays }, (_, index) => addChartDays(startDate, index));
}

export function normalizeRoomChartStatus(rawStatus = '') {
  const value = String(rawStatus || '').trim().toUpperCase();
  if (['VR', 'READY', 'CLEAN', 'AVAILABLE'].includes(value)) return 'VR';
  if (['VC', 'CLEANING', 'NOT_READY'].includes(value)) return 'VC';
  if (['VD', 'DIRTY'].includes(value)) return 'VD';
  if (['OR', 'OCCUPIED', 'CHECKED_IN'].includes(value)) return 'OR';
  if (['OD'].includes(value)) return 'OD';
  if (['OC'].includes(value)) return 'OC';
  if (['DND'].includes(value)) return 'DND';
  if (['ONL'].includes(value)) return 'ONL';
  if (['OOO', 'OUT_OF_ORDER'].includes(value)) return 'OOO';
  if (['OOS', 'MAINTENANCE', 'UNAVAILABLE', 'OUT_OF_SERVICE'].includes(value)) return 'OOS';
  if (['EA', 'EXPECTED_ARRIVAL', 'ARRIVAL'].includes(value)) return 'EA';
  if (['ED', 'EXPECTED_DEPARTURE', 'DEPARTURE'].includes(value)) return 'ED';
  return 'VC';
}

function dateInStay(date, stay) {
  const reservation = stay.reservations || {};
  const start = (reservation.check_in_date || stay.checkin_at || stay.actual_check_in || '').slice(0, 10);
  const end = (reservation.check_out_date || stay.checkout_at || stay.actual_check_out || '').slice(0, 10);
  return start && start <= date && (!end || end > date);
}

function dateInReservation(date, reservation) {
  return reservation.check_in_date && reservation.check_out_date && reservation.check_in_date <= date && reservation.check_out_date > date;
}

function dateInMaintenance(date, report) {
  const start = String(report.created_at || '').slice(0, 10);
  const end = report.status === 'done' ? String(report.updated_at || report.created_at || '').slice(0, 10) : '';
  return start && start <= date && (!end || end >= date);
}

function makeCell(room, date, status, context = {}) {
  return {
    room,
    date,
    status: normalizeRoomChartStatus(status),
    contextKey: context.contextKey || normalizeRoomChartStatus(status),
    guestName: context.guestName || '',
    notes: context.notes || '',
    arrival: context.arrival || '',
    departure: context.departure || '',
    folioNumber: context.folioNumber || '',
    source: context.source || 'room',
    sourceId: context.sourceId || '',
    raw: context.raw || null
  };
}

export function buildRoomChartCells(room, dateRange, sourceData = {}) {
  const reservations = sourceData.reservations || [];
  const stays = sourceData.stays || [];
  const maintenance = sourceData.maintenance || [];
  return dateRange.map((date) => {
    const stay = stays.find((item) => item.room_id === room.id && item.status === 'checked_in' && dateInStay(date, item));
    if (stay) {
      const reservation = stay.reservations || {};
      const guest = stay.guests || reservation.guests || {};
      const status = normalizeRoomChartStatus(['OR', 'OD', 'OC', 'DND', 'ONL'].includes(room.hk_status) ? room.hk_status : 'OC');
      return makeCell(room, date, status, {
        contextKey: `${status}:stay:${stay.id || stay.reservation_id || guest.id || guest.full_name}`,
        guestName: guest.full_name || '-',
        arrival: (reservation.check_in_date || stay.checkin_at || stay.actual_check_in || '').slice(0, 10),
        departure: (reservation.check_out_date || stay.checkout_at || stay.actual_check_out || '').slice(0, 10),
        folioNumber: stay.folios?.folio_number || reservation.folios?.folio_number || '',
        notes: reservation.notes || reservation.special_notes || '',
        source: 'stay',
        sourceId: stay.id,
        raw: stay
      });
    }

    const departure = reservations.find((item) => item.room_id === room.id && ['reserved', 'checked_in'].includes(item.status) && item.check_out_date === date);
    if (departure) {
      return makeCell(room, date, 'ED', {
        contextKey: `ED:reservation:${departure.id}`,
        guestName: departure.guests?.full_name || '-',
        arrival: departure.check_in_date,
        departure: departure.check_out_date,
        folioNumber: departure.folios?.folio_number || '',
        notes: departure.notes || departure.special_notes || '',
        source: 'reservation',
        sourceId: departure.id,
        raw: departure
      });
    }

    const arrival = reservations.find((item) => item.room_id === room.id && item.status === 'reserved' && item.check_in_date === date);
    if (arrival) {
      return makeCell(room, date, 'EA', {
        contextKey: `EA:reservation:${arrival.id}`,
        guestName: arrival.guests?.full_name || '-',
        arrival: arrival.check_in_date,
        departure: arrival.check_out_date,
        folioNumber: arrival.folios?.folio_number || '',
        notes: arrival.notes || arrival.special_notes || '',
        source: 'reservation',
        sourceId: arrival.id,
        raw: arrival
      });
    }

    const reservation = reservations.find((item) => item.room_id === room.id && item.status === 'reserved' && dateInReservation(date, item));
    if (reservation) {
      return makeCell(room, date, 'EA', {
        contextKey: `EA:reservation:${reservation.id}`,
        guestName: reservation.guests?.full_name || '-',
        arrival: reservation.check_in_date,
        departure: reservation.check_out_date,
        folioNumber: reservation.folios?.folio_number || '',
        notes: reservation.notes || reservation.special_notes || '',
        source: 'reservation',
        sourceId: reservation.id,
        raw: reservation
      });
    }

    const report = maintenance.find((item) => item.room_id === room.id && item.status !== 'done' && dateInMaintenance(date, item));
    if (report) {
      const status = normalizeRoomChartStatus(room.hk_status === 'OOO' ? 'OOO' : 'OOS');
      const notes = report.issue || room.notes || '-';
      return makeCell(room, date, status, { contextKey: `${status}:maintenance:${report.id}:${notes}`, notes, source: 'maintenance', sourceId: report.id, raw: report });
    }

    const hk = normalizeRoomChartStatus(room.hk_status || room.status);
    if (['OOO', 'OOS', 'VC', 'VD', 'DND', 'ONL'].includes(hk)) return makeCell(room, date, hk, { contextKey: `${hk}:room:${room.id}:${room.notes || ''}`, notes: room.notes || '', source: 'room', sourceId: room.id, raw: room });
    return makeCell(room, date, 'VR', { contextKey: `VR:room:${room.id}`, source: 'room', sourceId: room.id, raw: room });
  });
}

export function mergeRoomChartCells(cells = []) {
  return cells.reduce((blocks, cell) => {
    const last = blocks[blocks.length - 1];
    if (last && last.status === cell.status && last.contextKey === cell.contextKey) {
      last.colSpan += 1;
      last.endDate = cell.date;
      last.dates.push(cell.date);
    } else {
      blocks.push({ ...cell, startDate: cell.date, endDate: cell.date, colSpan: 1, dates: [cell.date] });
    }
    return blocks;
  }, []);
}

export function getRoomChartCellLabel(cell) {
  const status = normalizeRoomChartStatus(cell?.status);
  if (['OR', 'OD', 'OC', 'DND', 'ONL', 'EA', 'ED'].includes(status)) return `${status} - ${cell?.guestName || '-'}`;
  if (['OOO', 'OOS', 'VC', 'VD'].includes(status)) return cell?.notes ? `${status} - ${cell.notes}` : status;
  return 'VR / Ready';
}

export function getRoomChartCellClass(status) {
  return `room-chart-block status-${normalizeRoomChartStatus(status).toLowerCase()}`;
}
