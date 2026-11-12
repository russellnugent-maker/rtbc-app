import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useApp } from '../App.jsx'
import { getRef } from '../lib/provinces.js'

export const TERMS_VERSION = '2026-11-draft'

const ageOn = (dob, on = new Date()) => {
  const d = new Date(dob)
  let a = on.getFullYear() - d.getFullYear()
  const m = on.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && on.getDate() < d.getDate())) a--
  return a
}

export default function Enter() {
  const { passport, profile, session } = useApp()
  const [name, setName] = useState(passport?.name_on_passport || profile?.full_name || '')
  const [dob, setDob] = useState(passport?.date_of_birth || '')
  const [gName, setGName] = useState('')
  const [gEmail, setGEmail] = useState('')
  const [gConsent, setGConsent] = useState(false)
  const [terms, setTerms] = useState(false)
  const [health, setHealth] = useState(false)
  const [board, setBoard] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (passport && passport.status !== 'pending_payment') return <Navigate to="/" />

  const age = dob ? ageOn(dob) : null
  const minor = age !== null && age >= 16 && age < 18

  const submit = async (e) => {
    e.preventDefault(); setError('')
    if (name.trim().length < 2) return setError('Enter the name you want on your passport.')
    if (!dob) return setError('Enter your date of birth.')
    if (age < 16) return setError('Runners must be at least 16 to enter (T&Cs 2.1).')
    if (minor && (!gName.trim() || !/^\S+@\S+\.\S+$/.test(gEmail) || !gConsent))
      return setError('Runners aged 16 or 17 need a parent or guardian’s name, email and consent.')
    if (!terms || !health) return setError('Please accept the terms and the health declaration.')
    setBusy(true)
    try {
      const res = await fetch('/.netlify/functions/rtbc-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          name_on_passport: name.trim(), date_of_birth: dob,
          guardian_name: minor ? gName.trim() : null, guardian_email: minor ? gEmail.trim() : null,
          guardian_consent: minor ? gConsent : false,
          terms_version: TERMS_VERSION, leaderboard_consent: board, referral_code: getRef(),
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error || 'Something went wrong. Please try again.')
      // Hand over to PayFast with an auto-submitting form
      const f = document.createElement('form')
      f.method = 'POST'; f.action = out.payfast_url
      Object.entries(out.fields).forEach(([k, v]) => {
        const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i)
      })
      document.body.appendChild(f); f.submit()
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  return (
    <>
      <h1>Enter the challenge</h1>
      <p className="muted small">Your entry covers your digital race passport, result verification for all nine provinces and, when you finish, your printed finisher passport. Race entries, travel and accommodation are separate.</p>
      <form className="card" onSubmit={submit}>
        <label htmlFor="n">Name on your passport</label>
        <input id="n" type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="dob">Date of birth</label>
        <input id="dob" type="date" max={new Date().toISOString().slice(0, 10)} value={dob} onChange={(e) => setDob(e.target.value)} />

        {minor && (
          <div className="card" style={{ background: '#F3E9D2', marginTop: 12 }}>
            <strong className="small">Parent or guardian consent (16–17)</strong>
            <label htmlFor="gn">Parent or guardian’s full name</label>
            <input id="gn" type="text" value={gName} onChange={(e) => setGName(e.target.value)} />
            <label htmlFor="ge">Their email</label>
            <input id="ge" type="email" value={gEmail} onChange={(e) => setGEmail(e.target.value)} />
            <label className="check"><input type="checkbox" checked={gConsent} onChange={(e) => setGConsent(e.target.checked)} />
              I am this runner’s parent or guardian. I consent to them entering and accept the terms on their behalf.</label>
          </div>
        )}

        <label className="check"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>I accept the <a href="/terms" target="_blank">Terms &amp; Conditions</a> and have read the <a href="/privacy" target="_blank">Privacy Policy</a>.</span></label>
        <label className="check"><input type="checkbox" checked={health} onChange={(e) => setHealth(e.target.checked)} />
          <span>I am fit to take part, and I take part in the challenge, its races and related travel at my own risk.</span></label>
        <label className="check"><input type="checkbox" checked={board} onChange={(e) => setBoard(e.target.checked)} />
          <span>Optional: show my first name, surname initial and progress on the public finisher wall.</span></label>

        {error && <div className="error">{error}</div>}
        <button className="btn block" style={{ marginTop: 10 }} disabled={busy}>{busy ? 'Opening PayFast…' : 'Continue to payment'}</button>
        <p className="hint center" style={{ marginTop: 10 }}>Secure payment by PayFast. Your passport is issued the moment payment is confirmed.</p>
      </form>
      <p className="center small"><Link to="/">Back</Link></p>
    </>
  )
}
