// The nine provinces, in passport order. Names match rc_events.venue_province
// and the rtbc_submissions.province check constraint exactly.
export const PROVINCES = [
  { name: 'Western Cape', code: 'WC', slug: 'western-cape', ink: '#38507B' },
  { name: 'Eastern Cape', code: 'EC', slug: 'eastern-cape', ink: '#477B53' },
  { name: 'Northern Cape', code: 'NC', slug: 'northern-cape', ink: '#B35048' },
  { name: 'Free State', code: 'FS', slug: 'free-state', ink: '#3C788E' },
  { name: 'Gauteng', code: 'GP', slug: 'gauteng', ink: '#6F5397' },
  { name: 'KwaZulu-Natal', code: 'KZN', slug: 'kwazulu-natal', ink: '#C97536' },
  { name: 'North West', code: 'NW', slug: 'north-west', ink: '#7E563D' },
  { name: 'Limpopo', code: 'LP', slug: 'limpopo', ink: '#9C4965' },
  { name: 'Mpumalanga', code: 'MP', slug: 'mpumalanga', ink: '#338A86' },
]

export const stampUrl = (slug) => `${import.meta.env.BASE_URL}stamps/rtbc-stamp-${slug}.svg`

export const passportNo = (n) => (n ? `RTBC ${String(n).padStart(5, '0')}` : 'Not yet issued')

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export const fmtTime = (secs) => {
  if (!secs) return '—'
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const parseTime = (str) => {
  const p = String(str).trim().split(':').map(Number)
  if (p.length !== 3 || p.some((x) => !Number.isFinite(x) || x < 0) || p[1] > 59 || p[2] > 59) return null
  return p[0] * 3600 + p[1] * 60 + p[2]
}

// Referral (?ref=runningcalendar) is remembered until the runner enters.
export const captureRef = () => {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref && /^[a-z0-9-]{2,40}$/i.test(ref)) localStorage.setItem('rtbc_ref', ref.toLowerCase())
  } catch { /* storage unavailable */ }
}
export const getRef = () => { try { return localStorage.getItem('rtbc_ref') } catch { return null } }
