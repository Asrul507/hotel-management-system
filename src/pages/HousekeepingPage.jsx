import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { HK_STATUSES, housekeepingApi, roomTypesApi } from '../services/api';

const normalFlow = { VD: 'VC', OD: 'OC', VC: 'VR' };

export default function HousekeepingPage() {
  const { profile } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [filters, setFilters] = useState({ hkStatus: 'all', floor: '', roomTypeId: '' });
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const privileged = ['super_admin', 'manager'].includes(profile?.role);
  const floors = useMemo(() => [...new Set(rooms.map((room) => room.floor).filter(Boolean))], [rooms]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [roomData, typeData] = await Promise.all([housekeepingApi.rooms(filters), roomTypesApi.list()]);
      setRooms(roomData);
      setRoomTypes(typeData);
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
    try {
      const note = notes[room.id] || '';
      await housekeepingApi.updateRoomStatus(room, status, { role: profile?.role, notes: note, fo_status: ['OOO', 'OOS'].includes(room.hk_status) && !['OOO', 'OOS'].includes(status) && privileged ? 'available' : undefined });
      setNotes((current) => ({ ...current, [room.id]: '' }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  };

  return <div className="page-stack">
    <div className="page-header"><div><h1>Housekeeping</h1><p>HK hanya mengelola kondisi fisik kamar; FO inventory hanya berubah untuk OOO/OOS atau oleh manager/super admin.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="card filter-grid"><select value={filters.hkStatus} onChange={(e) => setFilters({ ...filters, hkStatus: e.target.value })}><option value="all">Semua HK</option>{HK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select><select value={filters.floor} onChange={(e) => setFilters({ ...filters, floor: e.target.value })}><option value="">Semua lantai</option>{floors.map((floor) => <option key={floor} value={floor}>{floor}</option>)}</select><select value={filters.roomTypeId} onChange={(e) => setFilters({ ...filters, roomTypeId: e.target.value })}><option value="">Semua tipe</option>{roomTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div>
    <div className="card table-card">{loading ? <p>Memuat kamar...</p> : rooms.length === 0 ? <p className="muted">Tidak ada kamar.</p> : <table><thead><tr><th>Kamar</th><th>Tipe/Lantai</th><th>FO</th><th>HK</th><th>Catatan</th><th>Update HK</th><th>Quick Action</th></tr></thead><tbody>{rooms.map((room) => {
      const roleBlocked = profile?.role === 'cashier' || (room.fo_status === 'unavailable' && !privileged);
      const oooBlocked = !privileged;
      const currentNote = notes[room.id] || '';
      return <tr key={room.id}><td>{room.room_number}</td><td>{room.room_types?.name}<br /><small>Lantai {room.floor || '-'}</small></td><td><span className={`badge ${room.fo_status}`}>{room.fo_status}</span></td><td><span className={`badge ${room.hk_status?.replaceAll(' ', '_')}`}>{room.hk_status}</span></td><td><input placeholder="Catatan (wajib OOO/OOS)" value={currentNote} onChange={(e) => setNotes({ ...notes, [room.id]: e.target.value })} /><small>{room.notes || '-'}</small></td><td><select disabled={saving === room.id || roleBlocked} value={room.hk_status} onChange={(e) => updateStatus(room, e.target.value)}>{HK_STATUSES.map((status) => <option key={status} value={status} disabled={['OOO', 'OOS'].includes(status) && oooBlocked}>{status}</option>)}</select>{roleBlocked && <small>FO unavailable hanya bisa diubah manager/super admin.</small>}</td><td>{normalFlow[room.hk_status] ? <button className="small" disabled={saving === room.id || roleBlocked} onClick={() => updateStatus(room, normalFlow[room.hk_status])}>{room.hk_status} → {normalFlow[room.hk_status]}</button> : <span className="muted">-</span>}</td></tr>;
    })}</tbody></table>}</div>
  </div>;
}
