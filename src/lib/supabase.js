import { createClient } from '@supabase/supabase-js'

// Shared Energy Lab / YNM Supabase project. The publishable key is safe in the
// browser: every RTBC table is protected by row level security.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://lkazcbvczleavcwlosrx.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_puPVoTgeoARJ9tPF1L4nkA_aUaDBZpj'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
