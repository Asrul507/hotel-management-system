import { useEffect, useState } from 'react';
import { reportsApi } from '../services/api';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export default function ReportsPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        setSummary(await reportsApi.summary());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const cards = summary ? [
    ['Total kamar', summary.totalRooms],
    ['Occupied', summary.occupied],
    ['Available', summary.available],
    ['Dirty', summary.dirty],
    ['Maintenance', summary.maintenance],
    ['Revenue hari ini', money.format(summary.revenueToday)],
    ['Arrival hari ini', summary.arrivalsToday],
    ['Departure hari ini', summary.departuresToday]
  ] : [];

  return <div className="page-stack">
    <div className="page-header"><div><h1>Reports</h1><p>Ringkasan operasional harian hotel.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {loading ? <div className="card">Memuat laporan...</div> : <div className="grid">{cards.map(([label, value]) => <div className="card" key={label}><h3>{label}</h3><p>{value}</p></div>)}</div>}
  </div>;
}
