// POST /.netlify/functions/rtbc-payfast-itn  (PayFast Instant Transaction Notification)
// Checks: signature, PayFast's own validate endpoint, amount, status. Then records
// the payment in payfast_payments and activates the passport. Safe to retry.
import { createClient } from '@supabase/supabase-js'
import { pfHost, paramString, signature } from '../lib/payfast.mjs'

const ok = () => new Response('OK', { status: 200 })

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const raw = await req.text()
  const pairs = [...new URLSearchParams(raw).entries()]
  const data = Object.fromEntries(pairs)
  const log = (msg, extra = {}) => console.log(JSON.stringify({ itn: msg, m_payment_id: data.m_payment_id, pf_payment_id: data.pf_payment_id, ...extra }))

  // 1. Signature (fields in the order PayFast sent them, minus the signature)
  const unsigned = pairs.filter(([k]) => k !== 'signature')
  if (signature(unsigned, Netlify.env.get('PAYFAST_PASSPHRASE')) !== data.signature) {
    log('bad signature'); return new Response('Bad signature', { status: 400 })
  }

  // 2. Ask PayFast to confirm the notification is genuine
  try {
    const v = await fetch(`https://${pfHost()}/eng/query/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: paramString(unsigned),
    })
    if ((await v.text()).trim() !== 'VALID') { log('not valid per PayFast'); return new Response('Invalid', { status: 400 }) }
  } catch (e) { log('validate call failed', { e: String(e) }); return new Response('Retry', { status: 500 }) }

  if (data.custom_str1 !== 'rtbc_entry') { log('not an RTBC payment'); return ok() }
  if (data.payment_status !== 'COMPLETE') { log('status not complete', { status: data.payment_status }); return ok() }
  if (data.merchant_id !== Netlify.env.get('PAYFAST_MERCHANT_ID')) { log('wrong merchant'); return new Response('Bad merchant', { status: 400 }) }

  const sb = createClient(
    Netlify.env.get('SUPABASE_URL') || Netlify.env.get('VITE_SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )

  // 3. Amount must match what this passport was quoted
  const { data: pp } = await sb.from('rtbc_passports').select('id, status, entry_fee_cents').eq('id', data.m_payment_id).maybeSingle()
  if (!pp) { log('unknown passport'); return ok() }
  const gross = Math.round(Number(data.amount_gross) * 100)
  if (gross !== pp.entry_fee_cents) { log('amount mismatch', { gross, expected: pp.entry_fee_cents }); return ok() }

  // 4. Record the payment (idempotent on pf_payment_id) and activate
  const fee = Math.abs(Math.round(Number(data.amount_fee || 0) * 100))
  const { error: payErr } = await sb.from('payfast_payments').upsert({
    pf_payment_id: data.pf_payment_id, source_key: `rtbc_entry:${pp.id}`,
    gross_cents: gross, fee_cents: fee, net_cents: Math.round(Number(data.amount_net || 0) * 100),
  }, { onConflict: 'pf_payment_id', ignoreDuplicates: true })
  if (payErr) { log('payment insert failed', { e: payErr.message }); return new Response('Retry', { status: 500 }) }

  const { error: actErr } = await sb.rpc('rtbc_activate_passport', { p_passport_id: pp.id })
  if (actErr) { log('activate failed', { e: actErr.message }); return new Response('Retry', { status: 500 }) }

  log('activated')
  return ok()
}
