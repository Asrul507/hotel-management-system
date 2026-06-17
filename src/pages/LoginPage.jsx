import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfigError from '../components/ConfigError';
import { useAuth } from '../contexts/AuthContext';
import { getFriendlySupabaseError } from '../utils/supabaseError';

export default function LoginPage() {
  const { signIn, session, profile, loading, authError, profileError, configError, isSupabaseConfigured } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!loading && session && profile) nav('/');
  }, [loading, nav, profile, session]);

  useEffect(() => {
    if (!cooldownUntil) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const submit = async (e) => {
    e.preventDefault();
    if (submitLockRef.current || submitting || loading || Date.now() < cooldownUntil) return;

    setError('');

    if (!isSupabaseConfigured || configError) {
      setError(configError || 'Supabase belum dikonfigurasi. Lengkapi ENV sebelum login.');
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const { error: err } = await signIn(form.email.trim(), form.password);
      if (err) {
        const message = getFriendlySupabaseError(err, 'Login gagal. Periksa email dan password lalu coba lagi.');
        if (message.includes('terlalu banyak request')) setCooldownUntil(Date.now() + 30000);
        setError(message);
      }
    } catch (err) {
      const message = getFriendlySupabaseError(err, 'Login gagal. Silakan coba lagi.');
      if (message.includes('terlalu banyak request')) setCooldownUntil(Date.now() + 30000);
      setError(message);
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  if (configError) return <ConfigError message={configError} />;

  const cooldownSeconds = Math.max(Math.ceil((cooldownUntil - now) / 1000), 0);
  const isCoolingDown = cooldownSeconds > 0;

  return <div className="auth"><form onSubmit={submit} className="card"><h1>Hotel Management System</h1>
    <input placeholder="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
    <input placeholder="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
    {(error || authError || profileError) && <p className="error">{error || authError || profileError}</p>}
    {isCoolingDown && <p className="muted">Coba login lagi dalam {cooldownSeconds} detik.</p>}
    <button disabled={submitting || loading || isCoolingDown}>{submitting || loading ? 'Memproses...' : isCoolingDown ? `Tunggu ${cooldownSeconds}s` : 'Login'}</button>
  </form></div>;
}
