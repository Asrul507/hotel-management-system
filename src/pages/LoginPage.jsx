import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfigError from '../components/ConfigError';
import { useAuth } from '../contexts/AuthContext';
import { getFriendlySupabaseError } from '../utils/supabaseError';

const LOGIN_ERROR = 'Username atau password salah, atau akun belum aktif.';
const normalizeUsername = (value = '') => String(value || '').trim().toLowerCase();

export default function LoginPage() {
  const { signInWithUsername, session, profile, loading, authError, profileError, configError, isSupabaseConfigured } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
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
    const username = normalizeUsername(form.username);
    if (!username || !form.password) {
      setError(LOGIN_ERROR);
      return;
    }

    if (!isSupabaseConfigured || configError) {
      setError(configError || 'Supabase belum dikonfigurasi. Lengkapi ENV sebelum login.');
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const { error: err } = await signInWithUsername(username, form.password);
      if (err) {
        const message = getFriendlySupabaseError(err, LOGIN_ERROR);
        if (message.includes('terlalu banyak request')) setCooldownUntil(Date.now() + 30000);
        setError(LOGIN_ERROR);
      }
    } catch (err) {
      const message = getFriendlySupabaseError(err, LOGIN_ERROR);
      if (message.includes('terlalu banyak request')) setCooldownUntil(Date.now() + 30000);
      setError(LOGIN_ERROR);
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  if (configError) return <ConfigError message={configError} />;

  const cooldownSeconds = Math.max(Math.ceil((cooldownUntil - now) / 1000), 0);
  const isCoolingDown = cooldownSeconds > 0;
  const displayError = error || (authError && LOGIN_ERROR) || (profileError && LOGIN_ERROR);

  return <div className="auth"><form onSubmit={submit} className="card"><h1>Hotel Management System</h1>
    <input placeholder="Username" type="text" autoComplete="username" required value={form.username} onChange={(e) => setForm({ ...form, username: normalizeUsername(e.target.value) })} />
    <input placeholder="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
    {displayError && <p className="error">{displayError}</p>}
    {isCoolingDown && <p className="muted">Coba login lagi dalam {cooldownSeconds} detik.</p>}
    <button disabled={submitting || loading || isCoolingDown}>{submitting || loading ? 'Memproses...' : isCoolingDown ? `Tunggu ${cooldownSeconds}s` : 'Login'}</button>
  </form></div>;
}
