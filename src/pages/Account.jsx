import { useState } from 'react'
import { useApp } from '../App.jsx'
import { supabase } from '../lib/supabase.js'
import { passportNo } from '../lib/provinces.js'
import { friendlyAuthError } from '../lib/authErrors.js'

// /account (build spec §2 route map). Phase 1: who is signed in, change password, sign out.
// Account deletion is phase 5 (a Netlify function with the service role, never the client).
export default function Account() {
  const { session, profile, passport } = useApp()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const changePassword = async (e) => {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setPassword('')
      setNotice('Password changed. It is the same login for Energy Lab and Your Next Move.')
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally { setBusy(false) }
  }

  return (
    <>
      <h1>Account</h1>
      <div className="card">
        <dl className="kv">
          {profile?.full_name && <><dt>Name</dt><dd>{profile.full_name}</dd></>}
          <dt>Email</dt><dd>{session.user.email}</dd>
          {passport?.passport_no && <><dt>Passport</dt><dd>{passportNo(passport.passport_no)}</dd></>}
        </dl>
        <p className="small muted" style={{ marginBottom: 0 }}>One login for Run the Beloved Country, Energy Lab and Your Next Move.</p>
      </div>
      <div className="card">
        <h2>Change password</h2>
        <form onSubmit={changePassword}>
          <label htmlFor="newpw">New password</label>
          <input id="newpw" type="password" minLength={8} required autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="hint">At least 8 characters.</div>
          {error && <div className="error" role="alert">{error}</div>}
          {notice && <div className="notice">{notice}</div>}
          <button className="btn block" style={{ marginTop: 14 }} disabled={busy}>{busy ? 'Please wait…' : 'Change password'}</button>
        </form>
      </div>
      <button className="btn secondary block" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </>
  )
}
