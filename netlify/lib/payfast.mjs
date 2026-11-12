// Shared PayFast helpers (custom integration, "Payment Form" + ITN).
import crypto from 'node:crypto'

export const pfHost = () =>
  (Netlify.env.get('PAYFAST_SANDBOX') === 'true' ? 'sandbox.payfast.co.za' : 'www.payfast.co.za')

// PayFast's encoding: urlencode, spaces as '+', uppercase hex escapes.
const enc = (v) =>
  encodeURIComponent(String(v).trim()).replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

export const paramString = (pairs) =>
  pairs.filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
    .map(([k, v]) => `${k}=${enc(v)}`).join('&')

export const signature = (pairs, passphrase) => {
  let s = paramString(pairs)
  if (passphrase) s += `&passphrase=${enc(passphrase)}`
  return crypto.createHash('md5').update(s).digest('hex')
}
