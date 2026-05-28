import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://auzbecwawoejvlfszvdo.supabase.co'

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1emJlY3dhd29lanZsZnN6dmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NTE1MzIsImV4cCI6MjA5NTUyNzUzMn0.E-Br-wHWSZ2CMfsNjfIeFNiou21tEP5T_MsIiYUKJWQ'

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('Supabase env variables are missing. Using fallback hardcoded public anon config.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
