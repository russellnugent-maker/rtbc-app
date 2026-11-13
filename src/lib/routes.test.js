// Run with: npm test
// Build spec §2: where auth emails send the runner, and links out of the app.
// What the native bundle leaves out is checked on the built bundle: npm run check:native.
import test from 'node:test'
import assert from 'node:assert/strict'
import { authRedirectUrl, webAppUrl, WEB_HOST, YNM_OFFER_URL } from './routes.js'

test('auth emails: the web uses its own origin, the app always the website', () => {
  assert.equal(authRedirectUrl({ native: false, origin: 'http://localhost:5173' }), 'http://localhost:5173/app/auth/callback')
  assert.equal(authRedirectUrl({ native: false, origin: 'https://runthebelovedcountry.co.za' }), 'https://runthebelovedcountry.co.za/app/auth/callback')
  // A preview (or the old netlify.app address) keeps its own origin on the web.
  assert.equal(authRedirectUrl({ native: false, origin: 'https://deploy-preview-1--runthebelovedcountry.netlify.app' }), 'https://deploy-preview-1--runthebelovedcountry.netlify.app/app/auth/callback')
  assert.equal(authRedirectUrl({ native: true, origin: 'capacitor://localhost', base: '/' }), 'https://runthebelovedcountry.co.za/app/auth/callback')
})

test('links out of the app go to the web app under /app/', () => {
  assert.equal(webAppUrl('/enter'), 'https://runthebelovedcountry.co.za/app/enter')
  assert.equal(webAppUrl(), 'https://runthebelovedcountry.co.za/app/')
})

test('the production address is the .co.za domain; the YNM offer stays on its own site', () => {
  assert.equal(WEB_HOST, 'runthebelovedcountry.co.za')
  assert.equal(YNM_OFFER_URL, 'https://yournextmove.run/#/rtbc')
})
