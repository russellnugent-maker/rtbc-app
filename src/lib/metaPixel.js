// Meta Pixel for the website only, to measure the launch ads (dataset "RTBC website",
// Energy Lab Running business portfolio). Never loaded in the store app: main.jsx imports this
// file behind `!NATIVE`, and check:native proves the native bundle has no connect.facebook.net.
// Named in the Privacy Policy, section 4.
export const META_PIXEL_ID = '4756365414640707'

function load() {
  if (window.fbq) return window.fbq
  /* Meta's standard loader, written out */
  const fbq = function (...args) {
    if (fbq.callMethod) fbq.callMethod(...args)
    else fbq.queue.push(args)
  }
  window.fbq = fbq
  if (!window._fbq) window._fbq = fbq
  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  const s = document.createElement('script')
  s.async = true
  s.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(s)
  fbq('init', META_PIXEL_ID)
  return fbq
}

export function track(event, params) {
  try { load()('track', event, params) } catch { /* never let tracking break the page */ }
}

const ENTRY = { value: 365, currency: 'ZAR' }

/** On app start: a page view, and a Purchase when PayFast sends the runner back after paying. */
export function initPixel() {
  track('PageView')
  const q = new URLSearchParams(window.location.search)
  if (q.get('paid') === '1') {
    try {
      if (sessionStorage.getItem('rtbc_purchase_tracked')) return
      sessionStorage.setItem('rtbc_purchase_tracked', '1')
    } catch { /* private mode: still count it once per load */ }
    track('Purchase', { ...ENTRY, content_name: 'Run the Beloved Country entry' })
  }
}

export const trackCheckout = () => track('InitiateCheckout', ENTRY)
