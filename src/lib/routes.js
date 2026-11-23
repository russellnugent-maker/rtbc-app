// Where things live: the web app at /app/ versus the store app (build spec §2, route map).
// Pure, so `npm test` runs it with no browser.
//
// The rule: the app never sells anything and never creates accounts. What the native build
// leaves out (entry, sign-up, magic links, the YNM offer, the review queue) is decided with the
// build-time NATIVE flag (src/lib/platform.js) so it is REMOVED from the bundle;
// scripts/check-native-bundle.mjs proves it.

/**
 * The production website. Every absolute address the app hands out is built from this: the link in
 * auth emails sent from the app, "Enter … on the website", and the sign-in page's footer links.
 * (On the web, auth emails use the page's own origin instead, so previews and `vite dev` work.)
 * Custom domain from 13 Nov 2026; runthebelovedcountry.netlify.app still serves the same site.
 */
export const WEB_ORIGIN = 'https://runthebelovedcountry.co.za'
export const WEB_HOST = new URL(WEB_ORIGIN).host
export const WEB_APP_URL = `${WEB_ORIGIN}/app/`

/** Your Next Move's RTBC offer (another site: it does not change with our domain). Web only. */
export const YNM_OFFER_URL = 'https://yournextmove.run/#/rtbc'
// YNM in the app stores. The store app links here (never to the web offer or YNM's own checkout):
// YNM sells its subscription in its own app, so the app store listing is the safe place to send people.
export const YNM_APP_STORE_URL = 'https://apps.apple.com/za/app/id6794237930'
export const YNM_PLAY_URL = 'https://play.google.com/store/apps/details?id=run.yournextmove.app'

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

/**
 * A Netlify function. The website calls its own origin (so previews and `vite dev` work); the
 * store app has no server of its own, so it calls the production website.
 */
export const functionUrl = (name, { native = false } = {}) => `${native ? WEB_ORIGIN : ''}/.netlify/functions/${name}`
