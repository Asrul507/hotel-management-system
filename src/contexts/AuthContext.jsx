import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigurationError, isSupabaseConfigured } from '../config/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let subscription;

    async function initializeAuth() {
      try {
        if (!isSupabaseConfigured || !supabase) {
          throw new Error(supabaseConfigurationError);
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!isMounted) return;

        const currentSession = data?.session || null;
        setSession(currentSession);
        setAuthError(null);

        if (currentSession?.user) {
          await loadProfile(currentSession.user.id);
        } else {
          setProfile(null);
        }
      } catch (error) {
        if (!isMounted) return;
        setSession(null);
        setProfile(null);
        setAuthError(error.message || 'Gagal memuat sesi login. Silakan coba lagi.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initializeAuth();

    if (isSupabaseConfigured && supabase) {
      try {
        const { data } = supabase.auth.onAuthStateChange(async (_, nextSession) => {
          try {
            if (!isMounted) return;

            setSession(nextSession || null);
            setAuthError(null);

            if (nextSession?.user) {
              await loadProfile(nextSession.user.id);
            } else {
              setProfile(null);
            }
          } catch (error) {
            if (!isMounted) return;
            setProfile(null);
            setAuthError(error.message || 'Gagal memperbarui sesi login. Silakan coba lagi.');
          }
        });
        subscription = data?.subscription;
      } catch (error) {
        setAuthError(error.message || 'Gagal memasang listener autentikasi. Silakan coba lagi.');
      }
    }

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function loadProfile(userId) {
    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error(supabaseConfigurationError);
      }

      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error) throw error;

      setProfile(data || null);
      return data || null;
    } catch (error) {
      setProfile(null);
      setAuthError(error.message || 'Gagal memuat profile akun. Silakan coba lagi.');
      return null;
    }
  }

  const unavailableClientError = () => ({
    data: null,
    error: new Error(supabaseConfigurationError || 'Supabase belum dikonfigurasi.')
  });

  const value = useMemo(() => ({
    session,
    profile,
    loading,
    authError,
    signIn: (email, password) => {
      if (!isSupabaseConfigured || !supabase) return unavailableClientError();
      return supabase.auth.signInWithPassword({ email, password });
    },
    signOut: () => {
      if (!isSupabaseConfigured || !supabase) return unavailableClientError();
      return supabase.auth.signOut();
    }
  }), [session, profile, loading, authError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
