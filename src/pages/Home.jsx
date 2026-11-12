import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../App.jsx'
import { supabase } from '../lib/supabase.js'
import { PROVINCES, stampUrl, passportNo, fmtDate } from '../lib/provinces.js'

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
  const [subs, setSubs] = useState([])
  useEffect(() => {
    supabase.from('rtbc_submissions').select('id, province, status, race_name, race_date, created_at')
      .eq('passport_id', passport.id).order('created_at', { ascending: false })
      .then(({ data }) => setSubs(data || []))
  }, [passport.id])

  const stateFor = (prov) => {
    const s = subs.filter((x) => x.province === prov)
    if (s.some((x) => ['approved', 'auto_approved'].includes(x.status))) return 'done'
    if (s.some((x) => ['pending', 'flagged'].includes(x.status))) return 'review'
    return 'locked'
  }
  const done = PROVINCES.filter((p) => stateFor(p.name) === 'done').length
  const daysLeft = Math.max(0, Math.ceil((new Date(passport.expires_at) - Date.now()) / 86400000))
  const finished = passport.status === 'completed'

  return (
    <>
      <div className="card dark identity">
        <div>
          <div className="small" style={{ color: '#CFC4A6', letterSpacing: '.1em' }}>RACE PASSPORT</div>
          <div className="no">{passportNo(passport.passport_no)}</div>
        </div>
        <img src={`${import.meta.env.BASE_URL}emblem.png`} alt="" style={{ width: 44, height: 44 }} />
        <dl>
          <dt>Name</dt><dd>{passport.name_on_passport}</dd>
          <dt>Issued</dt><dd>{fmtDate(passport.issued_at)}</dd>
          <dt>Expires</dt><dd>{fmtDate(passport.expires_at)}{!finished && ` · ${daysLeft} days left`}</dd>
          <dt>Stamps</dt><dd>{done} of 9</dd>
        </dl>
        <div className="progress" style={{ gridColumn: '1 / -1' }}><span style={{ width: `${(done / 9) * 100}%` }} /></div>
      </div>

      {passport.status === 'expired' && <div className="error">This passport has expired. Contact support@energylabapp.co.za about an extension.</div>}

      <div className="row spread" style={{ margin: '6px 0 10px' }}>
        <h2 style={{ margin: 0 }}>Province stamps</h2>
        {passport.status === 'active' && <Link className="btn" to="/submit" style={{ padding: '8px 14px', minHeight: 36 }}>Add a result</Link>}
      </div>
      <div className="stamps">
        {PROVINCES.map((p) => {
          const st = stateFor(p.name)
          const Tag = st === 'locked' && passport.status === 'active' ? Link : 'div'
          return (
            <Tag key={p.code} className={`stamp ${st}`} {...(Tag === Link ? { to: `/submit?province=${encodeURIComponent(p.name)}` } : {})}>
              {st === 'review' && <span className="tag">In review</span>}
              <img src={stampUrl(p.slug)} alt={`${p.name} stamp${st === 'done' ? ', verified' : ''}`} loading="lazy" />
              <span className="lbl">{p.name}</span>
            </Tag>
          )
        })}
      </div>

      <div className="card finisher" style={{ marginTop: 14 }}>
        <img src={stampUrl('finisher')} alt="Finisher stamp" style={finished ? {} : { filter: 'grayscale(1)', opacity: .3 }} />
        <div>
          <h3>{finished ? 'You ran the beloved country' : 'Finisher'}</h3>
          <p className="small muted" style={{ margin: 0 }}>
            {finished
              ? 'All nine provinces verified. Your printed finisher passport is on its way.'
              : 'Collect all nine stamps to unlock the finisher stamp and your printed finisher passport.'}
          </p>
        </div>
      </div>
    </>
  )
}
