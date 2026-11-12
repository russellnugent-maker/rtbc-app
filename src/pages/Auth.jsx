import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

const redirectTo = () => `${window.location.origin}/app/`

export default function Auth() {
  const [mode, setMode] = useState('signup') // signup | signin | reset
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: redirectTo(), data: { full_name: name.trim(), app_source: 'rtbc' } },
        })
        if (error) throw error
        if (!data.session) setNotice('Check your email and tap the link to confirm your account. Then come back here and sign in.')
      } else if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() })
        if (error) throw error
        setNotice('If that email has an account, a reset link is on its way.')
      }
    } catch (err) {
      setError(friendly(err))
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="card dark">
        <h1>Your race passport</h1>
        <p>Nine provinces. Nine races. One beloved country. Your passport lives here, and each province stamp unlocks when your result is verified.</p>
        <p className="small" style={{ marginBottom: 0, color: '#CFC4A6' }}>
          Already use Energy Lab or Your Next Move? Sign in with the same email and password.
        </p>
      </div>
      <div className="card">
        {mode !== 'reset' && (
          <div className="segment" role="tablist">
            <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>Create account</button>
            <button type="button" className={mode === 'signin' ? 'on' : ''} onClick={() => setMode('signin')}>Sign in</button>
          </div>
        )}
        {mode === 'reset' && <h2>Reset your password</h2>}
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <label htmlFor="name">Full name</label>
              <input id="name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </>
          )}
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {mode !== 'reset' && (
            <>
              <label htmlFor="pw">Password</label>
              <input id="pw" type="password" minLength={8} required
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} />
              {mode === 'signup' && <div className="hint">At least 8 characters.</div>}
            </>
          )}
          {error && <div className="error">{error}</div>}
          {notice && <div className="notice">{notice}</div>}
          <button className="btn block" style={{ marginTop: 16 }} disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'signin' ? 'Sign in' : 'Send reset link'}
          </button>
        </form>
        <p className="center small" style={{ marginTop: 14, marginBottom: 0 }}>
          {mode === 'reset'
            ? <a href="#" onClick={(e) => { e.preventDefault(); setMode('signin') }}>Back to sign in</a>
            : <a href="#" onClick={(e) => { e.preventDefault(); setMode('reset') }}>Forgot your password?</a>}
        </p>
      </div>
      <p className="center small muted">
        <a href="/">About the challenge</a> · Presented by Energy Lab Athletic Company
      </p>
    </>
  )
}

function friendly(err) {
  const m = String(err?.message || err)
  if (/invalid login/i.test(m)) return 'That email and password don’t match. Try again, or reset your password.'
  if (/already registered/i.test(m)) return 'That email already has an account. Sign in instead.'
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox for the link.'
  return m
}
