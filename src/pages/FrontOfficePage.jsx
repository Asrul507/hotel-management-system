import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ADDITIONAL_CHARGE_TYPES, NON_CASH_METHODS, addDaysToDate, foliosApi, forecastApi, guestsApi, nightsBetween, posApi, reservationsApi, roomTypesApi, roomsApi, staysApi, today } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { normalizePOSStatus } from '../utils/posStatus';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const tabs = [['input', 'Input'], ['bayar', 'Bayar'], ['report', 'Data / Report']];
const paymentMethods = ['cash', ...NON_CASH_METHODS.filter((method) => method !== 'e_wallet')];
const emptyGuest = { full_name: '', phone: '', email: '', nik: '', address: '', notes: '' };
const emptyInput = () => ({ guest_id: '', check_in_date: today(), check_out_date: addDaysToDate(today(), 1), room_type_id: '', room_id: '', status: 'reserved', source: '', notes: '', room_charge: '', breakfast: '', extra_bed: '', late_checkout: '', other_description: '', other_amount: '', other_notes: '' });
const defaultBayarFilters = () => ({ dateFrom: addDaysToDate(today(), -7), dateTo: today(), status: 'all', search: '' });
const amountOf = (item) => Number((item?.line_total ?? (Number(item?.qty || 0) * Number(item?.unit_price || 0))) || 0);
const formatDate = (value) => String(value || '').slice(0, 10) || '-';
const roomText = (folio) => (folio?.reservations || []).map((reservation) => reservation.rooms?.room_number).filter(Boolean).join(', ') || '-';

export default function FrontOfficePage() {
  const [params, setParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(params.get('tab') || 'input');
  const [message, setMessage] = useState({ type: '', text: '' });

  function switchTab(tab, extra = {}) {
    setActiveTab(tab);
    setParams({ tab, ...extra }, { replace: true });
  }

  return <div className="front-office-page page-stack">
    <div className="page-header fo-page-title"><div><p className="eyebrow">Front Office</p><h1>Front Office</h1><p>Workflow sederhana: input data tamu/reservasi/tagihan, bayar folio, lalu pantau data operasional.</p></div><Link className="button-link secondary-link" to="/billing">Folio Teknis</Link></div>
    {message.text && <div className={`alert ${message.type}`}>{message.text}</div>}
    <nav className="fo-tabs" aria-label="Front Office tabs">{tabs.map(([key, label]) => <button key={key} type="button" className={activeTab === key ? 'active' : ''} onClick={() => switchTab(key)}>{label}</button>)}</nav>
    {activeTab === 'input' && <InputTab onSaved={(folioId) => { setMessage({ type: 'success', text: 'Data tersimpan. Folio sudah masuk ke tab Bayar.' }); switchTab('bayar', { folio_id: folioId }); }} onError={(text) => setMessage({ type: 'error', text })} />}
    {activeTab === 'bayar' && <BayarTab selectedParam={params.get('folio_id') || ''} onError={(text) => setMessage({ type: 'error', text })} onSuccess={(text) => setMessage({ type: 'success', text })} />}
    {activeTab === 'report' && <ReportTab onError={(text) => setMessage({ type: 'error', text })} />}
  </div>;
}

function InputTab({ onSaved, onError }) {
  const { profile } = useAuth();
  const [guests, setGuests] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [form, setForm] = useState(emptyInput);
  const [guestModal, setGuestModal] = useState(false);
  const [guestForm, setGuestForm] = useState(emptyGuest);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const nights = nightsBetween(form.check_in_date, form.check_out_date);
  const canWrite = ['super_admin', 'admin', 'manager', 'frontdesk', 'receptionist'].includes(profile?.role);

  async function loadBase() {
    setLoading(true);
    try {
      const [guestRows, typeRows] = await Promise.all([guestsApi.list({ status: 'active' }), roomTypesApi.list({ includeInactive: false })]);
      setGuests(guestRows);
      setRoomTypes(typeRows);
    } catch (err) { onError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { loadBase(); }, []);
  useEffect(() => {
    let alive = true;
    if (!form.check_in_date || !form.check_out_date || form.check_out_date <= form.check_in_date) { setRooms([]); return; }
    roomsApi.availableForStay({ check_in_date: form.check_in_date, check_out_date: form.check_out_date, room_type_id: form.room_type_id }).then((rows) => { if (alive) setRooms(rows); }).catch((err) => onError(err.message));
    return () => { alive = false; };
  }, [form.check_in_date, form.check_out_date, form.room_type_id]);

  async function saveGuest(event) {
    event.preventDefault();
    setSaving('guest');
    try {
      const existing = guests.find((guest) => (guestForm.nik && guest.nik === guestForm.nik) || (guestForm.phone && guest.phone === guestForm.phone && guest.full_name?.toLowerCase() === guestForm.full_name.toLowerCase()));
      const guest = existing || await guestsApi.create(guestForm);
      setGuests((rows) => [guest, ...rows.filter((row) => row.id !== guest.id)]);
      setForm((current) => ({ ...current, guest_id: guest.id }));
      setGuestModal(false);
      setGuestForm(emptyGuest);
    } catch (err) { onError(err.message); } finally { setSaving(''); }
  }

  async function submit(event) {
    event.preventDefault();
    if (!canWrite) return onError('Role Anda read-only untuk Input Front Office.');
    if (nights <= 0) return onError('Departure harus setelah arrival dan nights harus > 0.');
    setSaving('input');
    try {
      let folio = await foliosApi.createFolio({ guest_id: form.guest_id, notes: form.notes || 'Front Office Input' });
      const reservation = await reservationsApi.create({ guest_id: form.guest_id, room_type_id: form.room_type_id, room_id: form.room_id || null, check_in_date: form.check_in_date, check_out_date: form.check_out_date, status: form.status === 'checked_in' ? 'reserved' : 'reserved', room_rate: Number(form.room_charge || 0), folio_id: folio.id, notes: form.notes });
      if (Number(form.room_charge || 0) > 0) folio = await foliosApi.syncReservationRoomCharge(folio.id, reservation);
      const chargeRows = [
        ['breakfast', 'Breakfast', form.breakfast], ['extra_bed', 'Extra Bed', form.extra_bed], ['late_checkout', 'Late Check Out', form.late_checkout], ['other', form.other_description || 'Other charge', form.other_amount, form.other_notes]
      ];
      for (const [item_type, description, value, notes] of chargeRows) if (Number(value || 0) > 0) folio = await foliosApi.addFolioItem(folio.id, { reservation_id: reservation.id, room_id: form.room_id || null, item_type, description, qty: 1, unit_price: Number(value), posting_date: today(), notes });
      if (form.status === 'checked_in') await staysApi.checkIn(reservation, form.room_id || null);
      setForm(emptyInput());
      onSaved(folio.id);
    } catch (err) { onError(err.message); } finally { setSaving(''); }
  }

  return <section className="fo-panel fo-input-panel">{loading ? <p>Memuat data input...</p> : <form onSubmit={submit} className="fo-input-grid">
    <div className="fo-section"><h2>A. Data Tamu</h2><label>Pilih tamu<select required value={form.guest_id} onChange={(e) => setForm({ ...form, guest_id: e.target.value })}><option value="">Pilih tamu existing</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.full_name} {guest.phone ? `· ${guest.phone}` : ''}</option>)}</select></label><button type="button" className="secondary" onClick={() => setGuestModal(true)}>+ Tambah Tamu Baru</button></div>
    <div className="fo-section"><h2>B. Reservasi / Menginap</h2><div className="fo-form-grid"><label>Arrival<input type="date" required value={form.check_in_date} onChange={(e) => setForm({ ...form, check_in_date: e.target.value })} /></label><label>Departure<input type="date" required value={form.check_out_date} onChange={(e) => setForm({ ...form, check_out_date: e.target.value })} /></label><label>Nights<input readOnly value={nights} /></label><label>Room Type<select required value={form.room_type_id} onChange={(e) => setForm({ ...form, room_type_id: e.target.value, room_id: '' })}><option value="">Pilih tipe kamar</option>{roomTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><label>Room Number<select value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })}><option value="">Unassigned</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.room_number} · {room.hk_status}</option>)}</select></label><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="reserved">Reservation / Booking</option><option value="checked_in">In House / Check-in</option></select></label><label className="full">Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label></div></div>
    <div className="fo-section"><h2>C. Tagihan / Charges</h2><div className="fo-form-grid">{ADDITIONAL_CHARGE_TYPES.filter(([key]) => ['breakfast', 'extra_bed'].includes(key)).map(([key, label]) => <label key={key}>{label}<input type="number" min="0" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}<label>Room Charge / malam<input type="number" min="0" value={form.room_charge} onChange={(e) => setForm({ ...form, room_charge: e.target.value })} /></label><label>Late Check Out<input type="number" min="0" value={form.late_checkout} onChange={(e) => setForm({ ...form, late_checkout: e.target.value })} /></label><label>Others Description<input value={form.other_description} onChange={(e) => setForm({ ...form, other_description: e.target.value })} /></label><label>Others Amount<input type="number" min="0" value={form.other_amount} onChange={(e) => setForm({ ...form, other_amount: e.target.value })} /></label><label className="full">Others Notes<textarea value={form.other_notes} onChange={(e) => setForm({ ...form, other_notes: e.target.value })} /></label></div><button disabled={!canWrite || saving === 'input'}>{saving === 'input' ? 'Menyimpan...' : 'Simpan Input'}</button></div>
  </form>}{guestModal && <div className="modal-backdrop"><form className="modal-card form-grid" onSubmit={saveGuest}><div className="modal-header"><h2>Tambah Tamu Baru</h2><button type="button" className="modal-close" onClick={() => setGuestModal(false)}>×</button></div><label>Nama tamu<input required value={guestForm.full_name} onChange={(e) => setGuestForm({ ...guestForm, full_name: e.target.value })} /></label><label>No HP<input value={guestForm.phone} onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })} /></label><label>Email<input type="email" value={guestForm.email} onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })} /></label><label>No Identitas<input value={guestForm.nik} onChange={(e) => setGuestForm({ ...guestForm, nik: e.target.value })} /></label><label className="full">Alamat/Catatan<textarea value={guestForm.address} onChange={(e) => setGuestForm({ ...guestForm, address: e.target.value })} /></label><button disabled={saving === 'guest'}>{saving === 'guest' ? 'Menyimpan...' : 'Simpan Tamu'}</button></form></div>}</section>;
}

function BayarTab({ selectedParam, onError, onSuccess }) {
  const { profile, session } = useAuth();
  const [filters, setFilters] = useState(defaultBayarFilters);
  const [folios, setFolios] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [payment, setPayment] = useState({ payment_method: 'cash', reference_number: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canPay = ['super_admin', 'admin', 'manager', 'frontdesk', 'receptionist'].includes(profile?.role);
  const items = (selected?.folio_items || []).filter((item) => item.is_void !== true);
  const selectedTotal = items.filter((item) => selectedItemIds.includes(item.id)).reduce((sum, item) => sum + amountOf(item), 0);
  const nonCash = payment.payment_method !== 'cash';

  async function load(preferredId = selected?.id || selectedParam) { setLoading(true); try { const rows = await posApi.listFolios(filters); setFolios(rows); const id = preferredId && rows.some((row) => row.id === preferredId) ? preferredId : ''; const fresh = id ? await posApi.getFolio(id) : null; setSelected(fresh); setSelectedItemIds([]); } catch (err) { onError(err.message); } finally { setLoading(false); } }
  useEffect(() => { load(selectedParam); }, []);
  async function submit(event) { event.preventDefault(); if (!canPay) return onError('Role Anda read-only untuk Bayar.'); if (!selected?.id || selectedItemIds.length === 0 || selectedTotal <= 0) return onError('Pilih item unpaid yang akan dibayar.'); setSaving(true); try { await posApi.postPayment(selected.id, { ...payment, amount: selectedTotal, selected_item_ids: selectedItemIds, paid_at: new Date().toISOString() }, profile?.role || '', session?.user?.id || ''); onSuccess('Payment berhasil diposting. Item terpilih menjadi paid.'); await load(selected.id); } catch (err) { onError(err.message); } finally { setSaving(false); } }

  return <section className="fo-panel"><form className="fo-filter-bar" onSubmit={(e) => { e.preventDefault(); load(''); }}><label>Dari Tanggal<input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} /></label><label>Sampai Tanggal<input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} /></label><label>Status<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">All</option><option value="open">Open</option><option value="close">Close</option></select></label><label>Search<input placeholder="Nama / kamar / folio / bill" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></label><button disabled={loading}>Apply</button><button type="button" className="secondary" onClick={() => { const next = defaultBayarFilters(); setFilters(next); }}>Reset</button></form><div className="fo-table-wrap">{loading ? <p>Memuat folio...</p> : folios.length === 0 ? <p className="muted">Tidak ada akun tagihan.</p> : <table className="fo-table"><thead><tr><th>Tanggal</th><th>No Folio</th><th>Nama Tamu</th><th>Kamar</th><th>Grand Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{folios.map((folio) => <tr key={folio.id}><td>{formatDate(folio.created_at)}</td><td>{folio.folio_number || '-'}</td><td>{folio.guests?.full_name || '-'}</td><td>{roomText(folio)}</td><td>{money.format(folio.grand_total || 0)}</td><td>{money.format(folio.paid_amount || 0)}</td><td>{money.format(folio.balance_due || 0)}</td><td><span className={`badge ${normalizePOSStatus(folio.status).toLowerCase()}`}>{normalizePOSStatus(folio.status)}</span></td><td><button type="button" onClick={() => load(folio.id)}>Pilih</button></td></tr>)}</tbody></table>}</div>{selected && <div className="fo-payment-layout"><div className="fo-summary"><div><span>No Folio</span><strong>{selected.folio_number}</strong></div><div><span>Tamu</span><strong>{selected.guests?.full_name || '-'}</strong></div><div><span>Kamar</span><strong>{roomText(selected)}</strong></div><div><span>Grand Total</span><strong>{money.format(selected.grand_total || 0)}</strong></div><div><span>Paid</span><strong>{money.format(selected.paid_amount || 0)}</strong></div><div><span>Balance</span><strong>{money.format(selected.balance_due || 0)}</strong></div></div><div className="fo-table-wrap"><table className="fo-table"><thead><tr><th></th><th>Tanggal</th><th>Kategori</th><th>Deskripsi</th><th>Qty</th><th>Total</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>{items.map((item) => { const amount = amountOf(item); const status = item.is_void ? 'void' : item.payment_status || 'unpaid'; const disabled = amount <= 0 || ['paid', 'cancelled', 'refunded', 'void'].includes(String(status).toLowerCase()); return <tr key={item.id}><td><input type="checkbox" disabled={disabled} checked={selectedItemIds.includes(item.id)} onChange={() => setSelectedItemIds((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} /></td><td>{item.posting_date || formatDate(item.created_at)}</td><td>{item.item_type || '-'}</td><td>{item.description || '-'}</td><td>{item.qty || 1}</td><td>{money.format(amount)}</td><td><span className={`badge ${String(status).toLowerCase()}`}>{status}</span></td><td>{amount < 0 ? 'Adjustment/minus' : item.notes || '-'}</td></tr>; })}</tbody></table></div><form className="fo-payment-box" onSubmit={submit}><h3>Payment Box</h3><p>Total item dipilih: <strong>{money.format(selectedTotal)}</strong></p><label>Metode<select value={payment.payment_method} onChange={(e) => setPayment({ ...payment, payment_method: e.target.value })}>{paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label>{nonCash && <label>No Referensi<input required value={payment.reference_number} onChange={(e) => setPayment({ ...payment, reference_number: e.target.value })} /></label>}<label>Catatan<textarea value={payment.notes} onChange={(e) => setPayment({ ...payment, notes: e.target.value })} /></label><button disabled={!canPay || saving || selectedItemIds.length === 0 || selectedTotal <= 0}>{saving ? 'Posting...' : 'Bayar Item Terpilih'}</button></form><div className="fo-table-wrap"><h3>Payment History</h3>{(selected.folio_payments || []).length === 0 ? <p className="muted">Belum ada payment.</p> : <table className="fo-table"><thead><tr><th>No Bill</th><th>Tanggal</th><th>Metode</th><th>Nominal</th><th>Status</th></tr></thead><tbody>{selected.folio_payments.map((pay) => <tr key={pay.id}><td>{pay.bill_no || '-'}</td><td>{String(pay.paid_at || pay.created_at || '').slice(0, 16).replace('T', ' ')}</td><td>{pay.payment_method || '-'}</td><td>{money.format(pay.amount || 0)}</td><td>{pay.payment_status || 'posted'}</td></tr>)}</tbody></table>}</div></div>}</section>;
}

function ReportTab({ onError }) {
  const [reportTab, setReportTab] = useState('in_house');
  const [data, setData] = useState({ inHouse: [], ea: [], ed: [], arrival: [], departure: [], forecast: [] });
  const [loading, setLoading] = useState(true);
  useEffect(() => { let alive = true; setLoading(true); Promise.all([staysApi.active().catch(() => []), reservationsApi.listByView('expected_arrival', { startDate: today(), endDate: today() }).catch(() => []), reservationsApi.listByView('expected_departure', { startDate: today(), endDate: today() }).catch(() => []), reservationsApi.listByView('arrival', { startDate: today(), endDate: today() }).catch(() => []), reservationsApi.listByView('departure', { startDate: today(), endDate: today() }).catch(() => []), forecastApi.byDateRange(today(), addDaysToDate(today(), 6)).catch(() => ({ rows: [] }))]).then(([inHouse, ea, ed, arrival, departure, forecast]) => { if (alive) setData({ inHouse, ea, ed, arrival, departure, forecast: forecast.rows || [] }); }).catch((err) => onError(err.message)).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, []);
  const summary = useMemo(() => ({ inHouse: data.inHouse.length, ea: data.ea.length, ed: data.ed.length, arrival: data.arrival.length, departure: data.departure.length, occupancy: data.forecast[0]?.occupancy_percent || 0 }), [data]);
  const rows = { in_house: data.inHouse, ea: data.ea, ed: data.ed, arrival: data.arrival, departure: data.departure, forecast: data.forecast }[reportTab] || [];
  return <section className="fo-panel"><h2>Data / Report Front Office</h2><div className="fo-summary">{Object.entries(summary).map(([key, value]) => <div key={key}><span>{key.replace('_', ' ')}</span><strong>{key === 'occupancy' ? `${Number(value || 0).toFixed(0)}%` : value}</strong></div>)}</div><nav className="fo-tabs compact">{[['in_house','In House'],['ea','EA'],['ed','ED'],['arrival','Arrival'],['departure','Departure'],['forecast','Forecast']].map(([key, label]) => <button key={key} className={reportTab === key ? 'active' : ''} onClick={() => setReportTab(key)}>{label}</button>)}</nav>{loading ? <p>Memuat report...</p> : rows.length === 0 ? <p className="muted">Tidak ada data.</p> : <table className="fo-table"><thead><tr>{reportTab === 'forecast' ? <><th>Tanggal</th><th>Rooms</th><th>Occupied</th><th>EA</th><th>ED</th><th>Occupancy</th></> : <><th>Kamar</th><th>Nama</th><th>Arrival</th><th>Departure</th><th>Balance</th><th>Status</th></>}</tr></thead><tbody>{rows.map((row, index) => reportTab === 'forecast' ? <tr key={row.date || index}><td>{row.date}</td><td>{row.inventory_rooms || row.total_rooms || 0}</td><td>{row.occupied_rooms || 0}</td><td>{row.expected_arrival || 0}</td><td>{row.expected_departure || 0}</td><td>{Number(row.occupancy_percent || 0).toFixed(0)}%</td></tr> : <tr key={row.id || index}><td>{row.rooms?.room_number || row.reservations?.rooms?.room_number || '-'}</td><td>{row.guests?.full_name || row.reservations?.guests?.full_name || '-'}</td><td>{row.check_in_date || row.reservations?.check_in_date || formatDate(row.actual_check_in)}</td><td>{row.check_out_date || row.reservations?.check_out_date || formatDate(row.actual_check_out)}</td><td>{money.format(row.folios?.balance_due || row.reservations?.folios?.balance_due || 0)}</td><td><span className={`badge ${row.status}`}>{row.status || '-'}</span></td></tr>)}</tbody></table>}</section>;
}
