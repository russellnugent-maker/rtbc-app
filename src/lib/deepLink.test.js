// Run with: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { deepLinkTarget, backAction } from './deepLink.js'
import { pushOverlay, closeTopOverlay, overlayOpen } from './backStack.js'

const CB = 'https://runthebelovedcountry.co.za/app/auth/callback'

test('the auth callback with a session: tokens handed over, lands on the passport', () => {
  const t = deepLinkTarget(`${CB}#access_token=at&refresh_token=rt&expires_in=3600&token_type=bearer&type=magiclink`)
  assert.deepEqual(t, { path: '/', session: { access_token: 'at', refresh_token: 'rt' }, type: 'magiclink', error: false })
})

test('a reset link lands on Account, where the new password is set', () => {
  assert.equal(deepLinkTarget(`${CB}#access_token=at&refresh_token=rt&type=recovery`).path, '/account')
})

test('a failed or expired link: no session, flagged, lands on the passport', () => {
  const t = deepLinkTarget(`${CB}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid`)
  assert.equal(t.session, null)
  assert.equal(t.error, true)
  assert.equal(t.path, '/')
})

test('other app pages map to the in-app route; www is accepted', () => {
  assert.equal(deepLinkTarget('https://runthebelovedcountry.co.za/app/results').path, '/results')
  assert.equal(deepLinkTarget('https://www.runthebelovedcountry.co.za/app/races?p=WC').path, '/races?p=WC')
  assert.equal(deepLinkTarget('https://runthebelovedcountry.co.za/app').path, '/')
})

test('anything not ours is ignored: other hosts, lookalikes, http, the landing page', () => {
  for (const u of [
    'https://evil.example/app/auth/callback#access_token=a&refresh_token=b',
    'https://runthebelovedcountry.co.za.evil.example/app/auth/callback',
    'http://runthebelovedcountry.co.za/app/auth/callback',
    'https://runthebelovedcountry.co.za/',
    'https://runthebelovedcountry.co.za/application',
    'not a url',
  ]) assert.equal(deepLinkTarget(u), null, u)
})

test('back button: overlay first, then back a page, and on the passport leave the app', () => {
  assert.equal(backAction({ overlayOpen: true, path: '/' }), 'close-overlay')
  assert.equal(backAction({ overlayOpen: false, path: '/results' }), 'go-back')
  assert.equal(backAction({ overlayOpen: false, path: '/' }), 'leave-app')
})

test('overlays close newest first, and unregister cleanly', () => {
  const closed = []
  const offA = pushOverlay(() => closed.push('a'))
  const offB = pushOverlay(() => closed.push('b'))
  assert.equal(overlayOpen(), true)
  assert.equal(closeTopOverlay(), true)
  offB(); offA()
  assert.equal(overlayOpen(), false)
  assert.equal(closeTopOverlay(), false)
  assert.deepEqual(closed, ['b'])
})
