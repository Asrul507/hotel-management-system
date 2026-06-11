import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RESERVATION_STATUSES, foliosApi, nightsBetween, reservationsApi, today } from '../services/api';
import IconButton from '../components/IconButton';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClipboardList, faInfo, faBan, faFilter, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const reservationViews = [
  ['all', faClipboardList, 'Semua'],
  ['expected_arrival', faClipboardList, 'Expected Arrival'],
  ['expected_departure', faClipboardList, 'Expected Departure'],
  ['arrival', faClipboardList, 'Arrival'],
  ['departure', faClipboardList, 'Departure']
];

export default function ReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [folios, setFolios] = useState([]);
  const [activeView, setActiveView] = useState('all');
  const [filters, setFilters] = useState({ status: 'all', search: '', startDate: today(), endDate: today() });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const effectiveFilters = { ...filters, startDate: filters.startDate || today(), endDate: filters.endDate || filters.startDate || today() };
      const [reservationData, folioData] = await Promise.all([
        reservationsApi.listByView(activeView, effectiveFilters),
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

  useEffect(() => { load(); }, [activeView]);

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
  const formatDateTime = (value) => value ? String(value).slice(0, 16).replace('T', ' ') : '-';

  return <div className="page-stack">
    <div className="page-header"><div><h1>Reservations</h1><p>Menu ini hanya untuk melihat dan memfilter reservasi. Reservasi baru dibuat dari menu Folio agar otomatis terhubung ke nomor bill/folio.</p></div><Link className="button-link" to="/billing">Buat Reservasi dari Folio</Link></div>
    {error && <div className="alert error">{error}</div>}
    <div className="alert"><strong>Info:</strong> Pilih sub menu untuk Expected Arrival/Departure atau actual Arrival/Departure sesuai rentang tanggal. Default tanggal adalah hari ini.</div>
    <div className="card action-toolbar" role="toolbar" aria-label="Reservation view filters">
      {reservationViews.map(([value, icon, label]) => <button key={value} type="button" className={`action-pill ${activeView === value ? 'active' : ''}`} title={label} aria-label={label} onClick={() => setActiveView(value)}><FontAwesomeIcon icon={icon} className="icon-action" aria-hidden="true" />{label}</button>)}
    </div>
    <div className="card table-card">
      <div className="page-header"><div><h2>Daftar Reservasi</h2><p className="muted">View aktif: {reservationViews.find(([value]) => value === activeView)?.[2]}</p></div><form className="filter-grid compact" onSubmit={(e) => { e.preventDefault(); load(); }}><input placeholder="Guest / kode / kamar" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} disabled={activeView !== 'all'}><option value="all">Semua status</option>{RESERVATION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select><input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} /><input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} /><IconButton icon={faFilter} label="Filter" title="Filter" type="submit" variant="primary" /></form></div>
      {loading ? <p>Memuat reservasi...</p> : reservations.length === 0 ? <p className="muted">Reservasi tidak ditemukan.</p> : <table><thead><tr><th>Kode</th><th>Folio</th><th>Tamu</th><th>Kamar</th><th>Check-in</th><th>Check-out</th><th>Actual In</th><th>Actual Out</th><th>Rate/Deposit</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{reservations.map((reservation) => <tr key={`${reservation.id}-${reservation.stay_id || ''}`}><td>{reservation.reservation_code || '-'}</td><td>{folioNumber(reservation)}</td><td>{reservation.guests?.full_name || '-'}{reservation.guests?.is_blacklisted && <><br /><span className="badge cancelled">Blacklist</span></>}<br /><small>{reservation.guests?.phone}</small></td><td>{reservation.rooms?.room_number || 'Unassigned'}<br /><small>{reservation.room_types?.name || reservation.rooms?.room_types?.name}</small></td><td>{reservation.check_in_date || '-'}</td><td>{reservation.check_out_date || '-'}<br /><small>{reservation.check_in_date && reservation.check_out_date ? `${reservation.nights || nightsBetween(reservation.check_in_date, reservation.check_out_date)} malam` : ''}</small></td><td>{formatDateTime(reservation.actual_check_in)}</td><td>{formatDateTime(reservation.actual_check_out)}</td><td>{money.format(reservation.room_rate || 0)}<br /><small>DP {money.format(reservation.deposit_amount || 0)}</small></td><td><span className={`badge ${reservation.status}`}>{reservation.status}</span></td><td><div className="table-actions compact-actions"><IconButton icon={faInfo} title="Lihat detail" onClick={() => window.alert(`Reservasi ${reservation.reservation_code || '-'}\nTamu: ${reservation.guests?.full_name || '-'}\nFolio: ${folioNumber(reservation)}\nTanggal: ${reservation.check_in_date || '-'} - ${reservation.check_out_date || '-'}`)} /><IconButton icon={faBan} title="Cancel reservation" variant="danger" disabled={saving === reservation.id || ['checked_out','cancelled','checked_in'].includes(reservation.status) || !reservation.reservation_code} onClick={() => action(reservation, 'cancelled')} /><IconButton icon={faTriangleExclamation} title="Mark no-show" variant="danger" disabled={saving === reservation.id || reservation.status !== 'reserved' || !reservation.reservation_code} onClick={() => action(reservation, 'no_show')} /></div></td></tr>)}</tbody></table>}
    </div>
  </div>;
}
