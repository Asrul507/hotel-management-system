import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfigError from '../components/ConfigError';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { signIn, session, profile, loading, authError, profileError, configError, isSupabaseConfigured } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);


  useEffect(() => {
    if (!loading && session && profile) {
      nav('/');
    }
  }, [loading, nav, profile, session]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isSupabaseConfigured || configError) {
      setError(configError || 'Supabase belum dikonfigurasi. Lengkapi ENV sebelum login.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: err } = await signIn(form.email, form.password);
      if (err) {
        setError(err.message || 'Login gagal. Periksa email dan password lalu coba lagi.');
        return;
      }
    } catch (err) {
      setError(err.message || 'Login gagal. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (configError) return <ConfigError message={configError} />;

  return <div className="auth"><form onSubmit={submit} className="card"><h1>Hotel Management System</h1>
    <input placeholder="Email" type="email" autoComplete="email" required value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})}/>
    <input placeholder="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})}/>
    {(error || authError || profileError) && <p className="error">{error || authError || profileError}</p>}<button disabled={submitting || loading}>{submitting || loading ? 'Memproses...' : 'Login'}</button></form></div>;
}
