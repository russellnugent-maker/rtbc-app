// RunningCalendar.co.za — Official Race Finder Partner.
// Logo taken from runningcalendar.co.za until Johan supplies the official artwork.
const BASE = import.meta.env.BASE_URL
export const RC_URL = 'https://runningcalendar.co.za/?utm_source=rtbc&utm_medium=app'

export function RCLockup({ size = 'md', dark = false }) {
  return (
    <span className={`rc-lockup rc-${size} ${dark ? 'rc-dark' : ''}`}>
      <img src={`${BASE}partners/runningcalendar.png`} alt="" />
      <span className="rc-word">RunningCalendar<small>.co.za</small></span>
    </span>
  )
}

/** Banner for the Find a race page */
export function RCBanner() {
  return (
    <a className="rc-banner" href={RC_URL} target="_blank" rel="noopener noreferrer">
      <RCLockup />
      <span className="rc-tag">Official Race Finder Partner<br /><b>Race listings by RunningCalendar ›</b></span>
    </a>
  )
}

/** Small badge on a stamp page when the race came from RunningCalendar's listings */
export function RCBadge() {
  return (
    <span className="rc-badge" title="Race listed on RunningCalendar.co.za">
      <img src={`${BASE}partners/runningcalendar.png`} alt="" />Listed on RunningCalendar
    </span>
  )
}
