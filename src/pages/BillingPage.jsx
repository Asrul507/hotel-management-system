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
    <div className="page-header"><div><h1>Billing</h1><p>Hitung room charge berdasarkan jumlah malam dan catat pembayaran.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="card table-card">{loading ? <p>Memuat billing...</p> : <table><thead><tr><th>Tamu / Kamar</th><th>Malam</th><th>Room Charge</th><th>Terbayar</th><th>Status</th><th>Catat Pembayaran</th></tr></thead><tbody>{stays.map((stay) => {
      const billing = calculateStayBilling(stay);
      const payment = payments[stay.id] || { payment_method: 'cash', amount: '', reference_number: '' };
      return <tr key={stay.id}><td>{stay.guests?.full_name}<br /><small>{stay.rooms?.room_number} - {stay.rooms?.room_types?.name}</small></td><td>{billing.nights}</td><td>{money.format(billing.roomCharge)}</td><td>{money.format(billing.paid)}</td><td><span className={`badge ${billing.paymentStatus}`}>{billing.paymentStatus}</span></td><td><form className="inline-form" onSubmit={(event) => submit(event, stay)}><input type="number" min="1" required placeholder="Nominal" value={payment.amount} onChange={(event) => setPayment(stay.id, { amount: event.target.value })} /><select value={payment.payment_method} onChange={(event) => setPayment(stay.id, { payment_method: event.target.value })}>{PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}</select><input placeholder="Referensi" value={payment.reference_number} onChange={(event) => setPayment(stay.id, { reference_number: event.target.value })} /><button className="small" disabled={saving === stay.id}>Bayar</button></form></td></tr>;
    })}</tbody></table>}{!loading && stays.length === 0 && <p className="muted">Belum ada stay untuk ditagihkan.</p>}</div>
  </div>;
}
