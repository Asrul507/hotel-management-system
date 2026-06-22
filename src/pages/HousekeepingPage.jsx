import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { housekeepingApi, roomTypesApi } from '../services/api';
import { HK_STATUSES, allowedNextHkStatuses } from '../utils/roomStatus';
import IconButton from '../components/IconButton';
import { useAppDialog } from '../components/AppDialog';
import { faBroom } from '@fortawesome/free-solid-svg-icons';

const normalFlow = { VD: 'VC', OD: 'OC', VC: 'VR' };

export default function HousekeepingPage() {
  const { profile } = useAuth();
  const dialog = useAppDialog();
  const [rooms, setRooms] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [selected, setSelected] = useState([]);
  const [activeTab, setActiveTab] = useState('room_status');
  const [filters, setFilters] = useState({ hkStatus: 'all', floor: '', roomTypeId: '' });
  const [bulk, setBulk] = useState({ target_hk_status: 'VC', notes: '' });
  const [notes, setNotes] = useState({});
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const privileged = ['super_admin', 'admin', 'manager'].includes(profile?.role);
  const floors = useMemo(() => [...new Set(rooms.map((room) => room.floor).filter(Boolean))], [rooms]);
  const visibleRooms = activeTab === 'ooo_oos' ? rooms.filter((room) => ['OOO', 'OOS'].includes(room.hk_status)) : rooms;
  const allSelected = visibleRooms.length > 0 && visibleRooms.every((room) => selected.includes(room.id));
  const selectedRoomsForBulk = rooms.filter((room) => selected.includes(room.id));
  const bulkStatuses = selectedRoomsForBulk.length === 0
    ? []
    : allowedNextHkStatuses(selectedRoomsForBulk[0], profile?.role).filter((status) => selectedRoomsForBulk.every((room) => allowedNextHkStatuses(room, profile?.role).includes(status)));


  useEffect(() => {
    if (bulkStatuses.length > 0 && !bulkStatuses.includes(bulk.target_hk_status)) {
      setBulk((current) => ({ ...current, target_hk_status: bulkStatuses[0] }));
    }
  }, [bulkStatuses.join('|'), bulk.target_hk_status]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [roomData, typeData] = await Promise.all([housekeepingApi.rooms(filters), roomTypesApi.list()]);
      setRooms(roomData);
      setRoomTypes(typeData);
      setSelected([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters.hkStatus, filters.floor, filters.roomTypeId]);

  const updateStatus = async (room, status) => {
    setSaving(room.id);
    setError('');
    setSuccess('');
    try {
      const note = notes[room.id] || '';
      await housekeepingApi.updateRoomStatus(room, status, { role: profile?.role, notes: note });
      setNotes((current) => ({ ...current, [room.id]: '' }));
      setSuccess(`Kamar ${room.room_number} berhasil diupdate ke ${status}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  };

  const bulkUpdate = async (event) => {
    event.preventDefault();
    const selectedRooms = rooms.filter((room) => selected.includes(room.id));
    if (selectedRooms.length === 0) return setError('Pilih minimal satu kamar.');
    if (!bulkStatuses.includes(bulk.target_hk_status)) return setError('Target HK status tidak valid untuk kombinasi kamar/role yang dipilih.');
    const fromText = filters.hkStatus === 'all' ? 'status terpilih' : filters.hkStatus;
    const confirmed = await dialog.confirm({ title: 'Bulk Update Housekeeping', message: `Update ${selectedRooms.length} kamar dari ${fromText} ke ${bulk.target_hk_status}?`, confirmLabel: 'Update' });
    if (!confirmed) return;
    setSaving('bulk');
    setError('');
    setSuccess('');
    try {
      const result = await housekeepingApi.bulkUpdate(selectedRooms, bulk.target_hk_status, { role: profile?.role, notes: bulk.notes });
      const failedText = result.failed?.length ? ` Gagal: ${result.failed.map((item) => `${item.room_number} (${item.error})`).join('; ')}` : '';
      setSuccess(`${result.succeeded?.length || 0}/${result.total || selectedRooms.length} kamar berhasil diupdate ke ${bulk.target_hk_status}.${failedText}`);
      setSelected([]);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  };

  return <div className="page-stack">
    <div className="page-header"><div><h1>Housekeeping</h1><p>Update HK satuan atau bulk. Role housekeeping tidak dapat mengubah FO status atau kamar FO unavailable.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {success && <div className="alert success">{success}</div>}
    <div className="card action-toolbar module-tabs" role="toolbar" aria-label="Housekeeping tabs"><button type="button" className={`action-pill ${activeTab === 'room_status' ? 'active' : ''}`} onClick={() => setActiveTab('room_status')}>Room Status</button><button type="button" className={`action-pill ${activeTab === 'bulk_update' ? 'active' : ''}`} onClick={() => setActiveTab('bulk_update')}>Bulk Update</button><button type="button" className={`action-pill ${activeTab === 'ooo_oos' ? 'active' : ''}`} onClick={() => { setActiveTab('ooo_oos'); setFilters((current) => ({ ...current, hkStatus: 'all' })); }}>OOO/OOS</button><Link className="button-link secondary-link" to="/maintenance">Maintenance</Link></div>
    <div className="card filter-grid"><select value={filters.hkStatus} onChange={(e) => setFilters({ ...filters, hkStatus: e.target.value })}><option value="all">Semua HK</option>{HK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select><select value={filters.floor} onChange={(e) => setFilters({ ...filters, floor: e.target.value })}><option value="">Semua lantai</option>{floors.map((floor) => <option key={floor} value={floor}>{floor}</option>)}</select><select value={filters.roomTypeId} onChange={(e) => setFilters({ ...filters, roomTypeId: e.target.value })}><option value="">Semua tipe</option>{roomTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div>
    {activeTab === 'bulk_update' && <form className="card filter-grid action-toolbar" onSubmit={bulkUpdate}><strong>Bulk Update</strong><select value={bulk.target_hk_status} onChange={(e) => setBulk({ ...bulk, target_hk_status: e.target.value })}>{bulkStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><input placeholder="Catatan bulk (wajib OOO/OOS)" value={bulk.notes} onChange={(e) => setBulk({ ...bulk, notes: e.target.value })} /><button disabled={saving === 'bulk' || selected.length === 0 || bulkStatuses.length === 0}>Apply Bulk Update ({selected.length} kamar)</button></form>}
    <div className="card table-card">{loading ? <p>Memuat kamar...</p> : visibleRooms.length === 0 ? <p className="muted">Tidak ada kamar.</p> : <table><thead><tr><th><input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? visibleRooms.map((room) => room.id) : [])} /></th><th>Kamar</th><th>Tipe/Lantai</th><th>FO</th><th>HK</th><th>Catatan</th><th>Update HK</th><th>Quick Action</th></tr></thead><tbody>{visibleRooms.map((room) => {
      const roleBlocked = ['cashier', 'receptionist', 'frontdesk'].includes(profile?.role) || (room.fo_status === 'unavailable' && !privileged);
      const currentNote = notes[room.id] || '';
      const statusOptions = allowedNextHkStatuses(room, profile?.role);
      const visibleStatusOptions = statusOptions.includes(room.hk_status) ? statusOptions : [room.hk_status, ...statusOptions];
      return <tr key={room.id}><td><input type="checkbox" checked={selected.includes(room.id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, room.id] : current.filter((id) => id !== room.id))} /></td><td>{room.room_number}</td><td>{room.room_types?.name}<br /><small>Lantai {room.floor || '-'}</small></td><td><span className={`badge ${room.fo_status}`}>{room.fo_status}</span></td><td><span className={`badge ${room.hk_status?.replaceAll(' ', '_')}`}>{room.hk_status}</span></td><td><input placeholder="Catatan (wajib OOO/OOS)" value={currentNote} onChange={(e) => setNotes({ ...notes, [room.id]: e.target.value })} /><small>{room.notes || '-'}</small></td><td><select disabled={saving === room.id || roleBlocked || statusOptions.length === 0} value={room.hk_status} onChange={(e) => updateStatus(room, e.target.value)}>{visibleStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select>{roleBlocked && <small>Manual HK update tidak tersedia untuk role ini/status ini.</small>}</td><td>{normalFlow[room.hk_status] && statusOptions.includes(normalFlow[room.hk_status]) ? <IconButton icon={faBroom} label={`${room.hk_status} ke ${normalFlow[room.hk_status]}`} title={`Update ${room.hk_status} ke ${normalFlow[room.hk_status]}`} disabled={saving === room.id || roleBlocked} variant="primary" onClick={() => updateStatus(room, normalFlow[room.hk_status])} /> : <span className="muted">-</span>}</td></tr>;
    })}</tbody></table>}</div>
  </div>;
}
