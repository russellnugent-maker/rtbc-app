import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../App.jsx'
import { supabase } from '../lib/supabase.js'
import { uploadPhoto, photoUrl } from '../lib/photos.js'
import { PROVINCES, stampUrl, passportNo, fmtDate, fmtTime } from '../lib/provinces.js'
import ResultForm from './ResultForm.jsx'
import { RCLockup, RCBadge, RC_URL } from './RCPartner.jsx'
import './passport.css'

const BASE = import.meta.env.BASE_URL
const PROV = Object.fromEntries(PROVINCES.map((p) => [p.name, p]))
const TILT = [-4, 3, -2, 5, -3, 2, -5, 4, -1]
const FIRST_STAMP_PAGE = 3
const pageOfSlot = (k) => FIRST_STAMP_PAGE + Math.floor(k / 2)

const isOk = (s) => ['approved', 'auto_approved'].includes(s?.status)
const isWait = (s) => ['pending', 'flagged'].includes(s?.status)
const seenKey = (pid, key) => `rtbc_stamped_${pid}_${key}`
const wasSeen = (pid, key) => { try { return localStorage.getItem(seenKey(pid, key)) === '1' } catch { return true } }
const markSeen = (pid, key) => { try { localStorage.setItem(seenKey(pid, key), '1') } catch { /* ignore */ } }

function usePhoto(path) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let live = true
    if (path) photoUrl(path).then((u) => { if (live) setUrl(u) })
    return () => { live = false }
  }, [path])
  return path ? url : null
}

/** Booklet: cover · identity · journey · 9 stamp spaces filled in the order results are added · finisher */
export default function PassportBook({ passport, subs, onChanged }) {
  const { session } = useApp()
  // Stamps go into the passport in the order the runner adds them, like a real passport
  const slots = subs.filter((s) => !['rejected', 'withdrawn'].includes(s.status))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).slice(0, 9)
  const byProv = Object.fromEntries(slots.map((s) => [s.province, s]))
  const done = slots.filter(isOk).length
  const finished = passport.status === 'completed'
  const canAdd = passport.status === 'active'

  const [sheet, setSheet] = useState(null) // province name for the result sheet
  const [viewer, setViewer] = useState(null) // photo url to view large
  const [gotoSub, setGotoSub] = useState(() => { try { return sessionStorage.getItem('rtbc_goto_sub') } catch { return null } })

  const pages = [
    { key: 'cover', el: <Cover /> },
    { key: 'id', el: <Identity passport={passport} done={done} session={session} onChanged={onChanged} /> },
    { key: 'journey', el: <Journey byProv={byProv} done={done} canAdd={canAdd} onAdd={setSheet} onOpen={(p) => go(pageOfSlot(slots.indexOf(byProv[p])))} /> },
    ...[0, 2, 4, 6, 8].map((k) => ({
      key: `s${k}`,
      el: <StampPage first={k} slots={slots} passport={passport} canAdd={canAdd} session={session}
        onChanged={onChanged} onAdd={() => go(2)} onView={setViewer} />,
      watch: [slots[k], slots[k + 1]].filter(Boolean).map((s) => s.province),
    })),
    { key: 'finish', el: <Finisher finished={finished} passport={passport} />, watch: ['__finisher'] },
    { key: 'back', el: <BackCover /> },
  ]

  const track = useRef(null)
  const [page, setPage] = useState(0)
  const go = useCallback((i) => {
    const el = track.current
    if (!el || i < 0) return
    el.scrollTo({ left: Math.min(i, el.children.length - 1) * el.clientWidth, behavior: 'smooth' })
  }, [])

  // Open on: a just-submitted result's page, else the first stamp not yet seen landing
  useEffect(() => {
    let target = -1
    if (gotoSub) {
      const k = slots.findIndex((s) => s.id === gotoSub)
      if (k >= 0) target = pageOfSlot(k)
      try { sessionStorage.removeItem('rtbc_goto_sub') } catch { /* ignore */ }
      setGotoSub(null)
    } else {
      target = pages.findIndex((pg) => pg.watch?.some((p) =>
        p === '__finisher' ? finished && !wasSeen(passport.id, p) : isOk(byProv[p]) && !wasSeen(passport.id, p)))
    }
    if (target > 0) {
      const t = setTimeout(() => go(target), 650)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gotoSub, subs])

  useEffect(() => {
    const onKey = (e) => {
      if (sheet || viewer) return
      if (e.key === 'ArrowRight') go(page + 1)
      if (e.key === 'ArrowLeft') go(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, go, sheet, viewer])

  return (
    <div className="book">
      <div className="book-track" ref={track} aria-roledescription="passport booklet"
        onScroll={(e) => setPage(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {pages.map((pg, i) => (
          <section key={pg.key} className={`leaf ${pg.key === 'cover' ? 'leaf-cover' : ''} ${i === page ? 'on' : ''}`} aria-label={`Page ${i}`}>
            {pg.el}
            {i > 0 && pg.key !== 'back' && <div className="folio">{String(i).padStart(2, '0')}</div>}
          </section>
        ))}
      </div>
      <div className="book-nav">
        <button className="turn" onClick={() => go(page - 1)} disabled={page === 0} aria-label="Previous page">‹</button>
        <div className="dots">
          {pages.map((pg, i) => <button key={pg.key} className={i === page ? 'on' : ''} onClick={() => go(i)} aria-label={`Go to page ${i}`} />)}
        </div>
        <button className="turn" onClick={() => go(page + 1)} disabled={page === pages.length - 1} aria-label="Next page">›</button>
      </div>
      <p className="book-hint">
        {page === 0 ? 'Swipe or tap › to open your passport' : page === 2 && canAdd ? 'Tap a province to add your result' : `${done} of 9 provinces stamped`}
      </p>

      {sheet && (
        <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={`Add your ${sheet} result`} onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <img src={stampUrl(PROV[sheet].slug)} alt="" />
              <div><small>ADD YOUR RESULT</small><h2>{sheet}</h2></div>
              <button className="x" onClick={() => setSheet(null)} aria-label="Close">×</button>
            </div>
            <ResultForm passport={passport} session={session} province={sheet}
              onDone={(id) => { setSheet(null); setGotoSub(id); onChanged() }} />
          </div>
        </div>
      )}
      {viewer && (
        <div className="sheet-wrap viewer" onClick={() => setViewer(null)} role="dialog" aria-label="Medal photo">
          <img src={viewer} alt="Finisher medal" />
        </div>
      )}
    </div>
  )
}

function PageHead() {
  return (
    <header className="pg-head">
      <img src={`${BASE}emblem.png`} alt="" />
      <div><b>RUN THE BELOVED COUNTRY</b><span>RACE PASSPORT</span></div>
    </header>
  )
}

function Waves() {
  const lines = [0, 1, 2, 3].map((k) => {
    const y = 70 + k * 16
    return `M0 ${y} C 60 ${y - 30 - k * 4}, 110 ${y + 20}, 170 ${y - 10} S 260 ${y - 40 + k * 6}, 320 ${y - 4}`
  })
  return (
    <svg className="cover-waves" viewBox="0 0 320 140" preserveAspectRatio="none" aria-hidden="true">
      {lines.map((d, i) => <path key={i} d={d} fill="none" stroke={i === 0 ? '#F5911D' : '#D2B270'} strokeWidth={i === 0 ? 1.6 : 1} opacity={1 - i * 0.18} />)}
    </svg>
  )
}

function Cover() {
  return (
    <div className="cover">
      <div className="cover-frame">
        <img className="cover-emblem" src={`${BASE}emblem.png`} alt="" />
        <div className="cover-brand">ENERGY LAB<small>ATHLETIC COMPANY · EST. 2019</small></div>
        <div className="cover-presents">PRESENTS</div>
        <h1 className="cover-title"><span>RUN THE</span>BELOVED<br />COUNTRY</h1>
        <Waves />
        <div className="cover-foot">RACE PASSPORT</div>
      </div>
    </div>
  )
}

function Identity({ passport, done, session, onChanged }) {
  const [first, ...rest] = passport.name_on_passport.split(/\s+/)
  const url = usePhoto(passport.photo_path)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = useRef(null)

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true); setErr('')
    try {
      const path = await uploadPhoto(session.user.id, f, 'passport')
      const { error } = await supabase.rpc('rtbc_set_passport_photo', { p_path: path })
      if (error) throw error
      onChanged()
    } catch (x) { setErr(x.message || 'Upload failed') } finally { setBusy(false) }
  }

  return (
    <div className="paper">
      <PageHead />
      <h2 className="pg-title">RACE PASSPORT</h2>
      <p className="pg-sub">This race passport belongs to</p>
      <div className="id-grid">
        <button type="button" className={`id-photo ${url ? 'has' : ''}`} onClick={() => input.current?.click()} disabled={busy}
          aria-label={url ? 'Change your passport photo' : 'Add your passport photo'}>
          {url ? <img className="face" src={url} alt="Runner" /> : (
            <span className="add-photo">{busy ? 'Uploading…' : <>＋<br />Add your<br />photo</>}</span>
          )}
          {url && <span className="change">{busy ? '…' : 'Change'}</span>}
        </button>
        <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />
        <dl className="fields">
          <dt>First name</dt><dd>{first}</dd>
          <dt>Surname</dt><dd>{rest.join(' ') || '—'}</dd>
          <div className="two">
            <div><dt>Date of issue</dt><dd>{fmtDate(passport.issued_at)}</dd></div>
            <div><dt>Expiry date</dt><dd>{fmtDate(passport.expires_at)}</dd></div>
          </div>
        </dl>
      </div>
      {err && <p className="fine" style={{ color: '#9B2F2F' }}>{err}</p>}
      <div className="pp-no"><span>PASSPORT Nº</span><b>{passportNo(passport.passport_no)}</b></div>
      <p className="fine">Challenge window: 24 months from the date of issue. A province counts once its official result has been verified.</p>
      <div className="progress-line"><span>Provinces stamped</span><b>{done} / 9</b></div>
      <div className="not-official">ENERGY LAB RUNNING CHALLENGE COLLECTIBLE<b>NOT AN OFFICIAL TRAVEL DOCUMENT</b></div>
    </div>
  )
}

function Journey({ byProv, done, canAdd, onAdd, onOpen }) {
  return (
    <div className="paper">
      <PageHead />
      <h2 className="pg-title">MY JOURNEY</h2>
      <p className="pg-sub">{canAdd ? 'Tap a province to add your result' : 'Each province fills in as it is verified'}</p>
      <div className="journey">
        {PROVINCES.map((p, i) => {
          const s = byProv[p.name]
          const ok = isOk(s), wait = isWait(s)
          const action = s ? () => onOpen(p.name) : canAdd ? () => onAdd(p.name) : null
          return (
            <button type="button" key={p.code} className={`jr ${ok ? 'ok' : wait ? 'wait' : ''}`} style={{ '--ink': p.ink }}
              onClick={action || undefined} disabled={!action}>
              <span className="jr-no">{i + 1}</span>
              <span className="jr-name">{p.name}</span>
              <span className="jr-act">{ok ? 'Stamped' : wait ? 'In review' : canAdd ? 'Add result ›' : ''}</span>
              <span className="jr-box">{ok ? '✓' : wait ? '…' : ''}</span>
            </button>
          )
        })}
      </div>
      <div className="journey-bar"><span style={{ width: `${(done / 9) * 100}%` }} /></div>
      <p className="pg-sub" style={{ marginTop: 6 }}>{done === 9 ? 'All nine. You ran the beloved country.' : `${9 - done} province${9 - done === 1 ? '' : 's'} to go`}</p>
    </div>
  )
}

function useStampOnView(passportId, key, shouldStamp) {
  const ref = useRef(null)
  const [state, setState] = useState('rest')
  useEffect(() => {
    if (!shouldStamp || wasSeen(passportId, key)) { setState('rest'); return }
    setState('armed')
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio > 0.7) {
        setTimeout(() => { setState('stamping'); markSeen(passportId, key); if (navigator.vibrate) navigator.vibrate(30) }, 350)
        io.disconnect()
      }
    }, { threshold: [0.7] })
    io.observe(el)
    return () => io.disconnect()
  }, [shouldStamp, passportId, key])
  return [ref, state]
}

function MedalPhoto({ sub, session, onChanged, onView, editable }) {
  const url = usePhoto(sub.medal_photo_path)
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true)
    try {
      const path = await uploadPhoto(session.user.id, f, 'medal')
      const { error } = await supabase.rpc('rtbc_set_medal_photo', { p_submission_id: sub.id, p_path: path })
      if (error) throw error
      onChanged()
    } catch (x) { alert(x.message || 'Upload failed') } finally { setBusy(false) }
  }
  if (url) return <button type="button" className="medal" onClick={() => onView(url)} aria-label="View medal photo"><img src={url} alt="Finisher medal" /></button>
  if (!editable) return null
  return (
    <>
      <button type="button" className="medal add" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? '…' : <>＋<br />Medal<br />photo</>}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />
    </>
  )
}

function Slot({ k, sub, isNext, passport, canAdd, session, onChanged, onAdd, onView }) {
  const ok = isOk(sub), wait = isWait(sub)
  const prov = sub ? PROV[sub.province] : null
  const [ref, state] = useStampOnView(passport.id, sub?.province || `slot${k}`, ok)
  const km = sub ? sub.distance_m / 1000 : null
  const no = String(k + 1).padStart(2, '0')

  return (
    <div className="slot">
      <div className="slot-head">
        <h3>{prov ? prov.name.toUpperCase() : `STAMP ${no}`}</h3>
        <span>STAMP {no} / 09</span>
      </div>
      <div className="slot-body">
        <div className={`stamp-box ${sub ? 'has' : ''}`} ref={ref}>
          {sub ? (
            <>
              <img className={`ink ${ok ? state : 'pending'}`} src={stampUrl(prov.slug)} alt={`${prov.name} stamp${ok ? '' : ', in review'}`}
                style={{ '--tilt': `${TILT[k]}deg` }} />
              {wait && <span className="ribbon">IN REVIEW</span>}
              <MedalPhoto sub={sub} session={session} onChanged={onChanged} onView={onView} editable={canAdd} />
            </>
          ) : isNext && canAdd ? (
            <button type="button" className="box-note link" onClick={onAdd}>Your next<br />stamp goes here<br /><b>Add a result ›</b></button>
          ) : <span className="box-note faint">{no}</span>}
        </div>
        <dl className="race">
          <dt>Race name</dt><dd>{sub?.race_name || ''}</dd>
          <dt>Town / city</dt><dd>{sub?.rc_events?.venue_town || ''}</dd>
          <dt>Race date</dt><dd>{sub ? fmtDate(sub.race_date) : ''}</dd>
          <dt>Distance</dt>
          <dd className="ticks">
            <span className={sub && km < 30 ? 'x' : ''}>21.1</span>
            <span className={sub && km >= 30 && km <= 43 ? 'x' : ''}>42.2</span>
            <span className={sub && km > 43 ? 'x' : ''}>Ultra</span>
          </dd>
          <dt>Finish time</dt><dd className="mono">{sub ? fmtTime(sub.finish_seconds) : ''}</dd>
          {sub?.rc_event_id && <RCBadge />}
        </dl>
      </div>
    </div>
  )
}

function StampPage({ first, slots, ...rest }) {
  const nextIndex = slots.length
  return (
    <div className="paper">
      <PageHead />
      {[first, first + 1].filter((k) => k < 9).map((k) => (
        <Slot key={k} k={k} sub={slots[k]} isNext={k === nextIndex} {...rest} />
      ))}
      {first === 8 && <div className="slot slot-empty"><img src={`${BASE}emblem.png`} alt="" /></div>}
    </div>
  )
}

function Finisher({ finished, passport }) {
  const [ref, state] = useStampOnView(passport.id, '__finisher', finished)
  return (
    <div className="paper finisher-page">
      <PageHead />
      <h2 className="pg-title">FINISHER</h2>
      <p className="pg-sub">Nine provinces. Nine races. One beloved country.</p>
      <div className={`stamp-box big ${finished ? 'has' : ''}`} ref={ref}>
        {finished
          ? <img className={`ink ${state}`} src={stampUrl('finisher')} alt="Finisher stamp" style={{ '--tilt': '-3deg' }} />
          : <span className="box-note">Your finisher stamp lands here<br />when all nine are verified</span>}
      </div>
      <p className="ran">I ran the beloved country</p>
      <div className="sign"><span>{finished ? passport.name_on_passport : ''}</span><small>Runner</small></div>
      <p className="fine center">{finished ? `Completed ${fmtDate(passport.completed_at)}. Your printed finisher passport is on its way.` : 'Finishers receive this passport in print, with all nine races filled in.'}</p>
    </div>
  )
}

function BackCover() {
  return (
    <div className="back-cover">
      <div className="back-frame">
        <div className="back-eyebrow">OFFICIAL RACE FINDER PARTNER</div>
        <a className="partner-card" href={RC_URL} target="_blank" rel="noopener noreferrer">
          <RCLockup size="lg" />
          <p>Southern Africa’s running calendar. Find a qualifying half marathon, marathon or ultra in every province.</p>
        </a>
        <div className="qr"><img src={`${BASE}partners/runningcalendar-qr.svg`} alt="QR code to runningcalendar.co.za" /></div>
        <div className="back-scan">Scan to find your next race</div>
        <div className="back-foot">RUN THE BELOVED COUNTRY<small>PRESENTED BY ENERGY LAB ATHLETIC COMPANY</small></div>
      </div>
    </div>
  )
}
