import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi, today } from '../services/api';
import { getBillingStatusLabel } from '../utils/billingStatus';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export default function DashboardPage() {
  const [stats, setStats] = useState({ totalRooms: 0, inventoryRooms: 0, occupied: 0, available: 0, oooRooms: 0, oosRooms: 0, arrivalsToday: 0, departuresToday: 0, revenueToday: 0, outstandingBalance: 0 });
  const [lists, setLists] = useState({ expectedCheckins: [], expectedCheckouts: [], actualArrivals: [], actualDepartures: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([dashboardApi.stats(), dashboardApi.todayLists()])
      .then(([nextStats, nextLists]) => { setStats(nextStats); setLists(nextLists); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    ['Total rooms', stats.totalRooms],
    ['Inventory rooms', stats.inventoryRooms],
    ['Occupied rooms', stats.occupied],
    ['Available rooms', stats.available],
    ['OOO rooms', stats.oooRooms],
    ['OOS rooms', stats.oosRooms],
    ['Expected arrival today', stats.arrivalsToday],
    ['Expected departure today', stats.departuresToday],
    ['Revenue today', money.format(stats.revenueToday)],
    ['Outstanding balance', money.format(stats.outstandingBalance)]
  ];

  return <div className="page-stack">
    <div className="page-header"><div><h1>Dashboard</h1><p>Angka operasional memakai FO/HK status, reservasi, stays, invoice, dan payment. Tanggal hari ini: {today()}.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {loading ? <div className="card">Memuat dashboard...</div> : <>
      <div className="grid">{cards.map(([key, value]) => <div className="card" key={key}><h3>{key}</h3><p>{value}</p></div>)}</div>
      <div className="dashboard-lists">
        <TodayTable title="Expected Check-in Hari Ini" rows={lists.expectedCheckins} type="checkin" />
        <TodayTable title="Expected Check-out Hari Ini" rows={lists.expectedCheckouts} type="checkout" />
        <TodayTable title="Actual Arrival Hari Ini" rows={lists.actualArrivals} type="actual-in" />
        <TodayTable title="Actual Departure Hari Ini" rows={lists.actualDepartures} type="actual-out" />
      </div>
    </>}
    <div className="card"><h2>Quick Link Operasional</h2><div className="button-row"><Link className="button-link" to="/billing">Buat Reservasi</Link><Link className="button-link" to="/front-office">Front Office</Link><Link className="button-link" to="/housekeeping">Housekeeping</Link><Link className="button-link" to="/billing">Billing</Link></div></div>
  </div>;
}

function TodayTable({ title, rows, type }) {
  return <div className="card table-card"><div className="page-header"><div><h2>{title}</h2><p className="muted">{rows.length} data</p></div><Link className="button-link" to="/front-office">Front Office</Link></div>{rows.length === 0 ? <p className="muted">Belum ada data.</p> : <table><thead><tr><th>Guest</th><th>Room</th><th>Folio</th><th>Tanggal</th>{type.includes('checkout') && <th>Billing</th>}<th>Aksi</th></tr></thead><tbody>{rows.map((row) => {
    const reservation = row.reservations || row;
    const guest = row.guests || reservation.guests;
    const room = row.rooms || reservation.rooms;
    const dateValue = type === 'actual-in' ? row.actual_check_in || row.checkin_at : type === 'actual-out' ? row.actual_check_out || row.checkout_at : type === 'checkin' ? reservation.check_in_date : reservation.check_out_date;
    return <tr key={`${type}-${row.id}`}><td>{guest?.full_name || '-'}</td><td>{room?.room_number || 'Unassigned'}</td><td>{row.folios?.folio_number || reservation.folio_id || '-'}</td><td>{String(dateValue || '-').slice(0, 16).replace('T', ' ')}</td>{type.includes('checkout') && <td>{getBillingStatusLabel(row.folios || {})}<br /><small>{money.format(row.folios?.balance_due || 0)}</small></td>}<td><Link className="button-link" to="/front-office">Lihat</Link></td></tr>;
  })}</tbody></table>}</div>;
}
