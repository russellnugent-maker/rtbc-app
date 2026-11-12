// Shared PayFast helpers (custom integration, "Payment Form" + ITN).
import crypto from 'node:crypto'

export const pfHost = () =>
  (Netlify.env.get('PAYFAST_SANDBOX') === 'true' ? 'sandbox.payfast.co.za' : 'www.payfast.co.za')

// PayFast's encoding: urlencode, spaces as '+', uppercase hex escapes.
const enc = (v) =>
  encodeURIComponent(String(v).trim()).replace(/%20/g, '+')
    .replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

// Checkout form: empty fields are left out. ITN: PayFast signs EVERY field it
// posts, empty ones included (e.g. "custom_str2="), so keepEmpty must be true there.
export const paramString = (pairs, keepEmpty = false) =>
  pairs.filter(([, v]) => v !== undefined && v !== null && (keepEmpty || String(v) !== ''))
    .map(([k, v]) => `${k}=${enc(v)}`).join('&')

export const signature = (pairs, passphrase, keepEmpty = false) => {
  let s = paramString(pairs, keepEmpty)
  if (passphrase) s += `&passphrase=${enc(passphrase)}`
  return crypto.createHash('md5').update(s).digest('hex')
}
