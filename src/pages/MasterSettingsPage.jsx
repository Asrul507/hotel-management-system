import { useEffect, useMemo, useState } from 'react';
import { FO_STATUSES, hotelSettingsApi, roomTypesApi, roomsApi } from '../services/api';
import { HK_STATUSES, allowedNextHkStatuses, deriveFoStatusFromHkStatus } from '../utils/roomStatus';
import IconButton from '../components/IconButton';
import { faPenToSquare } from '@fortawesome/free-solid-svg-icons';

const hotelFormEmpty = { hotel_name: '', address: '', phone: '', tax_percent: 0, service_charge_percent: 0, tax_mode: 'exclusive', invoice_prefix: 'INV', default_checkin_time: '14:00', default_checkout_time: '12:00' };
const typeFormEmpty = { code: '', name: '', description: '', base_rate: 0, max_occupancy: 2, facilities: '', is_active: true };
const roomFormEmpty = { room_number: '', room_type_id: '', floor: '', fo_status: 'available', hk_status: 'VC', is_active: true, notes: '' };
const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export default function MasterSettingsPage() {
  const [tab, setTab] = useState('hotel');
  const [hotelForm, setHotelForm] = useState(hotelFormEmpty);
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [typeForm, setTypeForm] = useState(typeFormEmpty);
  const [roomForm, setRoomForm] = useState(roomFormEmpty);
  const [editingTypeId, setEditingTypeId] = useState('');
  const [editingRoomId, setEditingRoomId] = useState('');
  const [filters, setFilters] = useState({ search: '', roomTypeId: '', fo: 'all', hk: 'all' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeRoomTypes = useMemo(() => roomTypes.filter((type) => type.is_active !== false), [roomTypes]);
  const filteredRooms = useMemo(() => rooms.filter((room) => {
    const search = filters.search.toLowerCase();
    return (!search || room.room_number?.toLowerCase().includes(search))
      && (!filters.roomTypeId || room.room_type_id === filters.roomTypeId)
      && (filters.fo === 'all' || room.fo_status === filters.fo)
      && (filters.hk === 'all' || room.hk_status === filters.hk);
  }), [rooms, filters]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [hotelData, typesData, roomsData] = await Promise.all([hotelSettingsApi.get(), roomTypesApi.list(), roomsApi.list()]);
      setHotelForm({ ...hotelFormEmpty, ...hotelData });
      setRoomTypes(typesData);
      setRooms(roomsData);
      if (!roomForm.room_type_id && typesData[0]) setRoomForm((current) => ({ ...current, room_type_id: typesData.find((type) => type.is_active !== false)?.id || '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function updateRoomField(field, value) {
    if (field === 'hk_status') {
      setRoomForm((current) => ({ ...current, hk_status: value, fo_status: deriveFoStatusFromHkStatus(value, current.fo_status) }));
      return;
    }
    setRoomForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(handler, reset) {
    setSaving(true);
    setError('');
    try {
      await handler();
      reset?.();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function editType(type) {
    setEditingTypeId(type.id);
    setTypeForm({ code: type.code || '', name: type.name || '', description: type.description || '', base_rate: type.base_rate ?? type.base_price ?? 0, max_occupancy: type.max_occupancy || 2, facilities: Array.isArray(type.facilities) ? type.facilities.join(', ') : '', is_active: type.is_active !== false });
    setTab('types');
  }

  function editRoom(room) {
    setEditingRoomId(room.id);
    setRoomForm({ room_number: room.room_number || '', room_type_id: room.room_type_id || '', floor: room.floor || '', fo_status: room.fo_status || 'available', hk_status: room.hk_status || 'VC', is_active: room.is_active !== false, notes: room.notes || '' });
    setTab('rooms');
  }

  return <div className="page-stack">
    <div className="page-header"><div><h1>Master Setting</h1><p>Konfigurasi hotel, tipe kamar, nomor kamar, rate, FO status, dan HK status.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="button-row"><button className={tab === 'hotel' ? '' : 'secondary'} onClick={() => setTab('hotel')}>Hotel Settings</button><button className={tab === 'types' ? '' : 'secondary'} onClick={() => setTab('types')}>Room Types</button><button className={tab === 'rooms' ? '' : 'secondary'} onClick={() => setTab('rooms')}>Rooms</button></div>

    {tab === 'hotel' && <form className="card form-grid" onSubmit={(e) => { e.preventDefault(); submit(() => hotelSettingsApi.save(hotelForm)); }}>
      <h2>Hotel Settings</h2>
      <label>Nama hotel<input required value={hotelForm.hotel_name || ''} onChange={(e) => setHotelForm({ ...hotelForm, hotel_name: e.target.value })} /></label>
      <label>Telepon<input value={hotelForm.phone || ''} onChange={(e) => setHotelForm({ ...hotelForm, phone: e.target.value })} /></label>
      <label>Pajak %<input type="number" min="0" step="0.01" value={hotelForm.tax_percent ?? 0} onChange={(e) => setHotelForm({ ...hotelForm, tax_percent: e.target.value })} /></label>
      <label>Service %<input type="number" min="0" step="0.01" value={hotelForm.service_charge_percent ?? 0} onChange={(e) => setHotelForm({ ...hotelForm, service_charge_percent: e.target.value })} /></label>
      <label>Tax Mode<select value={hotelForm.tax_mode || 'exclusive'} onChange={(e) => setHotelForm({ ...hotelForm, tax_mode: e.target.value })}><option value="exclusive">Exclusive Tax</option><option value="inclusive">Inclusive Tax</option></select></label>
      <label>Invoice prefix<input value={hotelForm.invoice_prefix || 'INV'} onChange={(e) => setHotelForm({ ...hotelForm, invoice_prefix: e.target.value })} /></label>
      <label>Default check-in<input type="time" value={hotelForm.default_checkin_time || '14:00'} onChange={(e) => setHotelForm({ ...hotelForm, default_checkin_time: e.target.value })} /></label>
      <label>Default check-out<input type="time" value={hotelForm.default_checkout_time || '12:00'} onChange={(e) => setHotelForm({ ...hotelForm, default_checkout_time: e.target.value })} /></label>
      <label className="full">Alamat<textarea value={hotelForm.address || ''} onChange={(e) => setHotelForm({ ...hotelForm, address: e.target.value })} /></label>
      <button disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Hotel Settings'}</button>
      {loading && <p className="muted full">Memuat konfigurasi...</p>}
    </form>}

    {tab === 'types' && <div className="two-column">
      <form className="card form-grid" onSubmit={(e) => { e.preventDefault(); submit(() => editingTypeId ? roomTypesApi.update(editingTypeId, typeForm) : roomTypesApi.create(typeForm), () => { setTypeForm(typeFormEmpty); setEditingTypeId(''); }); }}>
        <h2>{editingTypeId ? 'Edit Tipe Kamar' : 'Tambah Tipe Kamar'}</h2>
        <label>Code<input required value={typeForm.code} onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })} /></label>
        <label>Name<input required value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} /></label>
        <label>Base rate<input type="number" min="0" required value={typeForm.base_rate} onChange={(e) => setTypeForm({ ...typeForm, base_rate: e.target.value })} /></label>
        <label>Max occupancy<input type="number" min="1" required value={typeForm.max_occupancy} onChange={(e) => setTypeForm({ ...typeForm, max_occupancy: e.target.value })} /></label>
        <label>Status<select value={typeForm.is_active ? 'active' : 'inactive'} onChange={(e) => setTypeForm({ ...typeForm, is_active: e.target.value === 'active' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label>Facilities<input placeholder="WiFi, TV, AC" value={typeForm.facilities} onChange={(e) => setTypeForm({ ...typeForm, facilities: e.target.value })} /></label>
        <label className="full">Description<textarea value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} /></label>
        <button disabled={saving}>{saving ? 'Menyimpan...' : editingTypeId ? 'Simpan Perubahan' : 'Tambah Room Type'}</button>
        {editingTypeId && <button type="button" className="secondary" onClick={() => { setEditingTypeId(''); setTypeForm(typeFormEmpty); }}>Batal Edit</button>}
      </form>
      <div className="card table-card"><h2>Daftar Room Type</h2>{loading ? <p>Memuat tipe kamar...</p> : roomTypes.length === 0 ? <p className="muted">Belum ada tipe kamar.</p> : <table><thead><tr><th>Code</th><th>Name</th><th>Rate</th><th>Max</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{roomTypes.map((type) => <tr key={type.id}><td>{type.code}</td><td>{type.name}</td><td>{money.format(type.base_rate ?? type.base_price ?? 0)}</td><td>{type.max_occupancy || 2}</td><td><span className={`badge ${type.is_active === false ? 'cancelled' : 'available'}`}>{type.is_active === false ? 'inactive' : 'active'}</span></td><td><div className="table-actions"><IconButton icon={faPenToSquare} title="Edit" onClick={() => editType(type)} /></div></td></tr>)}</tbody></table>}</div>
    </div>}

    {tab === 'rooms' && <div className="page-stack">
      <div className="card filter-grid"><input placeholder="Cari nomor kamar" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><select value={filters.roomTypeId} onChange={(e) => setFilters({ ...filters, roomTypeId: e.target.value })}><option value="">Semua tipe</option>{roomTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select><select value={filters.fo} onChange={(e) => setFilters({ ...filters, fo: e.target.value })}><option value="all">Semua FO</option>{FO_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select><select value={filters.hk} onChange={(e) => setFilters({ ...filters, hk: e.target.value })}><option value="all">Semua HK</option>{HK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
      <div className="two-column">
        <form className="card form-grid" onSubmit={(e) => { e.preventDefault(); submit(() => editingRoomId ? roomsApi.update(editingRoomId, roomForm) : roomsApi.create(roomForm), () => { setRoomForm({ ...roomFormEmpty, room_type_id: activeRoomTypes[0]?.id || '' }); setEditingRoomId(''); }); }}>
          <h2>{editingRoomId ? 'Edit Kamar' : 'Tambah Kamar'}</h2>
          <label>Nomor kamar<input required value={roomForm.room_number} onChange={(e) => updateRoomField('room_number', e.target.value)} /></label>
          <label>Lantai<input value={roomForm.floor} onChange={(e) => updateRoomField('floor', e.target.value)} /></label>
          <label>Tipe kamar<select required value={roomForm.room_type_id} onChange={(e) => updateRoomField('room_type_id', e.target.value)}>{activeRoomTypes.map((type) => <option key={type.id} value={type.id}>{type.code ? `${type.code} - ` : ''}{type.name}</option>)}</select></label>
          <label>FO Status<select value={roomForm.fo_status} onChange={(e) => updateRoomField('fo_status', e.target.value)}>{FO_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label>HK Status<select value={roomForm.hk_status} onChange={(e) => updateRoomField('hk_status', e.target.value)}>{(editingRoomId ? allowedNextHkStatuses(roomForm, 'manager') : HK_STATUSES).map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label>Status aktif<select value={roomForm.is_active ? 'active' : 'inactive'} onChange={(e) => updateRoomField('is_active', e.target.value === 'active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <label className="full">Catatan<textarea value={roomForm.notes} onChange={(e) => updateRoomField('notes', e.target.value)} placeholder="Wajib untuk OOO/OOS" /></label>
          <button disabled={saving}>{saving ? 'Menyimpan...' : editingRoomId ? 'Simpan Perubahan' : 'Tambah Kamar'}</button>
          {editingRoomId && <button type="button" className="secondary" onClick={() => { setEditingRoomId(''); setRoomForm({ ...roomFormEmpty, room_type_id: activeRoomTypes[0]?.id || '' }); }}>Batal Edit</button>}
        </form>
        <div className="card table-card"><h2>Daftar Kamar</h2>{loading ? <p>Memuat kamar...</p> : filteredRooms.length === 0 ? <p className="muted">Belum ada kamar sesuai filter.</p> : <table><thead><tr><th>No</th><th>Tipe</th><th>Lantai</th><th>FO</th><th>HK</th><th>Status</th><th>Catatan</th><th>Aksi</th></tr></thead><tbody>{filteredRooms.map((room) => <tr key={room.id}><td>{room.room_number}</td><td>{room.room_types?.name || '-'}</td><td>{room.floor || '-'}</td><td><span className={`badge ${room.fo_status}`}>{room.fo_status}</span></td><td><span className={`badge ${room.hk_status?.replaceAll(' ', '_')}`}>{room.hk_status}</span></td><td>{room.is_active === false ? 'inactive' : 'active'}</td><td>{room.notes || '-'}</td><td><div className="table-actions"><IconButton icon={faPenToSquare} title="Edit" onClick={() => editRoom(room)} /></div></td></tr>)}</tbody></table>}</div>
      </div>
    </div>}
  </div>;
}
