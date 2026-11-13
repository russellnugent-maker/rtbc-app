import { YNM_OFFER_URL } from '../lib/routes.js'

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

// YNM (Your Next Move) — Official Training Partner. Offer: 50% off one year, web only.

export function YNMLockup({ size = 'md' }) {
  return (
    <span className={`ynm-lockup ynm-${size}`}>
      <img src={`${BASE}partners/ynm.png`} alt="" />
      <span className="ynm-word">YOUR NEXT MOVE<small>Training plans for every race</small></span>
    </span>
  )
}

/** Perk card under the passport */
export function YNMPerk() {
  return (
    <a className="ynm-perk" href={YNM_OFFER_URL} target="_blank" rel="noopener noreferrer">
      <span className="ynm-perk-eyebrow">YOUR RTBC PERK · OFFICIAL TRAINING PARTNER</span>
      <YNMLockup />
      <span className="ynm-perk-offer"><b>50% off a year of YNM.</b> A plan built around each of your nine races, from your current fitness to race day.</span>
      <span className="ynm-perk-cta">Claim your 50% off ›</span>
    </a>
  )
}
