import { useEffect, useState } from 'react';
import { calculateStayBilling, reservationsApi, roomsApi, staysApi } from '../services/api';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export default function CheckinPage() {
  const [arrivals, setArrivals] = useState([]);
  const [activeStays, setActiveStays] = useState([]);
  const [roomChoices, setRoomChoices] = useState({});
  const [selectedRooms, setSelectedRooms] = useState({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [arrivalData, stayData] = await Promise.all([reservationsApi.arrivals(), staysApi.active()]);
      setArrivals(arrivalData);
      setActiveStays(stayData);
      const choices = {};
      await Promise.all(arrivalData.map(async (reservation) => {
        choices[reservation.id] = await roomsApi.availableForStay({ check_in_date: reservation.check_in_date, check_out_date: reservation.check_out_date, room_type_id: reservation.room_type_id, exclude_reservation_id: reservation.id });
      }));
      setRoomChoices(choices);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const run = async (id, action, confirmText = '') => {
    if (confirmText && !window.confirm(confirmText)) return;
    setProcessing(id);
    setError('');
    try {
      await action();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing('');
    }
  };

  return <div className="page-stack">
    <div className="page-header"><div><h1>Check-in / Check-out</h1><p>Check-in membuat stay in-house dan HK menjadi OC; check-out membuat invoice dan HK menjadi VD.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="two-column">
      <div className="card table-card"><h2>Arrival Hari Ini</h2>{loading ? <p>Memuat arrival...</p> : arrivals.length === 0 ? <p className="muted">Tidak ada arrival hari ini.</p> : <table><thead><tr><th>Tamu</th><th>Kamar</th><th>Reservasi</th><th>Warning</th><th>Aksi</th></tr></thead><tbody>{arrivals.map((reservation) => {
        const choices = roomChoices[reservation.id] || [];
        const selected = selectedRooms[reservation.id] || reservation.room_id || '';
        return <tr key={reservation.id}><td>{reservation.guests?.full_name}{reservation.guests?.is_blacklisted && <><br /><span className="badge cancelled">Blacklist</span></>}</td><td>{reservation.room_id ? reservation.rooms?.room_number : <select required value={selected} onChange={(e) => setSelectedRooms({ ...selectedRooms, [reservation.id]: e.target.value })}><option value="">Pilih kamar</option>{choices.map((room) => <option key={room.id} value={room.id}>{room.room_number} - {room.hk_status}</option>)}</select>}<br /><small>{reservation.room_types?.name}</small></td><td>{reservation.reservation_code}<br /><small>{reservation.check_in_date} → {reservation.check_out_date}</small></td><td>{reservation.guests?.is_blacklisted ? 'Perlu approval manager.' : choices.length === 0 && !reservation.room_id ? 'Tidak ada kamar eligible.' : '-'}</td><td><button className="small" disabled={processing === reservation.id || !selected} onClick={() => run(reservation.id, () => staysApi.checkIn(reservation, selected), `Check-in ${reservation.guests?.full_name}?`)}>Check-in</button></td></tr>;
      })}</tbody></table>}</div>
      <div className="card table-card"><h2>Tamu In-house</h2>{loading ? <p>Memuat stay...</p> : activeStays.length === 0 ? <p className="muted">Belum ada tamu in-house.</p> : <table><thead><tr><th>Tamu</th><th>Kamar</th><th>Check-in</th><th>Expected Out</th><th>Billing</th><th>Aksi</th></tr></thead><tbody>{activeStays.map((stay) => {
        const billing = calculateStayBilling(stay);
        return <tr key={stay.id}><td>{stay.guests?.full_name}</td><td>{stay.rooms?.room_number}<br /><small>{stay.rooms?.hk_status}</small></td><td>{stay.checkin_at?.slice(0, 16).replace('T', ' ')}</td><td>{stay.reservations?.check_out_date || '-'}</td><td><span className={`badge ${billing.paymentStatus}`}>{billing.paymentStatus}</span><br /><small>{money.format(billing.balance)} due</small></td><td><button className="small" disabled={processing === stay.id} onClick={() => run(stay.id, () => staysApi.checkOut(stay), `Check-out ${stay.guests?.full_name}? Invoice akan dibuat jika belum ada.`)}>Check-out</button></td></tr>;
      })}</tbody></table>}</div>
    </div>
  </div>;
}
