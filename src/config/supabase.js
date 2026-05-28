import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://auzbecwawoejvlfszvdo.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'ISI_ANON_PUBLIC_KEY_SUPABASE_SAYA';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('[Supabase] Environment variables are missing. Using fallback values.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
