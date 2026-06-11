import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { foliosApi, nightsBetween, reservationsApi, roomsApi, staysApi, today } from '../services/api';
import { getBillingStatus, getBillingStatusLabel } from '../utils/billingStatus';
import IconButton from '../components/IconButton';
import { faClipboardList, faFilter, faRightFromBracket, faRightToBracket } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const views = [
  ['expected_arrival', 'Expected Arrival'],
  ['expected_departure', 'Expected Departure'],
  ['arrival', 'Arrival'],
  ['departure', 'Departure'],
  ['in_house', 'In House'],
  ['all', 'All Reservations']
];

export default function FrontOfficePage() {
  const [activeView, setActiveView] = useState('expected_arrival');
  const [rows, setRows] = useState([]);
  const [folios, setFolios] = useState([]);
  const [roomChoices, setRoomChoices] = useState({});
  const [selectedRooms, setSelectedRooms] = useState({});
  const [filters, setFilters] = useState({ search: '', startDate: today(), endDate: today(), status: 'all' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const effective = { ...filters, startDate: filters.startDate || today(), endDate: filters.endDate || filters.startDate || today() };
      const [folioData, data] = await Promise.all([
        foliosApi.list().catch(() => []),
        activeView === 'in_house' ? staysApi.active() : reservationsApi.listByView(activeView, effective)
      ]);
      setFolios(folioData);
      const normalizedRows = (data || []).map((row) => ({
        ...row,
        folios: row.folios || folioData.find((folio) => folio.id === (row.folio_id || row.reservations?.folio_id)) || null
      }));
      setRows(normalizedRows);
      if (activeView === 'expected_arrival') {
        const choices = {};
        await Promise.all(normalizedRows.map(async (reservation) => {
          choices[reservation.id] = await roomsApi.availableForStay({
            check_in_date: reservation.check_in_date,
            check_out_date: reservation.check_out_date,
            room_type_id: reservation.room_type_id,
            exclude_reservation_id: reservation.id
          }).catch(() => []);
        }));
        setRoomChoices(choices);
      } else {
        setRoomChoices({});
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [activeView]);

  async function run(key, action, done = '') {
    setSaving(key);
    setError('');
    setSuccess('');
    try {
      await action();
      if (done) setSuccess(done);
      await load();
      return true;
    } catch (err) {
      setError(err.message === 'EARLY_CHECKOUT_CONFIRM_REQUIRED' ? 'Tamu check-out lebih awal dari tanggal rencana. Konfirmasi diperlukan.' : err.message);
      return false;
    } finally {
      setSaving('');
    }
  }

  const folioNumber = (row) => row.folios?.folio_number || row.folio_id || row.reservations?.folio_id || '-';
  const formatDateTime = (value) => value ? String(value).slice(0, 16).replace('T', ' ') : '-';
  const billingStatus = (row) => getBillingStatus(row.folios || {});

  const handleCheckIn = (reservation) => {
    const selectedRoomId = selectedRooms[reservation.id] || reservation.room_id;
    run(`checkin-${reservation.id}`, () => staysApi.checkIn(reservation, selectedRoomId), 'Check-in berhasil. Tamu masuk ke In House.').then((ok) => { if (ok) setActiveView('in_house'); });
  };

  const handleCheckOut = (stay) => {
    const expected = stay.reservations?.check_out_date || stay.reservations?.checkout_date;
    const early = expected && today() < expected;
    const proceed = !early || window.confirm('Tamu check-out lebih awal dari tanggal rencana. Jika dilanjutkan, tanggal check-out reservasi akan diubah menjadi hari ini. Lanjutkan?');
    if (!proceed) return;
    run(`checkout-${stay.id}`, () => staysApi.checkOut(stay, { earlyCheckoutApproved: early }), 'Check-out berhasil. Kamar menjadi VD.');
  };

  const visibleRows = rows.filter((row) => {
    const value = filters.search.trim().toLowerCase();
    if (!value) return true;
    return [row.reservation_code, row.reservations?.reservation_code, row.guests?.full_name, row.reservations?.guests?.full_name, row.rooms?.room_number]
      .some((field) => String(field || '').toLowerCase().includes(value));
  });

  return <div className="page-stack">
    <div className="page-header"><div><h1>Front Office</h1><p>Expected arrival/departure, actual arrival/departure, in-house, dan action check-in/check-out dikelola dari satu menu.</p></div><Link className="button-link" to="/billing">Buat Reservasi/Folio</Link></div>
    {error && <div className="alert error">{error}</div>}
    {success && <div className="alert success">{success}</div>}
    <div className="card action-toolbar" role="toolbar" aria-label="Front Office tabs">
      {views.map(([value, label]) => <button key={value} type="button" className={`action-pill ${activeView === value ? 'active' : ''}`} onClick={() => setActiveView(value)}><FontAwesomeIcon icon={faClipboardList} aria-hidden="true" />{label}</button>)}
    </div>
    <form className="card filter-grid" onSubmit={(e) => { e.preventDefault(); load(); }}>
      <input placeholder="Cari guest / kode / kamar" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
      <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
      <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
      <IconButton icon={faFilter} label="Filter" title="Filter" type="submit" variant="primary" />
    </form>
    <div className="card table-card">
      <div className="page-header"><div><h2>{views.find(([value]) => value === activeView)?.[1]}</h2><p className="muted">Tanggal default hari ini. Room picker hanya menampilkan kamar VR yang ready.</p></div></div>
      {loading ? <p>Memuat Front Office...</p> : visibleRows.length === 0 ? <p className="muted">Tidak ada data untuk view ini.</p> : activeView === 'in_house' ? <InHouseTable rows={visibleRows} folioNumber={folioNumber} billingStatus={billingStatus} saving={saving} onCheckOut={handleCheckOut} /> : <ReservationTable rows={visibleRows} activeView={activeView} folioNumber={folioNumber} formatDateTime={formatDateTime} roomChoices={roomChoices} selectedRooms={selectedRooms} setSelectedRooms={setSelectedRooms} saving={saving} onCheckIn={handleCheckIn} />}
    </div>
  </div>;
}

function ReservationTable({ rows, activeView, folioNumber, formatDateTime, roomChoices, selectedRooms, setSelectedRooms, saving, onCheckIn }) {
  return <table><thead><tr><th>Kode</th><th>Folio</th><th>Tamu</th><th>Kamar</th><th>Check-in</th><th>Check-out</th><th>Actual In</th><th>Actual Out</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{rows.map((reservation) => {
    const choices = roomChoices[reservation.id] || [];
    const needsRoom = activeView === 'expected_arrival' && reservation.status === 'reserved' && !reservation.room_id;
    return <tr key={`${reservation.id}-${reservation.stay_id || ''}`}><td>{reservation.reservation_code || '-'}</td><td>{folioNumber(reservation)}</td><td>{reservation.guests?.full_name || '-'}</td><td>{reservation.rooms?.room_number || 'Unassigned'}<br /><small>{reservation.room_types?.name || reservation.rooms?.room_types?.name || '-'}</small>{needsRoom && <><select value={selectedRooms[reservation.id] || ''} onChange={(e) => setSelectedRooms((current) => ({ ...current, [reservation.id]: e.target.value }))}><option value="">Pilih kamar VR</option>{choices.map((room) => <option key={room.id} value={room.id}>{room.room_number} - {room.hk_status}</option>)}</select>{choices.length === 0 && <small>Tidak ada kamar VR yang ready untuk tanggal ini.</small>}</>}</td><td>{reservation.check_in_date || '-'}</td><td>{reservation.check_out_date || '-'}<br /><small>{reservation.check_in_date && reservation.check_out_date ? `${reservation.nights || nightsBetween(reservation.check_in_date, reservation.check_out_date)} malam` : ''}</small></td><td>{formatDateTime(reservation.actual_check_in)}</td><td>{formatDateTime(reservation.actual_check_out)}</td><td><span className={`badge ${reservation.status}`}>{reservation.status}</span></td><td>{activeView === 'expected_arrival' && reservation.status === 'reserved' && <IconButton icon={faRightToBracket} title="Check In" disabled={saving === `checkin-${reservation.id}` || (needsRoom && !selectedRooms[reservation.id])} variant="primary" onClick={() => onCheckIn(reservation)} />}</td></tr>;
  })}</tbody></table>;
}

function InHouseTable({ rows, folioNumber, billingStatus, saving, onCheckOut }) {
  return <table><thead><tr><th>Guest</th><th>Room</th><th>Folio</th><th>Check-in</th><th>Expected Check-out</th><th>Nights</th><th>Billing</th><th>Balance Due</th><th>Aksi</th></tr></thead><tbody>{rows.map((stay) => {
    const status = billingStatus(stay);
    return <tr key={stay.id}><td>{stay.guests?.full_name || stay.reservations?.guests?.full_name || '-'}</td><td>{stay.rooms?.room_number || '-'}</td><td>{folioNumber(stay)}</td><td>{String(stay.actual_check_in || stay.checkin_at || '').slice(0, 10) || '-'}</td><td>{stay.reservations?.check_out_date || '-'}</td><td>{stay.reservations?.check_in_date && stay.reservations?.check_out_date ? nightsBetween(stay.reservations.check_in_date, stay.reservations.check_out_date) : '-'}</td><td><span className={`badge ${status}`}>{getBillingStatusLabel(stay.folios || {})}</span></td><td>{money.format(stay.folios?.balance_due || 0)}</td><td><IconButton icon={faRightFromBracket} title="Check Out" disabled={saving === `checkout-${stay.id}`} variant="primary" onClick={() => onCheckOut(stay)} /></td></tr>;
  })}</tbody></table>;
}
