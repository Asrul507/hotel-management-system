import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ADDITIONAL_CHARGE_TYPES, addDaysToDate, calculateFolioTaxService, forecastApi, frontOfficeWorkflowApi, hotelSettingsApi, nightsBetween, reservationsApi, roomTypesApi, roomsApi, staysApi, today } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { FrontOfficeSubnav } from '../components/ModuleSubnav';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const tabs = [['input', 'Input Reservasi'], ['report', 'Data / Report']];
const bookingTypes = ['Walk In', 'Individual Reservation', 'Corporate', 'Government', 'OTA', 'Others'];
const emptyRoom = () => ({ room_type_id: '', room_id: '', rate_per_night: '' });
const emptyCharge = () => ({ item_type: 'other', description: '', unit_price: '', qty: 1, notes: '' });
const emptyForm = () => ({
  guest: { full_name: '', phone: '', email: '', nik: '', address: '' },
  booking_type: 'Walk In', institution: '', pic_name: '', pic_phone: '', ota_name: '', ota_booking_code: '',
  status: 'reserved', arrival: today(), departure: addDaysToDate(today(), 1), notes: '', rooms: [emptyRoom()], other_charges: [emptyCharge()]
});
const formatDate = (value) => String(value || '').slice(0, 10) || '-';
const dateLabel = (value) => value ? value.split('-').reverse().join('/') : '-';
const moneyValue = (value) => Number(value || 0);

export default function FrontOfficePage() {
  const [params, setParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(params.get('tab') || 'input');
  const [message, setMessage] = useState({ type: '', text: '' });
  const switchTab = (tab) => { setActiveTab(tab); setParams({ tab }, { replace: true }); };
  useEffect(() => { const tab = params.get('tab') || 'input'; setActiveTab(tabs.some(([key]) => key === tab) ? tab : 'input'); }, [params]);
  return <div className="front-office-page page-stack">
    <div className="page-header fo-page-title"><div><p className="eyebrow">Front Office</p><h1>Front Office</h1><p>Input Reservasi membuat data tamu, reservasi, folio, dan item tagihan awal dalam satu alur.</p></div><Link className="button-link secondary-link" to="/pos">Buka P.O.S</Link></div>
    <FrontOfficeSubnav />
    {message.text && <div className={`alert ${message.type}`}>{message.text}</div>}
    <nav className="fo-tabs" aria-label="Front Office tabs">{tabs.map(([key, label]) => <button key={key} type="button" className={activeTab === key ? 'active' : ''} onClick={() => switchTab(key)}>{label}</button>)}</nav>
    {activeTab === 'input' && <ReservationTab onSaved={(folio) => setMessage({ type: 'success', text: `Reservasi tersimpan. Folio ${folio.folio_number || ''} siap dibayar di P.O.S.` })} onError={(text) => setMessage({ type: 'error', text })} />}
    {activeTab === 'report' && <ReportTab onError={(text) => setMessage({ type: 'error', text })} />}
  </div>;
}

function ReservationTab({ onSaved, onError }) {
  const { profile } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [hotel, setHotel] = useState({});
  const [saving, setSaving] = useState(false);
  const nights = nightsBetween(form.arrival, form.departure);
  const canWrite = ['super_admin', 'admin', 'manager', 'frontdesk', 'receptionist'].includes(profile?.role);

  useEffect(() => {
    Promise.all([roomTypesApi.list({ includeInactive: false }), roomsApi.list(), hotelSettingsApi.get()])
      .then(([types, roomRows, settings]) => { setRoomTypes(types); setRooms(roomRows); setHotel(settings || {}); })
      .catch((err) => onError(err.message));
  }, []);

  const roomOptions = (roomTypeId) => rooms.filter((room) => !roomTypeId || room.room_type_id === roomTypeId);
  const updateGuest = (field, value) => setForm((current) => ({ ...current, guest: { ...current.guest, [field]: value } }));
  const updateRoom = (index, patch) => setForm((current) => ({ ...current, rooms: current.rooms.map((room, i) => i === index ? { ...room, ...patch } : room) }));
  const updateCharge = (index, patch) => setForm((current) => ({ ...current, other_charges: current.other_charges.map((charge, i) => i === index ? { ...charge, ...patch } : charge) }));
  const reset = () => setForm(emptyForm());

  const dailyRoomCharges = useMemo(() => {
    if (nights <= 0) return [];
    return form.rooms.flatMap((room, roomIndex) => {
      const roomType = roomTypes.find((type) => type.id === room.room_type_id);
      const roomRow = rooms.find((item) => item.id === room.room_id);
      return Array.from({ length: nights }, (_, nightIndex) => {
        const date = addDaysToDate(form.arrival, nightIndex);
        return {
          key: `${roomIndex}-${date}`,
          label: `${roomType?.name || 'Room'} ${roomRow?.room_number || 'Unassigned'} | ${dateLabel(date)}`,
          amount: moneyValue(room.rate_per_night)
        };
      });
    });
  }, [form.rooms, form.arrival, nights, roomTypes, rooms]);

  const otherChargeRows = useMemo(() => form.other_charges
    .filter((charge) => moneyValue(charge.unit_price) > 0 && Number(charge.qty || 0) > 0)
    .map((charge, index) => ({ ...charge, key: index, amount: moneyValue(charge.unit_price) * Number(charge.qty || 0) })), [form.other_charges]);
  const subtotal = dailyRoomCharges.reduce((sum, row) => sum + row.amount, 0) + otherChargeRows.reduce((sum, row) => sum + row.amount, 0);
  const totals = calculateFolioTaxService(subtotal, hotel);

  async function submit(event) {
    event.preventDefault();
    if (!canWrite) return onError('Role Anda read-only untuk Input Reservasi.');
    setSaving(true);
    try {
      const result = await frontOfficeWorkflowApi.createReservationWorkflow(form);
      reset();
      onSaved(result.folio);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return <form className="fo-panel fo-input-grid" onSubmit={submit}>
    <div className="action-bar full"><div><h2>Input Reservasi</h2><p className="muted">Hanya dua bagian utama: Overview dan Detail Transaksi. Tidak ada form payment di sini.</p></div><div className="button-row"><button disabled={!canWrite || saving || nights <= 0}>{saving ? 'Menyimpan...' : 'Simpan'}</button><button type="button" className="secondary" onClick={reset}>Reset / Batal</button></div></div>

    <section className="fo-section full"><h2>1. Overview</h2><div className="fo-form-grid"><label>Booking Type / Segment<select value={form.booking_type} onChange={(e) => setForm({ ...form, booking_type: e.target.value })}>{bookingTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label>Nama tamu<input required value={form.guest.full_name} onChange={(e) => updateGuest('full_name', e.target.value)} /></label><label>No HP<input value={form.guest.phone} onChange={(e) => updateGuest('phone', e.target.value)} /></label><label>Email<input type="email" value={form.guest.email} onChange={(e) => updateGuest('email', e.target.value)} /></label><label>Identitas / NIK<input value={form.guest.nik} onChange={(e) => updateGuest('nik', e.target.value)} /></label><label className="full">Alamat<textarea value={form.guest.address} onChange={(e) => updateGuest('address', e.target.value)} /></label>{['Corporate', 'Government', 'Others'].includes(form.booking_type) && <><label>Instansi<input required value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} /></label><label>Nama PIC<input required value={form.pic_name} onChange={(e) => setForm({ ...form, pic_name: e.target.value })} /></label><label>No Telp PIC<input required value={form.pic_phone} onChange={(e) => setForm({ ...form, pic_phone: e.target.value })} /></label></>}{form.booking_type === 'OTA' && <><label>Nama OTA<input required value={form.ota_name} onChange={(e) => setForm({ ...form, ota_name: e.target.value })} /></label><label>Kode Booking<input required value={form.ota_booking_code} onChange={(e) => setForm({ ...form, ota_booking_code: e.target.value })} /></label></>}<label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="reserved">Reserved</option><option value="checked_in">In House</option></select></label><label>Arrival<input type="date" required value={form.arrival} onChange={(e) => setForm({ ...form, arrival: e.target.value })} /></label><label>Departure<input type="date" required value={form.departure} onChange={(e) => setForm({ ...form, departure: e.target.value })} /></label><label>Nights<input readOnly value={nights} /></label><label className="full">Catatan booking<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label></div></section>

    <section className="fo-section full"><h2>2. Detail Transaksi</h2><div className="action-bar"><h3>Kamar</h3><button type="button" onClick={() => setForm({ ...form, rooms: [...form.rooms, emptyRoom()] })}>+ Kamar</button></div>{form.rooms.map((room, index) => <div className="fo-form-grid compact-row" key={index}><label>Room type<select required value={room.room_type_id} onChange={(e) => updateRoom(index, { room_type_id: e.target.value, room_id: '', rate_per_night: roomTypes.find((type) => type.id === e.target.value)?.base_rate ?? roomTypes.find((type) => type.id === e.target.value)?.base_price ?? '' })}><option value="">Pilih room type</option>{roomTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><label>Room number<select value={room.room_id} onChange={(e) => updateRoom(index, { room_id: e.target.value })}><option value="">Unassigned</option>{roomOptions(room.room_type_id).map((item) => <option key={item.id} value={item.id}>{item.room_number} · {item.hk_status}</option>)}</select></label><label>Rate/night<input type="number" min="0" required value={room.rate_per_night} onChange={(e) => updateRoom(index, { rate_per_night: e.target.value })} /></label><p><strong>Total</strong><br />{money.format(moneyValue(room.rate_per_night) * nights)}</p>{form.rooms.length > 1 && <button type="button" className="secondary" onClick={() => setForm({ ...form, rooms: form.rooms.filter((_, i) => i !== index) })}>Hapus</button>}</div>)}<div className="fo-table-wrap"><h3>Preview room charge harian</h3>{dailyRoomCharges.length === 0 ? <p className="muted">Pilih kamar dan tanggal untuk melihat preview.</p> : <table className="fo-table"><thead><tr><th>Item harian</th><th>Nominal</th></tr></thead><tbody>{dailyRoomCharges.map((row) => <tr key={row.key}><td>{row.label}</td><td>{money.format(row.amount)}</td></tr>)}</tbody></table>}</div>

    <div className="action-bar"><h3>Other Charge</h3><button type="button" onClick={() => setForm({ ...form, other_charges: [...form.other_charges, emptyCharge()] })}>+ Other Charge</button></div>{form.other_charges.map((charge, index) => <div className="fo-form-grid compact-row" key={index}><label>Item<select value={charge.item_type} onChange={(e) => { const label = ADDITIONAL_CHARGE_TYPES.find(([key]) => key === e.target.value)?.[1] || ''; updateCharge(index, { item_type: e.target.value, description: e.target.value === 'other' ? '' : label }); }}>{ADDITIONAL_CHARGE_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Nominal<input type="number" min="0" value={charge.unit_price} onChange={(e) => updateCharge(index, { unit_price: e.target.value })} /></label><label>Qty<input type="number" min="1" value={charge.qty} onChange={(e) => updateCharge(index, { qty: e.target.value })} /></label><label>Keterangan<input value={charge.description} onChange={(e) => updateCharge(index, { description: e.target.value })} /></label>{form.other_charges.length > 1 && <button type="button" className="secondary" onClick={() => setForm({ ...form, other_charges: form.other_charges.filter((_, i) => i !== index) })}>Hapus</button>}</div>)}<div className="fo-summary"><div><span>Subtotal</span><strong>{money.format(subtotal)}</strong></div><div><span>Tax ({totals.taxMode})</span><strong>{money.format(totals.taxAmount || 0)}</strong></div><div><span>Service</span><strong>{money.format(totals.serviceAmount || 0)}</strong></div><div><span>Grand Total</span><strong>{money.format(totals.grandTotal || 0)}</strong></div></div></section>
  </form>;
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
