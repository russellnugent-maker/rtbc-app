import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../App.jsx'
import { supabase } from '../lib/supabase.js'
import { fmtDate, fmtTime } from '../lib/provinces.js'
import EnterLink from '../components/EnterLink.jsx'

export const STATUS = {
  pending: ['In review', 'warn'], flagged: ['In review', 'warn'],
  auto_approved: ['Verified', 'ok'], approved: ['Verified', 'ok'],
  rejected: ['Not accepted', 'bad'], withdrawn: ['Withdrawn', ''],
}

export default function Results() {
  const { passport } = useApp()
  const [params] = useSearchParams()
  const [subs, setSubs] = useState(null)

  useEffect(() => {
    if (!passport) { setSubs([]); return }
    supabase.from('rtbc_submissions').select('*').eq('passport_id', passport.id)
      .order('race_date', { ascending: false }).then(({ data }) => setSubs(data || []))
  }, [passport])

  return (
    <>
      <h1>My results</h1>
      {params.get('sent') && <div className="notice">Thanks! Your result is in. We’ll email you once it’s checked, usually within 7 days.</div>}
      {!passport ? (
        <div className="card"><p>Enter the challenge to start adding results.</p><EnterLink className="btn">Enter the challenge</EnterLink></div>
      ) : subs === null ? <div className="spinner" /> : subs.length === 0 ? (
        <div className="card"><p style={{ margin: 0 }}>No results yet. Run a qualifying race, then <Link to="/submit">add your result</Link>.</p></div>
      ) : (
        <div className="card">
          <ul className="list">
            {subs.map((s) => {
              const [label, tone] = STATUS[s.status] || [s.status, '']
              return (
                <li key={s.id}>
                  <div className="row spread">
                    <strong>{s.province}</strong>
                    <span className={`pill ${tone}`}>{label}</span>
                  </div>
                  <div className="small">{s.race_name}</div>
                  <div className="small muted">{fmtDate(s.race_date)} · {(s.distance_m / 1000).toFixed(1)} km · {fmtTime(s.finish_seconds)}</div>
                  {s.status === 'rejected' && s.review_note && <div className="small" style={{ color: 'var(--bad)', marginTop: 4 }}>{s.review_note}</div>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </>
  )
}
