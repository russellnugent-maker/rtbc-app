import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { NATIVE } from '../lib/platform.js'
import { authRedirectUrl, WEB_ORIGIN, webAppUrl } from '../lib/routes.js'
import { friendlyAuthError, isNoAccountForOtp, normaliseCode } from '../lib/authErrors.js'
import { landingLinkError } from '../lib/authLanding.js'
import { OTP_LENGTH, codeLabel } from '../lib/authConfig.js'

// Sign-in (build spec §2, Login). Web: create account, password, magic link, reset. App: password
// or an emailed code (OTP_LENGTH digits, src/lib/authConfig.js), and reset; no account creation (the app never creates accounts).
const redirectTo = () => authRedirectUrl({ native: NATIVE, origin: window.location.origin, base: import.meta.env.BASE_URL })

// signup | signin | link (web) | code (app) | reset
export default function Auth() {
  const [mode, setMode] = useState(NATIVE ? 'signin' : 'signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(landingLinkError || '')
  const [notice, setNotice] = useState('')

  const go = (m) => { setMode(m); setError(''); setNotice(''); setCodeSent(false); setCode('') }

  // A code or link for an email: shouldCreateUser false, so it never makes an account. An email
  // with no account gets the same notice as one that has one.
  const sendOtp = async (withLink) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, ...(withLink ? { emailRedirectTo: redirectTo() } : {}) },
    })
    if (error && !isNoAccountForOtp(error)) throw error
  }

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    try {
      if (!NATIVE && mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: redirectTo(), data: { full_name: name.trim(), app_source: 'rtbc' } },
        })
        if (error) throw error
        if (!data.session) setNotice('Check your email and tap the link to confirm your account. Then come back here and sign in.')
      } else if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else if (!NATIVE && mode === 'link') {
        await sendOtp(true)
        setNotice('If that email has an account, a sign-in link is on its way. Open it on this device.')
      } else if (mode === 'code' && !codeSent) {
        await sendOtp(false)
        setCodeSent(true)
        setNotice(`If that email has an account, ${codeLabel()} is on its way.`)
      } else if (mode === 'code') {
        const { digits, valid } = normaliseCode(code, OTP_LENGTH)
        if (!valid) { setError(`Enter the ${OTP_LENGTH} digits from the email.`); return }
        const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: digits, type: 'email' })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() })
        if (error) throw error
        setNotice(NATIVE
          ? 'If that email has an account, a reset link is on its way. It opens the website; set your new password there, then sign in here.'
          : 'If that email has an account, a reset link is on its way.')
      }
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally { setBusy(false) }
  }

  const label = busy ? 'Please wait…'
    : !NATIVE && mode === 'signup' ? 'Create account'
    : mode === 'signin' ? 'Sign in'
    : !NATIVE && mode === 'link' ? 'Email me a sign-in link'
    : mode === 'code' ? (codeSent ? 'Sign in' : 'Email me a code')
    : 'Send reset link'

  return (
    <>
      <div className="card dark">
        <h1>Your race passport</h1>
        <p>Nine provinces. Nine races. One beloved country. Your passport lives here, and each province stamp unlocks when your result is verified.</p>
        <p className="small" style={{ marginBottom: 0, color: '#CFC4A6' }}>
          Already use Energy Lab or Your Next Move? Sign in with the same email and password.
        </p>
      </div>
      <div className="card" data-auth-mode={mode}>
        {!NATIVE && (mode === 'signup' || mode === 'signin') && (
          <div className="segment" role="tablist">
            <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => go('signup')}>Create account</button>
            <button type="button" className={mode === 'signin' ? 'on' : ''} onClick={() => go('signin')}>Sign in</button>
          </div>
        )}
        {NATIVE && mode === 'signin' && <h2>Sign in</h2>}
        {mode === 'reset' && <h2>Reset your password</h2>}
        {!NATIVE && mode === 'link' && <h2>Sign in with an email link</h2>}
        {NATIVE && mode === 'code' && <h2>Sign in with an email code</h2>}
        <form onSubmit={submit}>
          {!NATIVE && mode === 'signup' && (
            <>
              <label htmlFor="name">Full name</label>
              <input id="name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </>
          )}
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} readOnly={mode === 'code' && codeSent}
            onChange={(e) => setEmail(e.target.value)} />
          {(mode === 'signup' || mode === 'signin') && (
            <>
              <label htmlFor="pw">Password</label>
              <input id="pw" type="password" minLength={8} required
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} />
              {mode === 'signup' && <div className="hint">At least 8 characters.</div>}
            </>
          )}
          {mode === 'code' && codeSent && (
            <>
              <label htmlFor="code">{OTP_LENGTH}-digit code</label>
              <input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" required
                className="code-input" value={code} onChange={(e) => { setCode(normaliseCode(e.target.value, OTP_LENGTH).digits); setError('') }} />
            </>
          )}
          {error && <div className="error" role="alert">{error}</div>}
          {notice && <div className="notice">{notice}</div>}
          <button className="btn block" style={{ marginTop: 16 }} disabled={busy}>{label}</button>
        </form>
        <p className="center small" style={{ marginTop: 14, marginBottom: 0, display: 'grid', gap: 8 }}>
          {mode === 'signin' && (NATIVE
            ? <a href="#" onClick={(e) => { e.preventDefault(); go('code') }}>Email me {codeLabel()} instead</a>
            : <a href="#" onClick={(e) => { e.preventDefault(); go('link') }}>Email me a sign-in link instead</a>)}
          {mode === 'code' && codeSent && (
            <a href="#" onClick={(e) => { e.preventDefault(); setCodeSent(false); setCode(''); setNotice('') }}>Send a new code</a>
          )}
          {(mode === 'signup' || mode === 'signin')
            ? <a href="#" onClick={(e) => { e.preventDefault(); go('reset') }}>Forgot your password?</a>
            : <a href="#" onClick={(e) => { e.preventDefault(); go('signin') }}>Back to sign in</a>}
        </p>
      </div>
      {NATIVE ? (
        <p className="center small muted" data-enter-on-web>
          No passport yet? Enter at <a href={webAppUrl('/')} target="_blank" rel="noopener noreferrer">runthebelovedcountry.netlify.app</a>
        </p>
      ) : (
        <p className="center small muted">
          <a href="/">About the challenge</a> · Presented by Energy Lab Athletic Company
        </p>
      )}
      {NATIVE && <p className="center small muted">Presented by Energy Lab Athletic Company · <a href={WEB_ORIGIN} target="_blank" rel="noopener noreferrer">About the challenge</a></p>}
    </>
  )
}
