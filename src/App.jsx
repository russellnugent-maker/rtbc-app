import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Route, Routes, Link } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import Auth from './pages/Auth.jsx'
import Home from './pages/Home.jsx'
import Races from './pages/Races.jsx'
import Submit from './pages/Submit.jsx'
import Results from './pages/Results.jsx'
import Enter from './pages/Enter.jsx'
import Admin from './pages/Admin.jsx'
import Account from './pages/Account.jsx'
import { NATIVE } from './lib/platform.js'
import { AUTH_CALLBACK_PATH } from './lib/routes.js'
import Icon from './components/Icon.jsx'
import PassportBook from './components/PassportBook.jsx'
import NativeShell from './native/NativeShell.jsx'
import { isNetworkError, loadSnapshot, updateSnapshot, clearSnapshot, nativeStore, savedAtLabel } from './lib/offline.js'
import { primeOfflinePhoto } from './lib/photos.js'


const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [passport, setPassport] = useState(undefined)
  const [loadFailed, setLoadFailed] = useState(false)
  // Store app with no signal: the copy saved on the device (src/lib/offline.js), shown read-only.
  const [offline, setOffline] = useState(null)

  // Offline is only ever entered on a NETWORK failure, never because the runner is signed out:
  // a refused or revoked session clears the saved copy (SIGNED_OUT below).
  const goOffline = useCallback(async (uid) => {
    const snap = await loadSnapshot(await nativeStore())
    if (!snap || (uid && snap.userId !== uid)) return false
    Object.entries(snap.photos || {}).forEach(([path, url]) => primeOfflinePhoto(path, url))
    setOffline(snap)
    return true
  }, [])

  useEffect(() => {
    let settled = false
    supabase.auth.getSession().then(async ({ data, error }) => {
      settled = true
      if (NATIVE && !data.session && isNetworkError(error)) await goOffline(null)
      setSession(data.session)
    })
    // Store app: an expired token with no signal keeps getSession retrying the refresh for up to
    // 30 s. Don't hold the runner on a spinner: after 4 s (at once if the phone says it is
    // offline), show the saved copy if there is one. The copy only exists while signed in on this
    // phone (SIGNED_OUT clears it), and a later successful load replaces it.
    let timer
    if (NATIVE) {
      if (navigator.onLine === false) goOffline(null)
      else timer = setTimeout(() => { if (!settled) goOffline(null) }, 4_000)
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (NATIVE && event === 'SIGNED_OUT') { nativeStore().then(clearSnapshot); setOffline(null) }
    })
    return () => { clearTimeout(timer); sub.subscription.unsubscribe() }
  }, [goOffline])

  const reload = useCallback(async () => {
    if (session === undefined) return   // not read yet: the passport is unknown, not missing
    if (!session) { setPassport(null); setProfile(null); return }
    const uid = session.user.id
    // The phone already knows it has no connection (airplane mode, no signal): open the saved copy
    // now, rather than after supabase-js's retries (about 7 seconds).
    if (NATIVE && navigator.onLine === false && await goOffline(uid)) return
    const [{ data: prof, error: profErr }, { data: pp, error: ppErr }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, is_platform_admin').eq('id', uid).maybeSingle(),
      supabase.from('rtbc_passports').select('*').eq('user_id', uid)
        .not('status', 'in', '(cancelled)').order('created_at', { ascending: false }).limit(1),
    ])
    const err = profErr || ppErr
    if (err) {
      // Never show "Enter the challenge" just because the passport couldn't be read.
      if (NATIVE && isNetworkError(err) && await goOffline(uid)) return
      setLoadFailed(true)
      return
    }
    setLoadFailed(false)
    setOffline(null)
    setProfile(prof)
    setPassport(pp?.[0] || null)
    if (NATIVE) {
      const store = await nativeStore()
      if (pp?.[0]) updateSnapshot(store, uid, { profile: prof, passport: pp[0] })
      else clearSnapshot(store)
    }
  }, [session, goOffline])

  useEffect(() => { reload() }, [reload])

  // Back online (or "Try again"): pick the session up again and reload.
  const reloadRef = useRef(reload)
  useEffect(() => { reloadRef.current = reload })
  const retry = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) { setSession(data.session); setLoadFailed(false); reloadRef.current() }
  }, [])
  useEffect(() => {
    if (!NATIVE) return undefined
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [retry])

  if (NATIVE && offline) return <OfflinePassport snap={offline} retry={retry} />
  if (session === undefined) return <div className="spinner" />

  const isAdmin = !!profile?.is_platform_admin
  const live = passport && ['active', 'completed', 'expired'].includes(passport.status)

  return (
    <Ctx.Provider value={{ session, profile, passport, reload, isAdmin }}>
      <div className="shell">
        {NATIVE && <NativeShell />}
        <header className="topbar">
          <div className="topbar-row">
            <img src={`${import.meta.env.BASE_URL}emblem.png`} alt="" />
            <Link to="/" className="title">RUN THE BELOVED COUNTRY</Link>
            {session && <Link to="/account" className="topbar-btn">Account</Link>}
          </div>
          {session && (
            <nav className="tabs" aria-label="Main">
              <NavLink to="/" end><Icon name="passport" />Passport</NavLink>
              <NavLink to="/races"><Icon name="race" />Find a race</NavLink>
              <NavLink to="/results"><Icon name="results" />My results</NavLink>
              {!NATIVE && isAdmin && <NavLink to="/admin"><Icon name="review" />Review</NavLink>}
            </nav>
          )}
        </header>
        <main>
          {!session ? (
            <Routes><Route path="*" element={<Auth />} /></Routes>
          ) : loadFailed && passport === undefined ? (
            <div className="card" data-load-failed>
              <h2>We couldn’t load your passport</h2>
              <p>Check your connection and try again.</p>
              <button className="btn block" onClick={retry}>Try again</button>
            </div>
          ) : passport === undefined ? (
            <div className="spinner" />
          ) : (
            <Routes>
              <Route path="/" element={<Home />} />
              {!NATIVE && <Route path="/enter" element={<Enter />} />}
              <Route path="/races" element={<Races />} />
              <Route path="/submit" element={passport === undefined ? <div className="spinner" /> : live ? <Submit /> : <Navigate to="/" />} />
              <Route path="/results" element={<Results />} />
              {!NATIVE && <Route path="/admin" element={isAdmin ? <Admin /> : <Navigate to="/" />} />}
              <Route path="/account" element={<Account />} />
              <Route path={AUTH_CALLBACK_PATH} element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          )}
        </main>
      </div>
    </Ctx.Provider>
  )
}

// The store app with no signal: the passport as last saved on this phone, read-only. No tabs:
// races, results and uploads all need the network. Back online, it reloads by itself.
function OfflinePassport({ snap, retry }) {
  const [busy, setBusy] = useState(false)
  const again = async () => { setBusy(true); try { await retry() } finally { setBusy(false) } }
  return (
    <Ctx.Provider value={{ session: null, profile: snap.profile, passport: snap.passport, reload: retry, isAdmin: false, offline: true }}>
      <div className="shell">
        <NativeShell />
        <header className="topbar">
          <div className="topbar-row">
            <img src={`${import.meta.env.BASE_URL}emblem.png`} alt="" />
            <span className="title">RUN THE BELOVED COUNTRY</span>
          </div>
        </header>
        <main>
          <div className="offline-banner" role="status" data-offline>
            <span>You’re offline. This is your passport as saved on {savedAtLabel(snap.savedAt)}.</span>
            <button className="link-btn" onClick={again} disabled={busy}>{busy ? 'Trying…' : 'Try again'}</button>
          </div>
          <PassportBook passport={snap.passport} subs={snap.subs} onChanged={() => {}} readOnly />
        </main>
      </div>
    </Ctx.Provider>
  )
}
