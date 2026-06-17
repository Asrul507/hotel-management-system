import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ADDITIONAL_CHARGE_TYPES, addDaysToDate, calculateFolioTaxService, foliosApi, forecastApi, frontOfficeWorkflowApi, guestsApi, hotelSettingsApi, nightsBetween, reservationsApi, roomTypesApi, roomsApi, staysApi, today } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { FrontOfficeSubnav } from '../components/ModuleSubnav';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const tabs = [['input', 'Input Reservasi'], ['report', 'Data / Report']];
const bookingTypes = ['Walk In', 'Individual Reservation', 'Corporate', 'Government', 'OTA', 'Others'];
const emptyRoom = () => ({ room_type_id: '', room_id: '', rate_per_night: '' });
const emptyCharge = () => ({ posting_date: today(), item_type: 'other', description: '', unit_price: '', qty: 1, notes: '' });
const emptyGuest = { full_name: '', phone: '', email: '', nik: '', address: '' };
const emptyForm = () => ({
  guest_id: '', guest: { ...emptyGuest }, guest_search: '',
  booking_type: 'Walk In', institution: '', pic_name: '', pic_phone: '', ota_name: '', ota_booking_code: '',
  status: 'reserved', arrival: today(), nights: 1, departure: addDaysToDate(today(), 1), notes: '', rooms: [], other_charges: []
});
const formatDate = (value) => String(value || '').slice(0, 10) || '-';
const dateLabel = (value) => value ? value.split('-').reverse().join('/') : '-';
const moneyValue = (value) => Number(value || 0);
const roomTotal = (room, nights) => moneyValue(room.rate_per_night) * Math.max(Number(nights || 0), 0);
const chargeTotal = (charge) => moneyValue(charge.unit_price) * Number(charge.qty || 0);

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
    {activeTab === 'report' && <ReportTab onError={(text) => setMessage({ type: 'error', text })} onSuccess={(text) => setMessage({ type: 'success', text })} />}
  </div>;
}

function ReservationTab({ onSaved, onError }) {
  const { profile } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [guests, setGuests] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [hotel, setHotel] = useState({});
  const [activeRoomIndex, setActiveRoomIndex] = useState(null);
  const [activeChargeIndex, setActiveChargeIndex] = useState(null);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestDraft, setGuestDraft] = useState({ ...emptyGuest });
  const [saving, setSaving] = useState('');
  const nights = Math.max(Number(form.nights || nightsBetween(form.arrival, form.departure) || 1), 1);
  const canWrite = ['super_admin', 'admin', 'manager', 'frontdesk', 'receptionist'].includes(profile?.role);

  async function loadBase() {
    const [guestRows, types, roomRows, settings] = await Promise.all([
      guestsApi.list({ status: 'active' }), roomTypesApi.list({ includeInactive: false }), roomsApi.list(), hotelSettingsApi.get()
    ]);
    setGuests(guestRows); setRoomTypes(types); setRooms(roomRows); setHotel(settings || {});
  }
  useEffect(() => { loadBase().catch((err) => onError(err.message)); }, []);

  const roomOptions = (roomTypeId) => rooms.filter((room) => !roomTypeId || room.room_type_id === roomTypeId);
  const guestChoices = useMemo(() => {
    const search = form.guest_search.trim().toLowerCase();
    return guests.filter((guest) => !search || [guest.full_name, guest.phone, guest.email, guest.nik].some((field) => String(field || '').toLowerCase().includes(search))).slice(0, 20);
  }, [guests, form.guest_search]);
  const roomLabel = (room) => {
    const type = roomTypes.find((item) => item.id === room.room_type_id)?.name || 'Room';
    const number = rooms.find((item) => item.id === room.room_id)?.room_number || 'Unassigned';
    return `${type} ${number}`;
  };
  const chargeLabel = (charge) => ADDITIONAL_CHARGE_TYPES.find(([key]) => key === charge.item_type)?.[1] || charge.description || 'Other Charge';
  const reset = () => { setForm(emptyForm()); setActiveRoomIndex(null); setActiveChargeIndex(null); };
  const patchForm = (patch) => setForm((current) => ({ ...current, ...patch }));
  const updateGuest = (field, value) => setForm((current) => ({ ...current, guest: { ...current.guest, [field]: value } }));
  const updateRoom = (index, patch) => setForm((current) => ({ ...current, rooms: current.rooms.map((room, i) => i === index ? { ...room, ...patch } : room) }));
  const updateCharge = (index, patch) => setForm((current) => ({ ...current, other_charges: current.other_charges.map((charge, i) => i === index ? { ...charge, ...patch } : charge) }));
  const setArrival = (arrival) => patchForm({ arrival, departure: addDaysToDate(arrival, nights) });
  const setNights = (value) => {
    const nextNights = Math.max(Number(value || 1), 1);
    patchForm({ nights: nextNights, departure: addDaysToDate(form.arrival, nextNights) });
  };
  const setDeparture = (departure) => patchForm({ departure, nights: Math.max(nightsBetween(form.arrival, departure), 1) });
  const selectGuest = (guest) => setForm((current) => ({ ...current, guest_id: guest.id, guest_search: guest.full_name || '', guest: { full_name: guest.full_name || '', phone: guest.phone || '', email: guest.email || '', nik: guest.nik || '', address: guest.address || guest.notes || '' } }));
  const addRoom = () => { const next = form.rooms.length; patchForm({ rooms: [...form.rooms, emptyRoom()] }); setActiveRoomIndex(next); };
  const addCharge = () => { const next = form.other_charges.length; patchForm({ other_charges: [...form.other_charges, emptyCharge()] }); setActiveChargeIndex(next); };

  const dailyRoomCharges = useMemo(() => form.rooms.flatMap((room, roomIndex) => Array.from({ length: nights }, (_, nightIndex) => {
    const date = addDaysToDate(form.arrival, nightIndex);
    return { key: `${roomIndex}-${date}`, label: `${roomLabel(room)} | ${dateLabel(date)}`, amount: moneyValue(room.rate_per_night) };
  })), [form.rooms, form.arrival, nights, roomTypes, rooms]);
  const otherChargeRows = useMemo(() => form.other_charges.filter((charge) => chargeTotal(charge) > 0).map((charge, index) => ({ ...charge, key: index, amount: chargeTotal(charge) })), [form.other_charges]);
  const subtotal = dailyRoomCharges.reduce((sum, row) => sum + row.amount, 0) + otherChargeRows.reduce((sum, row) => sum + row.amount, 0);
  const totals = calculateFolioTaxService(subtotal, hotel);

  async function saveGuest(event) {
    event.preventDefault();
    setSaving('guest');
    try {
      const duplicate = guests.find((guest) => (guestDraft.nik && guest.nik === guestDraft.nik) || (guestDraft.phone && guest.phone === guestDraft.phone && String(guest.full_name || '').toLowerCase() === guestDraft.full_name.trim().toLowerCase()));
      const guest = duplicate || await guestsApi.create(guestDraft);
      setGuests((rows) => [guest, ...rows.filter((row) => row.id !== guest.id)]);
      selectGuest(guest);
      setShowGuestModal(false);
      setGuestDraft({ ...emptyGuest });
    } catch (err) { onError(err.message); } finally { setSaving(''); }
  }

  async function submit(event) {
    event.preventDefault();
    if (!canWrite) return onError('Role Anda read-only untuk Input Reservasi.');
    if (!form.guest.full_name.trim()) return onError('Pilih tamu dari database atau tambah tamu baru.');
    if (!form.rooms.length) return onError('Tambahkan minimal satu kamar.');
    setSaving('reservation');
    try {
      const result = await frontOfficeWorkflowApi.createReservationWorkflow({ ...form, nights });
      reset();
      onSaved(result.folio);
    } catch (err) { onError(err.message); } finally { setSaving(''); }
  }

  return <form className="fo-panel fo-input-grid" onSubmit={submit}>
    <div className="action-bar full"><div><h2>Input Reservasi</h2><p className="muted">Tampilan awal hanya Overview. Detail transaksi dibuka lewat tombol + Kamar dan + Other Charge.</p></div><div className="button-row"><button disabled={!canWrite || saving === 'reservation'}>{saving === 'reservation' ? 'Menyimpan...' : 'Simpan'}</button><button type="button" className="secondary" onClick={reset}>Reset / Batal</button></div></div>

    <section className="fo-section full"><h2>1. Overview</h2><div className="fo-form-grid"><label>Booking Type / Segment<select value={form.booking_type} onChange={(e) => patchForm({ booking_type: e.target.value })}>{bookingTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label>Nama tamu dari database<input list="guest-options" required placeholder="Cari nama / HP / email / NIK" value={form.guest_search} onChange={(e) => patchForm({ guest_search: e.target.value, guest_id: '' })} /><datalist id="guest-options">{guestChoices.map((guest) => <option key={guest.id} value={guest.full_name}>{guest.phone || guest.email || guest.nik || ''}</option>)}</datalist></label><div className="button-row"><button type="button" className="secondary" onClick={() => { const picked = guestChoices.find((guest) => guest.full_name === form.guest_search) || guestChoices[0]; if (picked) selectGuest(picked); }}>Pilih Tamu</button><button type="button" onClick={() => setShowGuestModal(true)}>+ Tambah Tamu Baru</button></div><label>No HP<input value={form.guest.phone} onChange={(e) => updateGuest('phone', e.target.value)} /></label><label>Email<input type="email" value={form.guest.email} onChange={(e) => updateGuest('email', e.target.value)} /></label><label>Identitas / NIK<input value={form.guest.nik} onChange={(e) => updateGuest('nik', e.target.value)} /></label><label className="full">Alamat / Catatan Tamu<textarea value={form.guest.address} onChange={(e) => updateGuest('address', e.target.value)} /></label>{['Corporate', 'Government', 'Others'].includes(form.booking_type) && <><label>Instansi<input required value={form.institution} onChange={(e) => patchForm({ institution: e.target.value })} /></label><label>Nama PIC<input required value={form.pic_name} onChange={(e) => patchForm({ pic_name: e.target.value })} /></label><label>No Telp PIC<input required value={form.pic_phone} onChange={(e) => patchForm({ pic_phone: e.target.value })} /></label></>}{form.booking_type === 'OTA' && <><label>Nama OTA<input required value={form.ota_name} onChange={(e) => patchForm({ ota_name: e.target.value })} /></label><label>Kode Booking<input required value={form.ota_booking_code} onChange={(e) => patchForm({ ota_booking_code: e.target.value })} /></label></>}<label>Status<select value={form.status} onChange={(e) => patchForm({ status: e.target.value })}><option value="reserved">Reserved</option><option value="checked_in">In House</option></select></label><label>Arrival<input type="date" required value={form.arrival} onChange={(e) => setArrival(e.target.value)} /></label><label>Night<input type="number" min="1" step="1" required value={nights} onChange={(e) => setNights(e.target.value)} /></label><div className="button-row night-stepper"><button type="button" className="secondary" onClick={() => setNights(nights - 1)}>-</button><button type="button" className="secondary" onClick={() => setNights(nights + 1)}>+</button></div><label>Departure<input type="date" required value={form.departure} onChange={(e) => setDeparture(e.target.value)} /></label><label className="full">Catatan booking<textarea value={form.notes} onChange={(e) => patchForm({ notes: e.target.value })} /></label></div></section>

    <section className="fo-section full"><div className="action-bar"><div><h2>2. Detail Transaksi</h2><p className="muted">Form kamar/charge hanya muncul setelah tombol plus diklik.</p></div><div className="button-row"><button type="button" onClick={addRoom}>+ Kamar</button><button type="button" onClick={addCharge}>+ Other Charge</button></div></div>
      {form.rooms.length > 0 && <CompactRoomList rooms={form.rooms} activeIndex={activeRoomIndex} roomLabel={roomLabel} nights={nights} arrival={form.arrival} departure={form.departure} onEdit={setActiveRoomIndex} onRemove={(index) => { patchForm({ rooms: form.rooms.filter((_, i) => i !== index) }); setActiveRoomIndex(null); }} />}
      {activeRoomIndex !== null && form.rooms[activeRoomIndex] && <RoomInput index={activeRoomIndex} room={form.rooms[activeRoomIndex]} roomTypes={roomTypes} roomOptions={roomOptions} nights={nights} updateRoom={updateRoom} onDone={() => setActiveRoomIndex(null)} />}
      {dailyRoomCharges.length > 0 && <div className="fo-table-wrap compact-list"><h3>Preview room charge harian</h3><table className="fo-table"><thead><tr><th>Item harian</th><th>Nominal</th></tr></thead><tbody>{dailyRoomCharges.map((row) => <tr key={row.key}><td>{row.label}</td><td>{money.format(row.amount)}</td></tr>)}</tbody></table></div>}

      {form.other_charges.length > 0 && <CompactChargeList charges={form.other_charges} activeIndex={activeChargeIndex} chargeLabel={chargeLabel} onEdit={setActiveChargeIndex} onRemove={(index) => { patchForm({ other_charges: form.other_charges.filter((_, i) => i !== index) }); setActiveChargeIndex(null); }} />}
      {activeChargeIndex !== null && form.other_charges[activeChargeIndex] && <ChargeInput index={activeChargeIndex} charge={form.other_charges[activeChargeIndex]} updateCharge={updateCharge} />}
      <div className="fo-summary fo-total-summary"><div><span>Subtotal</span><strong>{money.format(subtotal)}</strong></div><div><span>Pajak ({totals.taxMode})</span><strong>{money.format(totals.taxAmount || 0)}</strong></div><div><span>Service</span><strong>{money.format(totals.serviceAmount || 0)}</strong></div><div className="grand-total"><span>Grand Total</span><strong>{money.format(totals.grandTotal || 0)}</strong></div></div>
    </section>

    {showGuestModal && <div className="modal-backdrop"><form className="modal-card form-grid" onSubmit={saveGuest}><div className="modal-header"><h2>Tambah Tamu Baru</h2><button type="button" className="modal-close" onClick={() => setShowGuestModal(false)}>×</button></div><label>Nama tamu<input required value={guestDraft.full_name} onChange={(e) => setGuestDraft({ ...guestDraft, full_name: e.target.value })} /></label><label>No HP<input value={guestDraft.phone} onChange={(e) => setGuestDraft({ ...guestDraft, phone: e.target.value })} /></label><label>Email<input type="email" value={guestDraft.email} onChange={(e) => setGuestDraft({ ...guestDraft, email: e.target.value })} /></label><label>No Identitas<input value={guestDraft.nik} onChange={(e) => setGuestDraft({ ...guestDraft, nik: e.target.value })} /></label><label className="full">Alamat/Catatan<textarea value={guestDraft.address} onChange={(e) => setGuestDraft({ ...guestDraft, address: e.target.value })} /></label><button disabled={saving === 'guest'}>{saving === 'guest' ? 'Menyimpan...' : 'Simpan Tamu'}</button></form></div>}
  </form>;
}

function CompactRoomList({ rooms, activeIndex, roomLabel, nights, arrival, departure, onEdit, onRemove }) {
  return <div className="fo-table-wrap compact-list"><h3>List kamar ditambahkan</h3><table className="fo-table"><thead><tr><th>Kamar / Type</th><th>Arrival</th><th>Departure</th><th>Night</th><th>Rate</th><th>Total</th><th>Aksi</th></tr></thead><tbody>{rooms.map((room, index) => index === activeIndex ? null : <tr key={index}><td>{roomLabel(room)}</td><td>{dateLabel(arrival)}</td><td>{dateLabel(departure)}</td><td>{nights}</td><td>{money.format(moneyValue(room.rate_per_night))}</td><td>{money.format(roomTotal(room, nights))}</td><td><div className="table-actions"><button type="button" className="secondary" onClick={() => onEdit(index)}>Edit</button><button type="button" className="danger" onClick={() => onRemove(index)}>Remove</button></div></td></tr>)}</tbody></table></div>;
}

function RoomInput({ index, room, roomTypes, roomOptions, nights, updateRoom, onDone }) {
  return <div className="fo-inline-editor"><h3>Input Kamar ke-{index + 1}</h3><div className="fo-form-grid compact-row"><label>Room type<select required value={room.room_type_id} onChange={(e) => updateRoom(index, { room_type_id: e.target.value, room_id: '', rate_per_night: roomTypes.find((type) => type.id === e.target.value)?.base_rate ?? roomTypes.find((type) => type.id === e.target.value)?.base_price ?? '' })}><option value="">Pilih room type</option>{roomTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><label>Room number<select value={room.room_id} onChange={(e) => updateRoom(index, { room_id: e.target.value })}><option value="">Unassigned</option>{roomOptions(room.room_type_id).map((item) => <option key={item.id} value={item.id}>{item.room_number} · {item.hk_status}</option>)}</select></label><label>Rate/night<input type="number" min="0" required value={room.rate_per_night} onChange={(e) => updateRoom(index, { rate_per_night: e.target.value })} /></label><p><strong>Total</strong><br />{money.format(roomTotal(room, nights))}</p><button type="button" className="secondary" onClick={onDone}>Selesai</button></div></div>;
}

function CompactChargeList({ charges, activeIndex, chargeLabel, onEdit, onRemove }) {
  return <div className="fo-table-wrap compact-list"><h3>List other charge</h3><table className="fo-table"><thead><tr><th>Item</th><th>Tanggal</th><th>Qty</th><th>Unit Price</th><th>Amount</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>{charges.map((charge, index) => index === activeIndex ? null : <tr key={index}><td>{chargeLabel(charge)}</td><td>{dateLabel(charge.posting_date)}</td><td>{charge.qty || 1}</td><td>{money.format(moneyValue(charge.unit_price))}</td><td>{money.format(chargeTotal(charge))}</td><td>{charge.description || charge.notes || '-'}</td><td><div className="table-actions"><button type="button" className="secondary" onClick={() => onEdit(index)}>Edit</button><button type="button" className="danger" onClick={() => onRemove(index)}>Remove</button></div></td></tr>)}</tbody></table></div>;
}

function ChargeInput({ index, charge, updateCharge }) {
  const amount = chargeTotal(charge);
  const updateItem = (itemType) => {
    const label = ADDITIONAL_CHARGE_TYPES.find(([key]) => key === itemType)?.[1] || '';
    updateCharge(index, { item_type: itemType, description: itemType === 'other' ? '' : label });
  };
  return <div className="fo-inline-editor"><h3>Input Other Charge ke-{index + 1}</h3><div className="fo-form-grid compact-row"><label>Charge date<input type="date" value={charge.posting_date || today()} onChange={(e) => updateCharge(index, { posting_date: e.target.value })} /></label><label>Item<select value={charge.item_type} onChange={(e) => updateItem(e.target.value)}>{ADDITIONAL_CHARGE_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Qty<input type="number" min="1" value={charge.qty} onChange={(e) => updateCharge(index, { qty: e.target.value })} /></label><label>Unit price<input type="number" min="0" value={charge.unit_price} onChange={(e) => updateCharge(index, { unit_price: e.target.value })} /></label><p><strong>Amount</strong><br />{money.format(amount)}</p><label className="full">Keterangan<input value={charge.description} onChange={(e) => updateCharge(index, { description: e.target.value })} /></label></div></div>;
}


function ReportTab({ onError, onSuccess }) {
  const { profile } = useAuth();
  const [reportTab, setReportTab] = useState('in_house');
  const [data, setData] = useState({ inHouse: [], ea: [], ed: [], forecast: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [openMenuId, setOpenMenuId] = useState('');
  const [detailStay, setDetailStay] = useState(null);
  const [detailNotes, setDetailNotes] = useState('');
  const [moveState, setMoveState] = useState({ stay: null, roomId: '', reason: '', choices: [] });
  const [extendState, setExtendState] = useState({ stay: null, extraNights: 1, rate: '' });
  const canDebtCheckout = ['admin', 'super_admin'].includes(profile?.role);
  const todayDate = today();

  async function load() {
    setLoading(true);
    try {
      const [inHouse, ea, ed, forecast] = await Promise.all([staysApi.active().catch(() => []), reservationsApi.listByView('expected_arrival', { startDate: today(), endDate: today() }).catch(() => []), reservationsApi.listByView('expected_departure', { startDate: today(), endDate: today() }).catch(() => []), forecastApi.byDateRange(today(), addDaysToDate(today(), 6)).catch(() => ({ rows: [] }))]);
      setData({ inHouse, ea, ed, forecast: forecast.rows || [] });
    } catch (err) { onError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!openMenuId) return undefined;
    const close = () => setOpenMenuId('');
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuId]);

  const summary = useMemo(() => ({ inHouse: data.inHouse.length, expectedArrival: data.ea.length, expectedDeparture: data.ed.length, roomAvailability: data.forecast[0]?.available_rooms ?? 0 }), [data]);
  const rows = { in_house: data.inHouse, ea: data.ea, ed: data.ed, forecast: data.forecast }[reportTab] || [];
  const reservationOf = (stay) => stay?.reservations || stay || {};
  const folioOf = (stay) => stay?.folios || stay?.reservations?.folios || null;
  const expectedCheckoutOf = (stay) => reservationOf(stay).check_out_date || reservationOf(stay).checkout_date || '';
  const guestNameOf = (stay) => stay?.guests?.full_name || stay?.reservations?.guests?.full_name || '-';
  const roomNameOf = (stay) => stay?.rooms?.room_number || stay?.reservations?.rooms?.room_number || '-';

  async function checkIn(row) {
    if (saving) return;
    setSaving(`checkin-${row.id}`);
    try { await staysApi.checkIn(row, row.room_id || ''); onSuccess('Check In berhasil.'); await load(); }
    catch (err) { onError(err.message); }
    finally { setSaving(''); }
  }

  async function checkOut(row) {
    if (saving) return;
    const expectedCheckout = expectedCheckoutOf(row);
    if (expectedCheckout && todayDate < expectedCheckout) {
      const ok = window.confirm(`Tanggal departure tamu masih ${dateLabel(expectedCheckout)}. Jika dilanjutkan, tanggal check-out akan diubah menjadi hari ini. Lanjutkan?`);
      if (!ok) return;
    }
    setSaving(`checkout-${row.id}`);
    try {
      const folioId = row.folio_id || row.reservations?.folio_id;
      const freshFolio = folioId ? await foliosApi.getFolio(folioId).catch(() => null) : null;
      const balance = Number(freshFolio?.balance_due ?? row.folios?.balance_due ?? row.reservations?.folios?.balance_due ?? 0);
      if (balance > 0) {
        if (!canDebtCheckout) throw new Error('Checkout dengan debt/ledger hanya admin/super_admin.');
        if (folioId) await foliosApi.closeFolio(folioId);
      }
      await staysApi.checkOut(row, { earlyCheckoutApproved: true });
      onSuccess(balance > 0 ? 'Check Out debt/ledger berhasil.' : 'Check Out berhasil.');
      await load();
    } catch (err) { onError(err.message); } finally { setSaving(''); }
  }

  async function openMoveRoom(stay) {
    setOpenMenuId('');
    setSaving(`move-load-${stay.id}`);
    try {
      const checkIn = reservationOf(stay).check_in_date || todayDate;
      const checkOut = expectedCheckoutOf(stay) || addDaysToDate(todayDate, 1);
      const choices = await roomsApi.availableForStay({ check_in_date: checkIn, check_out_date: checkOut, exclude_reservation_id: stay.reservation_id || '' });
      setMoveState({ stay, roomId: '', reason: '', choices });
    } catch (err) { onError(err.message); } finally { setSaving(''); }
  }

  async function submitMoveRoom(event) {
    event.preventDefault();
    if (!moveState.stay || saving) return;
    setSaving(`move-${moveState.stay.id}`);
    try {
      await staysApi.moveRoom(moveState.stay, moveState.roomId, moveState.reason, profile?.role);
      setMoveState({ stay: null, roomId: '', reason: '', choices: [] });
      onSuccess('Pindah kamar berhasil. Rate tidak diubah otomatis; selisih tarif perlu diposting manual jika diperlukan.');
      await load();
    } catch (err) { onError(err.message); } finally { setSaving(''); }
  }

  function openDetail(stay) {
    const folio = folioOf(stay);
    setOpenMenuId('');
    setDetailStay(stay);
    setDetailNotes(folio?.notes || reservationOf(stay).notes || reservationOf(stay).special_notes || '');
  }

  async function saveDetailNotes(event) {
    event.preventDefault();
    if (!detailStay || saving) return;
    const folioId = detailStay.folio_id || detailStay.reservations?.folio_id || folioOf(detailStay)?.id;
    if (!folioId) return onError('Folio tidak ditemukan untuk menyimpan catatan.');
    setSaving(`notes-${detailStay.id}`);
    try {
      await foliosApi.updateNotes(folioId, detailNotes);
      setDetailStay(null);
      onSuccess('Catatan folio berhasil disimpan.');
      await load();
    } catch (err) { onError(err.message); } finally { setSaving(''); }
  }

  function openExtend(stay) {
    setOpenMenuId('');
    setExtendState({ stay, extraNights: 1, rate: String(reservationOf(stay).room_rate || 0) });
  }

  async function submitExtend(event) {
    event.preventDefault();
    if (!extendState.stay || saving) return;
    const reservation = reservationOf(extendState.stay);
    const folioId = extendState.stay.folio_id || reservation.folio_id || folioOf(extendState.stay)?.id;
    if (!folioId || !reservation?.id) return onError('Reservasi/folio tidak ditemukan untuk extend.');
    const oldCheckout = expectedCheckoutOf(extendState.stay);
    const newCheckout = addDaysToDate(oldCheckout, Math.max(Number(extendState.extraNights || 1), 1));
    setSaving(`extend-${extendState.stay.id}`);
    try {
      await foliosApi.extendStay(folioId, reservation, { new_check_out_date: newCheckout, extra_nightly_rate: extendState.rate });
      setExtendState({ stay: null, extraNights: 1, rate: '' });
      onSuccess('Extend berhasil. Charge tambahan masuk ke folio.');
      await load();
    } catch (err) { onError(err.message); } finally { setSaving(''); }
  }

  function InHouseActions({ stay }) {
    const canExtend = expectedCheckoutOf(stay) === todayDate;
    return <div className="row-menu" onClick={(event) => event.stopPropagation()}><button type="button" className="kebab-button" aria-label="Aksi tamu in house" onClick={() => setOpenMenuId(openMenuId === stay.id ? '' : stay.id)}>⋮</button>{openMenuId === stay.id && <div className="row-menu-dropdown"><button type="button" onClick={() => openMoveRoom(stay)}>Pindah Kamar</button><button type="button" onClick={() => openDetail(stay)}>Detail</button><button type="button" onClick={() => checkOut(stay)} disabled={saving === `checkout-${stay.id}`}>Check Out</button>{canExtend ? <button type="button" onClick={() => openExtend(stay)}>Extend</button> : <button type="button" disabled title="Extend hanya tersedia pada tanggal departure.">Extend</button>}</div>}</div>;
  }

  return <section className="fo-panel"><h2>Data / Report Front Office</h2><div className="fo-summary">{Object.entries(summary).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div><nav className="fo-tabs compact">{[['in_house','In House'],['ea','Expected Arrival'],['ed','Expected Departure'],['forecast','Forecast / Room Availability']].map(([key, label]) => <button key={key} type="button" className={reportTab === key ? 'active' : ''} onClick={() => setReportTab(key)}>{label}</button>)}</nav>{loading ? <p>Memuat report...</p> : rows.length === 0 ? <p className="muted">Tidak ada data.</p> : <table className="fo-table"><thead><tr>{reportTab === 'forecast' ? <><th>Tanggal</th><th>Inventory</th><th>Occupied</th><th>EA</th><th>ED</th><th>Available</th><th>Occ %</th></> : <><th>Kamar</th><th>Nama</th><th>Arrival</th><th>Departure</th><th>Status</th><th>Aksi</th></>}</tr></thead><tbody>{rows.map((row, index) => reportTab === 'forecast' ? <tr key={row.date || index}><td>{row.date}</td><td>{row.inventory_rooms || 0}</td><td>{row.occupied_rooms || 0}</td><td>{row.expected_arrival || 0}</td><td>{row.expected_departure || 0}</td><td>{row.available_rooms || 0}</td><td>{row.occupancy_percentage || row.occupancy_percent || 0}%</td></tr> : <tr key={row.id || index}><td>{roomNameOf(row)}</td><td>{guestNameOf(row)}</td><td>{row.check_in_date || row.reservations?.check_in_date || formatDate(row.actual_check_in)}</td><td>{expectedCheckoutOf(row) || formatDate(row.actual_check_out)}</td><td><span className={`badge ${row.status}`}>{row.status || '-'}</span></td><td>{reportTab === 'in_house' && row.status === 'checked_in' ? <InHouseActions stay={row} /> : <div className="table-actions">{reportTab === 'ea' && row.status === 'reserved' && <button type="button" disabled={saving === `checkin-${row.id}`} onClick={() => checkIn(row)}>Check In</button>}</div>}</td></tr>)}</tbody></table>}
    {moveState.stay && <div className="modal-backdrop"><form className="modal-card form-grid" onSubmit={submitMoveRoom}><div className="modal-header"><h2>Pindah Kamar</h2><button type="button" className="modal-close" onClick={() => setMoveState({ stay: null, roomId: '', reason: '', choices: [] })}>×</button></div><p><strong>{guestNameOf(moveState.stay)}</strong><br />Kamar lama: {roomNameOf(moveState.stay)}<br />{reservationOf(moveState.stay).check_in_date || '-'} - {expectedCheckoutOf(moveState.stay) || '-'}</p><label>Kamar baru<select required value={moveState.roomId} onChange={(event) => setMoveState({ ...moveState, roomId: event.target.value })}><option value="">Pilih kamar ready</option>{moveState.choices.map((room) => <option key={room.id} value={room.id}>{room.room_number} - {room.hk_status} - {room.room_types?.name || '-'}</option>)}</select></label><label className="full">Alasan pindah kamar<textarea required value={moveState.reason} onChange={(event) => setMoveState({ ...moveState, reason: event.target.value })} /></label><div className="button-row full"><button disabled={saving === `move-${moveState.stay.id}`}>Submit Pindah Kamar</button><button type="button" className="secondary" onClick={() => setMoveState({ stay: null, roomId: '', reason: '', choices: [] })}>Batal</button></div></form></div>}
    {detailStay && <div className="modal-backdrop"><form className="modal-card form-grid" onSubmit={saveDetailNotes}><div className="modal-header"><h2>Detail In House</h2><button type="button" className="modal-close" onClick={() => setDetailStay(null)}>×</button></div><div className="full detail-list"><p><strong>Nama</strong><br />{guestNameOf(detailStay)}</p><p><strong>No Folio</strong><br />{folioOf(detailStay)?.folio_number || '-'}</p><p><strong>Kamar</strong><br />{roomNameOf(detailStay)}</p><p><strong>Arrival / Departure</strong><br />{reservationOf(detailStay).check_in_date || '-'} / {expectedCheckoutOf(detailStay) || '-'}</p><p><strong>Nights</strong><br />{nightsBetween(reservationOf(detailStay).check_in_date, expectedCheckoutOf(detailStay))}</p><p><strong>Segment</strong><br />{(folioOf(detailStay)?.notes || reservationOf(detailStay).notes || '').split('\n')[0] || '-'}</p><p><strong>Status / Balance</strong><br />{detailStay.status || '-'} / {money.format(folioOf(detailStay)?.balance_due || 0)}</p></div><label className="full">Catatan folio<textarea value={detailNotes} onChange={(event) => setDetailNotes(event.target.value)} /></label><div className="button-row full"><button disabled={saving === `notes-${detailStay.id}`}>Simpan Catatan</button><button type="button" className="secondary" onClick={() => setDetailStay(null)}>Tutup</button></div></form></div>}
    {extendState.stay && <div className="modal-backdrop"><form className="modal-card form-grid" onSubmit={submitExtend}><div className="modal-header"><h2>Extend Stay</h2><button type="button" className="modal-close" onClick={() => setExtendState({ stay: null, extraNights: 1, rate: '' })}>×</button></div><p><strong>{guestNameOf(extendState.stay)}</strong><br />Kamar: {roomNameOf(extendState.stay)}<br />Departure lama: {dateLabel(expectedCheckoutOf(extendState.stay))}</p><label>Tambah night<input type="number" min="1" value={extendState.extraNights} onChange={(event) => setExtendState({ ...extendState, extraNights: event.target.value })} /></label><label>Rate/night<input type="number" min="0" value={extendState.rate} onChange={(event) => setExtendState({ ...extendState, rate: event.target.value })} /></label><p><strong>Departure baru</strong><br />{dateLabel(addDaysToDate(expectedCheckoutOf(extendState.stay), Math.max(Number(extendState.extraNights || 1), 1)))}</p><p><strong>Preview charge</strong><br />{money.format(Number(extendState.rate || 0) * Math.max(Number(extendState.extraNights || 1), 1))}</p><div className="button-row full"><button disabled={saving === `extend-${extendState.stay.id}`}>Submit Extend</button><button type="button" className="secondary" onClick={() => setExtendState({ stay: null, extraNights: 1, rate: '' })}>Batal</button></div></form></div>}
  </section>;
}
