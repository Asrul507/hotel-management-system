import { useEffect, useState } from 'react';
import { ROOM_STATUSES, housekeepingApi } from '../services/api';

export default function HousekeepingPage() {
  const [rooms, setRooms] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

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

  const updateStatus = async (roomId, status) => {
    setSaving(roomId);
    setError('');
    try {
      await housekeepingApi.updateRoomStatus(roomId, status);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  };

  return <div className="page-stack">
    <div className="page-header"><div><h1>Housekeeping</h1><p>Monitor kebersihan kamar dan ubah status setelah inspeksi.</p></div><label>Filter status<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Semua</option>{ROOM_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div>
    {error && <div className="alert error">{error}</div>}
    <div className="card table-card">{loading ? <p>Memuat kamar...</p> : <table><thead><tr><th>Kamar</th><th>Tipe</th><th>Status</th><th>Update cepat</th></tr></thead><tbody>{rooms.map((room) => <tr key={room.id}><td>{room.room_number}</td><td>{room.room_types?.name}</td><td><span className={`badge ${room.status}`}>{room.status}</span></td><td className="button-row"><button className="small" disabled={saving === room.id} onClick={() => updateStatus(room.id, 'available')}>Clean / Available</button><button className="small secondary" disabled={saving === room.id} onClick={() => updateStatus(room.id, 'dirty')}>Dirty</button><button className="small secondary" disabled={saving === room.id} onClick={() => updateStatus(room.id, 'maintenance')}>Maintenance</button><button className="small secondary" disabled={saving === room.id} onClick={() => updateStatus(room.id, 'out_of_order')}>Out of order</button></td></tr>)}</tbody></table>}</div>
  </div>;
}
