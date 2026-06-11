import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, supabaseConfigError, isSupabaseConfigured } from '../config/supabase';

const AuthContext = createContext(null);
const AUTH_TIMEOUT_MS = 15000;

function authLog(event, detail = {}) {
  const payload = Object.keys(detail).length ? detail : undefined;
  if (event === 'AUTH_ERROR') console.warn(event, payload || '');
  else console.info(event, payload || '');
}

function withTimeout(promise, label, timeoutMs = AUTH_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label} timeout setelah ${timeoutMs / 1000} detik.`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const authRequestRef = useRef(0);

  useEffect(() => {
    let isMounted = true;
    let subscription;

    async function loadProfile(userId, requestId = authRequestRef.current) {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error(supabaseConfigError || 'Supabase belum dikonfigurasi.');
      }

      const { data, error } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        'AUTH_PROFILE_LOADED'
      );

      if (!isMounted || requestId !== authRequestRef.current) return null;
      if (error) throw error;

      if (!data) {
        const message = 'Profile akun tidak ditemukan. Hubungi admin untuk membuat profile dan role.';
        setProfile(null);
        setProfileError(message);
        authLog('AUTH_ERROR', { step: 'profile_missing', userId });
        return null;
      }

      setProfile(data);
      setProfileError(null);
      authLog('AUTH_PROFILE_LOADED', { userId, role: data.role });
      return data;
    }

    async function applySession(nextSession, source, requestId = authRequestRef.current) {
      if (!isMounted || requestId !== authRequestRef.current) return;

      setSession(nextSession || null);
      setAuthError(null);
      setProfileError(null);

      if (nextSession?.user) {
        authLog('AUTH_SESSION_FOUND', { source, userId: nextSession.user.id });
        await loadProfile(nextSession.user.id, requestId);
      } else {
        setProfile(null);
      }
    }

    async function initializeAuth() {
      const requestId = authRequestRef.current + 1;
      authRequestRef.current = requestId;
      authLog('AUTH_INIT', { requestId });
      setLoading(true);
      setAuthError(null);
      setProfileError(null);

      try {
        if (!isSupabaseConfigured || !supabase) {
          throw new Error(supabaseConfigError || 'Supabase belum dikonfigurasi.');
        }

        const { data, error } = await withTimeout(supabase.auth.getSession(), 'AUTH_INIT');
        if (!isMounted || requestId !== authRequestRef.current) return;
        if (error) throw error;

        await applySession(data?.session || null, 'initial', requestId);
      } catch (error) {
        if (!isMounted || requestId !== authRequestRef.current) return;
        const message = error.message || 'Gagal memuat sesi login. Silakan coba lagi.';
        setSession(null);
        setProfile(null);
        setAuthError(message);
        setProfileError(null);
        authLog('AUTH_ERROR', { step: 'initialize', message });
      } finally {
        if (isMounted && requestId === authRequestRef.current) {
          setLoading(false);
          authLog('AUTH_DONE', { requestId });
        }
      }
    }

    function handleAuthStateChange(event, nextSession) {
      const requestId = authRequestRef.current + 1;
      authRequestRef.current = requestId;
      authLog('AUTH_INIT', { requestId, event });
      setLoading(true);
      setAuthError(null);
      setProfileError(null);

      // Avoid running Supabase queries directly inside onAuthStateChange callback.
      window.setTimeout(async () => {
        try {
          await applySession(nextSession || null, event, requestId);
        } catch (error) {
          if (!isMounted || requestId !== authRequestRef.current) return;
          const message = error.message || 'Gagal memperbarui sesi login. Silakan coba lagi.';
          setProfile(null);
          setAuthError(message);
          setProfileError(null);
          authLog('AUTH_ERROR', { step: 'auth_state_change', event, message });
        } finally {
          if (isMounted && requestId === authRequestRef.current) {
            setLoading(false);
            authLog('AUTH_DONE', { requestId, event });
          }
        }
      }, 0);
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { data } = supabase.auth.onAuthStateChange(handleAuthStateChange);
        subscription = data?.subscription;
      } catch (error) {
        const message = error.message || 'Gagal memasang listener autentikasi. Silakan coba lagi.';
        setAuthError(message);
        authLog('AUTH_ERROR', { step: 'listener', message });
      }
    }

    initializeAuth();

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const unavailableClientError = () => ({
    data: null,
    error: new Error(supabaseConfigError || 'Supabase belum dikonfigurasi.')
  });

  const value = useMemo(() => ({
    session,
    profile,
    loading,
    authError,
    profileError,
    configError: supabaseConfigError,
    isSupabaseConfigured,
    signIn: async (email, password) => {
      if (!isSupabaseConfigured || !supabase) return unavailableClientError();

      const requestId = authRequestRef.current + 1;
      authRequestRef.current = requestId;
      authLog('AUTH_INIT', { requestId, event: 'SIGN_IN_SUBMIT' });
      setLoading(true);
      setAuthError(null);
      setProfileError(null);

      try {
        const result = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          'AUTH_SIGN_IN'
        );

        if (result.error) {
          const message = result.error.message || 'Login gagal. Periksa email dan password lalu coba lagi.';
          setSession(null);
          setProfile(null);
          setAuthError(message);
          authLog('AUTH_ERROR', { step: 'sign_in', message });
          return result;
        }

        const nextSession = result.data?.session || null;
        setSession(nextSession);
        setAuthError(null);

        if (nextSession?.user) {
          authLog('AUTH_SESSION_FOUND', { source: 'sign_in', userId: nextSession.user.id });
          const { data, error } = await withTimeout(
            supabase.from('profiles').select('*').eq('id', nextSession.user.id).maybeSingle(),
            'AUTH_PROFILE_LOADED'
          );

          if (error) throw error;

          if (data) {
            setProfile(data);
            setProfileError(null);
            authLog('AUTH_PROFILE_LOADED', { userId: nextSession.user.id, role: data.role });
          } else {
            const message = 'Profile akun tidak ditemukan. Hubungi admin untuk membuat profile dan role.';
            setProfile(null);
            setProfileError(message);
            authLog('AUTH_ERROR', { step: 'profile_missing', userId: nextSession.user.id });
          }
        }

        return result;
      } catch (error) {
        const message = error.message || 'Login gagal. Silakan coba lagi.';
        setProfile(null);
        setAuthError(message);
        setProfileError(null);
        authLog('AUTH_ERROR', { step: 'sign_in', message });
        return { data: null, error: new Error(message) };
      } finally {
        setLoading(false);
        authLog('AUTH_DONE', { requestId, event: 'SIGN_IN_SUBMIT' });
      }
    },
    signOut: () => {
      if (!isSupabaseConfigured || !supabase) return unavailableClientError();
      return supabase.auth.signOut();
    }
  }), [session, profile, loading, authError, profileError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
