import { useEffect, useMemo, useState } from 'react';
import { ADDITIONAL_CHARGE_TYPES, NON_CASH_METHODS, addDaysToDate, foliosApi, guestsApi, nightsBetween, reservationsApi, roomTypesApi, roomsApi, today } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { getBillingStatus, getBillingStatusLabel } from '../utils/billingStatus';
import IconButton from '../components/IconButton';
import { FrontOfficeSubnav } from '../components/ModuleSubnav';
import { faCalendarPlus, faCreditCard, faFilter, faFloppyDisk, faLock, faMoneyBillWave, faPenToSquare, faPlus, faRotateLeft, faTrash } from '@fortawesome/free-solid-svg-icons';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const emptyPayment = { payment_group: 'cash', payment_method: 'cash', amount: '', reference_number: '', card_or_account_number: '', notes: '' };
const emptyCharge = { item_type: 'extra_bed', description: 'Extra Bed', qty: 1, unit_price: '', posting_date: today() };
const emptyReservation = { guest_id: '', room_type_id: '', room_id: '', check_in_date: today(), nights: 1, check_out_date: addDaysToDate(today(), 1), adults: 1, children: 0, room_rate: '', deposit_amount: '', status: 'reserved', notes: '' };

export default function BillingPage() {
  const { profile } = useAuth();
  const [folios, setFolios] = useState([]);
  const [guests, setGuests] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [allRooms, setAllRooms] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [filters, setFilters] = useState({ status: 'all', search: '' });
  const [activeTab, setActiveTab] = useState('overview');
  const [showNewFolio, setShowNewFolio] = useState(false);
  const [newFolio, setNewFolio] = useState({ guest_id: '', notes: '' });
  const [reservationForm, setReservationForm] = useState(emptyReservation);
  const [roomChoices, setRoomChoices] = useState([]);
  const [charge, setCharge] = useState(emptyCharge);
  const [editItem, setEditItem] = useState(null);
  const [payment, setPayment] = useState(emptyPayment);
  const [refund, setRefund] = useState(emptyPayment);
  const [editReservation, setEditReservation] = useState(null);
  const [extendStay, setExtendStay] = useState(null);
  const [debtPayment, setDebtPayment] = useState({ ...emptyPayment, paid_at: today() });
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
  const canManageItems = profile?.role === 'super_admin';
  const canManageReservations = ['admin', 'super_admin'].includes(profile?.role);
  const billingStatus = getBillingStatus(selected);
  const activeItems = (selected?.folio_items || []).filter((item) => item.is_void !== true);
  const itemTypes = ['room', 'extra_bed', 'breakfast', 'early_checkin', 'late_checkout', 'laundry', 'restaurant', 'minibar', 'other', 'cancellation_fee', 'no_show_fee', 'adjustment'];
  const itemTotal = (item) => Number((item.line_total ?? (Number(item.qty || 0) * Number(item.unit_price || 0))) || 0);
  const roomChargeTotal = activeItems.filter((item) => item.item_type === 'room').reduce((sum, item) => sum + itemTotal(item), 0);
  const additionalChargeTotal = activeItems.filter((item) => !['room', 'discount', 'refund'].includes(item.item_type)).reduce((sum, item) => sum + itemTotal(item), 0);
  const breakdownRows = itemTypes.map((type) => {
    const rows = activeItems.filter((item) => item.item_type === type);
    return { type, count: rows.length, total: rows.reduce((sum, item) => sum + itemTotal(item), 0) };
  });
  const hasTransactions = activeItems.length > 0 || (selected?.folio_payments || []).length > 0;

  const load = async (preferredSelectedId = '') => {
    setLoading(true);
    setError('');
    try {
      const [folioData, guestData, typeData, roomData] = await Promise.all([
        foliosApi.list(filters),
        guestsApi.list({ status: 'active' }),
        roomTypesApi.list({ includeInactive: false }),
        roomsApi.list().catch(() => [])
      ]);
      setFolios(folioData);
      setGuests(guestData);
      setRoomTypes(typeData);
      setAllRooms(roomData);
      const targetSelectedId = preferredSelectedId || selectedId;
      const nextSelected = targetSelectedId && folioData.some((folio) => folio.id === targetSelectedId) ? targetSelectedId : folioData[0]?.id || '';
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
    setEditItem(null);
    setReservationForm((form) => ({ ...form, guest_id: selected.guest_id || '' }));
  }, [selected?.id]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key !== 'Escape') return;
      setEditReservation(null);
      setExtendStay(null);
      setDebtPayment({ ...emptyPayment, paid_at: today() });
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

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
      const result = await action();
      if (doneMessage) setSuccess(doneMessage);
      await load(result?.selectedId || '');
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

  function startEditItem(item) {
    setEditItem({
      id: item.id,
      item_type: item.item_type,
      description: item.description || '',
      qty: item.qty ?? 1,
      unit_price: item.unit_price ?? 0,
      posting_date: item.posting_date || today()
    });
  }

  function updateEditItem(field, value) {
    if (field === 'item_type') {
      const label = ADDITIONAL_CHARGE_TYPES.find(([key]) => key === value)?.[1] || '';
      setEditItem((current) => ({ ...current, item_type: value, description: value === 'other' ? current.description : (current.description || label) }));
      return;
    }
    setEditItem((current) => ({ ...current, [field]: value }));
  }

  function confirmClosedFolioAction(action) {
    if (!['closed', 'debt', 'refunded'].includes(selected?.status)) return true;
    return window.confirm(`Folio sudah ${selected.status}. Lanjut ${action} transaksi?`);
  }

  function voidItem(item) {
    if (!window.confirm('Yakin hapus/void transaksi ini? Total folio akan dihitung ulang.')) return;
    if (!confirmClosedFolioAction('void')) return;
    const reason = window.prompt('Alasan void transaksi?', 'Void by super admin') || 'Void by super admin';
    run(`void-${item.id}`, () => foliosApi.voidFolioItem(selected.id, item.id, profile?.role, reason), 'Transaksi berhasil di-void.');
  }

  function updatePayment(setter) {
    return (patch) => setter((current) => {
      const next = { ...current, ...patch };
      if (patch.payment_group === 'cash') next.payment_method = 'cash';
      if (patch.payment_group === 'non_tunai' && next.payment_method === 'cash') next.payment_method = 'qris';
      return next;
    });
  }


  function startEditReservation(reservation) {
    setEditReservation({
      id: reservation.id,
      guest_name: reservation.guests?.full_name || selected.guests?.full_name || '',
      room_type_id: reservation.room_type_id || reservation.rooms?.room_type_id || '',
      room_id: reservation.room_id || '',
      check_in_date: reservation.check_in_date || today(),
      check_out_date: reservation.check_out_date || addDaysToDate(today(), 1),
      nights: nightsBetween(reservation.check_in_date, reservation.check_out_date) || 1,
      room_rate: reservation.room_rate ?? 0,
      status: reservation.status || 'reserved',
      notes: reservation.notes || reservation.special_notes || ''
    });
  }

  function updateEditReservation(field, value) {
    setEditReservation((current) => {
      if (!current) return current;
      if (field === 'check_in_date') return { ...current, check_in_date: value, check_out_date: addDaysToDate(value, Math.max(Number(current.nights || 1), 1)) };
      if (field === 'check_out_date') return { ...current, check_out_date: value, nights: nightsBetween(current.check_in_date, value) || 1 };
      if (field === 'nights') return { ...current, nights: value, check_out_date: addDaysToDate(current.check_in_date, Math.max(Number(value || 1), 1)) };
      if (field === 'room_type_id') return { ...current, room_type_id: value, room_id: '' };
      return { ...current, [field]: value };
    });
  }

  function startExtendStay(reservation) {
    const oldCheckout = reservation.check_out_date || addDaysToDate(today(), 1);
    setExtendStay({
      reservation,
      old_check_out_date: oldCheckout,
      new_check_out_date: addDaysToDate(oldCheckout, 1),
      extra_nightly_rate: reservation.room_rate || '',
      notes: ''
    });
  }

  function updateExtendStay(field, value) {
    setExtendStay((current) => current ? { ...current, [field]: value } : current);
  }

  function cancelReservationFromFolio(reservation) {
    const reason = window.prompt(`Alasan cancel reservasi ${reservation.reservation_code || ''}?`, 'Cancelled from Folio') || 'Cancelled from Folio';
    if (!window.confirm('Reservasi akan diubah ke status cancelled agar folio/transaksi tidak orphan. Lanjutkan?')) return;
    run(`cancel-reservation-${reservation.id}`, () => reservationsApi.cancelFromFolio(reservation, profile?.role, reason), 'Reservasi berhasil dicancel dari Folio.');
  }

  const debtRemaining = Math.max(Number(selected?.balance_due || 0), 0);

  const actionButtons = useMemo(() => [
    ['overview', 'Overview'],
    ['reservations', 'Add Reservation'],
    ['charges', 'Add Charge'],
    ['payments', 'Add Payment'],
    ['refund', 'Refund / Debt']
  ], []);

  return <div className="page-stack">
    <div className="page-header"><div><h1>Folio / Billing Workspace</h1><p>Billing utama memakai folio baru. Invoice lama hanya legacy saat check-out.</p></div></div>
    <FrontOfficeSubnav activeLabel="Folio" />
    {error && <div className="alert error">{error}</div>}
    {success && <div className="alert success">{success}</div>}
    <div className="billing-layout">
      <div className="page-stack">
        <div className="card action-card"><div className="action-bar"><div><h2>Folio</h2><p className="muted">Pilih folio atau buat nomor bill baru.</p></div><IconButton icon={faPlus} label="Tambah Folio Baru" title="Tambah Folio Baru" variant="primary" onClick={() => setShowNewFolio((value) => !value)} /></div></div>
        {showNewFolio && <form className="card form-grid" onSubmit={(e) => { e.preventDefault(); run('new-folio', async () => {
          const folio = await foliosApi.createFolio(newFolio);
          setSelectedId(folio.id);
          setActiveTab('overview');
          setShowNewFolio(false);
          setNewFolio({ guest_id: '', notes: '' });
          return { selectedId: folio.id };
        }, 'Folio baru berhasil dibuat.'); }}>
          <h2>Buat Folio Baru</h2>
          <label className="full">Guest<select required value={newFolio.guest_id} onChange={(e) => setNewFolio({ ...newFolio, guest_id: e.target.value })}><option value="">Pilih tamu</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.full_name}{guest.phone ? ` - ${guest.phone}` : ''}</option>)}</select></label>
          <label className="full">Notes<textarea value={newFolio.notes} onChange={(e) => setNewFolio({ ...newFolio, notes: e.target.value })} /></label>
          <div className="button-row"><IconButton icon={faFloppyDisk} label={saving === 'new-folio' ? 'Membuat...' : 'Simpan Folio'} title="Simpan Folio" type="submit" disabled={saving === 'new-folio'} variant="primary" /><button type="button" className="secondary" onClick={() => setShowNewFolio(false)}>Batal</button></div>
        </form>}
        <form className="card filter-grid" onSubmit={(e) => { e.preventDefault(); load(); }}><input placeholder="Cari folio / tamu" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">Semua status</option><option value="open">Open</option><option value="closed">Closed</option><option value="debt">Debt</option><option value="cancelled">Cancelled</option><option value="refunded">Refunded</option></select><IconButton icon={faFilter} label="Filter" title="Filter" type="submit" variant="primary" /></form>
        <div className="card table-card"><h2>Daftar Folio</h2>{loading ? <p>Memuat folio...</p> : folios.length === 0 ? <p className="muted">Belum ada folio. Klik Tambah Folio Baru untuk mulai.</p> : <table><thead><tr><th>Folio</th><th>Tamu</th><th>Grand Total</th><th>Balance</th><th>Status</th></tr></thead><tbody>{folios.map((folio) => <tr key={folio.id} className={selected?.id === folio.id ? 'selected-row' : ''} onClick={() => setSelectedId(folio.id)}><td>{folio.folio_number}</td><td>{folio.guests?.full_name || '-'}</td><td>{money.format(folio.grand_total || 0)}</td><td>{money.format(folio.balance_due || 0)}</td><td><span className={`badge ${folio.status}`}>{folio.status}</span></td></tr>)}</tbody></table>}</div>
      </div>

      {selected ? <div className="page-stack">
        <FolioHeader folio={selected} guestName={selected.guests?.full_name || selectedGuest?.full_name || '-'} billingStatus={billingStatus} onClose={() => run('close', () => foliosApi.closeFolio(selected.id), selected.balance_due > 0 ? 'Folio ditutup sebagai debt.' : 'Folio ditutup.')} onPayDebt={() => setDebtPayment({ ...emptyPayment, amount: selected.balance_due || '', paid_at: today(), notes: 'Pay debt folio' })} saving={saving === 'close'} />
        <div className="card action-toolbar module-tabs">{actionButtons.map(([tab, label]) => <button key={`${tab}-${label}`} className={activeTab === tab ? 'action-pill active' : 'action-pill'} onClick={() => setActiveTab(tab)}>{label}</button>)}</div>

        {activeTab === 'overview' && <div className="page-stack"><div className="card detail-list"><h2>Overview Folio</h2><div className="grid"><p><strong>No Bill / Folio</strong><br />{selected.folio_number}</p><p><strong>Guest</strong><br />{selected.guests?.full_name || '-'}</p><p><strong>Status Folio</strong><br /><span className={`badge ${selected.status}`}>{selected.status}</span></p><p><strong>Created</strong><br />{String(selected.created_at || '-').slice(0, 16).replace('T', ' ')}</p><p><strong>Billing Status</strong><br /><span className={`badge ${billingStatus}`}>{getBillingStatusLabel(selected)}</span></p>{selected.notes && <p><strong>Notes</strong><br />{selected.notes}</p>}</div></div>{!hasTransactions ? <div className="card muted">Belum ada transaksi pada folio ini.</div> : <><div className="card detail-list"><h2>Ringkasan Transaksi</h2><div className="grid"><p><strong>Room charge total</strong><br />{money.format(roomChargeTotal)}</p><p><strong>Additional charge total</strong><br />{money.format(additionalChargeTotal)}</p><p><strong>Discount</strong><br />{selected.discount_percent || 0}% / {money.format(selected.discount_amount || 0)}</p><p><strong>Tax / Service</strong><br />{money.format(selected.tax_amount || 0)} / {money.format(selected.service_amount || 0)}</p><p><strong>Grand Total</strong><br />{money.format(selected.grand_total || 0)}</p><p><strong>Payment Total</strong><br />{money.format(selected.paid_amount || 0)}</p><p><strong>Refund Total</strong><br />{money.format(selected.refund_amount || 0)}</p><p><strong>Balance Due</strong><br />{money.format(selected.balance_due || 0)}</p></div></div><div className="card table-card"><h2>Breakdown Item Type</h2><table><thead><tr><th>Kategori</th><th>Jumlah Item</th><th>Total Nominal</th></tr></thead><tbody>{breakdownRows.map((row) => <tr key={row.type}><td>{row.type}</td><td>{row.count}</td><td>{money.format(row.total)}</td></tr>)}</tbody></table><small>Item void/is_void tidak dihitung dalam ringkasan.</small></div></>}<div className="card"><div className="action-bar"><div className="action-group"><IconButton icon={faPlus} label="Reservasi" title="Add Reservation" variant="primary" onClick={() => setActiveTab('reservations')} /><IconButton icon={faPlus} label="Charge" title="Add Charge" variant="primary" onClick={() => setActiveTab('charges')} /><IconButton icon={faCreditCard} label="Payment" title="Add Payment" variant="primary" onClick={() => setActiveTab('payments')} /><IconButton icon={faRotateLeft} label="Refund" title="Refund" variant="secondary" onClick={() => setActiveTab('refund')} /></div></div><form className="inline-form" onSubmit={(e) => { e.preventDefault(); run('discount', () => foliosApi.updateDiscount(selected.id, discount, profile?.role), 'Discount folio tersimpan.'); }}><label>Discount %<input type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} /></label><IconButton icon={faFloppyDisk} label="Apply Discount" title="Apply Discount" type="submit" disabled={saving === 'discount'} variant="primary" /></form></div></div>}

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
          <label>Kamar ready<select value={reservationForm.room_id} onChange={(e) => updateReservation('room_id', e.target.value)}><option value="">Unassigned by type</option>{roomChoices.map((room) => <option key={room.id} value={room.id}>{room.room_number} - {room.hk_status}</option>)}</select>{reservationForm.room_type_id && roomChoices.length === 0 && <small>Tidak ada kamar VR yang ready untuk tanggal ini.</small>}</label>
          <label>Room rate<input type="number" min="0" value={reservationForm.room_rate} placeholder={String(selectedRoomType?.base_rate ?? selectedRoomType?.base_price ?? 0)} onChange={(e) => updateReservation('room_rate', e.target.value)} /></label>
          <label>Deposit<input type="number" min="0" value={reservationForm.deposit_amount} onChange={(e) => updateReservation('deposit_amount', e.target.value)} /></label>
          <label className="full">Notes<textarea value={reservationForm.notes} onChange={(e) => updateReservation('notes', e.target.value)} /></label>
          <button disabled={saving === 'reservation'}>Add Reservation</button>
        </form><ReservationFolioTable rows={reservations} canManage={canManageReservations} saving={saving} onEdit={startEditReservation} onCancel={cancelReservationFromFolio} onExtend={startExtendStay} /></div>}

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
        </form>{editItem && <form className="card form-grid" onSubmit={(e) => { e.preventDefault(); if (!confirmClosedFolioAction('edit')) return; run(`edit-${editItem.id}`, async () => { await foliosApi.updateFolioItem(selected.id, editItem.id, editItem, profile?.role); setEditItem(null); }, 'Transaksi berhasil diupdate.'); }}>
          <h2>Edit Folio Item</h2>
          <label>Item<select value={editItem.item_type} onChange={(e) => updateEditItem('item_type', e.target.value)}>{ADDITIONAL_CHARGE_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="room">Room Charge</option><option value="cancellation_fee">Cancellation Fee</option><option value="no_show_fee">No-show Fee</option><option value="adjustment">Adjustment</option></select></label>
          <label>Description<input required value={editItem.description} onChange={(e) => updateEditItem('description', e.target.value)} /></label>
          <label>Qty<input type="number" min="0.01" step="0.01" required value={editItem.qty} onChange={(e) => updateEditItem('qty', e.target.value)} /></label>
          <label>Unit price<input type="number" min="0" step="0.01" required value={editItem.unit_price} onChange={(e) => updateEditItem('unit_price', e.target.value)} /></label>
          <label>Posting date<input type="date" required value={editItem.posting_date} onChange={(e) => updateEditItem('posting_date', e.target.value)} /></label>
          <div className="button-row"><button disabled={saving === `edit-${editItem.id}`}>Simpan Edit</button><button type="button" className="secondary" onClick={() => setEditItem(null)}>Batal</button></div>
        </form>}<FolioItems title="Room Charges" rows={roomCharges} canManage={canManageItems} onEdit={startEditItem} onVoid={voidItem} saving={saving} /><FolioItems title="Additional Charges" rows={charges} canManage={canManageItems} onEdit={startEditItem} onVoid={voidItem} saving={saving} /></div>}

        {activeTab === 'payments' && <div className="page-stack"><div className="card action-card"><div className="action-bar"><div><h2>Add Payment</h2><p className="muted">Gunakan Bayar Debt untuk folio debt/kurang bayar. Pembayaran sebagian akan menyisakan status debt, pembayaran penuh akan menutup folio.</p></div>{debtRemaining > 0 && <IconButton icon={faMoneyBillWave} label="Bayar Debt" title="Bayar Debt" variant="primary" onClick={() => setDebtPayment({ ...emptyPayment, amount: selected.balance_due || '', paid_at: today(), notes: 'Pay debt folio' })} />}</div><PaymentForm state={payment} setter={updatePayment(setPayment)} onSubmit={(e) => { e.preventDefault(); run('payment', async () => { await foliosApi.addFolioPayment(selected.id, payment); setPayment(emptyPayment); }, 'Payment tersimpan.'); }} saving={saving === 'payment'} /></div><PaymentTable title="Payments" rows={payments} /></div>}

        {activeTab === 'refund' && <div className="page-stack"><div className="card"><h2>Refund</h2><PaymentForm state={refund} setter={updatePayment(setRefund)} onSubmit={(e) => { e.preventDefault(); run('refund', async () => { await foliosApi.refundFolio(selected.id, refund); setRefund(emptyPayment); }, 'Refund tersimpan.'); }} saving={saving === 'refund'} refund /></div><PaymentTable title="Refunds" rows={refunds} /></div>}
        {editReservation && <ReservationEditModal state={editReservation} rooms={allRooms} roomTypes={roomTypes} saving={saving === `edit-reservation-${editReservation.id}`} onChange={updateEditReservation} onClose={() => setEditReservation(null)} onSubmit={(event) => { event.preventDefault(); run(`edit-reservation-${editReservation.id}`, async () => { await reservationsApi.updateFromFolio(editReservation.id, editReservation, profile?.role); setEditReservation(null); }, 'Reservasi berhasil diupdate dari Folio.'); }} />}
        {extendStay && <ExtendStayModal state={extendStay} saving={saving === `extend-${extendStay.reservation.id}`} onChange={updateExtendStay} onClose={() => setExtendStay(null)} onSubmit={(event) => { event.preventDefault(); run(`extend-${extendStay.reservation.id}`, async () => { await foliosApi.extendStay(selected.id, extendStay.reservation, extendStay); setExtendStay(null); }, 'Extend stay berhasil. Charge tambahan masuk ke folio.'); }} />}
        {debtPayment.amount !== '' && <DebtPaymentModal folio={selected} state={debtPayment} saving={saving === 'pay-debt'} setter={updatePayment(setDebtPayment)} onClose={() => setDebtPayment({ ...emptyPayment, paid_at: today() })} onSubmit={(event) => { event.preventDefault(); run('pay-debt', async () => { await foliosApi.addFolioPayment(selected.id, { ...debtPayment, notes: debtPayment.notes || 'Pay debt folio' }); setDebtPayment({ ...emptyPayment, paid_at: today() }); }, 'Pembayaran debt berhasil disimpan.'); }} />}
      </div> : <div className="card muted">Pilih atau buat folio untuk mulai input billing.</div>}
    </div>
  </div>;
}

function FolioTable({ title, rows, columns, render }) {
  return <div className="card table-card"><h2>{title}</h2>{rows.length === 0 ? <p className="muted">Belum ada data.</p> : <table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{render(row).map((value, index) => <td key={index}>{value}</td>)}</tr>)}</tbody></table>}</div>;
}

function FolioItems({ title, rows, canManage = false, onEdit, onVoid, saving = '' }) {
  return <div className="card table-card"><h2>{title}</h2>{rows.length === 0 ? <p className="muted">Belum ada item.</p> : <table><thead><tr><th>Tanggal</th><th>Type</th><th>Deskripsi</th><th>Qty</th><th>Harga</th><th>Total</th><th>Status</th>{canManage && <th>Aksi</th>}</tr></thead><tbody>{rows.map((item) => <tr key={item.id} className={item.is_void ? 'void-row' : ''}><td>{item.posting_date}</td><td>{item.item_type}</td><td>{item.description}{item.void_reason && <><br /><small>Void reason: {item.void_reason}</small></>}</td><td>{item.qty}</td><td>{money.format(item.unit_price || 0)}</td><td>{money.format(item.line_total || 0)}</td><td>{item.is_void ? <span className="badge cancelled">VOID</span> : <span className="badge open">ACTIVE</span>}</td>{canManage && <td className="button-row"><IconButton icon={faPenToSquare} title="Edit" disabled={item.is_void || saving === `edit-${item.id}`} onClick={() => onEdit(item)} /><IconButton icon={faTrash} title="Hapus/Void" variant="danger" disabled={item.is_void || saving === `void-${item.id}`} onClick={() => onVoid(item)} /></td>}</tr>)}</tbody></table>}</div>;
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

function FolioHeader({ folio, guestName, billingStatus, onClose, onPayDebt, saving }) {
  const balanceDue = Number(folio?.balance_due || 0);
  return <div className="card folio-summary-card">
    <div className="folio-summary-main">
      <div><span>No Folio</span><strong>{folio?.folio_number || '-'}</strong></div>
      <div><span>Nama tamu/customer</span><strong>{guestName || '-'}</strong></div>
      <div><span>Grand Total</span><strong>{money.format(folio?.grand_total || 0)}</strong></div>
    </div>
    <div className="folio-summary-actions">
      <span className={`badge ${folio?.status || 'open'}`}>{folio?.status || '-'}</span>
      <span className={`badge ${billingStatus}`}>{getBillingStatusLabel(folio || {})}</span>
      {balanceDue > 0 && <IconButton icon={faMoneyBillWave} label="Bayar Debt" title="Bayar Debt" variant="primary" onClick={onPayDebt} />}
      <IconButton icon={faLock} label={balanceDue > 0 ? 'Close / Mark Debt' : 'Close Folio'} title="Close Folio" disabled={saving} variant="primary" onClick={onClose} />
    </div>
  </div>;
}

function ReservationFolioTable({ rows, canManage, saving, onEdit, onCancel, onExtend }) {
  return <div className="card table-card"><h2>Reservations</h2>{rows.length === 0 ? <p className="muted">Belum ada data.</p> : <table><thead><tr><th>Kode</th><th>Kamar</th><th>Tanggal</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{rows.map((reservation) => <tr key={reservation.id}><td>{reservation.reservation_code || '-'}</td><td>{reservation.rooms?.room_number || 'Unassigned'}</td><td>{reservation.check_in_date || '-'} - {reservation.check_out_date || '-'}</td><td><span className={`badge ${reservation.status}`}>{reservation.status || '-'}</span></td><td><div className="table-actions"><IconButton icon={faCalendarPlus} title="Extend Stay" disabled={saving === `extend-${reservation.id}` || ['cancelled', 'checked_out', 'no_show'].includes(reservation.status)} onClick={() => onExtend(reservation)} />{canManage ? <><IconButton icon={faPenToSquare} title="Edit Reservasi" disabled={saving === `edit-reservation-${reservation.id}`} onClick={() => onEdit(reservation)} /><IconButton icon={faTrash} title="Cancel Reservasi" variant="danger" disabled={saving === `cancel-reservation-${reservation.id}` || ['cancelled', 'checked_out'].includes(reservation.status)} onClick={() => onCancel(reservation)} /></> : <small className="muted">Edit/hapus khusus admin.</small>}</div></td></tr>)}</tbody></table>}</div>;
}

function ReservationEditModal({ state, rooms, roomTypes, saving, onChange, onClose, onSubmit }) {
  const roomOptions = rooms.filter((room) => !state.room_type_id || room.room_type_id === state.room_type_id);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-reservation-title">
      <div className="modal-header"><h2 id="edit-reservation-title">Edit Reservasi dari Folio</h2><button type="button" className="modal-close" onClick={onClose} aria-label="Tutup">×</button></div>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>Nama tamu<input value={state.guest_name || ''} onChange={(e) => onChange('guest_name', e.target.value)} /></label>
        <label>Room type<select required value={state.room_type_id || ''} onChange={(e) => onChange('room_type_id', e.target.value)}><option value="">Pilih tipe</option>{roomTypes.map((type) => <option key={type.id} value={type.id}>{type.code} - {type.name}</option>)}</select></label>
        <label>Check-in<input type="date" required value={state.check_in_date || ''} onChange={(e) => onChange('check_in_date', e.target.value)} /></label>
        <label>Nights<input type="number" min="1" required value={state.nights || 1} onChange={(e) => onChange('nights', e.target.value)} /></label>
        <label>Check-out<input type="date" required value={state.check_out_date || ''} onChange={(e) => onChange('check_out_date', e.target.value)} /></label>
        <label>Kamar<select value={state.room_id || ''} onChange={(e) => onChange('room_id', e.target.value)}><option value="">Unassigned</option>{roomOptions.map((room) => <option key={room.id} value={room.id}>{room.room_number} - {room.hk_status}</option>)}</select></label>
        <label>Room rate<input type="number" min="0" value={state.room_rate || ''} onChange={(e) => onChange('room_rate', e.target.value)} /></label>
        <label>Status<select value={state.status || 'reserved'} onChange={(e) => onChange('status', e.target.value)}><option value="reserved">reserved</option><option value="checked_in">checked_in</option><option value="checked_out">checked_out</option><option value="cancelled">cancelled</option><option value="no_show">no_show</option></select></label>
        <label className="full">Catatan<textarea value={state.notes || ''} onChange={(e) => onChange('notes', e.target.value)} /></label>
        <div className="button-row full"><button disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Reservasi'}</button><button type="button" className="secondary" onClick={onClose}>Close</button></div>
      </form>
    </section>
  </div>;
}

function ExtendStayModal({ state, saving, onChange, onClose, onSubmit }) {
  const extraNights = nightsBetween(state.old_check_out_date, state.new_check_out_date);
  const estimated = Math.max(extraNights, 0) * Number(state.extra_nightly_rate || 0);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="extend-stay-title">
      <div className="modal-header"><h2 id="extend-stay-title">Extend Stay / Tambah Hari</h2><button type="button" className="modal-close" onClick={onClose} aria-label="Tutup">×</button></div>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>Checkout lama<input disabled value={state.old_check_out_date || '-'} /></label>
        <label>Checkout baru<input type="date" required min={addDaysToDate(state.old_check_out_date, 1)} value={state.new_check_out_date || ''} onChange={(e) => onChange('new_check_out_date', e.target.value)} /></label>
        <label>Tambahan malam<input disabled value={extraNights > 0 ? extraNights : 0} /></label>
        <label>Tarif tambahan per malam<input type="number" min="1" required value={state.extra_nightly_rate || ''} onChange={(e) => onChange('extra_nightly_rate', e.target.value)} /></label>
        <p><strong>Estimasi biaya tambahan</strong><br />{money.format(estimated || 0)}</p>
        <label className="full">Catatan<textarea value={state.notes || ''} onChange={(e) => onChange('notes', e.target.value)} /></label>
        <div className="button-row full"><button disabled={saving || extraNights <= 0}>{saving ? 'Menyimpan...' : 'Simpan Extend Stay'}</button><button type="button" className="secondary" onClick={onClose}>Close</button></div>
      </form>
    </section>
  </div>;
}

function DebtPaymentModal({ folio, state, saving, setter, onClose, onSubmit }) {
  const remaining = Number(folio?.balance_due || 0);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="pay-debt-title">
      <div className="modal-header"><h2 id="pay-debt-title">Bayar Debt Folio</h2><button type="button" className="modal-close" onClick={onClose} aria-label="Tutup">×</button></div>
      <form className="form-grid" onSubmit={onSubmit}>
        <p><strong>Grand Total</strong><br />{money.format(folio?.grand_total || 0)}</p>
        <p><strong>Total sudah dibayar</strong><br />{money.format(folio?.paid_amount || 0)}</p>
        <p><strong>Sisa debt</strong><br />{money.format(remaining)}</p>
        <label>Nominal pembayaran<input type="number" min="1" max={remaining || undefined} required value={state.amount} onChange={(e) => setter({ amount: e.target.value })} /></label>
        <label>Group<select value={state.payment_group} onChange={(e) => setter({ payment_group: e.target.value })}><option value="cash">Cash</option><option value="non_tunai">Non Tunai</option></select></label>
        {state.payment_group === 'non_tunai' && <label>Metode<select value={state.payment_method} onChange={(e) => setter({ payment_method: e.target.value })}>{NON_CASH_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}</select></label>}
        <label>Tanggal pembayaran<input type="date" value={state.paid_at || today()} onChange={(e) => setter({ paid_at: e.target.value })} /></label>
        {state.payment_group === 'non_tunai' && <label>No Reff<input required value={state.reference_number} onChange={(e) => setter({ reference_number: e.target.value })} /></label>}
        <label className="full">Catatan<textarea value={state.notes} onChange={(e) => setter({ notes: e.target.value })} /></label>
        <div className="button-row full"><button disabled={saving || Number(state.amount || 0) <= 0 || Number(state.amount || 0) > remaining}>{saving ? 'Menyimpan...' : 'Bayar Debt'}</button><button type="button" className="secondary" onClick={onClose}>Close</button></div>
      </form>
    </section>
  </div>;
}
