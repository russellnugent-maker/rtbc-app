import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../App.jsx'
import { supabase } from '../lib/supabase.js'
import { PROVINCES, stampUrl } from '../lib/provinces.js'
import PassportBook from '../components/PassportBook.jsx'
import { YNMPerk } from '../components/RCPartner.jsx'

export default function Home() {
  const { passport, profile } = useApp()
  if (!passport) return <NoPassport name={profile?.full_name} />
  if (passport.status === 'pending_payment') return <PendingPayment />
  return <Passport passport={passport} />
}

function NoPassport({ name }) {
  return (
    <>
      <div className="card dark">
        <h1>Welcome{name ? `, ${name.split(' ')[0]}` : ''}</h1>
        <p>Run an officially timed road half marathon, marathon or ultra in each of South Africa’s nine provinces within 24 months. Every verified race unlocks that province’s stamp in your passport.</p>
        <Link className="btn block" to="/enter">Enter the challenge</Link>
      </div>
      <h2>The stamps you’ll collect</h2>
      <div className="stamps">
        {PROVINCES.map((p) => (
          <div key={p.code} className="stamp locked">
            <img src={stampUrl(p.slug)} alt={`${p.name} stamp`} loading="lazy" />
            <span className="lbl">{p.name}</span>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 14 }}>
        Finishers also receive a printed passport with all nine races filled in. <Link to="/races">See qualifying races</Link>.
      </p>
    </>
  )
}

function PendingPayment() {
  return (
    <div className="card">
      <h1>Almost there</h1>
      <p>Your entry is saved but we haven’t received payment yet. Your passport is issued as soon as PayFast confirms it, usually within a minute.</p>
      <Link className="btn block" to="/enter">Continue to payment</Link>
    </div>
  )
}

function Passport({ passport }) {
  const { reload } = useApp()
  const [subs, setSubs] = useState(null)
  const load = useCallback(() => {
    supabase.from('rtbc_submissions')
      .select('id, province, status, race_name, race_date, distance_m, finish_seconds, created_at, medal_photo_path, rc_event_id, rc_events(venue_town)')
      .eq('passport_id', passport.id).order('created_at', { ascending: true })
      .then(({ data }) => setSubs(data || []))
  }, [passport.id])
  useEffect(() => { load() }, [load])

  if (subs === null) return <div className="spinner" />
  return (
    <>
      {passport.status === 'expired' && <div className="error">This passport has expired. Contact support@energylabapp.co.za about an extension.</div>}
      <PassportBook passport={passport} subs={subs} onChanged={() => { load(); reload() }} />
      {passport.status === 'active' && (
        <Link className="btn block" to="/submit" style={{ marginTop: 10 }}>Add a race result</Link>
      )}
      {['active', 'completed'].includes(passport.status) && <YNMPerk />}
    </>
  )
}
