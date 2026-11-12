import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { PROVINCES, fmtDate } from '../lib/provinces.js'

// A race qualifies if it is a road race of at least 21.1 km (T&Cs 3.2).
export const qualifyingRaces = (ev) =>
  (ev.races || []).filter((r) => (r.race_type || '').toLowerCase() === 'road' && Number(r.distance_metres) >= 21097)

export default function Races() {
  const [prov, setProv] = useState(PROVINCES[0].name)
  const [events, setEvents] = useState(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    setEvents(null)
    const today = new Date().toISOString().slice(0, 10)
    supabase.from('rc_events')
      .select('id, name, event_date, venue_town, venue_province, races, url')
      .eq('venue_province', prov).gte('event_date', today)
      .order('event_date').limit(300)
      .then(({ data }) => setEvents((data || []).filter((e) => qualifyingRaces(e).length)))
  }, [prov])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (events || []).filter((e) => !s || `${e.name} ${e.venue_town}`.toLowerCase().includes(s))
  }, [events, q])

  return (
    <>
      <h1>Find a qualifying race</h1>
      <p className="muted small">Officially timed road races of 21.1 km or more, from our race finder partner RunningCalendar.co.za. Always confirm dates and entries with the organiser.</p>
      <div className="chips" role="tablist">
        {PROVINCES.map((p) => (
          <button key={p.code} className={prov === p.name ? 'on' : ''} onClick={() => setProv(p.name)}>{p.name}</button>
        ))}
      </div>
      <input type="search" placeholder="Search by race or town" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search races" />
      <div className="card" style={{ marginTop: 12 }}>
        {events === null ? <div className="spinner" /> : shown.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No upcoming qualifying races listed for {prov} yet. New races are added regularly.</p>
        ) : (
          <ul className="list">
            {shown.map((e) => (
              <li key={e.id}>
                <div style={{ fontWeight: 700 }}>{e.name}</div>
                <div className="small muted">{fmtDate(e.event_date)} · {e.venue_town || prov}</div>
                <div style={{ marginTop: 4 }}>
                  {qualifyingRaces(e).map((r, i) => <span key={i} className="pill">{(r.distance_metres / 1000).toFixed(1)} km</span>)}
                  {e.url && <a className="small" href={e.url} target="_blank" rel="noopener noreferrer">Race details</a>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
