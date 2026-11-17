// Links that open the store app, and the Android back button (phase 5). Pure, so `npm test` runs it.

import { WEB_HOST } from './routes.js'

/** Hosts whose links the app accepts (the AASA / assetlinks files are served from these). */
export const APP_LINK_HOSTS = [WEB_HOST, `www.${WEB_HOST}`]

/**
 * What to do with a URL the OS opened the app with (App plugin 'appUrlOpen').
 * Returns null for anything that isn't ours. Otherwise:
 *   path    — the in-app route (the web's /app/... with /app removed)
 *   session — { access_token, refresh_token } when the link carries one (the auth callback's
 *             fragment, as Energy Lab's /auth/confirm hands it over), else null
 *   type    — the link type from the fragment ('recovery', 'magiclink', 'signup', …), if any
 *   error   — true when the fragment reports a failed or expired link
 */
export function deepLinkTarget(url) {
  let u
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== 'https:' || !APP_LINK_HOSTS.includes(u.host)) return null
  if (u.pathname !== '/app' && !u.pathname.startsWith('/app/')) return null

  const frag = new URLSearchParams(u.hash.replace(/^#/, ''))
  const access_token = frag.get('access_token')
  const refresh_token = frag.get('refresh_token')
  const type = frag.get('type') || null
  const error = frag.has('error') || frag.has('error_code')

  let path = u.pathname.slice('/app'.length) || '/'
  // The callback is not a page of its own: land on the passport, or on Account to set a new
  // password after a reset link.
  if (path.startsWith('/auth/callback')) path = type === 'recovery' && !error ? '/account' : '/'

  return {
    path: path + (path === '/account' || path === '/' ? '' : u.search),
    session: access_token && refresh_token && !error ? { access_token, refresh_token } : null,
    type,
    error,
  }
}

/**
 * The Android back button: close the open sheet or viewer first; otherwise go back a page;
 * on the passport (the app's home) leave the app, as Android apps do.
 */
export function backAction({ overlayOpen, path }) {
  if (overlayOpen) return 'close-overlay'
  if (path === '/' || path === '') return 'leave-app'
  return 'go-back'
}
