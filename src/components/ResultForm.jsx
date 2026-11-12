import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { uploadPhoto } from '../lib/photos.js'
import { PROVINCES, fmtDate, parseTime } from '../lib/provinces.js'
import { qualifyingRaces } from '../pages/Races.jsx'

const DISTANCES = [
  { label: 'Half marathon (21.1 km)', m: 21097 },
  { label: 'Marathon (42.2 km)', m: 42195 },
  { label: 'Ultra (longer than 42.2 km)', m: 0 },
]

/** Result submission form. Used on its own page and in the My Journey sheet. */
export default function ResultForm({ passport, session, province: fixedProvince, onDone }) {
  const [province, setProvince] = useState(fixedProvince || '')
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState('') // RunningCalendar event id, or 'manual'
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [raceName, setRaceName] = useState('')
  const [raceDate, setRaceDate] = useState('')
  const [dist, setDist] = useState(21097)
  const [ultraKm, setUltraKm] = useState('')
  const [time, setTime] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [file, setFile] = useState(null)
  const [medal, setMedal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [taken, setTaken] = useState([])

  const issued = passport.issued_at?.slice(0, 10)
  const [today] = useState(() => new Date().toISOString().slice(0, 10))

  useEffect(() => {
    supabase.from('rtbc_submissions').select('province, status').eq('passport_id', passport.id)
      .then(({ data }) => setTaken((data || []).filter((s) => !['rejected', 'withdrawn'].includes(s.status)).map((s) => s.province)))
  }, [passport.id])

  useEffect(() => {
    if (!province || !raceDate) return
    let live = true
    setLoadingEvents(true)
    supabase.from('rc_events').select('id, name, event_date, end_date, venue_town, races')
      .eq('venue_province', province).lte('event_date', raceDate)
      .or(`event_date.eq.${raceDate},end_date.gte.${raceDate}`)
      .order('name').limit(50)
      .then(({ data }) => {
        if (!live) return
        const list = (data || []).filter((e) => qualifyingRaces(e).length)
        setEvents(list)
        setEventId(list.length ? '' : 'manual')
        setLoadingEvents(false)
      })
    return () => { live = false }
  }, [province, raceDate])

  const manual = eventId === 'manual'
  const ev = useMemo(() => events.find((e) => String(e.id) === eventId), [events, eventId])
  const evDistances = ev ? qualifyingRaces(ev).map((r) => Number(r.distance_metres)) : []
  const chosenDate = raceDate
  const [now] = useState(() => Date.now())
  const late = chosenDate && (now - new Date(chosenDate)) / 86400000 > 30

  const pickRace = (id) => {
    setEventId(id)
    const picked = events.find((x) => String(x.id) === id)
    const d = picked ? qualifyingRaces(picked).map((r) => Number(r.distance_metres)) : []
    if (d.length === 1) {
      setDist(d[0] > 42195 ? 0 : d[0] >= 42000 ? 42195 : 21097)
      if (d[0] > 42195) setUltraKm(String(d[0] / 1000))
    }
  }

  const submit = async (e) => {
    e.preventDefault(); setError('')
    const secs = parseTime(time)
    const distanceM = dist === 0 ? Math.round(Number(ultraKm) * 1000) : dist
    const name = manual ? raceName.trim() : ev?.name
    const date = chosenDate
    if (!province) return setError('Choose the province.')
    if (!date) return setError('Enter the date of the race.')
    if (!name) return setError(manual ? 'Enter the name of the race.' : 'Choose your race from the list, or tap “My race isn’t listed”.')
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
        if (file.size > 10 * 1024 * 1024) throw new Error('That certificate file is larger than 10 MB.')
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
        path = `${session.user.id}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from('rtbc-proofs').upload(path, file, { contentType: file.type })
        if (upErr) throw upErr
      }
      const { data: row, error: insErr } = await supabase.from('rtbc_submissions').insert({
        passport_id: passport.id, user_id: session.user.id, province,
        rc_event_id: manual ? null : Number(eventId),
        race_name: name, race_date: date, distance_m: distanceM, finish_seconds: secs,
        proof_url: proofUrl.trim() || null, proof_file_path: path,
      }).select('id').single()
      if (insErr) throw insErr
      if (medal) {
        try {
          const mp = await uploadPhoto(session.user.id, medal, 'medal')
          await supabase.rpc('rtbc_set_medal_photo', { p_submission_id: row.id, p_path: mp })
        } catch { /* the result is in; the medal photo can be added later from the passport */ }
      }
      onDone?.(row.id, province)
    } catch (err) {
      setError(err.message || String(err))
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit}>
      {fixedProvince ? (
        <p className="small muted" style={{ margin: 0 }}>Submit within 30 days of the race. We check it against the official results, usually within 7 days.</p>
      ) : (
        <>
          <label htmlFor="prov">Province</label>
          <select id="prov" value={province} onChange={(e) => { setProvince(e.target.value); setEvents([]); setEventId('') }} required>
            <option value="">Choose a province</option>
            {PROVINCES.map((p) => (
              <option key={p.code} value={p.name} disabled={taken.includes(p.name)}>
                {p.name}{taken.includes(p.name) ? ' (already submitted)' : ''}
              </option>
            ))}
          </select>
        </>
      )}

      {province && (
        <>
          <label htmlFor="rd">Date of the race</label>
          <input id="rd" type="date" min={issued} max={today} value={raceDate}
            onChange={(e) => { setRaceDate(e.target.value); setEvents([]); setEventId('') }} />
          {!raceDate && <div className="hint">Races from {fmtDate(issued)} (the day your passport was issued) onwards count.</div>}
        </>
      )}

      {province && raceDate && (
        <>
          <label>Which race?</label>
          {loadingEvents ? <div className="hint">Looking up races in {province} on {fmtDate(raceDate)}…</div> : (
            <div className="race-pick" role="radiogroup">
              {events.length === 0 && (
                <div className="hint" style={{ marginBottom: 6 }}>RunningCalendar has no qualifying {province} races on {fmtDate(raceDate)}. Enter your race below.</div>
              )}
              {events.map((x) => {
                const dists = qualifyingRaces(x).map((r) => `${(Number(r.distance_metres) / 1000).toFixed(1)} km`).join(' · ')
                return (
                  <button type="button" role="radio" aria-checked={eventId === String(x.id)} key={x.id}
                    className={`race-opt ${eventId === String(x.id) ? 'on' : ''}`} onClick={() => pickRace(String(x.id))}>
                    <b>{x.name}</b>
                    <span>{x.venue_town ? `${x.venue_town} · ` : ''}{dists}</span>
                  </button>
                )
              })}
              {events.length > 0 && (
                <button type="button" role="radio" aria-checked={manual} className={`race-opt other ${manual ? 'on' : ''}`} onClick={() => setEventId('manual')}>
                  <b>My race isn’t listed</b><span>Enter the race details yourself</span>
                </button>
              )}
            </div>
          )}
          {manual && (
            <>
              <label htmlFor="rn">Race name</label>
              <input id="rn" type="text" placeholder="e.g. Kalahari Half Marathon" value={raceName} onChange={(e) => setRaceName(e.target.value)} />
              <div className="hint">Unlisted races count for the province of their official start, and are checked by hand.</div>
            </>
          )}
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

      <label htmlFor="md">Photo of your finisher’s medal <span className="muted" style={{ fontWeight: 500 }}>(optional)</span></label>
      <input id="md" type="file" accept="image/*" onChange={(e) => setMedal(e.target.files?.[0] || null)} />
      <div className="hint">It goes on this race’s page in your passport. You can add it later too.</div>

      {late && <div className="error">This race was more than 30 days ago. You can still submit, but late results may not be accepted (T&amp;Cs 3.4).</div>}
      {error && <div className="error">{error}</div>}
      <button className="btn block" style={{ marginTop: 16 }} disabled={busy}>{busy ? 'Submitting…' : 'Submit for verification'}</button>
    </form>
  )
}
