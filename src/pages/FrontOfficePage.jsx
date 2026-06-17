import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ADDITIONAL_CHARGE_TYPES, addDaysToDate, forecastApi, frontOfficeWorkflowApi, nightsBetween, posApi, reservationsApi, roomTypesApi, roomsApi, staysApi, today } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { FrontOfficeSubnav } from '../components/ModuleSubnav';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const tabs = [['input', 'Reservasi'], ['folios', 'Folio'], ['report', 'Data / Report']];
const bookingTypes = ['Walk In', 'Individual Reservation', 'Corporate', 'Government', 'OTA', 'Others'];
const emptyRoom = () => ({ room_type_id: '', room_id: '', rate_per_night: '' });
const emptyCharge = () => ({ item_type: 'other', description: '', unit_price: '', qty: 1, notes: '' });
const emptyForm = () => ({
  guest: { full_name: '', phone: '', email: '', nik: '', address: '' },
  booking_type: 'Walk In', institution: '', pic_name: '', pic_phone: '', ota_name: '', ota_booking_code: '',
  status: 'reserved', arrival: today(), departure: addDaysToDate(today(), 1), notes: '', rooms: [emptyRoom()], other_charges: [emptyCharge()]
});
const formatDate = (value) => String(value || '').slice(0, 10) || '-';
const amountOf = (item) => Number((item?.line_total ?? (Number(item?.qty || 0) * Number(item?.unit_price || 0))) || 0);
const roomText = (folio) => (folio?.reservations || []).map((reservation) => reservation.rooms?.room_number).filter(Boolean).join(', ') || '-';

export default function FrontOfficePage() {
  const [params, setParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(params.get('tab') || 'input');
  const [message, setMessage] = useState({ type: '', text: '' });
  const switchTab = (tab, extra = {}) => { setActiveTab(tab); setParams({ tab, ...extra }, { replace: true }); };
  useEffect(() => { const tab = params.get('tab') || 'input'; if (tabs.some(([key]) => key === tab)) setActiveTab(tab); }, [params]);
  return <div className="front-office-page page-stack">
    <div className="page-header fo-page-title"><div><p className="eyebrow">Front Office</p><h1>Front Office</h1><p>Source of truth baru untuk reservasi, folio, daily room charge, dan data operasional.</p></div><Link className="button-link secondary-link" to="/pos">Buka P.O.S</Link></div>
    <FrontOfficeSubnav />
    {message.text && <div className={`alert ${message.type}`}>{message.text}</div>}
    <nav className="fo-tabs" aria-label="Front Office tabs">{tabs.map(([key, label]) => <button key={key} type="button" className={activeTab === key ? 'active' : ''} onClick={() => switchTab(key)}>{label}</button>)}</nav>
    {activeTab === 'input' && <ReservationTab onSaved={(folioId) => { setMessage({ type: 'success', text: 'Reservasi tersimpan. Folio Open/Unpaid sudah muncul di P.O.S.' }); switchTab('folios', { folio_id: folioId }); }} onError={(text) => setMessage({ type: 'error', text })} />}
    {activeTab === 'folios' && <FolioTab selectedParam={params.get('folio_id') || ''} onError={(text) => setMessage({ type: 'error', text })} />}
    {activeTab === 'report' && <ReportTab onError={(text) => setMessage({ type: 'error', text })} />}
  </div>;
}

function ReservationTab({ onSaved, onError }) {
  const { profile } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [saving, setSaving] = useState(false);
  const nights = nightsBetween(form.arrival, form.departure);
  const canWrite = ['super_admin', 'admin', 'manager', 'frontdesk', 'receptionist'].includes(profile?.role);
  useEffect(() => { Promise.all([roomTypesApi.list({ includeInactive: false }), roomsApi.list()]).then(([types, roomRows]) => { setRoomTypes(types); setRooms(roomRows); }).catch((err) => onError(err.message)); }, []);
  const roomOptions = (roomTypeId) => rooms.filter((room) => !roomTypeId || room.room_type_id === roomTypeId);
  const updateGuest = (field, value) => setForm((current) => ({ ...current, guest: { ...current.guest, [field]: value } }));
  const updateRoom = (index, patch) => setForm((current) => ({ ...current, rooms: current.rooms.map((room, i) => i === index ? { ...room, ...patch } : room) }));
  const updateCharge = (index, patch) => setForm((current) => ({ ...current, other_charges: current.other_charges.map((charge, i) => i === index ? { ...charge, ...patch } : charge) }));
  async function submit(event) {
    event.preventDefault();
    if (!canWrite) return onError('Role Anda read-only untuk Front Office.');
    setSaving(true);
    try { const result = await frontOfficeWorkflowApi.createReservationWorkflow(form); setForm(emptyForm()); onSaved(result.folio.id); }
    catch (err) { onError(err.message); }
    finally { setSaving(false); }
  }
  return <form className="fo-panel fo-input-grid" onSubmit={submit}>
    <div className="fo-section"><h2>A. Identitas</h2><div className="fo-form-grid"><label>Nama tamu<input required value={form.guest.full_name} onChange={(e) => updateGuest('full_name', e.target.value)} /></label><label>No HP<input value={form.guest.phone} onChange={(e) => updateGuest('phone', e.target.value)} /></label><label>Email<input type="email" value={form.guest.email} onChange={(e) => updateGuest('email', e.target.value)} /></label><label>No Identitas<input value={form.guest.nik} onChange={(e) => updateGuest('nik', e.target.value)} /></label><label>Booking Type / Segment<select value={form.booking_type} onChange={(e) => setForm({ ...form, booking_type: e.target.value })}>{bookingTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label className="full">Alamat<textarea value={form.guest.address} onChange={(e) => updateGuest('address', e.target.value)} /></label>{['Corporate', 'Government', 'Others'].includes(form.booking_type) && <><label>Instansi<input required value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} /></label><label>Nama PIC<input required value={form.pic_name} onChange={(e) => setForm({ ...form, pic_name: e.target.value })} /></label><label>No Telp PIC<input required value={form.pic_phone} onChange={(e) => setForm({ ...form, pic_phone: e.target.value })} /></label></>}{form.booking_type === 'OTA' && <><label>Nama OTA<input required value={form.ota_name} onChange={(e) => setForm({ ...form, ota_name: e.target.value })} /></label><label>Kode Booking<input required value={form.ota_booking_code} onChange={(e) => setForm({ ...form, ota_booking_code: e.target.value })} /></label></>}</div></div>
    <div className="fo-section"><h2>B. Reservasi</h2><div className="fo-form-grid"><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="reserved">Reserved</option><option value="checked_in">In House</option></select></label><label>Arrival<input type="date" required value={form.arrival} onChange={(e) => setForm({ ...form, arrival: e.target.value })} /></label><label>Departure<input type="date" required value={form.departure} onChange={(e) => setForm({ ...form, departure: e.target.value })} /></label><label>Nights<input readOnly value={nights} /></label><label className="full">Keterangan<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label></div></div>
    <div className="fo-section"><div className="action-bar"><h2>C. Kamar</h2><button type="button" onClick={() => setForm({ ...form, rooms: [...form.rooms, emptyRoom()] })}>+ Kamar</button></div>{form.rooms.map((room, index) => <div className="fo-form-grid compact-row" key={index}><label>Room type<select required value={room.room_type_id} onChange={(e) => updateRoom(index, { room_type_id: e.target.value, room_id: '', rate_per_night: roomTypes.find((type) => type.id === e.target.value)?.base_rate ?? '' })}><option value="">Pilih room type</option>{roomTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><label>Room number<select value={room.room_id} onChange={(e) => updateRoom(index, { room_id: e.target.value })}><option value="">Unassigned</option>{roomOptions(room.room_type_id).map((item) => <option key={item.id} value={item.id}>{item.room_number} · {item.hk_status}</option>)}</select></label><label>Rate/night<input type="number" min="0" required value={room.rate_per_night} onChange={(e) => updateRoom(index, { rate_per_night: e.target.value })} /></label><p><strong>Total</strong><br />{money.format(Number(room.rate_per_night || 0) * nights)}</p>{form.rooms.length > 1 && <button type="button" className="secondary" onClick={() => setForm({ ...form, rooms: form.rooms.filter((_, i) => i !== index) })}>Hapus</button>}</div>)}</div>
    <div className="fo-section"><div className="action-bar"><h2>D. Other Charge</h2><button type="button" onClick={() => setForm({ ...form, other_charges: [...form.other_charges, emptyCharge()] })}>+ Other Charge</button></div>{form.other_charges.map((charge, index) => <div className="fo-form-grid compact-row" key={index}><label>Item<select value={charge.item_type} onChange={(e) => { const label = ADDITIONAL_CHARGE_TYPES.find(([key]) => key === e.target.value)?.[1] || ''; updateCharge(index, { item_type: e.target.value, description: e.target.value === 'other' ? '' : label }); }}>{ADDITIONAL_CHARGE_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Nominal<input type="number" min="0" value={charge.unit_price} onChange={(e) => updateCharge(index, { unit_price: e.target.value })} /></label><label>Qty<input type="number" min="1" value={charge.qty} onChange={(e) => updateCharge(index, { qty: e.target.value })} /></label><label>Keterangan<input value={charge.description} onChange={(e) => updateCharge(index, { description: e.target.value })} /></label>{form.other_charges.length > 1 && <button type="button" className="secondary" onClick={() => setForm({ ...form, other_charges: form.other_charges.filter((_, i) => i !== index) })}>Hapus</button>}</div>)}</div>
    <div className="button-row"><button disabled={!canWrite || saving || nights <= 0}>{saving ? 'Menyimpan...' : '+ Reservasi'}</button><button type="button" className="secondary" onClick={() => setForm(emptyForm())}>Reset</button></div>
  </form>;
}

function FolioTab({ selectedParam, onError }) {
  const [folios, setFolios] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  async function load(id = selectedParam) { setLoading(true); try { const rows = await posApi.listFolios({ status: 'all' }); setFolios(rows); setSelected(id ? await posApi.getFolio(id) : null); } catch (err) { onError(err.message); } finally { setLoading(false); } }
  useEffect(() => { load(selectedParam); }, [selectedParam]);
  const items = (selected?.folio_items || []).filter((item) => item.is_void !== true);
  return <section className="fo-panel"><div className="fo-table-wrap">{loading ? <p>Memuat folio...</p> : <table className="fo-table"><thead><tr><th>No Folio</th><th>Tamu</th><th>Kamar</th><th>Grand Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{folios.map((folio) => <tr key={folio.id}><td>{folio.folio_number}</td><td>{folio.guests?.full_name || '-'}</td><td>{roomText(folio)}</td><td>{money.format(folio.grand_total || 0)}</td><td>{money.format(folio.paid_amount || 0)}</td><td>{money.format(folio.balance_due || 0)}</td><td><span className={`badge ${folio.status}`}>{folio.status}</span></td><td><button type="button" onClick={() => load(folio.id)}>Detail</button> <Link to={`/pos?folio_id=${folio.id}`}>P.O.S</Link></td></tr>)}</tbody></table>}</div>{selected && <div className="page-stack"><div className="fo-summary"><div><span>No Folio</span><strong>{selected.folio_number}</strong></div><div><span>Subtotal</span><strong>{money.format(selected.subtotal || 0)}</strong></div><div><span>Tax</span><strong>{money.format(selected.tax_amount || 0)}</strong></div><div><span>Service</span><strong>{money.format(selected.service_amount || 0)}</strong></div><div><span>Grand Total</span><strong>{money.format(selected.grand_total || 0)}</strong></div><div><span>Paid</span><strong>{money.format(selected.paid_amount || 0)}</strong></div><div><span>Balance</span><strong>{money.format(selected.balance_due || 0)}</strong></div></div><table className="fo-table"><thead><tr><th>Tanggal</th><th>Item</th><th>Qty</th><th>Amount</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.posting_date || formatDate(item.created_at)}</td><td>{item.description || item.item_type}</td><td>{item.qty}</td><td>{money.format(amountOf(item))}</td><td><span className={`badge ${item.payment_status || 'unpaid'}`}>{item.payment_status || 'unpaid'}</span></td><td>{item.notes || '-'}</td></tr>)}</tbody></table></div>}</section>;
}

function ReportTab({ onError }) {
  const [reportTab, setReportTab] = useState('in_house');
  const [data, setData] = useState({ inHouse: [], ea: [], ed: [], forecast: [] });
  const [loading, setLoading] = useState(true);
  useEffect(() => { let alive = true; Promise.all([staysApi.active().catch(() => []), reservationsApi.listByView('expected_arrival', { startDate: today(), endDate: today() }).catch(() => []), reservationsApi.listByView('expected_departure', { startDate: today(), endDate: today() }).catch(() => []), forecastApi.byDateRange(today(), addDaysToDate(today(), 6)).catch(() => ({ rows: [] }))]).then(([inHouse, ea, ed, forecast]) => { if (alive) setData({ inHouse, ea, ed, forecast: forecast.rows || [] }); }).catch((err) => onError(err.message)).finally(() => alive && setLoading(false)); return () => { alive = false; }; }, []);
  const summary = useMemo(() => ({ inHouse: data.inHouse.length, expectedArrival: data.ea.length, expectedDeparture: data.ed.length, roomAvailability: data.forecast[0]?.available_rooms ?? 0 }), [data]);
  const rows = { in_house: data.inHouse, ea: data.ea, ed: data.ed, forecast: data.forecast }[reportTab] || [];
  return <section className="fo-panel"><h2>Data / Report Front Office</h2><div className="fo-summary">{Object.entries(summary).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div><nav className="fo-tabs compact">{[['in_house','In House'],['ea','Expected Arrival'],['ed','Expected Departure'],['forecast','Forecast / Room Availability']].map(([key, label]) => <button key={key} type="button" className={reportTab === key ? 'active' : ''} onClick={() => setReportTab(key)}>{label}</button>)}</nav>{loading ? <p>Memuat report...</p> : rows.length === 0 ? <p className="muted">Tidak ada data.</p> : <table className="fo-table"><thead><tr>{reportTab === 'forecast' ? <><th>Tanggal</th><th>Inventory</th><th>Occupied</th><th>EA</th><th>ED</th><th>Available</th><th>Occ %</th></> : <><th>Kamar</th><th>Nama</th><th>Arrival</th><th>Departure</th><th>Status</th></>}</tr></thead><tbody>{rows.map((row, index) => reportTab === 'forecast' ? <tr key={row.date || index}><td>{row.date}</td><td>{row.inventory_rooms || 0}</td><td>{row.occupied_rooms || 0}</td><td>{row.expected_arrival || 0}</td><td>{row.expected_departure || 0}</td><td>{row.available_rooms || 0}</td><td>{row.occupancy_percentage || row.occupancy_percent || 0}%</td></tr> : <tr key={row.id || index}><td>{row.rooms?.room_number || row.reservations?.rooms?.room_number || '-'}</td><td>{row.guests?.full_name || row.reservations?.guests?.full_name || '-'}</td><td>{row.check_in_date || row.reservations?.check_in_date || formatDate(row.actual_check_in)}</td><td>{row.check_out_date || row.reservations?.check_out_date || formatDate(row.actual_check_out)}</td><td><span className={`badge ${row.status}`}>{row.status || '-'}</span></td></tr>)}</tbody></table>}</section>;
}
