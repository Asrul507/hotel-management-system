import { useEffect, useState } from 'react';
import { guestsApi } from '../services/api';
import IconButton from '../components/IconButton';
import { FrontOfficeSubnav } from '../components/ModuleSubnav';
import { faFilter, faPenToSquare, faTrash } from '@fortawesome/free-solid-svg-icons';

const emptyForm = { full_name: '', nik: '', phone: '', email: '', address: '', city: '', birth_date: '', gender: '', notes: '', is_blacklisted: false, is_active: true };

export default function GuestsPage() {
  const [guests, setGuests] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setGuests(await guestsApi.list({ search, status }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [status]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) await guestsApi.update(editingId, form);
      else await guestsApi.create(form);
      setForm(emptyForm);
      setEditingId('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function edit(guest) {
    setEditingId(guest.id);
    setForm({
      full_name: guest.full_name || '',
      nik: guest.nik || '',
      phone: guest.phone || '',
      email: guest.email || '',
      address: guest.address || '',
      city: guest.city || '',
      birth_date: guest.birth_date || '',
      gender: guest.gender || '',
      notes: guest.notes || '',
      is_blacklisted: Boolean(guest.is_blacklisted),
      is_active: guest.is_active !== false
    });
  }

  async function archive(guest) {
    if (!window.confirm(`Arsipkan tamu ${guest.full_name}?`)) return;
    setSaving(guest.id);
    setError('');
    try {
      await guestsApi.archive(guest.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return <div className="page-stack">
    <div className="page-header"><div><h1>Tamu</h1><p>Database tamu lengkap dengan pencarian nama, NIK, dan nomor HP.</p></div></div>
    <FrontOfficeSubnav activeLabel="Guest Database" />
    {error && <div className="alert error">{error}</div>}
    <div className="two-column">
      <form className="card form-grid" onSubmit={submit}>
        <h2>{editingId ? 'Edit Tamu' : 'Tambah Tamu'}</h2>
        <label className="full">Nama lengkap<input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
        <label>NIK<input value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value })} /></label>
        <label>No HP<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Kota<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
        <label>Tanggal lahir<input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></label>
        <label>Jenis kelamin<select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">-</option><option value="male">Laki-laki</option><option value="female">Perempuan</option><option value="other">Lainnya</option></select></label>
        <label>Status<select value={form.is_active ? 'active' : 'archived'} onChange={(e) => setForm({ ...form, is_active: e.target.value === 'active' })}><option value="active">Active</option><option value="archived">Archived</option></select></label>
        <label>Blacklist<select value={form.is_blacklisted ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, is_blacklisted: e.target.value === 'yes' })}><option value="no">Tidak</option><option value="yes">Ya</option></select></label>
        <label className="full">Alamat<textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label className="full">Catatan<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <button disabled={saving}>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Tamu'}</button>
        {editingId && <button type="button" className="secondary" onClick={() => { setEditingId(''); setForm(emptyForm); }}>Batal Edit</button>}
      </form>
      <div className="card table-card">
        <div className="page-header"><div><h2>Daftar Tamu</h2></div><form className="inline-form guest-filter" onSubmit={(e) => { e.preventDefault(); load(); }}><input placeholder="Cari nama / NIK / HP" value={search} onChange={(e) => setSearch(e.target.value)} /><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="archived">Archived</option><option value="all">Semua</option></select><IconButton icon={faFilter} label="Cari" title="Cari" type="submit" variant="primary" /></form></div>
        {loading ? <p>Memuat tamu...</p> : guests.length === 0 ? <p className="muted">Data tamu tidak ditemukan.</p> : <table><thead><tr><th>Nama</th><th>NIK</th><th>No HP</th><th>Email</th><th>Kota</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{guests.map((guest) => <tr key={guest.id}><td>{guest.full_name} {guest.is_blacklisted && <span className="badge cancelled">Blacklist</span>}</td><td>{guest.nik || '-'}</td><td>{guest.phone || '-'}</td><td>{guest.email || '-'}</td><td>{guest.city || '-'}</td><td>{guest.is_active === false ? 'archived' : 'active'}</td><td><div className="table-actions"><IconButton icon={faPenToSquare} title="Edit" onClick={() => edit(guest)} />{guest.is_active !== false && <IconButton icon={faTrash} title="Arsip" variant="danger" disabled={saving === guest.id} onClick={() => archive(guest)} />}</div></td></tr>)}</tbody></table>}
      </div>
    </div>
  </div>;
}
