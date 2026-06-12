import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MainMenuGrid from '../components/MainMenuGrid';
import { useAuth } from '../contexts/AuthContext';
import { dashboardApi, roomsApi, today } from '../services/api';
import { getBillingStatusLabel } from '../utils/billingStatus';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const shortMoney = (value) => {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1_000_000) return `Rp ${(amount / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} JT`;
  if (Math.abs(amount) >= 1_000) return `Rp ${(amount / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} RB`;
  return money.format(amount);
};

export default function HomePage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ totalRooms: 0, inventoryRooms: 0, occupied: 0, arrivalsToday: 0, departuresToday: 0, revenueToday: 0, oooRooms: 0 });
  const [rooms, setRooms] = useState([]);
  const [lists, setLists] = useState({ expectedCheckins: [], expectedCheckouts: [], actualArrivals: [], actualDepartures: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([dashboardApi.stats(), dashboardApi.todayLists(), roomsApi.list().catch(() => [])])
      .then(([nextStats, nextLists, nextRooms]) => { setStats(nextStats); setLists(nextLists); setRooms(nextRooms); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const homeStats = useMemo(() => {
    const occupancyPercentage = stats.inventoryRooms > 0 ? Math.round((stats.occupied / stats.inventoryRooms) * 100) : 0;
    return {
      ...stats,
      occupancyPercentage,
      revenueShort: shortMoney(stats.revenueToday),
      vrRooms: rooms.filter((room) => room.hk_status === 'VR').length,
      vdRooms: rooms.filter((room) => room.hk_status === 'VD').length,
      oooRooms: rooms.filter((room) => room.hk_status === 'OOO').length || stats.oooRooms || 0
    };
  }, [stats, rooms]);

  const kpis = [
    ['Occupancy', `${homeStats.occupancyPercentage}%`, 'Dihitung dari occupied rooms dibanding inventory rooms forecast hari ini.'],
    ['In House', homeStats.occupied, 'Jumlah kamar/tamu yang sedang checked-in.'],
    ['Expected Arrival', homeStats.arrivalsToday, 'Reservasi berstatus reserved dengan check-in hari ini.'],
    ['Expected Departure', homeStats.departuresToday, 'Reservasi yang dijadwalkan check-out hari ini.'],
    ['Revenue Today', money.format(homeStats.revenueToday), 'Payment folio yang tercatat hari ini.']
  ];

  return <div className="page-stack home-dashboard">
    <div className="hero-dashboard">
      <div>
        <p className="eyebrow">Hotel PMS Dashboard</p>
        <h1>Selamat datang, {profile?.full_name || 'Team Hotel'}</h1>
        <p>Landing page operasional untuk Front Office, Housekeeping, dan Report. Data hari ini berasal dari forecast, reservations, stays, folios, dan payments. Tanggal: {today()}.</p>
      </div>
      <Link className="button-link secondary-link" to="/front-office">Buka Front Office</Link>
    </div>

    {error && <div className="alert error">{error}</div>}
    {loading ? <div className="card">Memuat PMS dashboard...</div> : <>
      <section className="kpi-grid" aria-label="Dashboard ringkas">
        {kpis.map(([label, value, note]) => <div className="kpi-card" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}
      </section>
      <MainMenuGrid role={profile?.role} stats={homeStats} />
      <section className="today-activity" aria-labelledby="today-activity-title">
        <div className="section-heading"><p className="eyebrow">Today Activity</p><h2 id="today-activity-title">Aktivitas Hari Ini</h2></div>
        <div className="dashboard-lists collapsible-lists">
          <TodayActivity title="Expected Check-In Today" rows={lists.expectedCheckins} type="checkin" />
          <TodayActivity title="Expected Check-Out Today" rows={lists.expectedCheckouts} type="checkout" />
          <TodayActivity title="Actual Arrival Today" rows={lists.actualArrivals} type="actual-in" />
          <TodayActivity title="Actual Departure Today" rows={lists.actualDepartures} type="actual-out" />
        </div>
      </section>
    </>}
  </div>;
}

function TodayActivity({ title, rows, type }) {
  return <details className="card table-card activity-card" open>
    <summary><span>{title}</span><small>{rows.length} data</small></summary>
    {rows.length === 0 ? <p className="muted">Belum ada data.</p> : <table><thead><tr><th>Guest</th><th>Room</th><th>{type === 'checkout' ? 'Balance' : 'Folio'}</th></tr></thead><tbody>{rows.map((row) => {
      const reservation = row.reservations || row;
      const guest = row.guests || reservation.guests;
      const room = row.rooms || reservation.rooms;
      const folio = row.folios || reservation.folios || {};
      return <tr key={`${type}-${row.id}`}><td>{guest?.full_name || '-'}</td><td>{room?.room_number || 'Unassigned'}</td><td>{type === 'checkout' ? <>{getBillingStatusLabel(folio)}<br /><small>{money.format(folio.balance_due || 0)}</small></> : (folio.folio_number || reservation.folio_id || '-')}</td></tr>;
    })}</tbody></table>}
  </details>;
}
