import { useEffect, useState } from 'react';
import { reservationsApi, staysApi } from '../services/api';

export default function CheckinPage() {
  const [arrivals, setArrivals] = useState([]);
  const [activeStays, setActiveStays] = useState([]);
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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const run = async (id, action) => {
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
    <div className="page-header"><div><h1>Check-in / Check-out</h1><p>Check-in mengubah kamar menjadi occupied, check-out mengubah kamar menjadi dirty.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="two-column">
      <div className="card table-card"><h2>Arrival Hari Ini</h2>{loading ? <p>Memuat arrival...</p> : <table><thead><tr><th>Tamu</th><th>Kamar</th><th>Reservasi</th><th>Aksi</th></tr></thead><tbody>{arrivals.map((reservation) => <tr key={reservation.id}><td>{reservation.guests?.full_name}</td><td>{reservation.rooms?.room_number}</td><td>{reservation.reservation_code}</td><td><button className="small" disabled={processing === reservation.id || !reservation.room_id} onClick={() => run(reservation.id, () => staysApi.checkIn(reservation))}>Check-in</button></td></tr>)}</tbody></table>}{!loading && arrivals.length === 0 && <p className="muted">Tidak ada arrival hari ini.</p>}</div>
      <div className="card table-card"><h2>Tamu In-house</h2>{loading ? <p>Memuat stay...</p> : <table><thead><tr><th>Tamu</th><th>Kamar</th><th>Check-in</th><th>Aksi</th></tr></thead><tbody>{activeStays.map((stay) => <tr key={stay.id}><td>{stay.guests?.full_name}</td><td>{stay.rooms?.room_number}</td><td>{stay.checkin_at?.slice(0, 16).replace('T', ' ')}</td><td><button className="small" disabled={processing === stay.id} onClick={() => run(stay.id, () => staysApi.checkOut(stay))}>Check-out</button></td></tr>)}</tbody></table>}{!loading && activeStays.length === 0 && <p className="muted">Belum ada tamu in-house.</p>}</div>
    </div>
  </div>;
}
