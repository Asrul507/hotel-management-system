import { useEffect, useMemo, useState } from 'react';
import { forecastApi } from '../services/api';

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export default function ForecastPage() {
  const [filters, setFilters] = useState({ startDate: today(), endDate: addDays(7) });
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await forecastApi.byDateRange(filters.startDate, filters.endDate);
      setRows(data.rows);
      setSummary(data.summary);
    } catch (err) {
      setError(err.message);
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const cards = useMemo(() => summary ? [
    ['Hari', summary.days],
    ['Avg Occupancy', `${summary.average_occupancy_percentage}%`],
    ['Avg Inventory', Math.round((summary.inventory_rooms || 0) / summary.days)],
    ['Expected Arrival', summary.expected_arrival || 0],
    ['Expected Departure', summary.expected_departure || 0],
    ['Actual Arrival', summary.arrival || 0],
    ['Actual Departure', summary.departure || 0],
    ['OOO + OOS', (summary.ooo_rooms || 0) + (summary.oos_rooms || 0)]
  ] : [], [summary]);

  return <div className="page-stack">
    <div className="page-header"><div><h1>Forecast Hunian</h1><p>Forecast inventory, occupancy, arrival, dan departure berdasarkan filter tanggal.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <form className="card inline-form forecast-filter" onSubmit={(e) => { e.preventDefault(); load(); }}>
      <label>Mulai<input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} /></label>
      <label>Selesai<input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} /></label>
      <button>Apply Filter</button>
    </form>
    {summary && <div className="grid">{cards.map(([label, value]) => <div className="card" key={label}><h3>{label}</h3><p>{value}</p></div>)}</div>}
    <div className="card table-card">
      <h2>Forecast per Tanggal</h2>
      {loading ? <p>Memuat forecast...</p> : rows.length === 0 ? <p className="muted">Data forecast tidak ditemukan.</p> : <table><thead><tr><th>Date</th><th>Total Rooms</th><th>Inventory Rooms</th><th>OOO</th><th>OOS</th><th>Occupied</th><th>Expected Arrival</th><th>Expected Departure</th><th>Arrival</th><th>Departure</th><th>Room Available</th><th>Occ %</th><th>Warning</th></tr></thead><tbody>{rows.map((row) => <tr key={row.date}><td>{row.date}</td><td>{row.total_rooms}</td><td>{row.inventory_rooms}</td><td>{row.ooo_rooms}</td><td>{row.oos_rooms}</td><td>{row.occupied_rooms}</td><td>{row.expected_arrival}</td><td>{row.expected_departure}</td><td>{row.arrival || 0}</td><td>{row.departure || 0}</td><td className={row.available_rooms < 0 ? 'negative' : ''}>{row.available_rooms}</td><td>{row.occupancy_percentage}%</td><td>{row.warning || '-'}</td></tr>)}</tbody></table>}
    </div>
  </div>;
}
