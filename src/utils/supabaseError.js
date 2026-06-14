export const RATE_LIMIT_MESSAGE = 'Server sedang sibuk karena terlalu banyak request. Tunggu sebentar lalu coba lagi.';
const NETWORK_MESSAGE = 'Koneksi ke server bermasalah. Data terakhir tetap dipertahankan, coba lagi sebentar.';
const FORBIDDEN_MESSAGE = 'Tidak punya akses untuk aksi ini.';
let lastRateLimitWarningAt = 0;
let lastNetworkWarningAt = 0;

export function isRateLimitError(error) {
  if (!error) return false;
  const status = error.status || error.statusCode || error?.response?.status;
  const code = String(error.code || error.error_code || '').toLowerCase();
  const message = String(error.message || error.error_description || error.details || '').toLowerCase();
  return status === 429 || code === '429' || code.includes('rate') || message.includes('429') || message.includes('rate limit') || message.includes('rate_limit') || message.includes('too many requests');
}

export function isAuthSessionError(error) {
  const status = error?.status || error?.statusCode || error?.response?.status;
  const code = String(error?.code || error?.error_code || '').toLowerCase();
  const message = String(error?.message || error?.error_description || error?.details || '').toLowerCase();
  return status === 401 || code.includes('session_not_found') || code.includes('invalid_token') || message.includes('session_not_found') || message.includes('invalid token') || message.includes('refresh token not found') || message.includes('invalid refresh token');
}

export function isNetworkError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('failed to fetch') || message.includes('network') || message.includes('timeout');
}

export function getFriendlySupabaseError(error, fallback = 'Terjadi kesalahan saat mengambil data Supabase.') {
  if (isRateLimitError(error)) return RATE_LIMIT_MESSAGE;
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  if ((error?.status || error?.code) === 403 || error?.code === '42501') return FORBIDDEN_MESSAGE;
  return error?.message || fallback;
}

export function handleSupabaseError(error, context = 'Supabase', options = {}) {
  const message = getFriendlySupabaseError(error, options.fallback);
  const now = Date.now();
  if (isRateLimitError(error)) {
    if (now - lastRateLimitWarningAt > 30000) {
      lastRateLimitWarningAt = now;
      options.onWarning?.(RATE_LIMIT_MESSAGE);
    }
  } else if (isNetworkError(error)) {
    if (now - lastNetworkWarningAt > 30000) {
      lastNetworkWarningAt = now;
      options.onWarning?.(NETWORK_MESSAGE);
    }
  }
  console.warn(`[${context}]`, error?.message || error);
  return { message, shouldRedirectLogin: isAuthSessionError(error) && !isRateLimitError(error) && !isNetworkError(error), keepSession: isRateLimitError(error) || isNetworkError(error) };
}

export async function safeSupabaseQuery(fn, options = {}) {
  try {
    const result = await fn();
    if (result?.error) throw result.error;
    return result;
  } catch (error) {
    const handled = handleSupabaseError(error, options.context || 'Supabase query', options);
    if (options.silent) return { data: options.fallbackData ?? null, error, handled };
    throw Object.assign(new Error(handled.message), { cause: error, handled });
  }
}
