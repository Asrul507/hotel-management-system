import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { NON_CASH_METHODS, posApi, today } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useAppDialog } from '../components/AppDialog';
import IconButton from '../components/IconButton';
import { faFilter, faPrint, faReceipt } from '@fortawesome/free-solid-svg-icons';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const paymentEmpty = { amount: '', payment_group: 'cash', payment_method: 'cash', paid_at: new Date().toISOString().slice(0, 16), reference_number: '', notes: '' };
const adjustmentEmpty = { adjustment_type: 'correction', amount: '', posting_date: today(), notes: '' };
const paymentMethods = ['cash', ...NON_CASH_METHODS.filter((method) => method !== 'e_wallet')];

export default function PosPage() {
  const { profile, session } = useAuth();
  const dialog = useAppDialog();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({ search: '', room: '', status: 'all', date: '' });
  const [folios, setFolios] = useState([]);
  const [selectedId, setSelectedId] = useState(params.get('folio_id') || '');
  const [selected, setSelected] = useState(null);
  const [payment, setPayment] = useState(paymentEmpty);
  const [adjustment, setAdjustment] = useState(adjustmentEmpty);
  const [shiftDate, setShiftDate] = useState(today());
  const [shift, setShift] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canTransact = ['admin', 'super_admin'].includes(profile?.role);
  const reservations = selected?.reservations || [];
  const firstReservation = reservations[0] || {};
  const roomText = reservations.map((reservation) => reservation.rooms?.room_number).filter(Boolean).join(', ') || '-';
  const ledger = useMemo(() => posApi.buildLedger(selected), [selected]);
  const settlement = useMemo(() => posApi.settlement(selected), [selected]);
  const nonCash = payment.payment_group === 'non_tunai';

  async function load(preferredId = selectedId) {
    setLoading(true);
    setError('');
    try {
      const data = await posApi.listFolios(filters);
      setFolios(data);
      const nextId = preferredId || data[0]?.id || '';
      const next = nextId ? await posApi.getFolio(nextId).catch(() => null) : null;
      setSelectedId(next?.id || '');
      setSelected(next);
      if (next?.id) setParams({ folio_id: next.id }, { replace: true });
      setShift(await posApi.shiftSummary(shiftDate).catch(() => null));
    } catch (err) {
      setError(err.message);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(params.get('folio_id') || ''); }, []);

  async function selectFolio(id) {
    setSelectedId(id);
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
    const amount = Number(payment.amount || 0);
    if (amount <= 0) return setError('Nominal pembayaran harus lebih besar dari 0.');
    if (amount > Number(selected.balance_due || 0)) return setError('Overpayment belum diaktifkan. Nominal tidak boleh melebihi balance.');
    setSaving('payment');
    setError('');
    setSuccess('');
    try {
      await posApi.postPayment(selected.id, { ...payment, paid_at: payment.paid_at ? new Date(payment.paid_at).toISOString() : new Date().toISOString() }, profile?.role, session?.user?.id || '');
      const fresh = await posApi.getFolio(selected.id);
      const lastPayment = (fresh.folio_payments || []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      setReceipt({ folio: fresh, payment: lastPayment });
      setPayment(paymentEmpty);
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

  return <div className="page-stack pos-page">
    <div className="page-header"><div><h1>P.O.S / Kasir</h1><p>Pusat payment, settlement, refund, cancellation, dan correction folio.</p></div><Link className="button-link secondary-link" to="/billing">Kembali ke Folio</Link></div>
    {error && <div className="alert error">{error}</div>}
    {success && <div className="alert success">{success}</div>}

    <form className="card filter-grid" onSubmit={(event) => { event.preventDefault(); load(); }}>
      <input placeholder="No folio / nama tamu" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
      <input placeholder="No kamar" value={filters.room} onChange={(event) => setFilters({ ...filters, room: event.target.value })} />
      <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="all">Semua status</option><option value="open">Open</option><option value="closed">Paid/Closed</option><option value="debt">Debt/Partial</option><option value="cancelled">Cancelled</option><option value="refunded">Refunded</option></select>
      <input type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} />
      <IconButton icon={faFilter} label="Filter Folio" type="submit" title="Filter Folio" variant="primary" />
    </form>

    <div className="pos-layout">
      <div className="page-stack">
        <div className="card table-card"><h2>Pilih Folio</h2>{loading ? <p>Memuat folio...</p> : folios.length === 0 ? <p className="muted">Tidak ada folio sesuai filter.</p> : <table><thead><tr><th>Folio</th><th>Tamu</th><th>Kamar</th><th>Status</th><th>Balance</th></tr></thead><tbody>{folios.map((folio) => <tr key={folio.id} className={selectedId === folio.id ? 'selected-row' : ''} onClick={() => selectFolio(folio.id)}><td>{folio.folio_number || '-'}</td><td>{folio.guests?.full_name || '-'}</td><td>{(folio.reservations || []).map((reservation) => reservation.rooms?.room_number).filter(Boolean).join(', ') || '-'}</td><td><span className={`badge ${folio.status}`}>{folio.status || '-'}</span></td><td>{money.format(folio.balance_due || 0)}</td></tr>)}</tbody></table>}</div>
        {!selected ? <div className="card muted">Pilih folio terlebih dahulu.</div> : <>
          <section className="card pos-summary-card"><div><span>No Folio</span><strong>{selected.folio_number || '-'}</strong></div><div><span>Tamu</span><strong>{selected.guests?.full_name || '-'}</strong></div><div><span>Kamar</span><strong>{roomText}</strong></div><div><span>Check-in/out</span><strong>{firstReservation.check_in_date || '-'} / {firstReservation.check_out_date || '-'}</strong></div><div><span>Grand Total</span><strong>{money.format(selected.grand_total || 0)}</strong></div><div><span>Total Paid</span><strong>{money.format(selected.paid_amount || 0)}</strong></div><div><span>Balance</span><strong>{money.format(selected.balance_due || 0)}</strong></div><div><span>Status</span><strong>{selected.status || '-'}</strong></div></section>
          <div className="grid pos-settlement-grid"><div className="card"><h3>Total Charge</h3><p>{money.format(settlement.totalCharge)}</p></div><div className="card"><h3>Total Adjustment</h3><p>{money.format(settlement.totalAdjustment)}</p></div><div className="card"><h3>Total Payment</h3><p>{money.format(settlement.totalPayment)}</p></div><div className="card"><h3>Total Refund</h3><p>{money.format(settlement.totalRefund)}</p></div></div>
          <LedgerTable rows={ledger} />
        </>}
      </div>

      <aside className="page-stack">
        <div className="card"><h2>Input Payment</h2>{!canTransact && <p className="muted">Role Anda read-only untuk transaksi kasir.</p>}<form className="form-grid" onSubmit={submitPayment}><label className="full">Folio<input disabled value={selected?.folio_number || 'Pilih folio'} /></label><label>Nominal<input type="number" min="1" max={selected?.balance_due || undefined} required value={payment.amount} onChange={(event) => updatePayment({ amount: event.target.value })} /></label><label>Metode<select required value={payment.payment_method} onChange={(event) => updatePayment({ payment_method: event.target.value })}>{paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label><label>Tanggal/Jam<input type="datetime-local" value={payment.paid_at} onChange={(event) => updatePayment({ paid_at: event.target.value })} /></label>{nonCash && <label>No Referensi<input required value={payment.reference_number} onChange={(event) => updatePayment({ reference_number: event.target.value })} /></label>}<label className="full">Catatan<textarea value={payment.notes} onChange={(event) => updatePayment({ notes: event.target.value })} /></label><button disabled={!canTransact || saving === 'payment' || !selected}>{saving === 'payment' ? 'Posting...' : 'Submit Payment'}</button></form></div>
        {canTransact && <div className="card"><h2>Adjustment / Refund / Correction</h2><form className="form-grid" onSubmit={submitAdjustment}><label>Tipe<select value={adjustment.adjustment_type} onChange={(event) => setAdjustment({ ...adjustment, adjustment_type: event.target.value })}><option value="cancellation_fee">Cancellation</option><option value="refund">Refund</option><option value="correction">Correction</option><option value="discount_adjustment">Discount Adjustment</option><option value="other_adjustment">Other Adjustment</option></select></label><label>Nominal Minus<input type="number" max="-1" required value={adjustment.amount} onChange={(event) => setAdjustment({ ...adjustment, amount: event.target.value })} placeholder="-100000" /></label><label>Tanggal<input type="date" value={adjustment.posting_date} onChange={(event) => setAdjustment({ ...adjustment, posting_date: event.target.value })} /></label><label className="full">Keterangan<textarea required value={adjustment.notes} onChange={(event) => setAdjustment({ ...adjustment, notes: event.target.value })} /></label><button className="danger" disabled={saving === 'adjustment' || !selected}>{saving === 'adjustment' ? 'Posting...' : 'Posting Nominal Minus'}</button></form></div>}
        <div className="card"><div className="action-bar"><div><h2>Shift Hari Ini</h2><p className="muted">Ringkasan collection per metode.</p></div><input type="date" value={shiftDate} onChange={(event) => setShiftDate(event.target.value)} /></div><div className="detail-list"><p><strong>Cash</strong><br />{money.format(shift?.cash || 0)}</p><p><strong>Transfer</strong><br />{money.format(shift?.transfer || 0)}</p><p><strong>QRIS</strong><br />{money.format(shift?.qris || 0)}</p><p><strong>Debit / Credit</strong><br />{money.format((shift?.debit || 0) + (shift?.credit || 0))}</p><p><strong>Refund</strong><br />{money.format(shift?.refund || 0)}</p><p><strong>Net Collection</strong><br />{money.format(shift?.net || 0)}</p></div></div>
      </aside>
    </div>
    {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
  </div>;
}

function LedgerTable({ rows }) {
  return <div className="card table-card"><h2>Ledger / Tagihan & Payment History</h2>{rows.length === 0 ? <p className="muted">Belum ada tagihan atau transaksi pembayaran.</p> : <table><thead><tr><th>No Bill</th><th>Tanggal</th><th>Tipe</th><th>Deskripsi</th><th>Debit/Charge</th><th>Credit/Payment</th><th>Metode</th><th>Keterangan</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.source}-${row.id}`}><td>{row.bill_no}</td><td>{row.date || '-'}</td><td>{row.type || '-'}</td><td>{row.description || '-'}</td><td>{money.format(row.debit || 0)}</td><td>{money.format(row.credit || 0)}</td><td>{row.method || '-'}</td><td>{row.notes || '-'}</td><td><span className={`badge ${row.status}`}>{row.status || '-'}</span></td></tr>)}</tbody></table>}</div>;
}

function ReceiptModal({ receipt, onClose }) {
  const { folio, payment } = receipt;
  const amount = Number(payment?.amount || 0);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card receipt-card" role="dialog" aria-modal="true"><div className="modal-header"><div><p className="eyebrow">Receipt</p><h2>{payment?.bill_no || '-'}</h2></div><button className="modal-close" onClick={onClose}>×</button></div><div className="receipt-body"><p><strong>Hotel MS</strong></p><p>No Folio: {folio?.folio_number || '-'}</p><p>Tamu: {folio?.guests?.full_name || '-'}</p><p>Tanggal: {String(payment?.paid_at || '').slice(0, 16).replace('T', ' ')}</p><p>Metode: {payment?.payment_method || '-'}</p><p>Nominal: {money.format(amount)}</p><p>Balance Setelah Payment: {money.format(folio?.balance_due || 0)}</p><p>Catatan: {payment?.notes || '-'}</p></div><div className="modal-footer"><IconButton icon={faPrint} label="Print Receipt" title="Print Receipt" onClick={() => window.print()} /><button className="secondary" onClick={onClose}>Close</button></div></section></div>;
}
