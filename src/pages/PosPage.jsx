import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { NON_CASH_METHODS, posApi, today } from '../services/api';
import { normalizePOSStatus } from '../utils/posStatus';
import { useAuth } from '../contexts/AuthContext';
import { useAppDialog } from '../components/AppDialog';
import IconButton from '../components/IconButton';
import { faFilter, faPrint, faReceipt } from '@fortawesome/free-solid-svg-icons';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const addDays = (date, days) => { const next = new Date(`${date}T00:00:00`); next.setDate(next.getDate() + days); return next.toISOString().slice(0, 10); };
const defaultFilters = () => ({ dateFrom: addDays(today(), -7), dateTo: today(), status: 'all', search: '' });
const paymentEmpty = { amount: '', payment_group: 'cash', payment_method: 'cash', paid_at: new Date().toISOString().slice(0, 16), reference_number: '', notes: '' };
const adjustmentEmpty = { adjustment_type: 'correction', amount: '', posting_date: today(), notes: '' };
const paymentMethods = ['cash', ...NON_CASH_METHODS.filter((method) => method !== 'e_wallet')];
const formatDate = (value) => String(value || '-').slice(0, 10) || '-';

export default function PosPage() {
  const { profile, session } = useAuth();
  const dialog = useAppDialog();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState(defaultFilters);
  const [folios, setFolios] = useState([]);
  const [selectedId, setSelectedId] = useState(params.get('folio_id') || '');
  const [selected, setSelected] = useState(null);
  const [activePanel, setActivePanel] = useState('summary');
  const [payment, setPayment] = useState(paymentEmpty);
  const [adjustment, setAdjustment] = useState(adjustmentEmpty);
  const [receipt, setReceipt] = useState(null);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canTransact = ['admin', 'super_admin'].includes(profile?.role);
  const ledger = useMemo(() => posApi.buildLedger(selected), [selected]);
  const payments = useMemo(() => ledger.filter((row) => row.source === 'payment'), [ledger]);
  const adjustments = useMemo(() => ledger.filter((row) => row.source === 'charge' && Number(row.amount || 0) < 0), [ledger]);
  const settlement = useMemo(() => posApi.settlement(selected), [selected]);
  const pageStats = useMemo(() => ({
    open: folios.filter((folio) => normalizePOSStatus(folio.status) === 'Open').length,
    close: folios.filter((folio) => normalizePOSStatus(folio.status) === 'Close').length,
    balance: folios.reduce((sum, folio) => sum + Number(folio.balance_due || 0), 0)
  }), [folios]);
  const reservations = selected?.reservations || [];
  const firstReservation = reservations[0] || {};
  const roomText = reservations.map((reservation) => reservation.rooms?.room_number).filter(Boolean).join(', ') || '-';
  const nonCash = payment.payment_group === 'non_tunai';
  const folioItems = useMemo(() => (selected?.folio_items || []).filter((item) => item.is_void !== true), [selected]);
  const itemAmount = (item) => Number((item.line_total ?? (Number(item.qty || 0) * Number(item.unit_price || 0))) || 0);
  const selectableItems = useMemo(() => folioItems.filter((item) => itemAmount(item) > 0 && !['paid', 'cancelled', 'refunded', 'void'].includes(String(item.payment_status || 'unpaid').toLowerCase())), [folioItems]);
  const selectedItems = useMemo(() => folioItems.filter((item) => selectedItemIds.includes(item.id)), [folioItems, selectedItemIds]);
  const selectedSubtotal = selectedItems.filter((item) => itemAmount(item) > 0).reduce((sum, item) => sum + itemAmount(item), 0);
  const selectedAdjustment = selectedItems.filter((item) => itemAmount(item) < 0).reduce((sum, item) => sum + itemAmount(item), 0);
  const selectedTotal = selectedSubtotal + selectedAdjustment;

  async function load(preferredId = selectedId, nextFilters = filters) {
    if (nextFilters.dateFrom && nextFilters.dateTo && nextFilters.dateFrom > nextFilters.dateTo) {
      setError('Tanggal dari tidak boleh lebih besar dari tanggal sampai.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await posApi.listFolios(nextFilters);
      setFolios(data);
      const nextId = preferredId && data.some((folio) => folio.id === preferredId) ? preferredId : '';
      const next = nextId ? await posApi.getFolio(nextId).catch(() => null) : null;
      setSelectedId(next?.id || '');
      setSelected(next);
      setSelectedItemIds((ids) => ids.filter((id) => (next?.folio_items || []).some((item) => item.id === id && item.payment_status !== 'paid')));
      if (next?.id) setParams({ folio_id: next.id }, { replace: true });
      if (!next?.id && params.get('folio_id')) setParams({}, { replace: true });
    } catch (err) {
      setError(err.message);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(params.get('folio_id') || ''); }, []);

  async function resetFilters() {
    const next = defaultFilters();
    setFilters(next);
    await load('', next);
  }

  async function selectFolio(id, panel = 'summary') {
    setSelectedId(id);
    setActivePanel(panel);
    await load(id);
  }

  function updatePayment(patch) {
    setPayment((current) => {
      const next = { ...current, ...patch };
      if (patch.payment_method) next.payment_group = patch.payment_method === 'cash' ? 'cash' : 'non_tunai';
      if (patch.payment_group === 'cash') next.payment_method = 'cash';
      if (patch.payment_group === 'non_tunai' && next.payment_method === 'cash') next.payment_method = 'transfer';
      return next;
    });
  }

  async function submitPayment(event) {
    event.preventDefault();
    if (!canTransact) return setError('Role Anda hanya dapat melihat data P.O.S.');
    if (!selected?.id) return setError('Pilih folio terlebih dahulu.');
    const amount = Number(payment.amount || selectedTotal || 0);
    if (selectedItemIds.length === 0) return setError('Pilih item tagihan yang akan dibayar.');
    if (amount <= 0 || selectedTotal <= 0) return setError('Total item terpilih harus lebih besar dari 0.');
    if (amount !== selectedTotal) return setError('Pembayaran sebagian per item belum didukung. Nominal harus sama dengan total item terpilih.');
    setSaving('payment');
    setError('');
    setSuccess('');
    try {
      const result = await posApi.postPayment(selected.id, { ...payment, amount: selectedTotal, selected_item_ids: selectedItemIds, paid_at: payment.paid_at ? new Date(payment.paid_at).toISOString() : new Date().toISOString() }, profile?.role, session?.user?.id || '');
      const fresh = result.folio || await posApi.getFolio(selected.id);
      const lastPayment = result.payment || (fresh.folio_payments || []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      setReceipt({ folio: fresh, payment: lastPayment, items: result.items || selectedItems });
      setPayment(paymentEmpty);
      setSelectedItemIds([]);
      setSuccess('Payment berhasil diposting. No bill sudah terbentuk.');
      await load(fresh.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  }

  async function submitAdjustment(event) {
    event.preventDefault();
    if (!canTransact) return setError('Role Anda hanya dapat melihat data P.O.S.');
    if (!selected?.id) return setError('Pilih folio terlebih dahulu.');
    if (Number(adjustment.amount || 0) >= 0) return setError('Nominal adjustment/refund/correction wajib minus.');
    if (!adjustment.notes.trim()) return setError('Keterangan wajib diisi untuk transaksi minus.');
    const confirmed = await dialog.confirm({ title: 'Posting Transaksi Minus', message: 'Transaksi lama tidak dihapus. Sistem akan membuat line adjustment baru bernilai minus.', confirmLabel: 'Posting Adjustment', danger: true });
    if (!confirmed) return;
    setSaving('adjustment');
    setError('');
    setSuccess('');
    try {
      await posApi.postAdjustment(selected.id, adjustment, profile?.role);
      setAdjustment(adjustmentEmpty);
      setSuccess('Adjustment/refund/correction berhasil diposting.');
      await load(selected.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  }

  return <div className="page-stack pos-page compact-pos-page">
    <div className="page-header"><div><h1>P.O.S / Kasir</h1><p>Kelola pembayaran folio, bill, refund, dan settlement.</p></div><Link className="button-link secondary-link" to="/billing">Kembali ke Folio</Link></div>
    {error && <div className="alert error">{error}</div>}
    {success && <div className="alert success">{success}</div>}

    <section className="pos-kpi-row" aria-label="Ringkasan P.O.S"><div className="card"><h3>Total Open</h3><p>{pageStats.open}</p></div><div className="card"><h3>Total Close</h3><p>{pageStats.close}</p></div><div className="card"><h3>Total Balance / Outstanding</h3><p>{money.format(pageStats.balance)}</p></div></section>

    <form className="card filter-grid pos-filter-bar" onSubmit={(event) => { event.preventDefault(); load('', filters); }}>
      <label>Tanggal dari<input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label>
      <label>Tanggal sampai<input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label>
      <label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="all">All</option><option value="open">Open</option><option value="close">Close</option></select></label>
      <label className="wide-filter">Search<input placeholder="No folio / no bill / nama / kamar" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
      <div className="button-row"><IconButton icon={faFilter} label="Apply Filter" type="submit" title="Apply Filter" variant="primary" disabled={loading} /><button type="button" className="secondary" onClick={resetFilters} disabled={loading}>Reset Filter</button></div>
    </form>

    <div className="card table-card compact-pos-table"><div className="action-bar"><div><h2>Daftar Folio / Bill</h2><p className="muted">Pilih Detail atau Bayar untuk membuka panel transaksi.</p></div></div>{loading ? <p>Memuat transaksi...</p> : folios.length === 0 ? <p className="muted">Tidak ada transaksi pada filter ini.</p> : <table><thead><tr><th>Tanggal</th><th>No Folio</th><th>Nama Tamu</th><th>Kamar</th><th>Grand Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>{folios.map((folio) => <tr key={folio.id} className={selectedId === folio.id ? 'selected-row' : ''}><td>{formatDate(folio.folio_payments?.[0]?.paid_at || folio.created_at)}</td><td>{folio.folio_number || '-'}</td><td>{folio.guests?.full_name || '-'}</td><td>{(folio.reservations || []).map((reservation) => reservation.rooms?.room_number).filter(Boolean).join(', ') || '-'}</td><td>{money.format(folio.grand_total || 0)}</td><td>{money.format(folio.paid_amount || 0)}</td><td>{money.format(folio.balance_due || 0)}</td><td><span className={`badge ${normalizePOSStatus(folio.status).toLowerCase()}`}>{normalizePOSStatus(folio.status)}</span></td><td><div className="table-actions"><button className="secondary" onClick={() => selectFolio(folio.id, 'summary')}>Detail</button>{canTransact && Number(folio.balance_due || 0) > 0 && <button onClick={() => selectFolio(folio.id, 'payment')}>Bayar</button>}<IconButton icon={faPrint} title="Print Bill / Receipt" onClick={() => selectFolio(folio.id, 'history')} /></div></td></tr>)}</tbody></table>}</div>

    {!selected ? <div className="card muted">Pilih folio/bill terlebih dahulu.</div> : <section className="card pos-detail-panel"><div className="action-bar"><div><h2>{selected.folio_number || '-'}</h2><p className="muted">{selected.guests?.full_name || '-'} · Kamar {roomText} · {normalizePOSStatus(selected.status)}</p></div><div className="button-row"><button className={activePanel === 'summary' ? '' : 'secondary'} onClick={() => setActivePanel('summary')}>Summary</button><button className={activePanel === 'payment' ? '' : 'secondary'} onClick={() => setActivePanel('payment')}>Payment</button><button className={activePanel === 'history' ? '' : 'secondary'} onClick={() => setActivePanel('history')}>History</button>{canTransact && <button className={activePanel === 'adjustment' ? 'danger' : 'secondary'} onClick={() => setActivePanel('adjustment')}>Adjustment</button>}</div></div>
      {activePanel === 'summary' && <div className="pos-summary-card compact"><div><span>No Folio</span><strong>{selected.folio_number || '-'}</strong></div><div><span>Check-in/out</span><strong>{firstReservation.check_in_date || '-'} / {firstReservation.check_out_date || '-'}</strong></div><div><span>Grand Total</span><strong>{money.format(selected.grand_total || 0)}</strong></div><div><span>Total Paid</span><strong>{money.format(selected.paid_amount || 0)}</strong></div><div><span>Balance</span><strong>{money.format(selected.balance_due || 0)}</strong></div><div><span>Status</span><strong>{normalizePOSStatus(selected.status)}</strong></div></div>}
      {activePanel === 'payment' && <PaymentPanel selected={selected} items={folioItems} selectedItemIds={selectedItemIds} setSelectedItemIds={setSelectedItemIds} selectableItems={selectableItems} selectedSubtotal={selectedSubtotal} selectedAdjustment={selectedAdjustment} selectedTotal={selectedTotal} payment={payment} nonCash={nonCash} canTransact={canTransact} saving={saving} onPayment={updatePayment} onSubmit={submitPayment} />}
      {activePanel === 'history' && <div className="two-column"><HistoryTable title="Payment History" rows={payments} /><HistoryTable title="Adjustment / Refund History" rows={adjustments} adjustment /></div>}
      {activePanel === 'adjustment' && canTransact && <AdjustmentPanel adjustment={adjustment} saving={saving} onChange={setAdjustment} onSubmit={submitAdjustment} />}
    </section>}
    {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
  </div>;
}

function PaymentPanel({ selected, items, selectedItemIds, setSelectedItemIds, selectableItems, selectedSubtotal, selectedAdjustment, selectedTotal, payment, nonCash, canTransact, saving, onPayment, onSubmit }) {
  const toggleItem = (itemId) => setSelectedItemIds((ids) => ids.includes(itemId) ? ids.filter((id) => id !== itemId) : [...ids, itemId]);
  return <div className="pos-payment-workspace"><div className="card table-card pos-item-panel"><div className="action-bar"><div><h3>Item Tagihan Folio</h3><p className="muted">Pilih item belum dibayar. Item paid/cancelled/refunded/void dan nominal minus tidak bisa dibayar normal.</p></div><div className="button-row"><button type="button" onClick={() => setSelectedItemIds(selectableItems.map((item) => item.id))}>Pilih Semua Item Belum Dibayar</button><button type="button" className="secondary" onClick={() => setSelectedItemIds([])}>Clear Selection</button></div></div>{items.length === 0 ? <p className="muted">Belum ada item tagihan.</p> : <table><thead><tr><th>Pilih</th><th>Tanggal</th><th>Kategori</th><th>Deskripsi</th><th>Qty</th><th>Harga</th><th>Total</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>{items.map((item) => {
    const amount = Number((item.line_total ?? Number(item.qty || 0) * Number(item.unit_price || 0)) || 0);
    const status = item.is_void ? 'void' : (item.payment_status || 'unpaid');
    const disabled = amount <= 0 || ['paid', 'cancelled', 'refunded', 'void'].includes(String(status).toLowerCase());
    return <tr key={item.id}><td><input type="checkbox" disabled={disabled} checked={selectedItemIds.includes(item.id)} onChange={() => toggleItem(item.id)} /></td><td>{item.posting_date || String(item.created_at || '').slice(0, 10) || '-'}</td><td>{item.item_type || '-'}</td><td>{item.description || '-'}</td><td>{item.qty || 1}</td><td>{money.format(item.unit_price || 0)}</td><td>{money.format(amount)}</td><td><span className={`badge ${String(status).toLowerCase()}`}>{status}</span></td><td>{amount < 0 ? 'Adjustment/minus mempengaruhi balance, tidak dibayar normal' : item.notes || '-'}</td></tr>;
  })}</tbody></table>}</div><form className="form-grid pos-form-panel pos-payment-box" onSubmit={onSubmit}><h3 className="full">Payment Box</h3><label>Folio<input disabled value={selected?.folio_number || 'Pilih folio'} /></label><label>Item dipilih<input disabled value={`${selectedItemIds.length} item`} /></label><label>Subtotal positif<input disabled value={money.format(selectedSubtotal)} /></label><label>Adjustment/minus<input disabled value={money.format(selectedAdjustment)} /></label><label>Total dibayar<input disabled value={money.format(selectedTotal)} /></label><label>Nominal<input type="number" readOnly value={selectedTotal || ''} onChange={(event) => onPayment({ amount: event.target.value })} /></label><label>Metode<select required value={payment.payment_method} onChange={(event) => onPayment({ payment_method: event.target.value })}>{paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label><label>Tanggal/Jam<input type="datetime-local" value={payment.paid_at} onChange={(event) => onPayment({ paid_at: event.target.value })} /></label>{nonCash && <label>No Referensi<input required value={payment.reference_number} onChange={(event) => onPayment({ reference_number: event.target.value })} /></label>}<label className="full">Catatan<textarea value={payment.notes} onChange={(event) => onPayment({ notes: event.target.value })} /></label><div className="button-row full"><button disabled={!canTransact || saving === 'payment' || !selected || selectedItemIds.length === 0 || selectedTotal <= 0}>{saving === 'payment' ? 'Posting...' : 'Bayar Item Terpilih'}</button>{!canTransact && <span className="muted">Role Anda read-only untuk transaksi kasir.</span>}</div></form></div>;
}

function AdjustmentPanel({ adjustment, saving, onChange, onSubmit }) {
  return <form className="form-grid pos-form-panel" onSubmit={onSubmit}><label>Tipe<select value={adjustment.adjustment_type} onChange={(event) => onChange({ ...adjustment, adjustment_type: event.target.value })}><option value="cancellation_fee">Cancellation</option><option value="refund">Refund</option><option value="correction">Correction</option><option value="discount_adjustment">Discount Adjustment</option><option value="other_adjustment">Other Adjustment</option></select></label><label>Nominal Minus<input type="number" max="-1" required value={adjustment.amount} onChange={(event) => onChange({ ...adjustment, amount: event.target.value })} placeholder="-100000" /></label><label>Tanggal<input type="date" value={adjustment.posting_date} onChange={(event) => onChange({ ...adjustment, posting_date: event.target.value })} /></label><label className="full">Keterangan<textarea required value={adjustment.notes} onChange={(event) => onChange({ ...adjustment, notes: event.target.value })} /></label><button className="danger" disabled={saving === 'adjustment'}>{saving === 'adjustment' ? 'Posting...' : 'Posting Nominal Minus'}</button></form>;
}

function HistoryTable({ title, rows, adjustment = false }) {
  return <div className="table-card"><h3>{title}</h3>{rows.length === 0 ? <p className="muted">Tidak ada transaksi pembayaran.</p> : <table><thead><tr><th>{adjustment ? 'Tanggal' : 'No Bill'}</th><th>Tipe</th><th>Nominal</th><th>Metode</th><th>Keterangan</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.source}-${row.id}`}><td>{adjustment ? row.date : row.bill_no}</td><td>{row.type || '-'}</td><td>{money.format(row.credit || row.debit || 0)}</td><td>{row.method || '-'}</td><td>{row.notes || row.description || '-'}</td><td><span className={`badge ${row.status}`}>{row.status || '-'}</span></td></tr>)}</tbody></table>}</div>;
}

function ReceiptModal({ receipt, onClose }) {
  const { folio, payment, items = [] } = receipt;
  const amount = Number(payment?.amount || 0);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card receipt-card" role="dialog" aria-modal="true"><div className="modal-header"><div><p className="eyebrow">Receipt</p><h2>{payment?.bill_no || '-'}</h2></div><button className="modal-close" onClick={onClose}>×</button></div><div className="receipt-body"><p><strong>Hotel MS</strong></p><p>No Folio: {folio?.folio_number || '-'}</p><p>Tamu: {folio?.guests?.full_name || '-'}</p><p>Tanggal: {String(payment?.paid_at || '').slice(0, 16).replace('T', ' ')}</p><p>Metode: {payment?.payment_method || '-'}</p><p>Nominal: {money.format(amount)}</p>{items.length > 0 && <div><strong>Item dibayar:</strong><ul>{items.map((item) => <li key={item.folio_item_id || item.id}>{item.description || '-'} — {money.format(item.amount || item.line_total || 0)}</li>)}</ul></div>}<p>Balance Setelah Payment: {money.format(folio?.balance_due || 0)}</p><p>Catatan: {payment?.notes || '-'}</p></div><div className="modal-footer"><IconButton icon={faReceipt} label="Print Receipt" title="Print Receipt" onClick={() => window.print()} /><button className="secondary" onClick={onClose}>Close</button></div></section></div>;
}
