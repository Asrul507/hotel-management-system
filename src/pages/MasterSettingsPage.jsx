import { useEffect, useMemo, useState } from 'react';
import { FO_STATUSES, HK_STATUSES, roomTypesApi, roomsApi } from '../services/api';

const typeFormEmpty = { code: '', name: '', description: '', base_rate: 0, max_occupancy: 2, is_active: true };
const roomFormEmpty = { room_number: '', room_type_id: '', floor: '', fo_status: 'available', hk_status: 'VC', is_active: true, notes: '' };
const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export default function MasterSettingsPage() {
  const [tab, setTab] = useState('types');
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [typeForm, setTypeForm] = useState(typeFormEmpty);
  const [roomForm, setRoomForm] = useState(roomFormEmpty);
  const [editingTypeId, setEditingTypeId] = useState('');
  const [editingRoomId, setEditingRoomId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeRoomTypes = useMemo(() => roomTypes.filter((type) => type.is_active !== false), [roomTypes]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [typesData, roomsData] = await Promise.all([roomTypesApi.list(), roomsApi.list()]);
      setRoomTypes(typesData);
      setRooms(roomsData);
      if (!roomForm.room_type_id && typesData[0]) setRoomForm((current) => ({ ...current, room_type_id: typesData[0].id }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function updateRoomField(field, value) {
    if (field === 'hk_status' && ['OOO', 'OOS'].includes(value)) {
      setRoomForm((current) => ({ ...current, hk_status: value, fo_status: 'unavailable' }));
      return;
    }
    setRoomForm((current) => ({ ...current, [field]: value }));
  }

  async function saveType(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingTypeId) await roomTypesApi.update(editingTypeId, typeForm);
      else await roomTypesApi.create(typeForm);
      setTypeForm(typeFormEmpty);
      setEditingTypeId('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveRoom(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingRoomId) await roomsApi.update(editingRoomId, roomForm);
      else await roomsApi.create(roomForm);
      setRoomForm({ ...roomFormEmpty, room_type_id: activeRoomTypes[0]?.id || '' });
      setEditingRoomId('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function editType(type) {
    setEditingTypeId(type.id);
    setTypeForm({
      code: type.code || '',
      name: type.name || '',
      description: type.description || '',
      base_rate: type.base_rate ?? type.base_price ?? 0,
      max_occupancy: type.max_occupancy || 2,
      is_active: type.is_active !== false
    });
  }

  function editRoom(room) {
    setEditingRoomId(room.id);
    setRoomForm({
      room_number: room.room_number || '',
      room_type_id: room.room_type_id || '',
      floor: room.floor || '',
      fo_status: room.fo_status || 'available',
      hk_status: room.hk_status || 'VC',
      is_active: room.is_active !== false,
      notes: room.notes || ''
    });
  }

  return <div className="page-stack">
    <div className="page-header"><div><h1>Master Setting</h1><p>Room configuration untuk tipe kamar, harga, nomor kamar, status FO, dan status HK.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="button-row"><button className={tab === 'types' ? '' : 'secondary'} onClick={() => setTab('types')}>Room Types</button><button className={tab === 'rooms' ? '' : 'secondary'} onClick={() => setTab('rooms')}>Rooms</button></div>

    {tab === 'types' && <div className="two-column">
      <form className="card form-grid" onSubmit={saveType}>
        <h2>{editingTypeId ? 'Edit Tipe Kamar' : 'Tambah Tipe Kamar'}</h2>
        <label>Code<input required value={typeForm.code} onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })} /></label>
        <label>Name<input required value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} /></label>
        <label>Base rate<input type="number" min="0" value={typeForm.base_rate} onChange={(e) => setTypeForm({ ...typeForm, base_rate: e.target.value })} /></label>
        <label>Max occupancy<input type="number" min="1" value={typeForm.max_occupancy} onChange={(e) => setTypeForm({ ...typeForm, max_occupancy: e.target.value })} /></label>
        <label>Status<select value={typeForm.is_active ? 'active' : 'inactive'} onChange={(e) => setTypeForm({ ...typeForm, is_active: e.target.value === 'active' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label className="full">Description<textarea value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} /></label>
        <button disabled={saving}>{saving ? 'Menyimpan...' : editingTypeId ? 'Simpan Perubahan' : 'Tambah Room Type'}</button>
        {editingTypeId && <button type="button" className="secondary" onClick={() => { setEditingTypeId(''); setTypeForm(typeFormEmpty); }}>Batal Edit</button>}
      </form>
      <div className="card table-card"><h2>Daftar Room Type</h2>{loading ? <p>Memuat tipe kamar...</p> : roomTypes.length === 0 ? <p className="muted">Belum ada tipe kamar.</p> : <table><thead><tr><th>Code</th><th>Name</th><th>Rate</th><th>Max</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{roomTypes.map((type) => <tr key={type.id}><td>{type.code}</td><td>{type.name}</td><td>{money.format(type.base_rate ?? type.base_price ?? 0)}</td><td>{type.max_occupancy || 2}</td><td><span className="badge">{type.is_active === false ? 'inactive' : 'active'}</span></td><td><button className="small" onClick={() => editType(type)}>Edit</button></td></tr>)}</tbody></table>}</div>
    </div>}

    {tab === 'rooms' && <div className="two-column">
      <form className="card form-grid" onSubmit={saveRoom}>
        <h2>{editingRoomId ? 'Edit Kamar' : 'Tambah Kamar'}</h2>
        <label>Nomor kamar<input required value={roomForm.room_number} onChange={(e) => updateRoomField('room_number', e.target.value)} /></label>
        <label>Lantai<input value={roomForm.floor} onChange={(e) => updateRoomField('floor', e.target.value)} /></label>
        <label>Tipe kamar<select required value={roomForm.room_type_id} onChange={(e) => updateRoomField('room_type_id', e.target.value)}>{activeRoomTypes.map((type) => <option key={type.id} value={type.id}>{type.code ? `${type.code} - ` : ''}{type.name}</option>)}</select></label>
        <label>FO Status<select value={roomForm.fo_status} onChange={(e) => updateRoomField('fo_status', e.target.value)}>{FO_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <label>HK Status<select value={roomForm.hk_status} onChange={(e) => updateRoomField('hk_status', e.target.value)}>{HK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <label>Status aktif<select value={roomForm.is_active ? 'active' : 'inactive'} onChange={(e) => updateRoomField('is_active', e.target.value === 'active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label className="full">Catatan<textarea value={roomForm.notes} onChange={(e) => updateRoomField('notes', e.target.value)} /></label>
        <button disabled={saving}>{saving ? 'Menyimpan...' : editingRoomId ? 'Simpan Perubahan' : 'Tambah Kamar'}</button>
        {editingRoomId && <button type="button" className="secondary" onClick={() => { setEditingRoomId(''); setRoomForm({ ...roomFormEmpty, room_type_id: activeRoomTypes[0]?.id || '' }); }}>Batal Edit</button>}
      </form>
      <div className="card table-card"><h2>Daftar Kamar</h2>{loading ? <p>Memuat kamar...</p> : rooms.length === 0 ? <p className="muted">Belum ada kamar.</p> : <table><thead><tr><th>No</th><th>Tipe</th><th>Lantai</th><th>FO</th><th>HK</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{rooms.map((room) => <tr key={room.id}><td>{room.room_number}</td><td>{room.room_types?.name || '-'}</td><td>{room.floor || '-'}</td><td><span className={`badge ${room.fo_status}`}>{room.fo_status}</span></td><td><span className={`badge ${room.hk_status?.replaceAll(' ', '_')}`}>{room.hk_status}</span></td><td>{room.is_active === false ? 'inactive' : 'active'}</td><td><button className="small" onClick={() => editRoom(room)}>Edit</button></td></tr>)}</tbody></table>}</div>
    </div>}
  </div>;
}
