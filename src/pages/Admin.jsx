import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { supabase } from '../lib/supabase.js'
import { fmtDate, fmtTime, passportNo } from '../lib/provinces.js'
import { STATUS } from './Results.jsx'

export default function Admin() {
  const { session } = useApp()
  const [tab, setTab] = useState('queue')
  const [rows, setRows] = useState(null)
  const [stats, setStats] = useState(null)

  const load = useCallback(async () => {
    setRows(null)
    const statuses = tab === 'queue' ? ['pending', 'flagged'] : ['approved', 'auto_approved', 'rejected']
    const { data } = await supabase.from('rtbc_submissions')
      .select('*, rtbc_passports(passport_no, name_on_passport, date_of_birth)')
      .in('status', statuses).order('created_at', { ascending: tab === 'queue' }).limit(100)
    setRows(data || [])
    const { data: pp } = await supabase.from('rtbc_passports').select('status')
    const c = {}; (pp || []).forEach((p) => { c[p.status] = (c[p.status] || 0) + 1 }); setStats(c)
  }, [tab])

  useEffect(() => { load() }, [load])

  const decide = async (s, status, note) => {
    const { error } = await supabase.from('rtbc_submissions').update({
      status, review_note: note || null, reviewed_by: session.user.id, reviewed_at: new Date().toISOString(),
    }).eq('id', s.id)
    if (error) alert(error.message); else load()
  }

  return (
    <>
      <h1>Review</h1>
      {stats && (
        <p className="small muted">
          Passports: {stats.active || 0} active · {stats.completed || 0} finished · {stats.pending_payment || 0} awaiting payment
        </p>
      )}
      <div className="segment">
        <button className={tab === 'queue' ? 'on' : ''} onClick={() => setTab('queue')}>To check</button>
        <button className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>Decided</button>
      </div>
      {rows === null ? <div className="spinner" /> : rows.length === 0 ? (
        <div className="card"><p style={{ margin: 0 }}>{tab === 'queue' ? 'Nothing waiting. 🎉' : 'No decisions yet.'}</p></div>
      ) : rows.map((s) => <Item key={s.id} s={s} onDecide={decide} queue={tab === 'queue'} />)}
    </>
  )
}

function Item({ s, onDecide, queue }) {
  const [note, setNote] = useState('')
  const [fileUrl, setFileUrl] = useState(null)
  const pp = s.rtbc_passports || {}
  const [label, tone] = STATUS[s.status] || [s.status, '']
  const daysAfter = Math.round((new Date(s.created_at) - new Date(s.race_date)) / 86400000)

  const openFile = async () => {
    const { data, error } = await supabase.storage.from('rtbc-proofs').createSignedUrl(s.proof_file_path, 600)
    if (error) return alert(error.message)
    setFileUrl(data.signedUrl); window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <div className="card">
      <div className="row spread">
        <strong>{s.province}</strong>
        <span className={`pill ${tone}`}>{label}</span>
      </div>
      <div className="small"><strong>{pp.name_on_passport}</strong> · {passportNo(pp.passport_no)}</div>
      <div className="small">{s.race_name}{!s.rc_event_id && <span className="pill warn" style={{ marginLeft: 6 }}>not on RunningCalendar</span>}</div>
      <div className="small muted">{fmtDate(s.race_date)} · {(s.distance_m / 1000).toFixed(1)} km · {fmtTime(s.finish_seconds)} · submitted {daysAfter} day{daysAfter === 1 ? '' : 's'} after the race{daysAfter > 30 && ' ⚠️'}</div>
      <div className="row" style={{ margin: '8px 0' }}>
        {s.proof_url && <a className="btn secondary" href={s.proof_url} target="_blank" rel="noopener noreferrer">Open results link</a>}
        {s.proof_file_path && <button className="btn secondary" onClick={openFile}>{fileUrl ? 'Open certificate again' : 'Open certificate'}</button>}
      </div>
      {queue ? (
        <>
          <input type="text" placeholder="Note to runner (needed to reject)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn ok" onClick={() => onDecide(s, 'approved', note)}>Approve</button>
            <button className="btn danger" disabled={!note.trim()} onClick={() => onDecide(s, 'rejected', note)}>Reject</button>
          </div>
        </>
      ) : s.review_note && <div className="small muted">Note: {s.review_note}</div>}
    </div>
  )
}
