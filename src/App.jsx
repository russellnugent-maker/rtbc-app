import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, Link } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import Auth from './pages/Auth.jsx'
import Home from './pages/Home.jsx'
import Races from './pages/Races.jsx'
import Submit from './pages/Submit.jsx'
import Results from './pages/Results.jsx'
import Enter from './pages/Enter.jsx'
import Admin from './pages/Admin.jsx'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [passport, setPassport] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const reload = useCallback(async () => {
    if (!session) { setPassport(null); setProfile(null); return }
    const uid = session.user.id
    const [{ data: prof }, { data: pp }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, is_platform_admin').eq('id', uid).maybeSingle(),
      supabase.from('rtbc_passports').select('*').eq('user_id', uid)
        .not('status', 'in', '(cancelled)').order('created_at', { ascending: false }).limit(1),
    ])
    setProfile(prof)
    setPassport(pp?.[0] || null)
  }, [session])

  useEffect(() => { reload() }, [reload])

  if (session === undefined) return <div className="spinner" />

  const isAdmin = !!profile?.is_platform_admin
  const live = passport && ['active', 'completed', 'expired'].includes(passport.status)

  return (
    <Ctx.Provider value={{ session, profile, passport, reload, isAdmin }}>
      <div className="shell">
        <header className="topbar">
          <img src={`${import.meta.env.BASE_URL}emblem.png`} alt="" />
          <Link to="/" className="title">RUN THE BELOVED COUNTRY</Link>
          {session && <button onClick={() => supabase.auth.signOut()}>Sign out</button>}
        </header>
        <main>
          {!session ? (
            <Routes><Route path="*" element={<Auth />} /></Routes>
          ) : passport === undefined ? (
            <div className="spinner" />
          ) : (
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/enter" element={<Enter />} />
              <Route path="/races" element={<Races />} />
              <Route path="/submit" element={live ? <Submit /> : <Navigate to="/" />} />
              <Route path="/results" element={<Results />} />
              <Route path="/admin" element={isAdmin ? <Admin /> : <Navigate to="/" />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          )}
        </main>
        {session && (
          <nav className="tabs" aria-label="Main">
            <NavLink to="/" end>Passport</NavLink>
            <NavLink to="/races">Find a race</NavLink>
            <NavLink to="/results">My results</NavLink>
            {isAdmin && <NavLink to="/admin">Review</NavLink>}
          </nav>
        )}
      </div>
    </Ctx.Provider>
  )
}
