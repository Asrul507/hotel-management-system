import { useEffect, useMemo, useState } from 'react';
import { ADDITIONAL_CHARGE_TYPES, NON_CASH_METHODS, addDaysToDate, foliosApi, guestsApi, nightsBetween, reservationsApi, roomTypesApi, roomsApi, today } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const emptyPayment = { payment_group: 'cash', payment_method: 'cash', amount: '', reference_number: '', card_or_account_number: '', notes: '' };
const emptyCharge = { item_type: 'extra_bed', description: 'Extra Bed', qty: 1, unit_price: '', posting_date: today() };
const emptyReservation = { guest_id: '', room_type_id: '', room_id: '', check_in_date: today(), nights: 1, check_out_date: addDaysToDate(today(), 1), adults: 1, children: 0, room_rate: '', deposit_amount: '', status: 'reserved', notes: '' };

export default function BillingPage() {
  const { profile } = useAuth();
  const [folios, setFolios] = useState([]);
  const [guests, setGuests] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [filters, setFilters] = useState({ status: 'all', search: '' });
  const [activeTab, setActiveTab] = useState('summary');
  const [newFolio, setNewFolio] = useState({ guest_id: '', notes: '' });
  const [reservationForm, setReservationForm] = useState(emptyReservation);
  const [roomChoices, setRoomChoices] = useState([]);
  const [charge, setCharge] = useState(emptyCharge);
  const [payment, setPayment] = useState(emptyPayment);
  const [refund, setRefund] = useState(emptyPayment);
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selected = folios.find((folio) => folio.id === selectedId) || folios[0];
  const selectedGuestId = selected?.guest_id || '';
  const selectedGuest = guests.find((guest) => guest.id === selectedGuestId);
  const selectedRoomType = roomTypes.find((type) => type.id === reservationForm.room_type_id);
  const chargeTotal = Number(charge.qty || 0) * Number(charge.unit_price || 0);
  const reservations = selected?.reservations || [];
  const charges = (selected?.folio_items || []).filter((item) => item.item_type !== 'room');
  const roomCharges = (selected?.folio_items || []).filter((item) => item.item_type === 'room');
  const payments = (selected?.folio_payments || []).filter((item) => item.payment_type === 'payment');
  const refunds = (selected?.folio_payments || []).filter((item) => item.payment_type === 'refund');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [folioData, guestData, typeData] = await Promise.all([
        foliosApi.list(filters),
        guestsApi.list({ status: 'active' }),
        roomTypesApi.list({ includeInactive: false })
      ]);
      setFolios(folioData);
      setGuests(guestData);
      setRoomTypes(typeData);
      const nextSelected = selectedId && folioData.some((folio) => folio.id === selectedId) ? selectedId : folioData[0]?.id || '';
      setSelectedId(nextSelected);
      const current = folioData.find((folio) => folio.id === nextSelected) || folioData[0];
      if (current) {
        setDiscount(current.discount_percent || 0);
        setReservationForm((form) => ({ ...form, guest_id: current.guest_id || '' }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selected) return;
    setDiscount(selected.discount_percent || 0);
    setReservationForm((form) => ({ ...form, guest_id: selected.guest_id || '' }));
  }, [selected?.id]);

  useEffect(() => {
    let active = true;
    async function loadRooms() {
      if (!reservationForm.room_type_id || !reservationForm.check_in_date || !reservationForm.check_out_date || reservationForm.check_out_date <= reservationForm.check_in_date) {
        setRoomChoices([]);
        return;
      }
      try {
        const rooms = await roomsApi.availableForStay({
          check_in_date: reservationForm.check_in_date,
          check_out_date: reservationForm.check_out_date,
          room_type_id: reservationForm.room_type_id
        });
        if (active) setRoomChoices(rooms);
      } catch (err) {
        if (active) setError(err.message);
      }
    }
    loadRooms();
    return () => { active = false; };
  }, [reservationForm.room_type_id, reservationForm.check_in_date, reservationForm.check_out_date]);

  useEffect(() => {
    if (!reservationForm.room_type_id && roomTypes[0]) {
      setReservationForm((form) => ({ ...form, room_type_id: roomTypes[0].id, room_rate: form.room_rate || String(roomTypes[0].base_rate ?? roomTypes[0].base_price ?? 0) }));
    }
  }, [roomTypes]);

  async function run(key, action, doneMessage = '') {
    setSaving(key);
    setError('');
    setSuccess('');
    try {
      await action();
      if (doneMessage) setSuccess(doneMessage);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  }

  function updateReservation(field, value) {
    if (field === 'room_type_id') {
      const type = roomTypes.find((item) => item.id === value);
      setReservationForm((current) => ({ ...current, room_type_id: value, room_id: '', room_rate: String(type?.base_rate ?? type?.base_price ?? 0) }));
      return;
    }
    if (field === 'check_in_date') {
      setReservationForm((current) => ({ ...current, check_in_date: value, check_out_date: addDaysToDate(value, Math.max(Number(current.nights || 1), 1)) }));
      return;
    }
    if (field === 'nights') {
      const nextNights = Math.max(Number(value || 0), 1);
      setReservationForm((current) => ({ ...current, nights: value, check_out_date: addDaysToDate(current.check_in_date, nextNights) }));
      return;
    }
    if (field === 'check_out_date') {
      setReservationForm((current) => ({ ...current, check_out_date: value, nights: String(nightsBetween(current.check_in_date, value) || 1) }));
      return;
    }
    setReservationForm((current) => ({ ...current, [field]: value }));
  }

  function updateCharge(field, value) {
    if (field === 'item_type') {
      const label = ADDITIONAL_CHARGE_TYPES.find(([key]) => key === value)?.[1] || '';
      setCharge((current) => ({ ...current, item_type: value, description: value === 'other' ? '' : label }));
      return;
    }
    setCharge((current) => ({ ...current, [field]: value }));
  }

  function updatePayment(setter) {
    return (patch) => setter((current) => {
      const next = { ...current, ...patch };
      if (patch.payment_group === 'cash') next.payment_method = 'cash';
      if (patch.payment_group === 'non_tunai' && next.payment_method === 'cash') next.payment_method = 'qris';
      return next;
    });
  }

  const actionButtons = useMemo(() => [
    ['reservations', 'Add Reservation'],
    ['charges', 'Add Charge'],
    ['payments', 'Add Payment'],
    ['summary', 'Apply Discount'],
    ['refund', 'Refund / Debt']
  ], []);

  return <div className="page-stack">
    <div className="page-header"><div><h1>Folio / Billing Workspace</h1><p>Billing utama memakai folio baru. Invoice lama hanya legacy saat check-out.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {success && <div className="alert success">{success}</div>}
    <div className="two-column wide-left">
      <div className="page-stack">
        <form className="card form-grid" onSubmit={(e) => { e.preventDefault(); run('new-folio', async () => {
          const folio = await foliosApi.createFolio(newFolio);
          setSelectedId(folio.id);
          setNewFolio({ guest_id: '', notes: '' });
        }, 'Folio baru berhasil dibuat.'); }}>
          <h2>Buat Folio Baru</h2>
          <label className="full">Guest<select required value={newFolio.guest_id} onChange={(e) => setNewFolio({ ...newFolio, guest_id: e.target.value })}><option value="">Pilih tamu</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.full_name}{guest.phone ? ` - ${guest.phone}` : ''}</option>)}</select></label>
          <label className="full">Notes<textarea value={newFolio.notes} onChange={(e) => setNewFolio({ ...newFolio, notes: e.target.value })} /></label>
          <button disabled={saving === 'new-folio'}>{saving === 'new-folio' ? 'Membuat...' : 'New Folio'}</button>
        </form>
        <form className="card filter-grid" onSubmit={(e) => { e.preventDefault(); load(); }}><input placeholder="Cari folio / tamu" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">Semua status</option><option value="open">Open</option><option value="closed">Closed</option><option value="debt">Debt</option><option value="cancelled">Cancelled</option><option value="refunded">Refunded</option></select><button>Filter</button></form>
        <div className="card table-card"><h2>Daftar Folio</h2>{loading ? <p>Memuat folio...</p> : folios.length === 0 ? <p className="muted">Belum ada folio. Klik New Folio untuk mulai.</p> : <table><thead><tr><th>Folio</th><th>Tamu</th><th>Grand Total</th><th>Balance</th><th>Status</th></tr></thead><tbody>{folios.map((folio) => <tr key={folio.id} className={selected?.id === folio.id ? 'selected-row' : ''} onClick={() => setSelectedId(folio.id)}><td>{folio.folio_number}</td><td>{folio.guests?.full_name || '-'}</td><td>{money.format(folio.grand_total || 0)}</td><td>{money.format(folio.balance_due || 0)}</td><td><span className={`badge ${folio.status}`}>{folio.status}</span></td></tr>)}</tbody></table>}</div>
      </div>

      {selected ? <div className="page-stack">
        <div className="card detail-list">
          <div className="page-header"><div><h2>{selected.folio_number} - {selected.guests?.full_name || selectedGuest?.full_name || '-'}</h2><p><span className={`badge ${selected.status}`}>{selected.status}</span></p></div><button className="small" disabled={saving === 'close'} onClick={() => run('close', () => foliosApi.closeFolio(selected.id), selected.balance_due > 0 ? 'Folio ditutup sebagai debt.' : 'Folio ditutup.')}>{selected.balance_due > 0 ? 'Close / Mark Debt' : 'Close Folio'}</button></div>
          <div className="button-row">{actionButtons.map(([tab, label]) => <button key={tab} className={activeTab === tab ? 'small' : 'small secondary'} onClick={() => setActiveTab(tab)}>{label}</button>)}</div>
        </div>

        {activeTab === 'summary' && <div className="card detail-list"><h2>Summary</h2><div className="grid"><p><strong>Subtotal</strong><br />{money.format(selected.subtotal || 0)}</p><p><strong>Discount</strong><br />{selected.discount_percent || 0}% / {money.format(selected.discount_amount || 0)}</p><p><strong>Tax</strong><br />{money.format(selected.tax_amount || 0)}</p><p><strong>Service</strong><br />{money.format(selected.service_amount || 0)}</p><p><strong>Grand Total</strong><br />{money.format(selected.grand_total || 0)}</p><p><strong>Paid</strong><br />{money.format(selected.paid_amount || 0)}</p><p><strong>Refund</strong><br />{money.format(selected.refund_amount || 0)}</p><p><strong>Balance</strong><br />{money.format(selected.balance_due || 0)}</p></div><form className="inline-form" onSubmit={(e) => { e.preventDefault(); run('discount', () => foliosApi.updateDiscount(selected.id, discount, profile?.role), 'Discount folio tersimpan.'); }}><label>Discount %<input type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} /></label><button disabled={saving === 'discount'}>Apply Discount</button></form></div>}

        {activeTab === 'reservations' && <div className="page-stack"><form className="card form-grid" onSubmit={(e) => { e.preventDefault(); run('reservation', async () => {
          const payload = { ...reservationForm, guest_id: selected.guest_id, folio_id: selected.id, room_rate: reservationForm.room_rate === '' ? 0 : Number(reservationForm.room_rate), deposit_amount: reservationForm.deposit_amount === '' ? 0 : Number(reservationForm.deposit_amount) };
          const reservation = await reservationsApi.create(payload);
          await foliosApi.addRoomChargeOnce(selected.id, reservation);
          setReservationForm({ ...emptyReservation, guest_id: selected.guest_id, room_type_id: roomTypes[0]?.id || '', room_rate: String(roomTypes[0]?.base_rate ?? roomTypes[0]?.base_price ?? 0) });
        }, 'Reservasi tersimpan dan terhubung ke folio.'); }}>
          <h2>Add Reservation ke Folio</h2>
          <label>Guest<input disabled value={selected.guests?.full_name || '-'} /></label>
          <label>Room type<select required value={reservationForm.room_type_id} onChange={(e) => updateReservation('room_type_id', e.target.value)}><option value="">Pilih tipe</option>{roomTypes.map((type) => <option key={type.id} value={type.id}>{type.code} - {type.name}</option>)}</select></label>
          <label>Check-in<input type="date" required value={reservationForm.check_in_date} onChange={(e) => updateReservation('check_in_date', e.target.value)} /></label>
          <label>Nights<input type="number" min="1" required value={reservationForm.nights} onChange={(e) => updateReservation('nights', e.target.value)} /></label>
          <label>Check-out<input type="date" required value={reservationForm.check_out_date} onChange={(e) => updateReservation('check_out_date', e.target.value)} /></label>
          <label>Kamar ready<select value={reservationForm.room_id} onChange={(e) => updateReservation('room_id', e.target.value)}><option value="">Unassigned by type</option>{roomChoices.map((room) => <option key={room.id} value={room.id}>{room.room_number} - {room.hk_status}</option>)}</select>{reservationForm.room_type_id && roomChoices.length === 0 && <small>Tidak ada kamar ready untuk tanggal ini. Cek FO/HK status, tanggal, atau booking overlap.</small>}</label>
          <label>Room rate<input type="number" min="0" value={reservationForm.room_rate} placeholder={String(selectedRoomType?.base_rate ?? selectedRoomType?.base_price ?? 0)} onChange={(e) => updateReservation('room_rate', e.target.value)} /></label>
          <label>Deposit<input type="number" min="0" value={reservationForm.deposit_amount} onChange={(e) => updateReservation('deposit_amount', e.target.value)} /></label>
          <label className="full">Notes<textarea value={reservationForm.notes} onChange={(e) => updateReservation('notes', e.target.value)} /></label>
          <button disabled={saving === 'reservation'}>Add Reservation</button>
        </form><FolioTable title="Reservations" rows={reservations} columns={['Kode', 'Kamar', 'Tanggal', 'Status']} render={(reservation) => [reservation.reservation_code, reservation.rooms?.room_number || 'Unassigned', `${reservation.check_in_date} → ${reservation.check_out_date}`, reservation.status]} /></div>}

        {activeTab === 'charges' && <div className="page-stack"><form className="card form-grid" onSubmit={(e) => { e.preventDefault(); run('charge', async () => {
          await foliosApi.addFolioItem(selected.id, charge);
          setCharge(emptyCharge);
        }, 'Additional charge tersimpan.'); }}>
          <h2>Add Additional Charge</h2>
          <label>Item<select value={charge.item_type} onChange={(e) => updateCharge('item_type', e.target.value)}>{ADDITIONAL_CHARGE_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Description<input required value={charge.description} onChange={(e) => updateCharge('description', e.target.value)} placeholder="Wajib diisi" /></label>
          <label>Qty<input type="number" min="0.01" step="0.01" required value={charge.qty} onChange={(e) => updateCharge('qty', e.target.value)} /></label>
          <label>Unit price<input type="number" min="0" step="0.01" required value={charge.unit_price} onChange={(e) => updateCharge('unit_price', e.target.value)} /></label>
          <label>Posting date<input type="date" value={charge.posting_date} onChange={(e) => updateCharge('posting_date', e.target.value)} /></label>
          <p><strong>Total otomatis</strong><br />{money.format(chargeTotal || 0)}</p>
          <button disabled={saving === 'charge'}>Add Charge</button>
        </form><FolioItems title="Room Charges" rows={roomCharges} /><FolioItems title="Additional Charges" rows={charges} /></div>}

        {activeTab === 'payments' && <div className="page-stack"><div className="card"><h2>Add Payment</h2><PaymentForm state={payment} setter={updatePayment(setPayment)} onSubmit={(e) => { e.preventDefault(); run('payment', async () => { await foliosApi.addFolioPayment(selected.id, payment); setPayment(emptyPayment); }, 'Payment tersimpan.'); }} saving={saving === 'payment'} /></div><PaymentTable title="Payments" rows={payments} /></div>}

        {activeTab === 'refund' && <div className="page-stack"><div className="card"><h2>Refund</h2><PaymentForm state={refund} setter={updatePayment(setRefund)} onSubmit={(e) => { e.preventDefault(); run('refund', async () => { await foliosApi.refundFolio(selected.id, refund); setRefund(emptyPayment); }, 'Refund tersimpan.'); }} saving={saving === 'refund'} refund /></div><PaymentTable title="Refunds" rows={refunds} /></div>}
      </div> : <div className="card muted">Pilih atau buat folio untuk mulai input billing.</div>}
    </div>
  </div>;
}

function FolioTable({ title, rows, columns, render }) {
  return <div className="card table-card"><h2>{title}</h2>{rows.length === 0 ? <p className="muted">Belum ada data.</p> : <table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{render(row).map((value, index) => <td key={index}>{value}</td>)}</tr>)}</tbody></table>}</div>;
}

function FolioItems({ title, rows }) {
  return <div className="card table-card"><h2>{title}</h2>{rows.length === 0 ? <p className="muted">Belum ada item.</p> : <table><thead><tr><th>Tanggal</th><th>Type</th><th>Deskripsi</th><th>Qty</th><th>Harga</th><th>Total</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td>{item.posting_date}</td><td>{item.item_type}</td><td>{item.description}</td><td>{item.qty}</td><td>{money.format(item.unit_price || 0)}</td><td>{money.format(item.line_total || 0)}</td></tr>)}</tbody></table>}</div>;
}

function PaymentTable({ title, rows }) {
  return <div className="card table-card"><h2>{title}</h2>{rows.length === 0 ? <p className="muted">Belum ada payment/refund.</p> : <table><thead><tr><th>Tanggal</th><th>Group</th><th>Metode</th><th>Amount</th><th>Ref</th><th>Notes</th></tr></thead><tbody>{rows.map((payment) => <tr key={payment.id}><td>{payment.paid_at?.slice(0, 10)}</td><td>{payment.payment_group}</td><td>{payment.payment_method}</td><td>{money.format(payment.amount || 0)}</td><td>{payment.reference_number || '-'}</td><td>{payment.notes || '-'}</td></tr>)}</tbody></table>}</div>;
}

function PaymentForm({ state, setter, onSubmit, saving, refund = false }) {
  const nonCash = state.payment_group === 'non_tunai';
  return <form className="form-grid" onSubmit={onSubmit}>
    <label>Group<select value={state.payment_group} onChange={(e) => setter({ payment_group: e.target.value })}><option value="cash">Cash</option><option value="non_tunai">Non Tunai</option></select></label>
    {nonCash && <label>Metode<select value={state.payment_method} onChange={(e) => setter({ payment_method: e.target.value })}>{NON_CASH_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}</select></label>}
    <label>Amount<input type="number" min="1" required value={state.amount} onChange={(e) => setter({ amount: e.target.value })} /></label>
    {nonCash && <label>No Reff<input required value={state.reference_number} onChange={(e) => setter({ reference_number: e.target.value })} /></label>}
    {nonCash && <label>No Kartu/Account<input value={state.card_or_account_number} onChange={(e) => setter({ card_or_account_number: e.target.value })} /></label>}
    <label className="full">Notes<textarea required={refund} value={state.notes} onChange={(e) => setter({ notes: e.target.value })} /></label>
    <button disabled={saving}>{saving ? 'Menyimpan...' : refund ? 'Refund' : 'Add Payment'}</button>
  </form>;
}
