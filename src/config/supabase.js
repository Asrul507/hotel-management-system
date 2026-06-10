import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || ''

function getSupabaseConfigError() {
  if (!supabaseUrl && !supabaseAnonKey) {
    return 'Supabase belum dikonfigurasi. Set VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di environment aplikasi.'
  }

  if (!supabaseUrl) {
    return 'VITE_SUPABASE_URL belum dikonfigurasi di environment aplikasi.'
  }

  if (!supabaseAnonKey) {
    return 'VITE_SUPABASE_ANON_KEY belum dikonfigurasi di environment aplikasi.'
  }

  if (!supabaseUrl.startsWith('https://')) {
    return 'VITE_SUPABASE_URL tidak valid. Gunakan URL Supabase yang diawali https://.'
  }

  return ''
}

export const supabaseConfigError = getSupabaseConfigError()
export const isSupabaseConfigured = !supabaseConfigError

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError || 'Supabase belum dikonfigurasi.')
  }

  return supabase
}
