import { useEffect, useMemo, useState } from 'react';
import { RESERVATION_STATUSES, addDaysToDate, guestsApi, nightsBetween, reservationsApi, roomTypesApi, roomsApi } from '../services/api';

const initialForm = { guest_id: '', room_type_id: '', room_id: '', check_in_date: '', nights: 1, check_out_date: '', adults: 1, children: 0, room_rate: '', deposit_amount: '', status: 'reserved', notes: '' };
const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export default function ReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [guests, setGuests] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState('');
  const [availableRooms, setAvailableRooms] = useState([]);
  const [roomLoading, setRoomLoading] = useState(false);
  const [filters, setFilters] = useState({ status: 'all', search: '', startDate: '', endDate: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedGuest = guests.find((guest) => guest.id === form.guest_id);
  const selectedType = roomTypes.find((type) => type.id === form.room_type_id);
  const nights = useMemo(() => Math.max(Number(form.nights || 0), 0), [form.nights]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [reservationData, guestData, typeData] = await Promise.all([
        reservationsApi.list(filters), guestsApi.list({ status: 'active' }), roomTypesApi.list({ includeInactive: false })
      ]);
      setReservations(reservationData);
      setGuests(guestData);
      setRoomTypes(typeData);
      if (!form.room_type_id && typeData[0]) setForm((current) => ({ ...current, room_type_id: typeData[0].id, room_rate: current.room_rate === '' ? String(typeData[0].base_rate ?? typeData[0].base_price ?? 0) : current.room_rate }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let active = true;
    async function loadRooms() {
      if (!form.room_type_id || !form.check_in_date || !form.check_out_date || form.check_out_date <= form.check_in_date) {
        setAvailableRooms([]);
        return;
      }
      setRoomLoading(true);
      try {
        const rooms = await roomsApi.availableForStay({ check_in_date: form.check_in_date, check_out_date: form.check_out_date, room_type_id: form.room_type_id, exclude_reservation_id: editingId });
        if (active) setAvailableRooms(rooms);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setRoomLoading(false);
      }
    }
    loadRooms();
    return () => { active = false; };
  }, [form.room_type_id, form.check_in_date, form.check_out_date, editingId]);

  function updateForm(field, value) {
    if (field === 'room_type_id') {
      const type = roomTypes.find((item) => item.id === value);
      setForm((current) => ({ ...current, room_type_id: value, room_id: '', room_rate: String(type?.base_rate ?? type?.base_price ?? 0) }));
      return;
    }
    if (field === 'check_in_date') {
      setForm((current) => ({ ...current, check_in_date: value, check_out_date: addDaysToDate(value, Math.max(Number(current.nights || 1), 1)) }));
      return;
    }
    if (field === 'nights') {
      const nextNights = Math.max(Number(value || 0), 1);
      setForm((current) => ({ ...current, nights: value, check_out_date: addDaysToDate(current.check_in_date, nextNights) }));
      return;
    }
    if (field === 'check_out_date') {
      setForm((current) => ({ ...current, check_out_date: value, nights: String(nightsBetween(current.check_in_date, value) || 1) }));
      return;
    }
    setForm((current) => ({ ...current, [field]: value }));
  }

  const submit = async (event) => {
    event.preventDefault();
    if (Number(form.nights) < 1) return setError('Nights minimal 1.');
    if (form.check_out_date <= form.check_in_date) return setError('Tanggal check-out harus setelah check-in.');
    if (Number(form.room_rate || 0) < 0) return setError('Room rate tidak boleh negatif.');
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, nights: Number(form.nights || 1), room_rate: form.room_rate === '' ? 0 : Number(form.room_rate), deposit_amount: form.deposit_amount === '' ? 0 : Number(form.deposit_amount) };
      if (editingId) await reservationsApi.update(editingId, payload);
      else await reservationsApi.create(payload);
      setForm({ ...initialForm, room_type_id: roomTypes[0]?.id || '', room_rate: String(roomTypes[0]?.base_rate ?? roomTypes[0]?.base_price ?? 0) });
      setEditingId('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  function edit(reservation) {
    const currentNights = reservation.nights || nightsBetween(reservation.check_in_date, reservation.check_out_date) || 1;
    setEditingId(reservation.id);
    setForm({ guest_id: reservation.guest_id || '', room_type_id: reservation.room_type_id || '', room_id: reservation.room_id || '', check_in_date: reservation.check_in_date || '', nights: String(currentNights), check_out_date: reservation.check_out_date || addDaysToDate(reservation.check_in_date, currentNights), adults: reservation.adults || 1, children: reservation.children || 0, room_rate: reservation.room_rate === 0 ? '0' : String(reservation.room_rate || reservation.room_types?.base_rate || ''), deposit_amount: reservation.deposit_amount === 0 ? '0' : String(reservation.deposit_amount || ''), status: reservation.status || 'reserved', notes: reservation.notes || reservation.special_notes || '' });
  }

  async function action(reservation, status) {
    const options = {};
    if (status === 'cancelled') {
      options.cancellation_reason = window.prompt('Alasan cancellation?', '') || '';
      options.cancellation_fee = Number(window.prompt('Cancellation fee (0 jika tidak ada)?', '0') || 0);
      options.refund_amount = Number(window.prompt('Refund deposit (0 jika tidak ada)?', '0') || 0);
    }
    if (status === 'no_show') options.no_show_fee = Number(window.prompt('No-show fee (0 jika tidak ada)?', '0') || 0);
    if (!window.confirm(`Konfirmasi ${status} reservasi ${reservation.reservation_code}?`)) return;
    setSaving(reservation.id);
    setError('');
    try {
      await reservationsApi.updateStatus(reservation, status, options);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return <div className="page-stack">
    <div className="page-header"><div><h1>Reservations</h1><p>Nights adalah input utama; checkout otomatis. Room picker hanya menampilkan kamar ready VR/VC yang tidak bentrok.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="two-column">
      <form className="card form-grid" onSubmit={submit}>
        <h2>{editingId ? 'Edit Reservasi' : 'Tambah Reservasi'}</h2>
        <label className="full">Tamu<select required value={form.guest_id} onChange={(e) => updateForm('guest_id', e.target.value)}><option value="">Pilih tamu</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.full_name}{guest.nik ? ` - ${guest.nik}` : ''}{guest.is_blacklisted ? ' (BLACKLIST)' : ''}</option>)}</select></label>
        {selectedGuest?.is_blacklisted && <div className="alert error full">Tamu ini blacklist. Lanjutkan hanya dengan approval manager.</div>}
        <label>Room type<select required value={form.room_type_id} onChange={(e) => updateForm('room_type_id', e.target.value)}><option value="">Pilih tipe</option>{roomTypes.map((type) => <option key={type.id} value={type.id}>{type.code} - {type.name}</option>)}</select></label>
        <label>Check-in<input type="date" required value={form.check_in_date} onChange={(e) => updateForm('check_in_date', e.target.value)} /></label>
        <label>Nights<input type="number" min="1" required value={form.nights} onChange={(e) => updateForm('nights', e.target.value)} /></label>
        <label>Check-out<input type="date" required value={form.check_out_date} onChange={(e) => updateForm('check_out_date', e.target.value)} /></label>
        <label>Kamar optional<select value={form.room_id} onChange={(e) => updateForm('room_id', e.target.value)}><option value="">Unassigned by type</option>{availableRooms.map((room) => <option key={room.id} value={room.id}>{room.room_number} - {room.hk_status}</option>)}</select>{roomLoading && <small>Memuat kamar ready...</small>}{!roomLoading && form.room_type_id && form.check_in_date && form.check_out_date && availableRooms.length === 0 && <small>Tidak ada kamar ready untuk tanggal ini.</small>}</label>
        <label>Adults<input type="number" min="1" value={form.adults} onChange={(e) => updateForm('adults', e.target.value)} /></label>
        <label>Children<input type="number" min="0" value={form.children} onChange={(e) => updateForm('children', e.target.value)} /></label>
        <label>Room rate<input type="number" min="0" value={form.room_rate} placeholder={String(selectedType?.base_rate ?? selectedType?.base_price ?? 0)} onChange={(e) => updateForm('room_rate', e.target.value)} /></label>
        <label>Deposit<input type="number" min="0" value={form.deposit_amount} onChange={(e) => updateForm('deposit_amount', e.target.value)} /></label>
        <label>Status<select value={form.status} onChange={(e) => updateForm('status', e.target.value)}>{RESERVATION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <label className="full">Catatan<textarea value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} /></label>
        <button disabled={saving}>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan Reservasi'}</button>
        {editingId && <button type="button" className="secondary" onClick={() => { setEditingId(''); setForm(initialForm); }}>Batal Edit</button>}
      </form>
      <div className="card table-card">
        <div className="page-header"><div><h2>Daftar Reservasi</h2></div><form className="filter-grid compact" onSubmit={(e) => { e.preventDefault(); load(); }}><input placeholder="Guest / kode / kamar" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">Semua status</option>{RESERVATION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select><input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} /><input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} /><button className="small">Filter</button></form></div>
        {loading ? <p>Memuat reservasi...</p> : reservations.length === 0 ? <p className="muted">Reservasi tidak ditemukan.</p> : <table><thead><tr><th>Kode</th><th>Tamu</th><th>Kamar</th><th>Tanggal</th><th>Rate/Deposit</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{reservations.map((reservation) => <tr key={reservation.id}><td>{reservation.reservation_code}</td><td>{reservation.guests?.full_name}{reservation.guests?.is_blacklisted && <><br /><span className="badge cancelled">Blacklist</span></>}<br /><small>{reservation.guests?.phone}</small></td><td>{reservation.rooms?.room_number || 'Unassigned'}<br /><small>{reservation.room_types?.name}</small></td><td>{reservation.check_in_date} → {reservation.check_out_date}<br /><small>{reservation.nights || nightsBetween(reservation.check_in_date, reservation.check_out_date)} malam</small></td><td>{money.format(reservation.room_rate || 0)}<br /><small>DP {money.format(reservation.deposit_amount || 0)}</small></td><td><span className={`badge ${reservation.status}`}>{reservation.status}</span></td><td className="button-row"><button className="small" disabled={['checked_in','checked_out'].includes(reservation.status)} onClick={() => edit(reservation)}>Edit</button><button className="small secondary" disabled={saving === reservation.id || ['checked_out','cancelled','checked_in'].includes(reservation.status)} onClick={() => action(reservation, 'cancelled')}>Cancel</button><button className="small secondary" disabled={saving === reservation.id || reservation.status !== 'reserved'} onClick={() => action(reservation, 'no_show')}>No-show</button></td></tr>)}</tbody></table>}
      </div>
    </div>
  </div>;
}
