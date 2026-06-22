import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { profilesApi } from '../services/api';
import { ROLES } from '../utils/roles';
import IconButton from '../components/IconButton';
import { faFilter, faPenToSquare } from '@fortawesome/free-solid-svg-icons';

const roleOptions = Object.values(ROLES);
const blankForm = { username: '', password: '', full_name: '', phone: '', role: ROLES.RECEPTIONIST, is_active: true, must_change_password: true };
const normalizeUsername = (value = '') => String(value || '').trim().toLowerCase().replace(/\s+/g, '');

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

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: field === 'username' ? normalizeUsername(value) : value }));
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setForm({
      username: item.username || '',
      password: '',
      full_name: item.full_name || '',
      phone: item.phone || '',
      role: item.role || ROLES.RECEPTIONIST,
      is_active: item.is_active !== false,
      must_change_password: item.must_change_password === true
    });
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
        setSuccess('Profile user berhasil diperbarui. Password diubah melalui Supabase Auth/admin endpoint, bukan disimpan di profile.');
      } else {
        await profilesApi.createUser(form, profile?.role);
        setSuccess('User berhasil dibuat. Username dapat dipakai untuk login setelah auth user tersedia.');
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
    <div className="page-header"><div><h1>User Management</h1><p>Kelola akun username, role, dan status user aplikasi hotel.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {success && <div className="alert success">{success}</div>}
    <div className="alert"><strong>Info:</strong> Login memakai username + password. Email internal Supabase dibuat otomatis dari username dan tidak ditampilkan di halaman login. Pembuatan auth user memerlukan Supabase Edge Function/server-side endpoint agar service role key tidak pernah berada di frontend.</div>
    <div className="two-column wide-left">
      <form className="card form-grid" onSubmit={submit}>
        <h2>{editing ? 'Edit User' : 'Buat User Baru'}</h2>
        <label>Username<input required disabled={Boolean(editing)} value={form.username} onChange={(e) => updateForm('username', e.target.value)} placeholder="username" pattern="[a-z0-9._-]+" title="Huruf kecil, angka, titik, underscore, atau strip. Tanpa spasi." />{editing && <small>Username/auth email internal tidak diubah dari frontend.</small>}</label>
        {!editing && <label>Password awal<input type="password" required minLength="6" autoComplete="new-password" value={form.password} onChange={(e) => updateForm('password', e.target.value)} /></label>}
        <label>Nama lengkap<input required value={form.full_name} onChange={(e) => updateForm('full_name', e.target.value)} /></label>
        <label>Phone<input value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} /></label>
        <label>Role<select value={form.role} onChange={(e) => updateForm('role', e.target.value)}>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
        <label>Status<select value={form.is_active ? 'active' : 'inactive'} onChange={(e) => updateForm('is_active', e.target.value === 'active')}><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>
        <label className="full"><input type="checkbox" checked={form.must_change_password} onChange={(e) => updateForm('must_change_password', e.target.checked)} /> Wajib ganti password saat onboarding</label>
        <div className="button-row full"><button disabled={saving}>{editing ? 'Simpan Perubahan' : 'Buat User'}</button>{editing && <button type="button" className="secondary" onClick={resetForm}>Batal Edit</button>}</div>
      </form>
      <div className="card table-card">
        <div className="page-header"><div><h2>Daftar User</h2></div><form className="filter-grid compact" onSubmit={(e) => { e.preventDefault(); load(); }}><input placeholder="Cari username/nama/phone" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}><option value="all">Semua role</option>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select><IconButton icon={faFilter} label="Filter" title="Filter" type="submit" variant="primary" /></form></div>
        {loading ? <p>Memuat profiles...</p> : profiles.length === 0 ? <p className="muted">Profile tidak ditemukan.</p> : <table><thead><tr><th>Username</th><th>Nama</th><th>Phone</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{profiles.map((item) => <tr key={item.id}><td>{item.username || '-'}<br /><small>{item.id}</small></td><td>{item.full_name || '-'}</td><td>{item.phone || '-'}</td><td><span className="badge">{item.role}</span></td><td><span className={`badge ${item.is_active === false ? 'cancelled' : 'available'}`}>{item.is_active === false ? 'inactive' : 'active'}</span></td><td><div className="table-actions"><IconButton icon={faPenToSquare} title="Edit" onClick={() => startEdit(item)} /></div></td></tr>)}</tbody></table>}
      </div>
    </div>
  </div>;
}
