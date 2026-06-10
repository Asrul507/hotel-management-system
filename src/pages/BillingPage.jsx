import { useEffect, useState } from 'react';
import { FOLIO_ITEM_TYPES, NON_CASH_METHODS, foliosApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const emptyPayment = { payment_group: 'cash', payment_method: 'cash', amount: '', reference_number: '', card_or_account_number: '', notes: '' };
const emptyItem = { item_type: 'other', description: '', qty: 1, unit_price: '' };
const emptyRefund = { payment_group: 'cash', payment_method: 'cash', amount: '', reference_number: '', card_or_account_number: '', notes: '' };

export default function BillingPage() {
  const { profile } = useAuth();
  const [folios, setFolios] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [filters, setFilters] = useState({ status: 'all', search: '' });
  const [payments, setPayments] = useState({});
  const [items, setItems] = useState({});
  const [refunds, setRefunds] = useState({});
  const [discounts, setDiscounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const selected = folios.find((folio) => folio.id === selectedId) || folios[0];

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await foliosApi.list(filters);
      setFolios(data);
      if (!selectedId && data[0]) setSelectedId(data[0].id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const paymentState = (id) => payments[id] || emptyPayment;
  const itemState = (id) => items[id] || emptyItem;
  const refundState = (id) => refunds[id] || emptyRefund;

  function setPayment(id, patch) {
    setPayments((current) => {
      const next = { ...emptyPayment, ...current[id], ...patch };
      if (patch.payment_group === 'cash') next.payment_method = 'cash';
      if (patch.payment_group === 'non_tunai' && next.payment_method === 'cash') next.payment_method = 'qris';
      return { ...current, [id]: next };
    });
  }

  function setRefund(id, patch) {
    setRefunds((current) => {
      const next = { ...emptyRefund, ...current[id], ...patch };
      if (patch.payment_group === 'cash') next.payment_method = 'cash';
      if (patch.payment_group === 'non_tunai' && next.payment_method === 'cash') next.payment_method = 'qris';
      return { ...current, [id]: next };
    });
  }

  async function run(id, action) {
    setSaving(id);
    setError('');
    try {
      await action();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  }

  return <div className="page-stack">
    <div className="page-header"><div><h1>Billing / Folio</h1><p>Folio menampung room charge, tambahan, discount, payment, refund, debt, dan closing.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <form className="card filter-grid" onSubmit={(e) => { e.preventDefault(); load(); }}><input placeholder="Cari folio / tamu" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">Semua status</option><option value="open">Open</option><option value="closed">Closed</option><option value="debt">Debt</option><option value="cancelled">Cancelled</option><option value="refunded">Refunded</option></select><button>Filter</button></form>
    {loading ? <div className="card">Memuat folio...</div> : folios.length === 0 ? <div className="card muted">Belum ada folio. Folio akan dibuat otomatis saat check-in/cancellation/no-show.</div> : <div className="two-column wide-left">
      <div className="card table-card"><h2>Daftar Folio</h2><table><thead><tr><th>Folio</th><th>Tamu</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>{folios.map((folio) => <tr key={folio.id} className={selected?.id === folio.id ? 'selected-row' : ''} onClick={() => setSelectedId(folio.id)}><td>{folio.folio_number}</td><td>{folio.guests?.full_name || '-'}</td><td>{money.format(folio.grand_total || 0)}</td><td>{money.format(folio.paid_amount || 0)}</td><td>{money.format(folio.balance_due || 0)}</td><td><span className={`badge ${folio.status}`}>{folio.status}</span></td></tr>)}</tbody></table></div>
      {selected && <div className="page-stack">
        <div className="card detail-list"><div className="page-header"><div><h2>{selected.folio_number} - {selected.guests?.full_name}</h2><p><span className={`badge ${selected.status}`}>{selected.status}</span></p></div><button className="small" disabled={saving === selected.id} onClick={() => run(selected.id, () => foliosApi.closeFolio(selected.id))}>{selected.balance_due > 0 ? 'Close as Debt' : 'Close Folio'}</button></div><div className="grid"><p><strong>Subtotal</strong><br />{money.format(selected.subtotal || 0)}</p><p><strong>Discount</strong><br />{selected.discount_percent || 0}% / {money.format(selected.discount_amount || 0)}</p><p><strong>Tax</strong><br />{money.format(selected.tax_amount || 0)}</p><p><strong>Service</strong><br />{money.format(selected.service_amount || 0)}</p><p><strong>Grand Total</strong><br />{money.format(selected.grand_total || 0)}</p><p><strong>Paid</strong><br />{money.format(selected.paid_amount || 0)}</p><p><strong>Refund</strong><br />{money.format(selected.refund_amount || 0)}</p><p><strong>Balance</strong><br />{money.format(selected.balance_due || 0)}</p></div></div>
        <div className="card"><h2>Discount Persen</h2><form className="inline-form" onSubmit={(e) => { e.preventDefault(); run(selected.id, () => foliosApi.updateDiscount(selected.id, discounts[selected.id] ?? selected.discount_percent ?? 0, profile?.role)); }}><input type="number" min="0" max="100" value={discounts[selected.id] ?? selected.discount_percent ?? 0} onChange={(e) => setDiscounts({ ...discounts, [selected.id]: e.target.value })} /><button className="small" disabled={saving === selected.id}>Simpan Discount</button></form></div>
        <div className="card table-card"><h2>Folio Items</h2><table><thead><tr><th>Tanggal</th><th>Type</th><th>Deskripsi</th><th>Qty</th><th>Harga</th><th>Total</th></tr></thead><tbody>{(selected.folio_items || []).map((item) => <tr key={item.id}><td>{item.posting_date}</td><td>{item.item_type}</td><td>{item.description}</td><td>{item.qty}</td><td>{money.format(item.unit_price || 0)}</td><td>{money.format(item.line_total || 0)}</td></tr>)}</tbody></table></div>
        <div className="card"><h2>Tambah Charge</h2><form className="inline-form" onSubmit={(e) => { e.preventDefault(); run(selected.id, () => foliosApi.addFolioItem(selected.id, itemState(selected.id))); }}><select value={itemState(selected.id).item_type} onChange={(e) => setItems({ ...items, [selected.id]: { ...itemState(selected.id), item_type: e.target.value } })}>{FOLIO_ITEM_TYPES.filter((type) => !['refund', 'discount'].includes(type)).map((type) => <option key={type} value={type}>{type}</option>)}</select><input required placeholder="Deskripsi" value={itemState(selected.id).description} onChange={(e) => setItems({ ...items, [selected.id]: { ...itemState(selected.id), description: e.target.value } })} /><input type="number" min="0.01" step="0.01" value={itemState(selected.id).qty} onChange={(e) => setItems({ ...items, [selected.id]: { ...itemState(selected.id), qty: e.target.value } })} /><input type="number" step="0.01" value={itemState(selected.id).unit_price} onChange={(e) => setItems({ ...items, [selected.id]: { ...itemState(selected.id), unit_price: e.target.value } })} /><button className="small" disabled={saving === selected.id}>Tambah</button></form></div>
        <div className="card"><h2>Payment</h2><PaymentForm state={paymentState(selected.id)} setter={(patch) => setPayment(selected.id, patch)} onSubmit={(e) => { e.preventDefault(); run(selected.id, () => foliosApi.addFolioPayment(selected.id, paymentState(selected.id))); }} saving={saving === selected.id} /></div>
        <div className="card"><h2>Refund</h2><PaymentForm state={refundState(selected.id)} setter={(patch) => setRefund(selected.id, patch)} onSubmit={(e) => { e.preventDefault(); run(selected.id, () => foliosApi.refundFolio(selected.id, refundState(selected.id))); }} saving={saving === selected.id} refund /></div>
      </div>}
    </div>}
  </div>;
}

function PaymentForm({ state, setter, onSubmit, saving, refund = false }) {
  const nonCash = state.payment_group === 'non_tunai';
  return <form className="form-grid" onSubmit={onSubmit}>
    <label>Group<select value={state.payment_group} onChange={(e) => setter({ payment_group: e.target.value })}><option value="cash">Cash</option><option value="non_tunai">Non Tunai</option></select></label>
    {nonCash && <label>Metode<select value={state.payment_method} onChange={(e) => setter({ payment_method: e.target.value })}>{NON_CASH_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}</select></label>}
    <label>Amount<input type="number" min="1" required value={state.amount} onChange={(e) => setter({ amount: e.target.value })} /></label>
    {nonCash && <label>No Reff<input required={nonCash} value={state.reference_number} onChange={(e) => setter({ reference_number: e.target.value })} /></label>}
    {nonCash && <label>No Kartu/Account<input value={state.card_or_account_number} onChange={(e) => setter({ card_or_account_number: e.target.value })} /></label>}
    <label className="full">Notes<textarea required={refund} value={state.notes} onChange={(e) => setter({ notes: e.target.value })} /></label>
    <button disabled={saving}>{saving ? 'Menyimpan...' : refund ? 'Refund' : 'Bayar'}</button>
  </form>;
}
