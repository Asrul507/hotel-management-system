import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../services/api';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export default function DashboardPage() {
  const [stats, setStats] = useState({ totalRooms: 0, inventoryRooms: 0, occupied: 0, available: 0, oooRooms: 0, oosRooms: 0, arrivalsToday: 0, departuresToday: 0, revenueToday: 0, outstandingBalance: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    dashboardApi.stats().then(setStats).catch((err) => setError(err.message)).finally(() => setLoading(false));
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
    <div className="page-header"><div><h1>Dashboard</h1><p>Angka operasional memakai FO/HK status, reservasi, stays, invoice, dan payment.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {loading ? <div className="card">Memuat dashboard...</div> : <div className="grid">{cards.map(([key, value]) => <div className="card" key={key}><h3>{key}</h3><p>{value}</p></div>)}</div>}
    <div className="card"><h2>Quick Link Operasional</h2><div className="button-row"><Link className="button-link" to="/billing">Buat Reservasi</Link><Link className="button-link" to="/checkin">Check-in/out</Link><Link className="button-link" to="/housekeeping">Housekeeping</Link><Link className="button-link" to="/billing">Billing</Link></div></div>
  </div>;
}
