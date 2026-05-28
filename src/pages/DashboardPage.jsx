import { useEffect, useState } from 'react';
import { dashboardApi } from '../services/api';

export default function DashboardPage() {
  const [stats, setStats] = useState({ totalRooms: 0, occupied: 0, dirty: 0, maintenance: 0 });
  useEffect(() => { dashboardApi.stats().then(setStats); }, []);
  const available = stats.totalRooms - stats.occupied - stats.maintenance;
  const occupancy = stats.totalRooms ? Math.round((stats.occupied / stats.totalRooms) * 100) : 0;
  return <div><h1>Dashboard</h1><div className="grid">{[
    ['Total Kamar', stats.totalRooms], ['Kamar Tersedia', available], ['Kamar Terisi', stats.occupied], ['Kamar Kotor', stats.dirty],
    ['Kamar Maintenance', stats.maintenance], ['Occupancy %', `${occupancy}%`], ['Arrival Hari Ini', '-'], ['Departure Hari Ini', '-'], ['Revenue Hari Ini', '-']
  ].map(([k,v]) => <div className="card" key={k}><h3>{k}</h3><p>{v}</p></div>)}</div></div>;
}
