import { useEffect, useState } from 'react';
import { PAYMENT_METHODS, billingApi, calculateStayBilling } from '../services/api';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export default function BillingPage() {
  const [stays, setStays] = useState([]);
  const [payments, setPayments] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setStays(await billingApi.list());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setPayment = (stayId, patch) => setPayments((current) => ({ ...current, [stayId]: { payment_method: 'cash', amount: '', reference_number: '', ...current[stayId], ...patch } }));

  const ensureInvoice = async (stay) => {
    setSaving(stay.id);
    setError('');
    try {
      await billingApi.ensureInvoice(stay);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  };

  const submit = async (event, stay) => {
    event.preventDefault();
    setSaving(stay.id);
    setError('');
    try {
      await billingApi.recordPayment(stay, payments[stay.id] || {});
      setPayment(stay.id, { amount: '', reference_number: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  };

  return <div className="page-stack">
    <div className="page-header"><div><h1>Billing</h1><p>Invoice dibuat dari stay/reservation, menghitung room charge, tax/service, deposit, payment, dan balance.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="card table-card">{loading ? <p>Memuat billing...</p> : stays.length === 0 ? <p className="muted">Belum ada stay untuk ditagihkan.</p> : <table><thead><tr><th>Invoice</th><th>Tamu / Kamar</th><th>Room Charge</th><th>Tax/Service/Deposit</th><th>Total</th><th>Paid / Balance</th><th>Status</th><th>Catat Pembayaran</th></tr></thead><tbody>{stays.map((stay) => {
      const billing = calculateStayBilling(stay);
      const invoice = stay.invoices?.[0];
      const payment = payments[stay.id] || { payment_method: 'cash', amount: '', reference_number: '' };
      return <tr key={stay.id}><td>{invoice?.invoice_number || <button className="small secondary" disabled={saving === stay.id} onClick={() => ensureInvoice(stay)}>Buat invoice</button>}</td><td>{stay.guests?.full_name}<br /><small>{stay.rooms?.room_number} - {stay.rooms?.room_types?.name}</small></td><td>{billing.nights} malam × {money.format(billing.roomRate)}<br /><strong>{money.format(billing.subtotal)}</strong></td><td>Tax {money.format(billing.taxAmount)}<br />Service {money.format(billing.serviceAmount)}<br />Deposit -{money.format(billing.depositApplied)}</td><td>{money.format(invoice?.total_amount ?? billing.total)}</td><td>{money.format(billing.paid)}<br /><small>{money.format(invoice?.balance_due ?? billing.balance)} due</small></td><td><span className={`badge ${invoice?.status || billing.paymentStatus}`}>{invoice?.status || billing.paymentStatus}</span></td><td><form className="inline-form" onSubmit={(event) => submit(event, stay)}><input type="number" min="1" max={billing.balance || undefined} required placeholder="Nominal" value={payment.amount} onChange={(event) => setPayment(stay.id, { amount: event.target.value })} /><select value={payment.payment_method} onChange={(event) => setPayment(stay.id, { payment_method: event.target.value })}>{PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}</select><input placeholder="Referensi" value={payment.reference_number} onChange={(event) => setPayment(stay.id, { reference_number: event.target.value })} /><button className="small" disabled={saving === stay.id || billing.balance <= 0}>Bayar</button></form></td></tr>;
    })}</tbody></table>}</div>
  </div>;
}
