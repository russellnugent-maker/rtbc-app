import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { NATIVE } from '../lib/platform.js'
import { functionUrl } from '../lib/routes.js'
import { passportNo, fmtDate } from '../lib/provinces.js'
import { clearSnapshot, nativeStore } from '../lib/offline.js'

// Delete my account (phase 5; App Store 5.1.1(v)). The deletion itself is the shared one for
// RTBC, Energy Lab and YNM (netlify/lib/rtbcAccount.mjs explains why): a 7-day window, then a
// purge. This screen's job is to say plainly what goes, and to stop a runner deleting while a
// subscription would keep billing them without their knowing.
export const CONFIRM_WORD = 'DELETE'

const call = async (session, method, body) => {
  const r = await fetch(functionUrl('rtbc-account', { native: NATIVE }), {
    method,
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const out = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(out.error || 'Something went wrong. Please try again.')
  return out
}

function SubscriptionWarning({ source }) {
  const where = source === 'apple'
    ? <>in <b>Settings → your name → Subscriptions</b> on your iPhone</>
    : source === 'google'
      ? <>in <b>Google Play → Payments &amp; subscriptions → Subscriptions</b></>
      : <>in Your Next Move, or email <a href="mailto:support@energylabapp.co.za">support@energylabapp.co.za</a></>
  return (
    <div className="warn-box" data-ynm-sub-warning>
      <strong>You have an active Your Next Move subscription.</strong> Deleting your account does not
      cancel it, and you would keep being billed. Cancel it first, {where}.
    </div>
  )
}

export default function DeleteAccount({ session, passport }) {
  const [ctx, setCtx] = useState(null)        // what to warn about (GET rtbc-account)
  const [ctxError, setCtxError] = useState('')
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [scheduled, setScheduled] = useState(null) // just requested: the date it will happen

  const load = useCallback(() => {
    setCtxError('')
    call(session, 'GET').then(setCtx, (e) => setCtxError(e.message))
  }, [session])
  useEffect(() => { load() }, [load])

  const request = async () => {
    setBusy(true); setError('')
    try {
      const out = await call(session, 'POST', { action: 'request' })
      if (NATIVE) await clearSnapshot(await nativeStore())
      setScheduled(out.scheduled_for)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const restore = async () => {
    setBusy(true); setError('')
    try {
      await call(session, 'POST', { action: 'cancel' })
      setCtx({ ...ctx, deletion_scheduled_for: null })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  // Just requested: the shared function has already signed this account out everywhere.
  if (scheduled) {
    return (
      <div className="card danger-card" data-delete-scheduled>
        <h2>Account scheduled for deletion</h2>
        <p>Your account will be permanently deleted on <b>{fmtDate(scheduled)}</b>. If you change your mind, sign in again before then and choose Restore my account.</p>
        <button className="btn block" onClick={() => supabase.auth.signOut({ scope: 'local' })}>OK</button>
      </div>
    )
  }

  // Signed back in during the 7 days: offer the way back first.
  if (ctx?.deletion_scheduled_for) {
    return (
      <div className="card danger-card" data-delete-pending>
        <h2>Your account is scheduled for deletion</h2>
        <p>Everything will be permanently deleted on <b>{fmtDate(ctx.deletion_scheduled_for)}</b>. Nothing has been deleted yet, so you can still stop it.</p>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn block" onClick={restore} disabled={busy}>{busy ? 'Please wait…' : 'Restore my account'}</button>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="card danger-card" data-delete-panel>
        <h2>Delete my account</h2>
        <p className="small">Permanently delete your account, your passport and your results.</p>
        <button className="btn danger block" onClick={() => setOpen(true)}>Delete my account</button>
      </div>
    )
  }

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD && ctx && !busy
  return (
    <div className="card danger-card" data-delete-panel data-open>
      <h2>Delete my account</h2>

      <div className="warn-box" data-shared-login-warning>
        <strong>This also removes your Energy Lab and Your Next Move login.</strong> Run the Beloved
        Country, Energy Lab and Your Next Move use one account, so it can’t be deleted for one of them only.
        {ctx?.club_member && <> Your Energy Lab club membership and its history go with it.</>}
      </div>

      {ctx?.ynm_subscription && <SubscriptionWarning source={ctx.ynm_subscription.source} />}

      <p>
        {passport?.passport_no ? <>Your race passport {passportNo(passport.passport_no)}, your</> : 'Your'} results,
        certificates and photos are deleted, along with everything in Energy Lab and Your Next Move.
        You’ll be signed out straight away.
      </p>
      <p><b>You have 7 days to change your mind.</b> Nothing is deleted until then: sign in again during that week and you can restore your account. After that it can’t be recovered.</p>
      <p className="small muted">Payment records are kept with your name and contact details removed. The law requires us to keep them for five years.</p>

      {ctxError && (
        <div className="error" role="alert">{ctxError} <button className="link-btn" onClick={load}>Try again</button></div>
      )}

      <label htmlFor="confirm-delete">Type <b>{CONFIRM_WORD}</b> to confirm</label>
      <input id="confirm-delete" type="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off"
        value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} />
      {error && <div className="error" role="alert">{error}</div>}
      <button className="btn danger block" style={{ marginTop: 14 }} disabled={!armed} onClick={request}>
        {busy ? 'Deleting…' : 'Delete my account'}
      </button>
      <button className="btn secondary block" style={{ marginTop: 8 }} disabled={busy}
        onClick={() => { setOpen(false); setTyped(''); setError('') }}>Cancel</button>
    </div>
  )
}
