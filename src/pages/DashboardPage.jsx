import { useEffect, useState } from 'react';
import { dashboardApi } from '../services/api';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export default function DashboardPage() {
  const [stats, setStats] = useState({ totalRooms: 0, occupied: 0, available: 0, dirty: 0, maintenance: 0, arrivalsToday: 0, departuresToday: 0, revenueToday: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    dashboardApi.stats().then(setStats).catch((err) => setError(err.message));
  }, []);

  const occupancy = stats.totalRooms ? Math.round((stats.occupied / stats.totalRooms) * 100) : 0;
  const cards = [
    ['Total Kamar', stats.totalRooms],
    ['Kamar Tersedia', stats.available],
    ['Kamar Terisi', stats.occupied],
    ['Kamar Kotor', stats.dirty],
    ['Kamar Maintenance', stats.maintenance],
    ['Occupancy %', `${occupancy}%`],
    ['Arrival Hari Ini', stats.arrivalsToday],
    ['Departure Hari Ini', stats.departuresToday],
    ['Revenue Hari Ini', money.format(stats.revenueToday)]
  ];

  return <div className="page-stack"><h1>Dashboard</h1>{error && <div className="alert error">{error}</div>}<div className="grid">{cards.map(([key, value]) => <div className="card" key={key}><h3>{key}</h3><p>{value}</p></div>)}</div></div>;
}
