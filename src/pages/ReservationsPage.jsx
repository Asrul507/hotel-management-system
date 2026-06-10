import { useEffect, useState } from 'react';
import { RESERVATION_STATUSES, reservationsApi, roomsApi } from '../services/api';

const initialForm = { guest_name: '', phone: '', room_id: '', check_in_date: '', check_out_date: '', status: 'booked' };

export default function ReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [reservationData, roomData] = await Promise.all([reservationsApi.list(), roomsApi.list()]);
      setReservations(reservationData);
      setRooms(roomData);
      if (!form.room_id && roomData[0]) setForm((current) => ({ ...current, room_id: roomData[0].id }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (form.check_out_date <= form.check_in_date) return setError('Tanggal check-out harus setelah check-in.');
    setSaving(true);
    setError('');
    try {
      await reservationsApi.create(form);
      setForm({ ...initialForm, room_id: rooms[0]?.id || '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="page-stack">
    <div className="page-header"><div><h1>Reservations</h1><p>Buat dan pantau reservasi tamu dari Supabase.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="two-column">
      <form className="card form-grid" onSubmit={submit}>
        <h2>Tambah Reservasi</h2>
        <label>Nama tamu<input required value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} /></label>
        <label>No. HP<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Kamar<select required value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })}>{rooms.filter((room) => room.status !== 'out_of_order').map((room) => <option key={room.id} value={room.id}>{room.room_number} - {room.room_types?.name}</option>)}</select></label>
        <label>Check-in<input type="date" required value={form.check_in_date} onChange={(e) => setForm({ ...form, check_in_date: e.target.value })} /></label>
        <label>Check-out<input type="date" required value={form.check_out_date} onChange={(e) => setForm({ ...form, check_out_date: e.target.value })} /></label>
        <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{RESERVATION_STATUSES.map((status) => <option key={status} value={status}>{status === 'booked' ? 'reserved' : status}</option>)}</select></label>
        <button disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Reservasi'}</button>
      </form>
      <div className="card table-card">
        <h2>Daftar Reservasi</h2>
        {loading ? <p>Memuat reservasi...</p> : <table><thead><tr><th>Kode</th><th>Tamu</th><th>Kamar</th><th>Tanggal</th><th>Status</th></tr></thead><tbody>{reservations.map((reservation) => <tr key={reservation.id}><td>{reservation.reservation_code}</td><td>{reservation.guests?.full_name}<br /><small>{reservation.guests?.phone}</small></td><td>{reservation.rooms?.room_number || '-'}</td><td>{reservation.checkin_date} → {reservation.checkout_date}</td><td><span className={`badge ${reservation.status}`}>{reservation.status === 'booked' ? 'reserved' : reservation.status}</span></td></tr>)}</tbody></table>}
      </div>
    </div>
  </div>;
}
