import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { HK_STATUSES, housekeepingApi } from '../services/api';

export default function HousekeepingPage() {
  const { profile } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const privileged = ['super_admin', 'manager'].includes(profile?.role);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRooms(await housekeepingApi.rooms(filter));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const updateStatus = async (room, status) => {
    setSaving(room.id);
    setError('');
    try {
      await housekeepingApi.updateRoomStatus(room, status, { role: profile?.role });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  };

  return <div className="page-stack">
    <div className="page-header"><div><h1>Housekeeping</h1><p>Monitor status HK kamar. Status HK kamar unavailable hanya bisa diubah super admin atau manager.</p></div><label>Filter status<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Semua</option>{HK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div>
    {error && <div className="alert error">{error}</div>}
    <div className="card table-card">{loading ? <p>Memuat kamar...</p> : rooms.length === 0 ? <p className="muted">Tidak ada kamar.</p> : <table><thead><tr><th>Kamar</th><th>Tipe</th><th>FO</th><th>HK</th><th>Update HK</th></tr></thead><tbody>{rooms.map((room) => {
      const disabled = saving === room.id || (room.fo_status === 'unavailable' && !privileged);
      return <tr key={room.id}><td>{room.room_number}</td><td>{room.room_types?.name}</td><td><span className={`badge ${room.fo_status}`}>{room.fo_status}</span></td><td><span className={`badge ${room.hk_status?.replaceAll(' ', '_')}`}>{room.hk_status}</span></td><td><select disabled={disabled} value={room.hk_status} onChange={(e) => updateStatus(room, e.target.value)}>{HK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select>{disabled && room.fo_status === 'unavailable' && <small>FO unavailable: hanya admin/manager.</small>}</td></tr>;
    })}</tbody></table>}</div>
  </div>;
}
