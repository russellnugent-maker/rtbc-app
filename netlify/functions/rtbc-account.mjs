// GET/POST /.netlify/functions/rtbc-account: account deletion for the RTBC web app and the store
// app. Everything that matters is in ../lib/rtbcAccount.mjs (why it forwards to the shared
// ynm-delete-account rather than deleting the user itself).
import { createClient } from '@supabase/supabase-js'
import { handleAccount } from '../lib/rtbcAccount.mjs'

// The same public (publishable) key the browser app uses; safe to ship, RLS protects the data.
const PUBLISHABLE_KEY = 'sb_publishable_puPVoTgeoARJ9tPF1L4nkA_aUaDBZpj'

export default async (req) => {
  const url = Netlify.env.get('SUPABASE_URL') || Netlify.env.get('VITE_SUPABASE_URL')
  const anon = Netlify.env.get('SUPABASE_ANON_KEY') || Netlify.env.get('VITE_SUPABASE_PUBLISHABLE_KEY') || PUBLISHABLE_KEY
  const sb = createClient(url, Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

  return handleAccount(req, {
    userFromToken: async (token) => {
      const { data, error } = await sb.auth.getUser(token)
      return error ? null : data?.user || null
    },
    readContext: async (userId) => {
      const [prof, mem, sub] = await Promise.all([
        sb.from('profiles').select('deletion_scheduled_for').eq('id', userId).maybeSingle(),
        sb.from('memberships').select('id').eq('user_id', userId).eq('status', 'active').limit(1).maybeSingle(),
        sb.from('ynm_subscriptions').select('source').eq('user_id', userId).eq('status', 'active').limit(1).maybeSingle(),
      ])
      const err = prof.error || mem.error || sub.error
      if (err) throw new Error(err.message)
      return {
        deletion_scheduled_for: prof.data?.deletion_scheduled_for,
        club_member: !!mem.data,
        ynm_subscription_source: sub.data ? (sub.data.source || 'unknown') : null,
      }
    },
    forward: async (action, token) => {
      const r = await fetch(`${url}/functions/v1/ynm-delete-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await r.json().catch(() => ({}))
      return { ok: r.ok && body?.ok !== false, status: r.status, body }
    },
    log: (msg, detail) => console.error(`[rtbc-account] ${msg}`, JSON.stringify(detail)),
  })
}
