// Where things live: the web app at /app/ versus the store app (build spec §2, route map).
// Pure, so `npm test` runs it with no browser.
//
// The rule: the app never sells anything and never creates accounts. What the native build
// leaves out (entry, sign-up, magic links, the YNM offer, the review queue) is decided with the
// build-time NATIVE flag (src/lib/platform.js) so it is REMOVED from the bundle;
// scripts/check-native-bundle.mjs proves it.

/** The website. Every absolute URL the app needs is built from this (a custom domain changes it here). */
export const WEB_ORIGIN = 'https://runthebelovedcountry.netlify.app'
export const WEB_APP_URL = `${WEB_ORIGIN}/app/`

export const AUTH_CALLBACK_PATH = '/auth/callback'

/** A page of the web app, as a full URL (for links out of the native app). */
export const webAppUrl = (path = '/') => WEB_APP_URL + String(path).replace(/^\/+/, '')

/**
 * Where auth emails (confirm, reset, magic link) send the runner. On the web: this site's own
 * /app/auth/callback (so `vite dev` stays on localhost). In the app: always the WEBSITE, because
 * the app's own origin (capacitor://localhost) means nothing in an email.
 */
export function authRedirectUrl({ native, origin, base = '/app/' }) {
  if (native) return webAppUrl(AUTH_CALLBACK_PATH)
  return `${origin}${base}${AUTH_CALLBACK_PATH.slice(1)}`
}
