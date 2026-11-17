import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../App.jsx'
import { supabase } from '../lib/supabase.js'
import { PROVINCES, stampUrl } from '../lib/provinces.js'
import PassportBook from '../components/PassportBook.jsx'
import { YNMPerk } from '../components/RCPartner.jsx'
import EnterLink from '../components/EnterLink.jsx'
import { NATIVE } from '../lib/platform.js'
import { nativeStore, updateSnapshot } from '../lib/offline.js'
import { photoDataUrl } from '../lib/photos.js'

export default function Home() {
  const { passport, profile } = useApp()
  // Still loading (supabase-js retries a dropped read for ~7 s): never show "Enter the challenge"
  // to someone who may well have a passport.
  if (passport === undefined) return <div className="spinner" />
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
        <EnterLink>Enter the challenge</EnterLink>
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
      <EnterLink>Continue to payment</EnterLink>
    </div>
  )
}

function Passport({ passport }) {
  const { reload } = useApp()
  const [subs, setSubs] = useState(null)
  const latest = useRef(passport)
  useEffect(() => { latest.current = passport })
  const load = useCallback(() => {
    supabase.from('rtbc_submissions')
      .select('id, province, status, race_name, race_date, distance_m, finish_seconds, created_at, medal_photo_path, rc_event_id, rc_events(venue_town)')
      .eq('passport_id', passport.id).order('created_at', { ascending: true })
      .then(({ data, error }) => {
        setSubs(data || [])
        // Store app: keep the stamps and the passport photo on the phone for offline use.
        if (NATIVE && !error) saveOffline(latest.current, data || [])
      })
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
      {!NATIVE && ['active', 'completed'].includes(passport.status) && <YNMPerk />}
    </>
  )
}

async function saveOffline(passport, subs) {
  const store = await nativeStore()
  await updateSnapshot(store, passport.user_id, { passport, subs })
  if (passport.photo_path) {
    const dataUrl = await photoDataUrl(passport.photo_path)
    if (dataUrl) await updateSnapshot(store, passport.user_id, { photos: { [passport.photo_path]: dataUrl } })
  }
}
