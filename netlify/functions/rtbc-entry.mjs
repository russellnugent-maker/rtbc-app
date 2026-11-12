// POST /.netlify/functions/rtbc-entry
// Creates (or refreshes) the runner's pending passport and returns the signed
// PayFast form fields. The passport is only activated by the ITN, never here.
import { createClient } from '@supabase/supabase-js'
import { pfHost, signature } from '../lib/payfast.mjs'

const json = (body, status = 200) => Response.json(body, { status })

const ageOn = (dob, on = new Date()) => {
  const d = new Date(dob)
  let a = on.getFullYear() - d.getFullYear()
  const m = on.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && on.getDate() < d.getDate())) a--
  return a
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const fee = Number(Netlify.env.get('RTBC_ENTRY_FEE_CENTS'))
  const merchantId = Netlify.env.get('PAYFAST_MERCHANT_ID')
  const merchantKey = Netlify.env.get('PAYFAST_MERCHANT_KEY')
  if (!Number.isInteger(fee) || fee <= 0 || !merchantId || !merchantKey)
    return json({ error: 'Entries open soon. We’ll email you the moment they do.' }, 503)

  const sb = createClient(
    Netlify.env.get('SUPABASE_URL') || Netlify.env.get('VITE_SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: u, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !u?.user) return json({ error: 'Please sign in again.' }, 401)
  const user = u.user
  if (!user.email_confirmed_at) return json({ error: 'Please confirm your email address first.' }, 403)

  // While PayFast is in sandbox (test money), only listed test accounts may enter,
  // so nobody can get a real passport with a fake payment.
  if (Netlify.env.get('PAYFAST_SANDBOX') === 'true') {
    const testers = (Netlify.env.get('RTBC_TEST_EMAILS') || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)
    if (!testers.includes(String(user.email).toLowerCase()))
      return json({ error: 'Entries open soon. We’ll email you the moment they do.' }, 503)
  }

  let b
  try { b = await req.json() } catch { return json({ error: 'Bad request' }, 400) }

  const name = String(b.name_on_passport || '').trim()
  const dob = String(b.date_of_birth || '')
  if (name.length < 2 || name.length > 80) return json({ error: 'Enter the name for your passport.' }, 400)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || isNaN(new Date(dob))) return json({ error: 'Enter a valid date of birth.' }, 400)
  const age = ageOn(dob)
  if (age < 16 || age > 110) return json({ error: 'Runners must be at least 16 to enter.' }, 400)
  const minor = age < 18
  const gName = minor ? String(b.guardian_name || '').trim() : null
  const gEmail = minor ? String(b.guardian_email || '').trim().toLowerCase() : null
  if (minor && (!gName || !/^\S+@\S+\.\S+$/.test(gEmail) || b.guardian_consent !== true))
    return json({ error: 'A parent or guardian’s name, email and consent are needed for 16–17-year-olds.' }, 400)
  const terms = String(b.terms_version || '').slice(0, 40)
  if (!terms) return json({ error: 'Please accept the terms.' }, 400)
  const ref = b.referral_code && /^[a-z0-9-]{2,40}$/.test(b.referral_code) ? b.referral_code : null

  const now = new Date().toISOString()
  const row = {
    user_id: user.id, name_on_passport: name, date_of_birth: dob,
    guardian_name: gName, guardian_email: gEmail, guardian_consent_at: minor ? now : null,
    terms_version: terms, terms_accepted_at: now, entry_fee_cents: fee,
    referral_code: ref, leaderboard_consent: b.leaderboard_consent === true,
  }

  // One live passport per runner: reuse a pending one, refuse if already active.
  const { data: existing } = await sb.from('rtbc_passports').select('id, status')
    .eq('user_id', user.id).in('status', ['pending_payment', 'active']).maybeSingle()
  if (existing?.status === 'active') return json({ error: 'You already have an active passport.' }, 409)

  let passportId = existing?.id
  if (passportId) {
    const { error } = await sb.from('rtbc_passports').update(row).eq('id', passportId)
    if (error) return json({ error: 'Could not save your entry.' }, 500)
  } else {
    const { data, error } = await sb.from('rtbc_passports').insert(row).select('id').single()
    if (error) return json({ error: 'Could not save your entry.' }, 500)
    passportId = data.id
  }

  const origin = new URL(req.url).origin
  const [first, ...rest] = name.split(/\s+/)
  const pairs = [
    ['merchant_id', merchantId],
    ['merchant_key', merchantKey],
    ['return_url', `${origin}/app/?paid=1`],
    ['cancel_url', `${origin}/app/enter`],
    ['notify_url', `${origin}/.netlify/functions/rtbc-payfast-itn`],
    ['name_first', first],
    ['name_last', rest.join(' ') || first],
    ['email_address', user.email],
    ['m_payment_id', passportId],
    ['amount', (fee / 100).toFixed(2)],
    ['item_name', 'Run the Beloved Country entry'],
    ['item_description', 'Digital race passport and result verification'],
    ['custom_str1', 'rtbc_entry'],
  ]
  const fields = Object.fromEntries(pairs.filter(([, v]) => v !== '' && v != null))
  fields.signature = signature(pairs, Netlify.env.get('PAYFAST_PASSPHRASE'))

  return json({ payfast_url: `https://${pfHost()}/eng/process`, fields })
}
