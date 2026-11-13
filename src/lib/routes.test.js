// Run with: npm test
// Build spec §2: where auth emails send the runner, and links out of the app.
// What the native bundle leaves out is checked on the built bundle: npm run check:native.
import test from 'node:test'
import assert from 'node:assert/strict'
import { authRedirectUrl, webAppUrl } from './routes.js'

test('auth emails: the web uses its own origin, the app always the website', () => {
  assert.equal(authRedirectUrl({ native: false, origin: 'http://localhost:5173' }), 'http://localhost:5173/app/auth/callback')
  assert.equal(authRedirectUrl({ native: false, origin: 'https://runthebelovedcountry.netlify.app' }), 'https://runthebelovedcountry.netlify.app/app/auth/callback')
  assert.equal(authRedirectUrl({ native: true, origin: 'capacitor://localhost', base: '/' }), 'https://runthebelovedcountry.netlify.app/app/auth/callback')
})

test('links out of the app go to the web app under /app/', () => {
  assert.equal(webAppUrl('/enter'), 'https://runthebelovedcountry.netlify.app/app/enter')
  assert.equal(webAppUrl(), 'https://runthebelovedcountry.netlify.app/app/')
})
