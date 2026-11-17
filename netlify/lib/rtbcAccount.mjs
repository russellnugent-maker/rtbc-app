// Account deletion for Run the Beloved Country / Running Passport (phase 5; App Store 5.1.1(v)).
//
// ONE ACCOUNT, ONE DELETION PATH. RTBC, Energy Lab and YNM share one Supabase login, and the shared
// project already has its deletion path: YNM's edge function `ynm-delete-account`
// (ynm-app/supabase/functions/ynm-delete-account). It arms a 7-day grace window, signs the person
// out everywhere, and a nightly purge then anonymises the payment and subscription rows the law
// says must be kept for 5 years, releases the foreign keys that would otherwise block the delete,
// and only then deletes the auth user with the service role, and checks that it is gone. A second,
// RTBC-only hard delete here would skip all of that: the cascade would destroy tax records, or the
// NO ACTION keys would refuse it. So this function does not call deleteUser itself; it
//   GET  → tells the screen what to warn about (read with the service role), and
//   POST → forwards { action: 'request' | 'cancel' } to ynm-delete-account with the runner's own
//          token, so the deletion is the runner's, verified there, never an id we pass.
// What the shared purge does NOT yet do for RTBC (files in rtbc-proofs / rtbc-photos, and
// rtbc_submissions.reviewed_by) is drafted in supabase/drafts/20261117_rtbc_account_deletion.md.
//
// The store app calls this cross-origin (capacitor://localhost on iOS, https://localhost on
// Android), so it answers CORS for exactly those two origins. The website calls it same-origin.

export const APP_ORIGINS = ['capacitor://localhost', 'https://localhost']

// Runner-facing wording only: never a status code, a URL or another service's message.
export const MSG = {
  signIn: 'Please sign in again.',
  context: 'We couldn’t check your account just now. Please try again.',
  failed: 'Your account couldn’t be deleted just now. Please try again, or email support@energylabapp.co.za.',
  restoreFailed: 'Your account couldn’t be restored just now. Please try again, or email support@energylabapp.co.za.',
  bad: 'Something went wrong. Please try again.',
}

export function corsHeaders(origin) {
  if (!APP_ORIGINS.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

/**
 * deps:
 *   userFromToken(token)  → { id } | null
 *   readContext(userId)   → { deletion_scheduled_for, club_member, ynm_subscription_source } (throws on failure)
 *   forward(action, token) → { ok, status, body }  (the shared ynm-delete-account answer)
 *   log(msg, detail)
 */
export async function handleAccount(req, deps) {
  const cors = corsHeaders(req.headers.get('origin'))
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: MSG.bad }, 405)

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const user = token ? await deps.userFromToken(token).catch(() => null) : null
  if (!user?.id) return json({ error: MSG.signIn }, 401)

  if (req.method === 'GET') {
    try {
      const c = await deps.readContext(user.id)
      return json({
        deletion_scheduled_for: c.deletion_scheduled_for || null,
        club_member: !!c.club_member,
        // 'apple' | 'google' | 'payfast' | … — the screen words the warning by where it is billed.
        ynm_subscription: c.ynm_subscription_source ? { source: String(c.ynm_subscription_source).toLowerCase() } : null,
      })
    } catch (e) {
      deps.log('context read failed', { user: user.id, e: String(e?.message || e) })
      return json({ error: MSG.context }, 502)
    }
  }

  let body
  try { body = await req.json() } catch { return json({ error: MSG.bad }, 400) }
  const action = body?.action
  if (action !== 'request' && action !== 'cancel') return json({ error: MSG.bad }, 400)

  let out
  try { out = await deps.forward(action, token) } catch (e) { out = { ok: false, status: 0, body: { error: String(e?.message || e) } } }
  if (!out.ok) {
    deps.log(`ynm-delete-account ${action} failed`, { user: user.id, status: out.status, body: out.body })
    return json({ error: action === 'request' ? MSG.failed : MSG.restoreFailed }, 502)
  }
  return json({
    ok: true,
    scheduled_for: out.body?.scheduled_for || null,
    already_scheduled: !!out.body?.already_scheduled,
  })
}
