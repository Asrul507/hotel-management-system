import { useEffect, useState } from 'react';
import { ROOM_STATUSES, roomsApi, roomTypesApi } from '../services/api';
import IconButton from '../components/IconButton';
import { faPenToSquare } from '@fortawesome/free-solid-svg-icons';

const emptyForm = { room_number: '', floor: '', room_type_id: '', status: 'available', notes: '' };
const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export default function RoomsPage() {
  const [rooms, setRooms] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [roomData, typeData] = await Promise.all([roomsApi.list(), roomTypesApi.list()]);
      setRooms(roomData);
      setRoomTypes(typeData);
      if (!form.room_type_id && typeData[0]) setForm((current) => ({ ...current, room_type_id: typeData[0].id }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, floor: form.floor || null, notes: form.notes || null };
      if (editingId) await roomsApi.update(editingId, payload);
      else await roomsApi.create(payload);
      setForm({ ...emptyForm, room_type_id: roomTypes[0]?.id || '' });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const edit = (room) => {
    setEditingId(room.id);
    setForm({
      room_number: room.room_number,
      floor: room.floor || '',
      room_type_id: room.room_type_id,
      status: room.status,
      notes: room.notes || ''
    });
  };

  return <div className="page-stack">
    <div className="page-header"><div><h1>Master Data Kamar</h1><p>Kelola nomor kamar, tipe, harga, dan status operasional.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="two-column">
      <form className="card form-grid" onSubmit={submit}>
        <h2>{editingId ? 'Edit Kamar' : 'Tambah Kamar'}</h2>
        <label>Nomor kamar<input required value={form.room_number} onChange={(e) => setForm({ ...form, room_number: e.target.value })} /></label>
        <label>Lantai<input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} /></label>
        <label>Tipe kamar<select required value={form.room_type_id} onChange={(e) => setForm({ ...form, room_type_id: e.target.value })}>{roomTypes.map((type) => <option key={type.id} value={type.id}>{type.name} - {money.format(type.base_price)}</option>)}</select></label>
        <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{ROOM_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <label className="full">Catatan<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <button disabled={saving}>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Kamar'}</button>
        {editingId && <button type="button" className="secondary" onClick={() => { setEditingId(null); setForm({ ...emptyForm, room_type_id: roomTypes[0]?.id || '' }); }}>Batal Edit</button>}
      </form>
      <div className="card table-card">
        <h2>Daftar Kamar</h2>
        {loading ? <p>Memuat kamar...</p> : <table><thead><tr><th>No</th><th>Tipe</th><th>Harga</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{rooms.map((room) => <tr key={room.id}><td>{room.room_number}</td><td>{room.room_types?.name || '-'}</td><td>{money.format(room.room_types?.base_price || 0)}</td><td><span className={`badge ${room.status}`}>{room.status}</span></td><td><div className="table-actions"><IconButton icon={faPenToSquare} title="Edit" onClick={() => edit(room)} /></div></td></tr>)}</tbody></table>}
      </div>
    </div>
  </div>;
}
