import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { profilesApi } from '../services/api';
import { ROLES } from '../utils/roles';

const roleOptions = Object.values(ROLES);
const blankForm = { id: '', email: '', full_name: '', phone: '', role: ROLES.RECEPTIONIST, is_active: true };

export default function UserManagementPage() {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [filters, setFilters] = useState({ search: '', role: 'all', status: 'all' });
  const [form, setForm] = useState(blankForm);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setProfiles(await profilesApi.list(filters));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (item) => {
    setEditing(item.id);
    setForm({ id: item.id, email: item.email || '', full_name: item.full_name || '', phone: item.phone || '', role: item.role || ROLES.RECEPTIONIST, is_active: item.is_active !== false });
  };

  const resetForm = () => {
    setEditing(null);
    setForm(blankForm);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (editing) {
        await profilesApi.updateProfile(editing, form, profile?.role);
        setSuccess('Profile user berhasil diperbarui.');
      } else {
        await profilesApi.createProfile(form, profile?.role);
        setSuccess('Profile user berhasil dibuat. Pastikan Supabase Auth user sudah dibuat/diundang dengan email yang sama.');
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="page-stack">
    <div className="page-header"><div><h1>User Management</h1><p>Khusus super admin untuk mengelola profile aplikasi. Auth user tetap dibuat aman melalui Supabase Dashboard/Invite, bukan service_role di frontend.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {success && <div className="alert success">{success}</div>}
    <div className="alert"><strong>Catatan aman:</strong> Form ini mengelola data <code>profiles</code>. Untuk user login baru, buat atau invite user di Supabase Auth Dashboard terlebih dahulu, lalu set role/status profile di sini.</div>
    <div className="two-column wide-left">
      <form className="card form-grid" onSubmit={submit}>
        <h2>{editing ? 'Edit Profile User' : 'Tambah Profile User'}</h2>
        {!editing && <label className="full">Auth User UUID<input required value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="UUID dari Supabase Auth Dashboard" /></label>}
        <label>Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Nama lengkap<input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
        <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
        <label>Status<select value={form.is_active ? 'active' : 'inactive'} onChange={(e) => setForm({ ...form, is_active: e.target.value === 'active' })}><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>
        <div className="button-row full"><button disabled={saving}>{editing ? 'Simpan Perubahan' : 'Tambah Profile'}</button>{editing && <button type="button" className="secondary" onClick={resetForm}>Batal Edit</button>}</div>
      </form>
      <div className="card table-card">
        <div className="page-header"><div><h2>Profiles</h2></div><form className="filter-grid compact" onSubmit={(e) => { e.preventDefault(); load(); }}><input placeholder="Cari email/nama/phone" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}><option value="all">Semua role</option>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select><button className="small">Filter</button></form></div>
        {loading ? <p>Memuat profiles...</p> : profiles.length === 0 ? <p className="muted">Profile tidak ditemukan.</p> : <table><thead><tr><th>Email</th><th>Nama</th><th>Phone</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{profiles.map((item) => <tr key={item.id}><td>{item.email || '-'}<br /><small>{item.id}</small></td><td>{item.full_name || '-'}</td><td>{item.phone || '-'}</td><td><span className="badge">{item.role}</span></td><td><span className={`badge ${item.is_active === false ? 'cancelled' : 'available'}`}>{item.is_active === false ? 'inactive' : 'active'}</span></td><td><button className="small" onClick={() => startEdit(item)}>Edit</button></td></tr>)}</tbody></table>}
      </div>
    </div>
  </div>;
}
