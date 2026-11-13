// Partner details that are not addresses on our own site (those are in routes.js).
// Pure, so `npm test` runs it with no browser.

// Binah Legacy Center: Charity Partner (13 Nov 2026). R50 of every entry goes to it.
export const BINAH_URL = 'https://legacycenter.co.za'
export const BINAH_NAME = 'Binah Legacy Center'
export const BINAH_DONATION_CENTS = 5000

/** Whole rands as written on the site: 49900 → "R499", 5000 → "R50". null if not a usable amount. */
export function rand(cents) {
  const c = Number(cents)
  if (!Number.isInteger(c) || c <= 0) return null
  return c % 100 === 0 ? `R${c / 100}` : `R${(c / 100).toFixed(2)}`
}

/** Back cover (web and app): no amount of the entry, so it never goes stale. */
export const BINAH_BACK_COVER_LINE = `${rand(BINAH_DONATION_CENTS)} of every entry goes to the ${BINAH_NAME}.`

/**
 * The /enter line under the price, from the fee the server charges (rtbc-entry, the same
 * RTBC_ENTRY_FEE_CENTS PayFast is sent). Without a fee: the line without the entry amount.
 */
export function entryCharityLead(feeCents) {
  const fee = rand(feeCents)
  return `${rand(BINAH_DONATION_CENTS)} of your ${fee ? `${fee} ` : ''}entry goes to the`
}
export const entryCharityLine = (feeCents) => `${entryCharityLead(feeCents)} ${BINAH_NAME}.`
