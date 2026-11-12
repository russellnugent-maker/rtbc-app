import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PROVINCES, stampUrl, passportNo, fmtDate, fmtTime } from '../lib/provinces.js'
import './passport.css'

const BASE = import.meta.env.BASE_URL
// Slight, fixed tilt per province so stamps look hand-pressed but never jump around
const TILT = [-4, 3, -2, 5, -3, 2, -5, 4, -1]

const seenKey = (pid, prov) => `rtbc_stamped_${pid}_${prov}`
const wasSeen = (pid, prov) => { try { return localStorage.getItem(seenKey(pid, prov)) === '1' } catch { return true } }
const markSeen = (pid, prov) => { try { localStorage.setItem(seenKey(pid, prov), '1') } catch { /* ignore */ } }

/** Booklet: cover · identity · journey · 5 province spreads (2 per page) · finisher */
export default function PassportBook({ passport, subs }) {
  const byProv = {}
  for (const s of subs) {
    const cur = byProv[s.province]
    const rank = (x) => (['approved', 'auto_approved'].includes(x?.status) ? 3 : ['pending', 'flagged'].includes(x?.status) ? 2 : x ? 1 : 0)
    if (rank(s) > rank(cur)) byProv[s.province] = s
  }
  const verified = (p) => ['approved', 'auto_approved'].includes(byProv[p]?.status)
  const done = PROVINCES.filter((p) => verified(p.name)).length
  const finished = passport.status === 'completed'

  const pairs = []
  for (let i = 0; i < PROVINCES.length; i += 2) pairs.push(PROVINCES.slice(i, i + 2))

  const pages = [
    { key: 'cover', el: <Cover /> },
    { key: 'id', el: <Identity passport={passport} done={done} /> },
    { key: 'journey', el: <Journey byProv={byProv} done={done} /> },
    ...pairs.map((pair, i) => ({
      key: `p${i}`,
      el: <ProvincePage pair={pair} startIndex={i * 2} byProv={byProv} passport={passport} />,
      provinces: pair.map((p) => p.name),
    })),
    { key: 'finish', el: <Finisher finished={finished} passport={passport} />, provinces: ['__finisher'] },
  ]

  // Open on the first page that has a stamp the runner hasn't seen land yet
  const firstUnseen = pages.findIndex((pg) => pg.provinces?.some((p) =>
    p === '__finisher' ? finished && !wasSeen(passport.id, p) : verified(p) && !wasSeen(passport.id, p)))

  const track = useRef(null)
  const [page, setPage] = useState(0)

  const go = useCallback((i) => {
    const el = track.current
    if (!el) return
    const n = Math.max(0, Math.min(pages.length - 1, i))
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' })
  }, [pages.length])

  useEffect(() => {
    if (firstUnseen > 0) {
      const t = setTimeout(() => go(firstUnseen), 700)
      return () => clearTimeout(t)
    }
  }, [firstUnseen, go])

  const onScroll = () => {
    const el = track.current
    if (el) setPage(Math.round(el.scrollLeft / el.clientWidth))
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(page + 1)
      if (e.key === 'ArrowLeft') go(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, go])

  return (
    <div className="book">
      <div className="book-track" ref={track} onScroll={onScroll} aria-roledescription="passport booklet">
        {pages.map((pg, i) => (
          <section key={pg.key} className={`leaf ${pg.key === 'cover' ? 'leaf-cover' : ''} ${i === page ? 'on' : ''}`}
            aria-label={`Page ${i}`} aria-hidden={i !== page}>
            {pg.el}
            {i > 0 && <div className="folio">{String(i).padStart(2, '0')}</div>}
          </section>
        ))}
      </div>
      <div className="book-nav">
        <button className="turn" onClick={() => go(page - 1)} disabled={page === 0} aria-label="Previous page">‹</button>
        <div className="dots">
          {pages.map((pg, i) => (
            <button key={pg.key} className={i === page ? 'on' : ''} onClick={() => go(i)} aria-label={`Go to page ${i}`} />
          ))}
        </div>
        <button className="turn" onClick={() => go(page + 1)} disabled={page === pages.length - 1} aria-label="Next page">›</button>
      </div>
      <p className="book-hint">{page === 0 ? 'Swipe or tap › to open your passport' : `${done} of 9 provinces stamped`}</p>
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
  // gold contour lines, like the printed cover
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

function Identity({ passport, done }) {
  const [first, ...rest] = passport.name_on_passport.split(/\s+/)
  return (
    <div className="paper">
      <PageHead />
      <h2 className="pg-title">RACE PASSPORT</h2>
      <p className="pg-sub">This race passport belongs to</p>
      <div className="id-grid">
        <div className="id-photo"><img src={`${BASE}emblem.png`} alt="" /></div>
        <dl className="fields">
          <dt>First name</dt><dd>{first}</dd>
          <dt>Surname</dt><dd>{rest.join(' ') || '—'}</dd>
          <div className="two">
            <div><dt>Date of issue</dt><dd>{fmtDate(passport.issued_at)}</dd></div>
            <div><dt>Expiry date</dt><dd>{fmtDate(passport.expires_at)}</dd></div>
          </div>
        </dl>
      </div>
      <div className="pp-no"><span>PASSPORT Nº</span><b>{passportNo(passport.passport_no)}</b></div>
      <p className="fine">Challenge window: 24 months from the date of issue. A province counts once its official result has been verified.</p>
      <div className="progress-line"><span>Provinces stamped</span><b>{done} / 9</b></div>
      <div className="not-official">ENERGY LAB RUNNING CHALLENGE COLLECTIBLE<b>NOT AN OFFICIAL TRAVEL DOCUMENT</b></div>
    </div>
  )
}

function Journey({ byProv, done }) {
  return (
    <div className="paper">
      <PageHead />
      <h2 className="pg-title">MY JOURNEY</h2>
      <p className="pg-sub">Each province fills in as it is verified</p>
      <div className="journey">
        {PROVINCES.map((p, i) => {
          const s = byProv[p.name]
          const ok = ['approved', 'auto_approved'].includes(s?.status)
          const wait = ['pending', 'flagged'].includes(s?.status)
          return (
            <div key={p.code} className={`jr ${ok ? 'ok' : wait ? 'wait' : ''}`} style={{ '--ink': p.ink }}>
              <span className="jr-no">{i + 1}</span>
              <span className="jr-name">{p.name}</span>
              <span className="jr-box" aria-label={ok ? 'verified' : wait ? 'in review' : 'not yet'}>{ok ? '✓' : wait ? '…' : ''}</span>
            </div>
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
  const [state, setState] = useState(() => (shouldStamp && !wasSeen(passportId, key) ? 'armed' : 'rest'))
  useEffect(() => {
    if (state !== 'armed' || !ref.current) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio > 0.7) {
        setTimeout(() => {
          setState('stamping')
          markSeen(passportId, key)
          if (navigator.vibrate) navigator.vibrate(30)
        }, 350)
        io.disconnect()
      }
    }, { threshold: [0.7] })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [state, passportId, key])
  return [ref, state]
}

function ProvinceSlot({ prov, index, sub, passport }) {
  const ok = ['approved', 'auto_approved'].includes(sub?.status)
  const wait = ['pending', 'flagged'].includes(sub?.status)
  const [ref, state] = useStampOnView(passport.id, prov.name, ok)
  const km = sub ? sub.distance_m / 1000 : null

  return (
    <div className="slot">
      <div className="slot-head">
        <h3>{prov.name.toUpperCase()}</h3>
        <span>PROVINCE {String(index + 1).padStart(2, '0')} / 09</span>
      </div>
      <div className="slot-body">
        <div className={`stamp-box ${ok ? 'has' : ''}`} ref={ref}>
          {ok ? (
            <img className={`ink ${state}`} src={stampUrl(prov.slug)} alt={`${prov.name} stamp`}
              style={{ '--tilt': `${TILT[index]}deg` }} />
          ) : wait ? (
            <>
              <img className="ink ghost" src={stampUrl(prov.slug)} alt="" />
              <span className="box-note">In review</span>
            </>
          ) : passport.status === 'active' ? (
            <Link className="box-note link" to={`/submit?province=${encodeURIComponent(prov.name)}`}>Add your<br />result</Link>
          ) : <span className="box-note">Not stamped</span>}
        </div>
        <dl className="race">
          <dt>Race name</dt><dd>{ok || wait ? sub.race_name : ''}</dd>
          <dt>Town / city</dt><dd>{ok || wait ? sub.rc_events?.venue_town || '' : ''}</dd>
          <dt>Race date</dt><dd>{ok || wait ? fmtDate(sub.race_date) : ''}</dd>
          <dt>Distance</dt>
          <dd className="ticks">
            <span className={ok && km < 30 ? 'x' : ''}>21.1</span>
            <span className={ok && km >= 30 && km <= 43 ? 'x' : ''}>42.2</span>
            <span className={ok && km > 43 ? 'x' : ''}>Ultra</span>
          </dd>
          <dt>Finish time</dt><dd className="mono">{ok || wait ? fmtTime(sub.finish_seconds) : ''}</dd>
        </dl>
      </div>
    </div>
  )
}

function ProvincePage({ pair, startIndex, byProv, passport }) {
  return (
    <div className="paper">
      <PageHead />
      {pair.map((p, k) => (
        <ProvinceSlot key={p.code} prov={p} index={startIndex + k} sub={byProv[p.name]} passport={passport} />
      ))}
      {pair.length === 1 && <div className="slot slot-empty"><img src={`${BASE}emblem.png`} alt="" /></div>}
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
