import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RESERVATION_STATUSES, foliosApi, nightsBetween, reservationsApi } from '../services/api';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export default function ReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [folios, setFolios] = useState([]);
  const [filters, setFilters] = useState({ status: 'all', search: '', startDate: '', endDate: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [reservationData, folioData] = await Promise.all([
        reservationsApi.list(filters),
        foliosApi.list().catch(() => [])
      ]);
      setReservations(reservationData);
      setFolios(folioData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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

  const folioNumber = (reservation) => folios.find((folio) => folio.id === reservation.folio_id)?.folio_number || reservation.folio_id || '-';

  return <div className="page-stack">
    <div className="page-header"><div><h1>Reservations</h1><p>Menu ini hanya untuk melihat dan memfilter reservasi. Reservasi baru dibuat dari menu Folio agar otomatis terhubung ke nomor bill/folio.</p></div><Link className="button-link" to="/billing">Buat Reservasi dari Folio</Link></div>
    {error && <div className="alert error">{error}</div>}
    <div className="alert"><strong>Info:</strong> Reservasi baru dibuat dari menu Folio / Billing supaya selalu memiliki folio/no bill. Gunakan filter di bawah untuk mencari data reservasi.</div>
    <div className="card table-card">
      <div className="page-header"><div><h2>Daftar Reservasi</h2></div><form className="filter-grid compact" onSubmit={(e) => { e.preventDefault(); load(); }}><input placeholder="Guest / kode / kamar" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">Semua status</option>{RESERVATION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select><input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} /><input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} /><button className="small">Filter</button></form></div>
      {loading ? <p>Memuat reservasi...</p> : reservations.length === 0 ? <p className="muted">Reservasi tidak ditemukan.</p> : <table><thead><tr><th>Kode</th><th>Folio</th><th>Tamu</th><th>Kamar</th><th>Tanggal</th><th>Rate/Deposit</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{reservations.map((reservation) => <tr key={reservation.id}><td>{reservation.reservation_code}</td><td>{folioNumber(reservation)}</td><td>{reservation.guests?.full_name}{reservation.guests?.is_blacklisted && <><br /><span className="badge cancelled">Blacklist</span></>}<br /><small>{reservation.guests?.phone}</small></td><td>{reservation.rooms?.room_number || 'Unassigned'}<br /><small>{reservation.room_types?.name}</small></td><td>{reservation.check_in_date} → {reservation.check_out_date}<br /><small>{reservation.nights || nightsBetween(reservation.check_in_date, reservation.check_out_date)} malam</small></td><td>{money.format(reservation.room_rate || 0)}<br /><small>DP {money.format(reservation.deposit_amount || 0)}</small></td><td><span className={`badge ${reservation.status}`}>{reservation.status}</span></td><td><div className="table-actions"><button className="icon-button" title="Lihat detail" onClick={() => window.alert(`Reservasi ${reservation.reservation_code}\nTamu: ${reservation.guests?.full_name || '-'}\nFolio: ${folioNumber(reservation)}\nTanggal: ${reservation.check_in_date} → ${reservation.check_out_date}`)}>ℹ</button><button className="icon-button" title="Cancel" disabled={saving === reservation.id || ['checked_out','cancelled','checked_in'].includes(reservation.status)} onClick={() => action(reservation, 'cancelled')}>✕</button><button className="icon-button" title="No-show" disabled={saving === reservation.id || reservation.status !== 'reserved'} onClick={() => action(reservation, 'no_show')}>!</button></div></td></tr>)}</tbody></table>}
    </div>
  </div>;
}
