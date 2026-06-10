import { useEffect, useState } from 'react';
import { reportsApi, today } from '../services/api';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const addDays = (days) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };

export default function ReportsPage() {
  const [tab, setTab] = useState('occupancy');
  const [filters, setFilters] = useState({ startDate: today(), endDate: addDays(7) });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setReport(await reportsApi.byDateRange(filters.startDate, filters.endDate));
    } catch (err) {
      setError(err.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return <div className="page-stack">
    <div className="page-header"><div><h1>Reports</h1><p>Laporan occupancy, revenue, arrival/departure, payment, dan room status.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <form className="card inline-form forecast-filter" onSubmit={(e) => { e.preventDefault(); load(); }}><label>Mulai<input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} /></label><label>Selesai<input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} /></label><button>Apply</button></form>
    <div className="button-row"><button className={tab === 'occupancy' ? '' : 'secondary'} onClick={() => setTab('occupancy')}>Occupancy</button><button className={tab === 'revenue' ? '' : 'secondary'} onClick={() => setTab('revenue')}>Revenue/Payment</button><button className={tab === 'methods' ? '' : 'secondary'} onClick={() => setTab('methods')}>Payment Method</button><button className={tab === 'arrival' ? '' : 'secondary'} onClick={() => setTab('arrival')}>Arrival/Departure</button><button className={tab === 'room' ? '' : 'secondary'} onClick={() => setTab('room')}>Room Status</button></div>
    {loading && <div className="card">Memuat laporan...</div>}
    {!loading && !report && <div className="card muted">Data laporan belum tersedia.</div>}
    {!loading && report && tab === 'occupancy' && <div className="card table-card"><h2>Occupancy Report</h2><table><thead><tr><th>Date</th><th>Total</th><th>Inventory</th><th>Occupied</th><th>Available</th><th>Occ %</th></tr></thead><tbody>{report.occupancy.map((row) => <tr key={row.date}><td>{row.date}</td><td>{row.total_rooms}</td><td>{row.inventory_rooms}</td><td>{row.occupied_rooms}</td><td>{row.available_rooms}</td><td>{row.occupancy_percentage}%</td></tr>)}</tbody></table></div>}
    {!loading && report && tab === 'revenue' && <div className="grid"><div className="card"><h3>Folio grand total</h3><p>{money.format(report.revenue.invoice_total)}</p></div><div className="card"><h3>Payment collected</h3><p>{money.format(report.revenue.payment_collected)}</p></div><div className="card"><h3>Outstanding/Debt</h3><p>{money.format(report.revenue.outstanding_balance)}</p></div><div className="card"><h3>Refund total</h3><p>{money.format(report.revenue.refund_total || 0)}</p></div><div className="card"><h3>Cancellation/No-show fee</h3><p>{money.format(report.revenue.cancellation_total || 0)}</p></div></div>}
    {!loading && report && tab === 'methods' && <div className="card table-card"><h2>Payment Method Report</h2><table><thead><tr><th>Method</th><th>Amount</th></tr></thead><tbody>{(report.revenue.payment_methods || []).map((row) => <tr key={row.method}><td>{row.method}</td><td>{money.format(row.amount || 0)}</td></tr>)}</tbody></table></div>}
    {!loading && report && tab === 'arrival' && <div className="grid"><div className="card"><h3>Expected arrival</h3><p>{report.arrivalsDepartures.expected_arrival}</p></div><div className="card"><h3>Expected departure</h3><p>{report.arrivalsDepartures.expected_departure}</p></div><div className="card"><h3>Checked in</h3><p>{report.arrivalsDepartures.checked_in}</p></div><div className="card"><h3>Checked out</h3><p>{report.arrivalsDepartures.checked_out}</p></div></div>}
    {!loading && report && tab === 'room' && <div className="two-column"><div className="card table-card"><h2>FO Status</h2><table><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>{report.roomStatus.fo.map((row) => <tr key={row.status}><td><span className={`badge ${row.status}`}>{row.status}</span></td><td>{row.count}</td></tr>)}</tbody></table></div><div className="card table-card"><h2>HK Status</h2><table><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>{report.roomStatus.hk.map((row) => <tr key={row.status}><td><span className={`badge ${row.status.replaceAll(' ', '_')}`}>{row.status}</span></td><td>{row.count}</td></tr>)}</tbody></table></div></div>}
  </div>;
}
