import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, supabaseConfigError, isSupabaseConfigured } from '../config/supabase';
import { getFriendlySupabaseError, handleSupabaseError, isAuthSessionError, isRateLimitError } from '../utils/supabaseError';

const AuthContext = createContext(null);
const AUTH_TIMEOUT_MS = 15000;
const AUTH_CHECK_THROTTLE_MS = 30000;

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
  const lastSessionCheckAtRef = useRef(0);
  const isAuthCheckingRef = useRef(false);
  const isRefreshingSessionRef = useRef(false);
  const isAppInitializingRef = useRef(false);
  const isAppInitializedRef = useRef(false);
  const initStartedRef = useRef(false);
  const mountedRef = useRef(false);
  const loadedProfileUserIdRef = useRef(null);
  const profileRequestUserIdRef = useRef(null);
  const profileRef = useRef(null);
  const sessionUserIdRef = useRef(null);

  const unavailableClientError = useCallback(() => ({
    data: null,
    error: new Error(supabaseConfigError || 'Supabase belum dikonfigurasi.')
  }), []);

  const loadProfile = useCallback(async (userId, options = {}) => {
    const { force = false, requestId = authRequestRef.current } = options;

    if (!userId) {
      loadedProfileUserIdRef.current = null;
      profileRequestUserIdRef.current = null;
      profileRef.current = null;
      setProfile(null);
      return null;
    }

    if (!force && loadedProfileUserIdRef.current === userId && profileRef.current) {
      setProfileError(null);
      return profileRef.current;
    }

    if (!isSupabaseConfigured || !supabase) {
      throw new Error(supabaseConfigError || 'Supabase belum dikonfigurasi.');
    }

    profileRequestUserIdRef.current = userId;

    try {
      const { data, error } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        'AUTH_PROFILE_LOADED'
      );

      if (!mountedRef.current || requestId !== authRequestRef.current) return null;
      if (error) throw error;

      if (!data) {
        loadedProfileUserIdRef.current = null;
        profileRef.current = null;
        setProfile(null);
        setProfileError('Profile akun tidak ditemukan. Hubungi admin untuk membuat profile dan role.');
        return null;
      }

      loadedProfileUserIdRef.current = userId;
      profileRef.current = data;
      setProfile(data);
      setProfileError(null);
      return data;
    } catch (error) {
      if (!mountedRef.current || requestId !== authRequestRef.current) return null;
      const message = getFriendlySupabaseError(error, 'Gagal memuat profile akun. Silakan coba lagi.');
      if (!isRateLimitError(error)) loadedProfileUserIdRef.current = null;
      setProfileError(message);
      throw new Error(message);
    } finally {
      if (profileRequestUserIdRef.current === userId) profileRequestUserIdRef.current = null;
    }
  }, []);

  const applySession = useCallback(async (nextSession, _source, options = {}) => {
    const { requestId = authRequestRef.current, forceProfile = false } = options;
    if (!mountedRef.current || requestId !== authRequestRef.current) return;

    sessionUserIdRef.current = nextSession?.user?.id || null;
    setSession(nextSession || null);
    setAuthError(null);

    if (nextSession?.user) {
      await loadProfile(nextSession.user.id, { force: forceProfile, requestId });
      return;
    }

    loadedProfileUserIdRef.current = null;
    profileRequestUserIdRef.current = null;
    profileRef.current = null;
    setProfile(null);
    setProfileError(null);
  }, [loadProfile]);

  const initializeAuth = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && isAppInitializedRef.current && now - lastSessionCheckAtRef.current < AUTH_CHECK_THROTTLE_MS) return;
    if (initStartedRef.current && !force) return;
    if (isAuthCheckingRef.current && !force) return;
    initStartedRef.current = true;
    isAuthCheckingRef.current = true;
    isAppInitializingRef.current = true;
    lastSessionCheckAtRef.current = now;

    const requestId = authRequestRef.current + 1;
    authRequestRef.current = requestId;
    setLoading(true);
    setAuthError(null);
    if (force) setProfileError(null);

    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error(supabaseConfigError || 'Supabase belum dikonfigurasi.');
      }

      const { data, error } = await withTimeout(supabase.auth.getSession(), 'AUTH_INIT');
      if (!mountedRef.current || requestId !== authRequestRef.current) return;
      if (error) throw error;

      await applySession(data?.session || null, 'initial', { requestId, forceProfile: force });
    } catch (error) {
      if (!mountedRef.current || requestId !== authRequestRef.current) return;
      const handled = handleSupabaseError(error, 'AUTH_INIT');
      const message = getFriendlySupabaseError(error, 'Gagal memuat sesi login. Silakan coba lagi.');
      setAuthError(message);
      if (!handled.keepSession && isAuthSessionError(error)) {
        sessionUserIdRef.current = null;
        setSession(null);
        profileRef.current = null;
        setProfile(null);
        loadedProfileUserIdRef.current = null;
      }
    } finally {
      isAuthCheckingRef.current = false;
      isAppInitializingRef.current = false;
      isAppInitializedRef.current = true;
      if (mountedRef.current && requestId === authRequestRef.current) setLoading(false);
    }
  }, [applySession]);

  const handleAuthStateChange = useCallback((event, nextSession) => {
    if (event === 'INITIAL_SESSION') return;

    const currentUserId = sessionUserIdRef.current;
    const nextUserId = nextSession?.user?.id || null;
    if (event === 'TOKEN_REFRESHED') {
      isRefreshingSessionRef.current = true;
      if (nextSession?.user && currentUserId === nextUserId) {
        sessionUserIdRef.current = nextUserId;
        setSession(nextSession || null);
        window.setTimeout(() => { isRefreshingSessionRef.current = false; }, 0);
        return;
      }
      window.setTimeout(() => { isRefreshingSessionRef.current = false; }, 0);
    }

    const requestId = authRequestRef.current + 1;
    authRequestRef.current = requestId;
    setLoading(true);
    setAuthError(null);

    window.setTimeout(async () => {
      try {
        await applySession(nextSession || null, event, { requestId });
      } catch (error) {
        if (!mountedRef.current || requestId !== authRequestRef.current) return;
        const message = getFriendlySupabaseError(error, 'Gagal memperbarui sesi login. Silakan coba lagi.');
        if (nextSession?.user) setProfileError(message);
        else setAuthError(message);
      } finally {
        if (mountedRef.current && requestId === authRequestRef.current) setLoading(false);
      }
    }, 0);
  }, [applySession]);

  useEffect(() => {
    mountedRef.current = true;
    let subscription;

    if (isSupabaseConfigured && supabase) {
      try {
        const { data } = supabase.auth.onAuthStateChange(handleAuthStateChange);
        subscription = data?.subscription;
      } catch (error) {
        setAuthError(getFriendlySupabaseError(error, 'Gagal memasang listener autentikasi. Silakan coba lagi.'));
      }
    }

    initializeAuth();

    return () => {
      mountedRef.current = false;
      subscription?.unsubscribe();
    };
  }, [handleAuthStateChange, initializeAuth]);

  const value = useMemo(() => ({
    session,
    profile,
    loading,
    authError,
    profileError,
    configError: supabaseConfigError,
    isSupabaseConfigured,
    isAuthChecking: isAuthCheckingRef.current,
    isRefreshingSession: isRefreshingSessionRef.current,
    isAppInitializing: isAppInitializingRef.current,
    isAppInitialized: isAppInitializedRef.current,
    retryAuth: () => initializeAuth({ force: true }),
    retryProfile: async () => {
      if (!session?.user) return null;
      const requestId = authRequestRef.current + 1;
      authRequestRef.current = requestId;
      setLoading(true);
      setProfileError(null);
      try {
        return await loadProfile(session.user.id, { force: true, requestId });
      } finally {
        if (mountedRef.current && requestId === authRequestRef.current) setLoading(false);
      }
    },
    signIn: async (email, password) => {
      if (!isSupabaseConfigured || !supabase) return unavailableClientError();

      const requestId = authRequestRef.current + 1;
      authRequestRef.current = requestId;
      setLoading(true);
      setAuthError(null);
      setProfileError(null);

      try {
        const result = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          'AUTH_SIGN_IN'
        );

        if (result.error) {
          const message = getFriendlySupabaseError(result.error, 'Login gagal. Periksa email dan password lalu coba lagi.');
          if (!isRateLimitError(result.error)) {
            sessionUserIdRef.current = null;
            setSession(null);
            profileRef.current = null;
            setProfile(null);
            loadedProfileUserIdRef.current = null;
          }
          setAuthError(message);
          return { ...result, error: new Error(message) };
        }

        const nextSession = result.data?.session || null;
        await applySession(nextSession, 'sign_in', { requestId, forceProfile: true });
        return result;
      } catch (error) {
        const message = getFriendlySupabaseError(error, 'Login gagal. Silakan coba lagi.');
        if (!isRateLimitError(error)) {
          profileRef.current = null;
          setProfile(null);
        }
        setAuthError(message);
        return { data: null, error: new Error(message) };
      } finally {
        if (mountedRef.current && requestId === authRequestRef.current) setLoading(false);
      }
    },
    signOut: () => {
      if (!isSupabaseConfigured || !supabase) return unavailableClientError();
      loadedProfileUserIdRef.current = null;
      profileRequestUserIdRef.current = null;
      profileRef.current = null;
      setProfile(null);
      sessionUserIdRef.current = null;
      return supabase.auth.signOut();
    }
  }), [applySession, authError, initializeAuth, loadProfile, loading, profile, profileError, session, unavailableClientError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
