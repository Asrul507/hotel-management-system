export const RATE_LIMIT_MESSAGE = 'Terlalu banyak request ke server. Tunggu beberapa menit lalu coba lagi.';

export function isRateLimitError(error) {
  if (!error) return false;

  const status = error.status || error.statusCode || error?.response?.status;
  const code = String(error.code || error.error_code || '').toLowerCase();
  const message = String(error.message || error.error_description || error.details || '').toLowerCase();

  return status === 429
    || code === '429'
    || code.includes('rate')
    || message.includes('429')
    || message.includes('rate limit')
    || message.includes('rate_limit')
    || message.includes('too many requests');
}

export function getFriendlySupabaseError(error, fallback = 'Terjadi kesalahan saat mengambil data Supabase.') {
  if (isRateLimitError(error)) return RATE_LIMIT_MESSAGE;
  return error?.message || fallback;
}
