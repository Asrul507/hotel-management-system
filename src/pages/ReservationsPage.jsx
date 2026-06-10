import { useEffect, useMemo, useState } from 'react';
import { RESERVATION_STATUSES, guestsApi, nightsBetween, reservationsApi, roomTypesApi, roomsApi } from '../services/api';

const initialForm = { guest_id: '', room_type_id: '', room_id: '', check_in_date: '', check_out_date: '', adults: 1, children: 0, room_rate: 0, deposit_amount: 0, status: 'reserved', notes: '' };
const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export default function ReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [guests, setGuests] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState('');
  const [filters, setFilters] = useState({ status: 'all', search: '', startDate: '', endDate: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedGuest = guests.find((guest) => guest.id === form.guest_id);
  const selectedType = roomTypes.find((type) => type.id === form.room_type_id);
  const nights = useMemo(() => nightsBetween(form.check_in_date, form.check_out_date), [form.check_in_date, form.check_out_date]);
  const eligibleRooms = rooms.filter((room) => room.is_active !== false && room.fo_status === 'available' && !['OOO', 'OOS'].includes(room.hk_status) && (!form.room_type_id || room.room_type_id === form.room_type_id));

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [reservationData, guestData, typeData, roomData] = await Promise.all([
        reservationsApi.list(filters), guestsApi.list({ status: 'active' }), roomTypesApi.list({ includeInactive: false }), roomsApi.list()
      ]);
      setReservations(reservationData);
      setGuests(guestData);
      setRoomTypes(typeData);
      setRooms(roomData);
      if (!form.room_type_id && typeData[0]) setForm((current) => ({ ...current, room_type_id: typeData[0].id, room_rate: typeData[0].base_rate ?? typeData[0].base_price ?? 0 }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  function updateForm(field, value) {
    if (field === 'room_type_id') {
      const type = roomTypes.find((item) => item.id === value);
      setForm((current) => ({ ...current, room_type_id: value, room_id: '', room_rate: type?.base_rate ?? type?.base_price ?? current.room_rate }));
      return;
    }
    setForm((current) => ({ ...current, [field]: value }));
  }

  const submit = async (event) => {
    event.preventDefault();
    if (form.check_out_date <= form.check_in_date) return setError('Tanggal check-out harus setelah check-in.');
    setSaving(true);
    setError('');
    try {
      if (editingId) await reservationsApi.update(editingId, form);
      else await reservationsApi.create(form);
      setForm({ ...initialForm, room_type_id: roomTypes[0]?.id || '', room_rate: roomTypes[0]?.base_rate ?? roomTypes[0]?.base_price ?? 0 });
      setEditingId('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  function edit(reservation) {
    setEditingId(reservation.id);
    setForm({ guest_id: reservation.guest_id || '', room_type_id: reservation.room_type_id || '', room_id: reservation.room_id || '', check_in_date: reservation.check_in_date || '', check_out_date: reservation.check_out_date || '', adults: reservation.adults || 1, children: reservation.children || 0, room_rate: reservation.room_rate || reservation.room_types?.base_rate || 0, deposit_amount: reservation.deposit_amount || 0, status: reservation.status || 'reserved', notes: reservation.notes || reservation.special_notes || '' });
  }

  async function action(reservation, status) {
    const label = status === 'cancelled' ? 'cancel' : 'no-show';
    if (!window.confirm(`Konfirmasi ${label} reservasi ${reservation.reservation_code}?`)) return;
    setSaving(reservation.id);
    setError('');
    try {
      await reservationsApi.updateStatus(reservation, status);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return <div className="page-stack">
    <div className="page-header"><div><h1>Reservations</h1><p>Buat reservasi berbasis guest database, room type/room number, dan validasi double booking.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="two-column">
      <form className="card form-grid" onSubmit={submit}>
        <h2>{editingId ? 'Edit Reservasi' : 'Tambah Reservasi'}</h2>
        <label className="full">Tamu<select required value={form.guest_id} onChange={(e) => updateForm('guest_id', e.target.value)}><option value="">Pilih tamu</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.full_name}{guest.nik ? ` - ${guest.nik}` : ''}{guest.is_blacklisted ? ' (BLACKLIST)' : ''}</option>)}</select></label>
        {selectedGuest?.is_blacklisted && <div className="alert error full">Tamu ini blacklist. Lanjutkan hanya dengan approval manager.</div>}
        <label>Room type<select required value={form.room_type_id} onChange={(e) => updateForm('room_type_id', e.target.value)}><option value="">Pilih tipe</option>{roomTypes.map((type) => <option key={type.id} value={type.id}>{type.code} - {type.name}</option>)}</select></label>
        <label>Kamar optional<select value={form.room_id} onChange={(e) => updateForm('room_id', e.target.value)}><option value="">Unassigned by type</option>{eligibleRooms.map((room) => <option key={room.id} value={room.id}>{room.room_number} - {room.hk_status}</option>)}</select></label>
        <label>Check-in<input type="date" required value={form.check_in_date} onChange={(e) => updateForm('check_in_date', e.target.value)} /></label>
        <label>Check-out<input type="date" required value={form.check_out_date} onChange={(e) => updateForm('check_out_date', e.target.value)} /></label>
        <label>Nights<input readOnly value={nights} /></label>
        <label>Adults<input type="number" min="1" value={form.adults} onChange={(e) => updateForm('adults', e.target.value)} /></label>
        <label>Children<input type="number" min="0" value={form.children} onChange={(e) => updateForm('children', e.target.value)} /></label>
        <label>Room rate<input type="number" min="0" value={form.room_rate || selectedType?.base_rate || 0} onChange={(e) => updateForm('room_rate', e.target.value)} /></label>
        <label>Deposit<input type="number" min="0" value={form.deposit_amount} onChange={(e) => updateForm('deposit_amount', e.target.value)} /></label>
        <label>Status<select value={form.status} onChange={(e) => updateForm('status', e.target.value)}>{RESERVATION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <label className="full">Catatan<textarea value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} /></label>
        <button disabled={saving}>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan Reservasi'}</button>
        {editingId && <button type="button" className="secondary" onClick={() => { setEditingId(''); setForm(initialForm); }}>Batal Edit</button>}
      </form>
      <div className="card table-card">
        <div className="page-header"><div><h2>Daftar Reservasi</h2></div><form className="filter-grid compact" onSubmit={(e) => { e.preventDefault(); load(); }}><input placeholder="Guest / kode / kamar" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">Semua status</option>{RESERVATION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select><input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} /><input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} /><button className="small">Filter</button></form></div>
        {loading ? <p>Memuat reservasi...</p> : reservations.length === 0 ? <p className="muted">Reservasi tidak ditemukan.</p> : <table><thead><tr><th>Kode</th><th>Tamu</th><th>Kamar</th><th>Tanggal</th><th>Rate/Deposit</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{reservations.map((reservation) => <tr key={reservation.id}><td>{reservation.reservation_code}</td><td>{reservation.guests?.full_name}{reservation.guests?.is_blacklisted && <><br /><span className="badge cancelled">Blacklist</span></>}<br /><small>{reservation.guests?.phone}</small></td><td>{reservation.rooms?.room_number || 'Unassigned'}<br /><small>{reservation.room_types?.name}</small></td><td>{reservation.check_in_date} → {reservation.check_out_date}<br /><small>{reservation.nights || nightsBetween(reservation.check_in_date, reservation.check_out_date)} malam</small></td><td>{money.format(reservation.room_rate || 0)}<br /><small>DP {money.format(reservation.deposit_amount || 0)}</small></td><td><span className={`badge ${reservation.status}`}>{reservation.status}</span></td><td className="button-row"><button className="small" disabled={['checked_in','checked_out'].includes(reservation.status)} onClick={() => edit(reservation)}>Edit</button><button className="small secondary" disabled={saving === reservation.id || ['checked_out','cancelled'].includes(reservation.status)} onClick={() => action(reservation, 'cancelled')}>Cancel</button><button className="small secondary" disabled={saving === reservation.id || reservation.status !== 'reserved'} onClick={() => action(reservation, 'no_show')}>No-show</button></td></tr>)}</tbody></table>}
      </div>
    </div>
  </div>;
}
