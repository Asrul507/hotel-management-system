export const RATE_LIMIT_MESSAGE = 'Server sedang sibuk karena terlalu banyak request. Tunggu sebentar lalu coba lagi.';
const NETWORK_MESSAGE = 'Koneksi ke server bermasalah. Data terakhir tetap dipertahankan, coba lagi sebentar.';
const FORBIDDEN_MESSAGE = 'Tidak punya akses untuk aksi ini.';
const NOT_FOUND_MESSAGE = 'Data tidak ditemukan atau sudah tidak tersedia.';
let lastRateLimitWarningAt = 0;
let lastNetworkWarningAt = 0;
let lastNotFoundWarningAt = 0;

export function getErrorStatus(error) {
  return error?.status || error?.statusCode || error?.response?.status || Number(error?.code) || 0;
}

export function isRateLimitError(error) {
  if (!error) return false;
  const status = getErrorStatus(error);
  const code = String(error.code || error.error_code || '').toLowerCase();
  const message = String(error.message || error.error_description || error.details || '').toLowerCase();
  return status === 429 || code === '429' || code.includes('rate') || message.includes('429') || message.includes('rate limit') || message.includes('rate_limit') || message.includes('too many requests');
}

export function isAuthRateLimitError(error) {
  const message = String(error?.message || error?.error_description || error?.details || '').toLowerCase();
  const url = String(error?.url || error?.endpoint || '').toLowerCase();
  return isRateLimitError(error) && (url.includes('/auth/v1/token') || message.includes('refresh_token') || message.includes('grant_type') || message.includes('too many requests'));
}

export function isNotFoundOrNotAcceptableError(error) {
  const status = getErrorStatus(error);
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || error?.details || '').toLowerCase();
  return status === 406 || code === 'pgrst116' || message.includes('json object requested') || message.includes('not acceptable');
}

export function isAuthSessionError(error) {
  const code = String(error?.code || error?.error_code || '').toLowerCase();
  const message = String(error?.message || error?.error_description || error?.details || '').toLowerCase();
  return code.includes('session_not_found') || code.includes('invalid_token') || code.includes('invalid_refresh_token') || message.includes('session_not_found') || message.includes('refresh token not found') || message.includes('invalid refresh token') || message.includes('jwt expired') || message.includes('invalid jwt');
}

export function shouldLogoutForAuthError(error) {
  if (!error || isRateLimitError(error) || isNotFoundOrNotAcceptableError(error) || isNetworkError(error)) return false;
  return isAuthSessionError(error);
}

export function isNetworkError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('failed to fetch') || message.includes('network') || message.includes('timeout');
}

export function getFriendlySupabaseError(error, fallback = 'Terjadi kesalahan saat mengambil data Supabase.') {
  if (isRateLimitError(error)) return RATE_LIMIT_MESSAGE;
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  if (isNotFoundOrNotAcceptableError(error)) return NOT_FOUND_MESSAGE;
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
  } else if (isNotFoundOrNotAcceptableError(error)) {
    if (now - lastNotFoundWarningAt > 30000) {
      lastNotFoundWarningAt = now;
      options.onWarning?.(NOT_FOUND_MESSAGE);
    }
  }
  console.warn(`[${context}]`, error?.message || error);
  return { message, shouldRedirectLogin: shouldLogoutForAuthError(error), keepSession: !shouldLogoutForAuthError(error) };
}

export async function safeSupabaseQuery(fn, options = {}) {
  try {
    const result = await fn();
    if (result?.error) throw result.error;
    return result;
  } catch (error) {
    const handled = handleSupabaseError(error, options.context || 'Supabase query', options);
    if (options.silent || isRateLimitError(error) || isNotFoundOrNotAcceptableError(error) || getErrorStatus(error) === 401 || getErrorStatus(error) === 403) {
      return { data: options.fallbackData ?? null, error, handled };
    }
    throw Object.assign(new Error(handled.message), { cause: error, handled });
  }
}
