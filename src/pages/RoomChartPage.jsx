import { useEffect, useMemo, useState } from 'react';
import { roomChartApi, today } from '../services/api';
import { getRoomChartCellClass, getRoomChartCellLabel, ROOM_CHART_STATUSES } from '../utils/roomChart';

const dateLabel = (value) => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(`${value}T00:00:00+07:00`));
const longDate = (value) => value ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(`${value}T00:00:00+07:00`)) : '-';

const legend = [
  ['VR', 'Ready'], ['VC', 'Not ready / gantung'], ['OR/OC', 'Occupied'], ['OOO', 'Maintenance'], ['OOS', 'Out of service'], ['EA', 'Expected Arrival'], ['ED', 'Expected Departure']
];

export default function RoomChartPage() {
  const [filters, setFilters] = useState({ startDate: today(), days: 7, roomTypeId: '', floor: '', status: 'all' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [data, setData] = useState({ dateRange: [], rows: [], roomTypes: [], floors: [] });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(nextFilters = appliedFilters) {
    setLoading(true);
    setError('');
    try {
      const payload = await roomChartApi.getRoomChartData(nextFilters);
      setData(payload);
    } catch (err) {
      setError(err.message || 'Gagal memuat Room Chart.');
      setData((current) => ({ ...current, rows: [] }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(appliedFilters); }, [appliedFilters]);

  const gridTemplateColumns = useMemo(() => `150px repeat(${Math.max(data.dateRange.length, 1)}, minmax(112px, 1fr))`, [data.dateRange.length]);

  const apply = (event) => {
    event.preventDefault();
    setAppliedFilters({ ...filters, days: Math.min(Math.max(Number(filters.days || 7), 1), 31) });
  };

  const reset = () => {
    const defaults = { startDate: today(), days: 7, roomTypeId: '', floor: '', status: 'all' };
    setFilters(defaults);
    setAppliedFilters(defaults);
  };

  return <div className="page-stack room-chart-page">
    <div className="page-header"><div><h1>Room Chart</h1><p>Kalender status kamar berdasarkan tanggal.</p></div></div>
    {error && <div className="alert error">{error}</div>}

    <form className="card room-chart-filter" onSubmit={apply}>
      <label>Dari Tanggal<input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} /></label>
      <label>Jumlah Hari<input type="number" min="1" max="31" value={filters.days} onChange={(e) => setFilters({ ...filters, days: e.target.value })} /></label>
      <label>Room Type<select value={filters.roomTypeId} onChange={(e) => setFilters({ ...filters, roomTypeId: e.target.value })}><option value="">Semua</option>{data.roomTypes.map((type) => <option key={type.id} value={type.id}>{type.name || type.code}</option>)}</select></label>
      <label>Floor<select value={filters.floor} onChange={(e) => setFilters({ ...filters, floor: e.target.value })}><option value="">Semua</option>{data.floors.map((floor) => <option key={floor} value={floor}>{floor}</option>)}</select></label>
      <label>Status<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">Semua</option>{ROOM_CHART_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
      <div className="button-row"><button type="submit">Apply</button><button type="button" className="secondary" onClick={reset}>Reset</button></div>
    </form>

    <div className="card room-chart-legend">{legend.map(([status, label]) => <span key={status} className={`room-chart-legend-item status-${status.split('/')[0].toLowerCase()}`}><strong>{status}</strong> {label}</span>)}</div>

    <div className="card room-chart-card">
      <div className="room-chart-scroll">
        <div className="room-chart-grid room-chart-head" style={{ gridTemplateColumns }}>
          <div className="room-chart-room sticky-cell">No Kamar</div>
          {data.dateRange.map((date) => <div key={date} className="room-chart-date">{dateLabel(date)}<small>{date}</small></div>)}
        </div>
        {loading ? <p className="muted room-chart-empty">Memuat Room Chart...</p> : data.rows.length === 0 ? <p className="muted room-chart-empty">Data kamar tidak ditemukan.</p> : data.rows.map(({ room, blocks }) => <div key={room.id} className="room-chart-grid room-chart-row" style={{ gridTemplateColumns }}>
          <div className="room-chart-room sticky-cell"><strong>{room.room_number}</strong><small>{room.room_types?.name || '-'}</small></div>
          {blocks.map((block) => <button key={`${room.id}-${block.startDate}-${block.contextKey}`} type="button" className={getRoomChartCellClass(block.status)} style={{ gridColumn: `span ${block.colSpan}` }} title={getRoomChartCellLabel(block)} onClick={() => setSelected(block)}>
            <span className="room-chart-status">{block.status}</span><span className="room-chart-text">{getRoomChartCellLabel(block)}</span>
          </button>)}
        </div>)}
      </div>
    </div>

    {selected && <div className="modal-backdrop" role="presentation" onClick={() => setSelected(null)}><div className="modal-card room-chart-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header"><div><h2>Detail Room Chart</h2><small>Kamar {selected.room?.room_number} · {longDate(selected.startDate)}{selected.endDate !== selected.startDate ? ` - ${longDate(selected.endDate)}` : ''}</small></div><button className="modal-close" type="button" onClick={() => setSelected(null)}>×</button></div>
      <div className="overview-field-grid">
        <div className="overview-field"><span>No Kamar</span><strong>{selected.room?.room_number || '-'}</strong></div>
        <div className="overview-field"><span>Status</span><strong>{selected.status}</strong></div>
        {['OR', 'OC', 'EA', 'ED'].includes(selected.status) && <><div className="overview-field"><span>Nama Tamu</span><strong>{selected.guestName || '-'}</strong></div><div className="overview-field"><span>Arrival / Departure</span><strong>{longDate(selected.arrival)} / {longDate(selected.departure)}</strong></div><div className="overview-field"><span>No Folio</span><strong>{selected.folioNumber || '-'}</strong></div></>}
        <div className="overview-field"><span>Keterangan</span><strong>{selected.notes || '-'}</strong></div>
        <div className="overview-field"><span>Periode Block</span><strong>{selected.colSpan} hari</strong></div>
      </div>
    </div></div>}
  </div>;
}
