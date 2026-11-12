import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../App.jsx'
import { supabase } from '../lib/supabase.js'
import { PROVINCES, fmtDate, parseTime } from '../lib/provinces.js'
import { qualifyingRaces } from './Races.jsx'

const DISTANCES = [
  { label: 'Half marathon (21.1 km)', m: 21097 },
  { label: 'Marathon (42.2 km)', m: 42195 },
  { label: 'Ultra (longer than 42.2 km)', m: 0 },
]

export default function Submit() {
  const { passport, session } = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [province, setProvince] = useState(params.get('province') || '')
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState('')
  const [manual, setManual] = useState(false)
  const [raceName, setRaceName] = useState('')
  const [raceDate, setRaceDate] = useState('')
  const [dist, setDist] = useState(21097)
  const [ultraKm, setUltraKm] = useState('')
  const [time, setTime] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [verified, setVerified] = useState([])

  const issued = passport.issued_at?.slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    supabase.from('rtbc_submissions').select('province, status').eq('passport_id', passport.id)
      .then(({ data }) => setVerified((data || []).filter((s) => ['approved', 'auto_approved', 'pending', 'flagged'].includes(s.status)).map((s) => s.province)))
  }, [passport.id])

  useEffect(() => {
    setEvents([]); setEventId('')
    if (!province) return
    supabase.from('rc_events').select('id, name, event_date, venue_town, races')
      .eq('venue_province', province).gte('event_date', issued).lte('event_date', today)
      .order('event_date', { ascending: false }).limit(200)
      .then(({ data }) => setEvents((data || []).filter((e) => qualifyingRaces(e).length)))
  }, [province, issued, today])

  const ev = useMemo(() => events.find((e) => String(e.id) === eventId), [events, eventId])
  const evDistances = ev ? qualifyingRaces(ev).map((r) => Number(r.distance_metres)) : []

  const submit = async (e) => {
    e.preventDefault(); setError('')
    const secs = parseTime(time)
    const distanceM = dist === 0 ? Math.round(Number(ultraKm) * 1000) : dist
    const name = manual ? raceName.trim() : ev?.name
    const date = manual ? raceDate : ev?.event_date
    if (!province) return setError('Choose the province.')
    if (!name || !date) return setError('Choose your race, or enter its name and date.')
    if (date < issued) return setError('Only races run after your passport was issued count.')
    if (date > today) return setError('That race date is in the future.')
    if (!distanceM || distanceM < 21097) return setError('Enter the race distance (ultras must be longer than 42.2 km).')
    if (!secs) return setError('Enter your finish time as h:mm:ss, for example 1:52:07.')
    if (!proofUrl.trim() && !file) return setError('Add a link to the official results, or upload your finisher certificate.')
    if (proofUrl.trim() && !/^https?:\/\//i.test(proofUrl.trim())) return setError('The results link should start with https://')

    setBusy(true)
    try {
      let path = null
      if (file) {
        if (file.size > 10 * 1024 * 1024) throw new Error('That file is larger than 10 MB.')
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
        path = `${session.user.id}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from('rtbc-proofs').upload(path, file, { contentType: file.type })
        if (upErr) throw upErr
      }
      const { error: insErr } = await supabase.from('rtbc_submissions').insert({
        passport_id: passport.id, user_id: session.user.id, province,
        rc_event_id: manual ? null : Number(eventId),
        race_name: name, race_date: date, distance_m: distanceM, finish_seconds: secs,
        proof_url: proofUrl.trim() || null, proof_file_path: path,
      })
      if (insErr) throw insErr
      nav('/results?sent=1')
    } catch (err) {
      setError(err.message || String(err))
    } finally { setBusy(false) }
  }

  const late = (manual ? raceDate : ev?.event_date) && (Date.now() - new Date(manual ? raceDate : ev.event_date)) / 86400000 > 30

  return (
    <>
      <h1>Add a race result</h1>
      <p className="muted small">Submit within 30 days of the race. We check it against the official results, usually within 7 days, and the province stamp unlocks once it’s verified.</p>
      <form className="card" onSubmit={submit}>
        <label htmlFor="prov">Province</label>
        <select id="prov" value={province} onChange={(e) => setProvince(e.target.value)} required>
          <option value="">Choose a province</option>
          {PROVINCES.map((p) => (
            <option key={p.code} value={p.name} disabled={verified.includes(p.name)}>
              {p.name}{verified.includes(p.name) ? ' (already submitted)' : ''}
            </option>
          ))}
        </select>

        {province && !manual && (
          <>
            <label htmlFor="race">Race</label>
            <select id="race" value={eventId} onChange={(e) => {
              setEventId(e.target.value)
              const picked = events.find((x) => String(x.id) === e.target.value)
              const d = picked ? qualifyingRaces(picked).map((r) => Number(r.distance_metres)) : []
              if (d.length === 1) setDist(d[0] > 42195 ? 0 : d[0] >= 42195 ? 42195 : 21097)
              if (d.length === 1 && d[0] > 42195) setUltraKm(String(d[0] / 1000))
            }}>
              <option value="">{events.length ? 'Choose your race' : 'No listed races since your passport was issued'}</option>
              {events.map((x) => <option key={x.id} value={x.id}>{fmtDate(x.event_date)} · {x.name}{x.venue_town ? `, ${x.venue_town}` : ''}</option>)}
            </select>
            <div className="hint">Race counts for the province RunningCalendar lists it under. <a href="#" onClick={(e) => { e.preventDefault(); setManual(true) }}>My race isn’t listed</a></div>
          </>
        )}
        {province && manual && (
          <>
            <label htmlFor="rn">Race name</label>
            <input id="rn" type="text" value={raceName} onChange={(e) => setRaceName(e.target.value)} />
            <label htmlFor="rd">Race date</label>
            <input id="rd" type="date" min={issued} max={today} value={raceDate} onChange={(e) => setRaceDate(e.target.value)} />
            <div className="hint">Unlisted races count for the province of their official start. <a href="#" onClick={(e) => { e.preventDefault(); setManual(false) }}>Pick from the list instead</a></div>
          </>
        )}

        <label htmlFor="dist">Distance you ran</label>
        <select id="dist" value={dist} onChange={(e) => setDist(Number(e.target.value))}>
          {DISTANCES.map((d) => <option key={d.m} value={d.m}>{d.label}</option>)}
        </select>
        {dist === 0 && (
          <>
            <label htmlFor="uk">Ultra distance (km)</label>
            <input id="uk" type="text" inputMode="decimal" value={ultraKm} onChange={(e) => setUltraKm(e.target.value)} placeholder="e.g. 56" />
          </>
        )}
        {ev && evDistances.length > 0 && <div className="hint">Listed distances: {evDistances.map((m) => `${(m / 1000).toFixed(1)} km`).join(', ')}</div>}

        <label htmlFor="ft">Official finish time</label>
        <input id="ft" type="text" inputMode="numeric" placeholder="h:mm:ss" value={time} onChange={(e) => setTime(e.target.value)} />

        <label htmlFor="pu">Link to the official results</label>
        <input id="pu" type="url" placeholder="https://" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} />
        <label htmlFor="pf">Or upload your official finisher certificate</label>
        <input id="pf" type="file" accept="image/jpeg,image/png,image/heic,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <div className="hint">Photo or PDF, up to 10 MB. GPS watch or app screenshots aren’t accepted.</div>

        {late && <div className="error">This race was more than 30 days ago. You can still submit, but late results may not be accepted (T&amp;Cs 3.4).</div>}
        {error && <div className="error">{error}</div>}
        <button className="btn block" style={{ marginTop: 16 }} disabled={busy}>{busy ? 'Submitting…' : 'Submit for verification'}</button>
      </form>
    </>
  )
}
