// Run with: npm run test:screens   (builds both bundles first, then opens them in Chromium)
//
// Why this exists (13 Nov 2026): 4b50264 moved YNM_OFFER_URL into src/lib/routes.js, and the Home
// perk card kept using a name that was no longer in scope. Unit tests and the build both passed;
// the PR preview went blank right after sign-in. So this opens the BUILT web and native bundles,
// signed in, with a real-shaped passport (active, with a photo, one approved stamp with a medal
// photo), and fails on any uncaught page error. It asserts on the elements that crashed (the YNM
// perk card and the back-cover partner cards) and on the passport actually rendering.
//
// Supabase is never reached: every request to it is answered here from fixtures.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { chromium } from 'playwright'
import { YNM_OFFER_URL } from '../src/lib/routes.js'
import { BINAH_URL, BINAH_BACK_COVER_LINE } from '../src/lib/partners.js'

// Set SCREENS_OUT=<folder> to also save a screenshot of each screen checked.
const OUT = process.env.SCREENS_OUT
const shot = (page, name) => OUT && page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true })

const ROOT = new URL('..', import.meta.url).pathname
const PROJECT_REF = 'lkazcbvczleavcwlosrx'
const UID = '7b0c6a0e-3f1d-4c55-9a51-2a4f0c1d9e01'
const PASSPORT_ID = 'c1f4e7a2-5b6d-4e8f-9a0b-1c2d3e4f5a6b'
const PHOTO = `${UID}/passport-3f9b2c1e-7a4d-4e6f-8b9a-0c1d2e3f4a5b.jpg`
const MEDAL = `${UID}/medal-9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d.jpg`

// Columns as in supabase/migrations/20261112_rtbc_core.sql + 20261112_rtbc_photos.sql.
const PASSPORT = {
  id: PASSPORT_ID, user_id: UID, passport_no: 1, status: 'active',
  name_on_passport: 'Russell Nugent', date_of_birth: '1980-04-12',
  guardian_name: null, guardian_email: null, guardian_consent_at: null,
  terms_version: '2026-11-01', terms_accepted_at: '2026-11-12T08:00:00Z', entry_fee_cents: 49900,
  referral_code: null, leaderboard_consent: true,
  issued_at: '2026-11-12T08:05:00Z', expires_at: '2028-11-12T08:05:00Z',
  extended_at: null, extension_reason: null, completed_at: null,
  created_at: '2026-11-12T08:00:00Z', updated_at: '2026-11-12T08:05:00Z',
  photo_path: PHOTO,
}
const SUBMISSION = {
  id: 'd2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f60', province: 'Free State', status: 'approved',
  race_name: 'Bloemfontein Half Marathon', race_date: '2026-11-08', distance_m: 21097, finish_seconds: 6420,
  created_at: '2026-11-09T07:00:00Z', medal_photo_path: MEDAL, rc_event_id: null, rc_events: null,
}
const PROFILE = { id: UID, full_name: 'Russell Nugent', email: 'runner@example.com', is_platform_admin: false }

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const exp = Math.floor(Date.now() / 1000) + 3600
const USER = { id: UID, email: PROFILE.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' }
const SESSION = {
  access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp, role: 'authenticated', aud: 'authenticated', email: USER.email })}.sig`,
  refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: USER,
}
// 1×1 PNG, served for both signed photo URLs.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' }

/** Static server for a build folder; unknown paths under `spaBase` get its index.html (as Netlify / Capacitor do). */
function serve(dir, spaBase) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
    let file = join(dir, path)
    try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html') } catch { file = join(dir, spaBase, 'index.html') }
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(body)
    } catch { res.writeHead(404); res.end() }
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}` })))
}

const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

// rtbc-account (account deletion). The store app calls the production website cross-origin, so
// the answers carry CORS headers like the real function's.
const CONTEXT_DEFAULT = { deletion_scheduled_for: null, club_member: false, ynm_subscription: null }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type' }

async function openSignedIn(ctx, base, { passport = PASSPORT, feeCents = 49900, account = CONTEXT_DEFAULT } = {}) {
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
  await page.route('**/*.supabase.co/**', (route) => {
    const u = new URL(route.request().url())
    const p = u.pathname
    if (p === '/auth/v1/user') return json(route, USER)
    if (p === '/auth/v1/token') return json(route, SESSION)
    if (p.startsWith('/rest/v1/profiles')) return json(route, PROFILE)          // maybeSingle
    if (p.startsWith('/rest/v1/rtbc_passports')) return json(route, passport ? [passport] : [])
    if (p.startsWith('/rest/v1/rtbc_submissions')) return json(route, [SUBMISSION])
    // POST creates the signed link; GET on that link is the image itself.
    if (p.startsWith('/storage/v1/object/sign/rtbc-photos/') && route.request().method() === 'POST') {
      const path = p.replace('/storage/v1/object/sign/rtbc-photos/', '')
      return json(route, { signedURL: `/object/sign/rtbc-photos/${path}?token=fixture` })
    }
    if (p.startsWith('/storage/v1/object/sign/')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    return json(route, [])
  })
  const accountCalls = []
  await page.route('**/.netlify/functions/rtbc-account', (route) => {
    const r = route.request()
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const body = r.postData() ? JSON.parse(r.postData()) : null
    accountCalls.push({ method: r.method(), url: r.url(), auth: r.headers().authorization, body })
    const out = r.method() === 'GET' ? account
      : body?.action === 'request' ? { ok: true, scheduled_for: '2026-11-24T05:00:00.000Z', already_scheduled: false }
      : { ok: true, scheduled_for: null, already_scheduled: false }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(out) })
  })
  // The entry fee as rtbc-entry's GET returns it (feeCents 'fail' = the function errors).
  const feeRequests = []
  await page.route('**/.netlify/functions/rtbc-entry', (route) => {
    feeRequests.push(route.request().method())
    if (feeCents === 'fail') return route.fulfill({ status: 500, body: '' })
    return json(route, { fee_cents: feeCents })
  })
  // Store the session before the app boots, as a returning signed-in runner has it.
  await page.addInitScript(([key, s]) => { localStorage.setItem(key, s) }, [`sb-${PROJECT_REF}-auth-token`, JSON.stringify(SESSION)])
  await page.goto(base)
  return { page, errors, feeRequests, accountCalls }
}

/** Wait for a selector; if it never shows, fail with the page's own errors (a blank screen says nothing). */
async function waitFor(page, errors, selector, timeout = 10_000) {
  try { await page.waitForSelector(selector, { timeout }) } catch (e) {
    assert.deepEqual(errors, [], `page errors while waiting for ${selector}`)
    throw e
  }
}

let browser, web, native
before(async () => {
  execSync('npm run build', { cwd: ROOT, stdio: 'pipe' })
  execSync('npm run build:native', { cwd: ROOT, stdio: 'pipe' })
  web = await serve(join(ROOT, 'dist'), 'app')
  native = await serve(join(ROOT, 'dist-native'), '')
  browser = await chromium.launch()
})
after(async () => {
  await browser?.close()
  web?.server.close(); native?.server.close()
})

const BUILDS = [
  { name: 'web', base: () => `${web.url}/app/`, native: false },
  { name: 'native', base: () => `${native.url}/`, native: true },
]

for (const b of BUILDS) {
  test(`${b.name}: signed-in Passport (Home) renders an active passport with its photo, no page errors`, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const { page, errors } = await openSignedIn(ctx, b.base())

    // The passport itself: signed-in shell, booklet, number, name, and the photo actually loaded.
    await waitFor(page, errors, 'nav.tabs')
    await waitFor(page, errors, '[aria-roledescription="passport booklet"]')
    const book = await page.locator('[aria-roledescription="passport booklet"]').innerText()
    assert.match(book, /RTBC 00001/)
    assert.match(book, /Russell/)
    const photo = page.locator(`img[src*="${PHOTO}"]`)
    await photo.waitFor({ timeout: 10_000 })
    assert.ok(await photo.evaluate((img) => img.complete && img.naturalWidth > 0), 'passport photo loaded')
    await page.locator(`img[src*="${MEDAL}"]`).first().waitFor({ state: 'attached', timeout: 10_000 })

    // The element that crashed: the YNM perk card under the booklet (web only).
    assert.equal(await page.locator(`a.ynm-perk[href="${YNM_OFFER_URL}"]`).count(), b.native ? 0 : 1, 'YNM perk card')
    // Back cover: the RunningCalendar card on both (proves the back cover rendered), YNM web only.
    assert.equal(await page.locator('.back-cover a.partner-card[href^="https://runningcalendar.co.za/"]').count(), 1, 'back cover rendered')
    assert.equal(await page.locator(`.back-cover a.partner-card.ynm[href="${YNM_OFFER_URL}"]`).count(), b.native ? 0 : 1, 'back-cover YNM card')
    // App: YNM is credited as Official Training Partner, with no link, offer or price (store rules).
    if (b.native) {
      const credit = page.locator('.back-cover [data-ynm-credit]')
      assert.equal(await credit.count(), 1, 'YNM partner credit in the app')
      assert.equal(await page.locator('.back-cover .partner-card.ynm a, .back-cover a.partner-card.ynm').count(), 0, 'YNM credit has no link')
      assert.doesNotMatch(await credit.innerText(), /%|\bR\d|\boff\b/i)
    }
    // Charity Partner credit on the back cover, web AND app, linking to the Binah Legacy Center.
    const binah = page.locator(`.back-cover a.partner-card.charity[href="${BINAH_URL}"]`)
    assert.equal(await binah.count(), 1, 'Binah credit on the back cover')
    const binahText = await binah.innerText()
    assert.match(binahText, /CHARITY PARTNER/)
    assert.ok(binahText.includes(BINAH_BACK_COVER_LINE), binahText)
    const binahLogo = binah.locator('img[src$="partners/binah.jpg"]')
    await binahLogo.evaluate((img) => img.decode())
    assert.ok(await binahLogo.evaluate((img) => img.naturalWidth > 0), 'Binah logo loaded')
    // Three partner cards still fit: the footer stays inside the back cover's frame.
    const frame = await page.locator('.back-frame').boundingBox()
    const foot = await page.locator('.back-foot').boundingBox()
    assert.ok(foot.y + foot.height <= frame.y + frame.height + 0.5, `back-cover footer overflows (${foot.y + foot.height} > ${frame.y + frame.height})`)
    if (OUT) {
      // Turn to the last page, as a runner would, and capture the back cover.
      // (The booklet first jumps to the new Free State stamp; let that land, then go to the end.)
      await page.waitForTimeout(1500)
      const dots = page.locator('button[aria-label^="Go to page "]')
      await dots.nth((await dots.count()) - 1).click()
      await page.locator('button[aria-label="Next page"]:disabled').waitFor({ timeout: 5_000 })
      await page.waitForTimeout(500)
      // Element shot: a full-page shot resizes the window, which moves the booklet off this page.
      await page.locator('.back-cover').screenshot({ path: join(OUT, `${b.name}-passport-back.png`) })
    }

    // Add a result is offered on an active passport.
    assert.equal(await page.getByRole('link', { name: 'Add a race result' }).count(), 1)

    assert.deepEqual(errors, [])
    await ctx.close()
  })

  test(`${b.name}: every other signed-in tab renders without page errors`, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const { page, errors } = await openSignedIn(ctx, b.base())
    await waitFor(page, errors, '[aria-roledescription="passport booklet"]')
    for (const [link, heading] of [['Find a race', null], ['My results', null], ['Account', 'Account']]) {
      await page.getByRole('link', { name: link, exact: true }).click()
      await page.waitForLoadState('networkidle')
      assert.ok(await page.locator('nav.tabs').isVisible(), `${link}: shell still rendered`)
      assert.ok((await page.locator('main').innerText()).trim().length > 0, `${link}: page not blank`)
      if (heading) await page.locator(`h1:has-text("${heading}")`).waitFor({ timeout: 5_000 })
    }
    await page.getByRole('link', { name: 'Passport', exact: true }).click()
    await page.getByRole('link', { name: 'Add a race result' }).click()
    await page.waitForLoadState('networkidle')
    assert.ok((await page.locator('main').innerText()).trim().length > 0, 'Submit: page not blank')
    assert.deepEqual(errors, [])
    await ctx.close()
  })

  test(`${b.name}: /enter shows the charity line from the server's fee on the web, and nothing in the app`, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const { page, errors, feeRequests } = await openSignedIn(ctx, b.base() + 'enter', { passport: null, feeCents: 49900 })
    await waitFor(page, errors, 'nav.tabs')
    if (b.native) {
      // No entry route in the app: it lands on Home, with no price, no line, no call for the fee.
      await waitFor(page, errors, '[data-enter-on-web]')
      assert.equal(await page.locator('[data-entry-charity]').count(), 0, 'no /enter line in the app')
      assert.equal(await page.locator('[data-entry-price]').count(), 0, 'no price in the app')
      assert.deepEqual(feeRequests, [])
    } else {
      await waitFor(page, errors, '[data-entry-charity]')
      await page.locator('.entry-fee').waitFor({ timeout: 5_000 })
      assert.equal((await page.locator('[data-entry-charity]').innerText()).trim(), 'R50 of your R499 entry goes to the Binah Legacy Center.')
      assert.equal(await page.locator(`[data-entry-charity] a[href="${BINAH_URL}"]`).count(), 1)
      assert.match(await page.locator('.entry-fee').innerText(), /R499/)
      assert.deepEqual(feeRequests, ['GET'])
      await shot(page, 'web-enter')
    }
    assert.deepEqual(errors, [])
    await ctx.close()
  })
}

test('web: /enter follows a price change, and drops the amount if the fee cannot be read', async () => {
  for (const [feeCents, line, price] of [
    [59900, 'R50 of your R599 entry goes to the Binah Legacy Center.', 'R599'],
    ['fail', 'R50 of your entry goes to the Binah Legacy Center.', null],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const { page, errors } = await openSignedIn(ctx, `${web.url}/app/enter`, { passport: null, feeCents })
    await waitFor(page, errors, '[data-entry-charity]')
    if (price) await page.locator('.entry-fee').waitFor({ timeout: 5_000 })
    else await page.waitForLoadState('networkidle')
    assert.equal((await page.locator('[data-entry-charity]').innerText()).trim(), line)
    assert.equal(await page.locator('.entry-fee').count(), price ? 1 : 0)
    if (price) assert.match(await page.locator('.entry-fee').innerText(), new RegExp(price))
    else await shot(page, 'web-enter-no-fee')
    assert.deepEqual(errors, [])
    await ctx.close()
  }
})

// ── Phase 5: the store app ──────────────────────────────────────────────────────────────────────

const OFFLINE_KEY = 'CapacitorStorage.rtbc_offline_v1'   // Capacitor Preferences' web storage key

/** A page with Supabase unreachable, as with no signal (the app's own files are on the phone). */
async function openNoSignal(ctx, base, { session, airplane = false } = {}) {
  const page = await ctx.newPage()
  // Airplane mode: the phone says so. Otherwise (patchy signal) only the requests fail.
  if (airplane) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false }))
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/*.supabase.co/**', (route) => route.abort('internetdisconnected'))
  if (session) await page.addInitScript(([key, s]) => { localStorage.setItem(key, s) }, [`sb-${PROJECT_REF}-auth-token`, JSON.stringify(session)])
  await page.goto(base)
  return { page, errors }
}

test('native: with no signal the passport opens from the phone, read-only, photo included', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const base = `${native.url}/`

  // 1. Online once: the passport, the stamps and the passport photo are saved on the phone.
  const online = await openSignedIn(ctx, base)
  await waitFor(online.page, online.errors, '[aria-roledescription="passport booklet"]')
  await online.page.waitForFunction((k) => {
    const s = JSON.parse(localStorage.getItem(k) || 'null')
    return s && s.subs.length === 1 && Object.keys(s.photos || {}).length === 1
  }, OFFLINE_KEY, { timeout: 10_000 })
  const saved = JSON.parse(await online.page.evaluate((k) => localStorage.getItem(k), OFFLINE_KEY))
  assert.equal(saved.userId, UID)
  assert.equal(saved.passport.passport_no, 1)
  assert.match(saved.photos[PHOTO], /^data:image\/png;base64,/)
  assert.deepEqual(online.errors, [])
  await online.page.close()

  // 2a. Airplane mode: the saved copy at once, not after supabase-js's retries.
  const air = await openNoSignal(ctx, base, { airplane: true })
  const t0 = Date.now()
  await waitFor(air.page, air.errors, '[data-offline]', 3_000)
  assert.ok(Date.now() - t0 < 3_000)
  await air.page.close()

  // 2b. Patchy signal (requests fail, the phone thinks it is online), session still valid: a
  // spinner while supabase-js retries (~7 s), never "Enter the challenge", then the saved passport
  // with no tabs and nothing to add.
  const off = await openNoSignal(ctx, base)
  await off.page.waitForTimeout(1_500)
  assert.equal(await off.page.getByText('Enter the challenge').count(), 0, 'no "Enter the challenge" while retrying')
  assert.equal(await off.page.locator('main .spinner, .spinner').count(), 1, 'a spinner while retrying')
  await waitFor(off.page, off.errors, '[data-offline]', 15_000)
  assert.match(await off.page.locator('[data-offline]').innerText(), /You’re offline\. This is your passport as saved on \d{1,2} \w{3}, \d\d:\d\d\./)
  const book = await off.page.locator('[aria-roledescription="passport booklet"]').innerText()
  assert.match(book, /RTBC 00001/)
  assert.match(book, /Bloemfontein Half Marathon/)                  // the stamp, from the saved copy
  const photo = off.page.locator('img[src^="data:image/png"]').first()
  await photo.waitFor({ timeout: 5_000 })
  assert.ok(await photo.evaluate((img) => img.complete && img.naturalWidth > 0), 'saved passport photo shows offline')
  assert.equal(await off.page.locator('nav.tabs').count(), 0, 'no tabs offline')
  assert.equal(await off.page.getByRole('link', { name: 'Add a race result' }).count(), 0)
  assert.ok(await off.page.locator('.id-photo').isDisabled(), 'no photo upload offline')
  assert.equal(await off.page.locator('[data-auth-mode]').count(), 0, 'not sent to sign-in')
  assert.deepEqual(off.errors, [])
  await shot(off.page, 'native-offline')

  // 3. Back online: Try again reloads the real passport, with tabs.
  await off.page.unroute('**/*.supabase.co/**')
  await off.page.route('**/*.supabase.co/**', (route) => {
    const p = new URL(route.request().url()).pathname
    if (p.startsWith('/rest/v1/profiles')) return json(route, PROFILE)
    if (p.startsWith('/rest/v1/rtbc_passports')) return json(route, [PASSPORT])
    if (p.startsWith('/rest/v1/rtbc_submissions')) return json(route, [SUBMISSION])
    return json(route, [])
  })
  await off.page.getByRole('button', { name: 'Try again' }).click()
  await waitFor(off.page, off.errors, 'nav.tabs')
  assert.equal(await off.page.locator('[data-offline]').count(), 0)
  await off.page.close()

  // 4. No signal AND an expired token (the refresh can't reach the server): still the saved copy.
  const expired = { ...SESSION, expires_at: Math.floor(Date.now() / 1000) - 600 }
  const off2 = await openNoSignal(ctx, base, { session: expired })
  const t1 = Date.now()
  await waitFor(off2.page, off2.errors, '[data-offline]', 8_000)
  assert.ok(Date.now() - t1 < 8_000, 'not held for the 30 s refresh retries')
  assert.match(await off2.page.locator('[aria-roledescription="passport booklet"]').innerText(), /RTBC 00001/)
  await off2.page.close()
  await ctx.close()
})

test('native: signed out, or never signed in, with no signal → sign-in, never someone’s saved passport', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const { page, errors } = await openNoSignal(ctx, `${native.url}/`)
  await waitFor(page, errors, '[data-auth-mode]')
  assert.equal(await page.locator('[data-offline]').count(), 0)

  // Signing out clears the copy on the phone.
  const on = await openSignedIn(ctx, `${native.url}/`)
  await waitFor(on.page, on.errors, '[aria-roledescription="passport booklet"]')
  await on.page.waitForFunction((k) => !!localStorage.getItem(k), OFFLINE_KEY, { timeout: 10_000 })
  await on.page.getByRole('link', { name: 'Account', exact: true }).click()
  await on.page.getByRole('button', { name: 'Sign out' }).click()
  await waitFor(on.page, on.errors, '[data-auth-mode]')
  await on.page.waitForFunction((k) => !localStorage.getItem(k), OFFLINE_KEY, { timeout: 5_000 })
  await ctx.close()
})

test('native: every link out of the app opens outside it (target=_blank, absolute https)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const check = async (page, where) => {
    const links = await page.locator('a[href^="http"], a[href^="mailto:"]').evaluateAll((as) => as.map((a) => ({ href: a.getAttribute('href'), target: a.getAttribute('target') })))
    assert.ok(links.length > 0, `${where}: found links to check`)
    for (const l of links) if (!l.href.startsWith('mailto:')) assert.equal(l.target, '_blank', `${where}: ${l.href}`)
    return links.map((l) => l.href)
  }
  // Signed out: the sign-in page links to the website.
  const out = await openNoSignal(ctx, `${native.url}/`)
  await waitFor(out.page, out.errors, '[data-auth-mode]')
  const authLinks = await check(out.page, 'sign-in')
  assert.ok(authLinks.includes('https://runthebelovedcountry.co.za/app/'), 'Enter at … the website')
  await out.page.close()
  // No passport yet: "Enter the challenge on the website".
  const np = await openSignedIn(ctx, `${native.url}/`, { passport: null })
  await waitFor(np.page, np.errors, '[data-enter-on-web]')
  assert.ok((await check(np.page, 'home, no passport')).includes('https://runthebelovedcountry.co.za/app/enter'))
  await np.page.close()
  // The passport: RunningCalendar and Binah on the back cover.
  const pp = await openSignedIn(ctx, `${native.url}/`)
  await waitFor(pp.page, pp.errors, '.back-cover')
  const bookLinks = await check(pp.page, 'passport')
  assert.ok(bookLinks.some((h) => h.startsWith('https://legacycenter.co.za')), 'Binah')
  assert.ok(bookLinks.some((h) => h.startsWith('https://runningcalendar.co.za')), 'RunningCalendar')
  await ctx.close()
})

test('native: the result form offers the camera or photo library, and a PDF for the certificate', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const { page, errors } = await openSignedIn(ctx, `${native.url}/`)
  await waitFor(page, errors, '[aria-roledescription="passport booklet"]')
  await page.getByRole('link', { name: 'Add a race result' }).click()   // a cold /submit goes home until the passport loads
  await waitFor(page, errors, '#pf')
  assert.equal(await page.locator('input#pf').count(), 0, 'no bare file input in the app')
  assert.equal(await page.locator('#pf button', { hasText: 'Take or choose a photo' }).count(), 1)
  assert.equal(await page.locator('#pf button', { hasText: 'Choose a PDF' }).count(), 1)
  assert.equal(await page.locator('#md button', { hasText: 'Take or choose a photo' }).count(), 1)
  assert.equal(await page.locator('#md button', { hasText: 'Choose a PDF' }).count(), 0)
  await shot(page, 'native-submit')
  assert.deepEqual(errors, [])
  await ctx.close()
})

test('web: the result form keeps its plain file inputs', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const { page, errors } = await openSignedIn(ctx, `${web.url}/app/`)
  await waitFor(page, errors, '[aria-roledescription="passport booklet"]')
  await page.getByRole('link', { name: 'Add a race result' }).click()
  await page.waitForSelector('input#pf[type=file]', { state: 'attached', timeout: 10_000 })
  assert.equal(await page.locator('input#md[type=file]').count(), 1)
  assert.equal(await page.locator('[data-file-field]').count(), 0)
  await ctx.close()
})

for (const b of BUILDS) {
  test(`${b.name}: delete my account warns plainly, needs DELETE typed, and asks the shared deletion`, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const { page, errors, accountCalls } = await openSignedIn(ctx, b.base() + 'account', {
      account: { deletion_scheduled_for: null, club_member: true, ynm_subscription: { source: 'apple' } },
    })
    await waitFor(page, errors, '[data-delete-panel]')
    await page.getByRole('button', { name: 'Delete my account' }).click()
    await waitFor(page, errors, '[data-delete-panel][data-open]')
    await page.locator('[data-ynm-sub-warning]').waitFor({ timeout: 5_000 })

    const panel = await page.locator('[data-delete-panel]').innerText()
    assert.match(panel, /This also removes your Energy Lab and Your Next Move login\./)
    assert.match(panel, /Energy Lab club membership/)
    assert.match(await page.locator('[data-ynm-sub-warning]').innerText(), /active Your Next Move subscription[\s\S]*does not\s+cancel it[\s\S]*Settings → your name → Subscriptions/)
    assert.match(panel, /RTBC 00001/)
    assert.match(panel, /7 days to change your mind/)

    const del = page.locator('[data-delete-panel] button.danger')
    assert.ok(await del.isDisabled(), 'disabled until DELETE is typed')
    await page.fill('#confirm-delete', 'delet')
    assert.ok(await del.isDisabled())
    await page.fill('#confirm-delete', 'delete')
    assert.ok(await del.isEnabled())
    await shot(page, `${b.name}-account-delete`)
    await del.click()
    await waitFor(page, errors, '[data-delete-scheduled]')
    assert.match(await page.locator('[data-delete-scheduled]').innerText(), /permanently deleted on 24 Nov 2026/)

    const posts = accountCalls.filter((c) => c.method === 'POST')
    assert.deepEqual(posts.map((c) => c.body), [{ action: 'request' }])
    assert.equal(posts[0].auth, `Bearer ${SESSION.access_token}`)
    // The store app has no server of its own: it calls the production website.
    if (b.native) assert.ok(posts[0].url.startsWith('https://runthebelovedcountry.co.za/.netlify/functions/rtbc-account'), posts[0].url)
    else assert.ok(posts[0].url.startsWith(`${web.url}/.netlify/functions/rtbc-account`), posts[0].url)

    await page.getByRole('button', { name: 'OK' }).click()
    await waitFor(page, errors, '[data-auth-mode]')
    assert.deepEqual(errors, [])
    await ctx.close()
  })
}

test('native: signed back in during the 7 days → Restore my account; a PayFast subscription is warned too', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const { page, errors, accountCalls } = await openSignedIn(ctx, `${native.url}/account`, {
    account: { deletion_scheduled_for: '2026-11-24T05:00:00.000Z', club_member: false, ynm_subscription: null },
  })
  await waitFor(page, errors, '[data-delete-pending]')
  assert.match(await page.locator('[data-delete-pending]').innerText(), /24 Nov 2026/)
  await page.getByRole('button', { name: 'Restore my account' }).click()
  await waitFor(page, errors, '[data-delete-panel]')
  assert.deepEqual(accountCalls.filter((c) => c.method === 'POST').map((c) => c.body), [{ action: 'cancel' }])
  await page.close()

  const pf = await openSignedIn(ctx, `${native.url}/account`, { account: { deletion_scheduled_for: null, club_member: false, ynm_subscription: { source: 'payfast' } } })
  await waitFor(pf.page, pf.errors, '[data-delete-panel]')
  await pf.page.getByRole('button', { name: 'Delete my account' }).click()
  await pf.page.locator('[data-ynm-sub-warning]').waitFor({ timeout: 5_000 })
  assert.match(await pf.page.locator('[data-ynm-sub-warning]').innerText(), /in Your Next Move, or email support@energylabapp\.co\.za/)
  assert.equal(await pf.page.locator('[data-delete-panel]').getByText('Energy Lab club membership').count(), 0)
  await ctx.close()
})

test('native: the top bar and the page clear a notch and a home indicator (safe areas)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const { page, errors } = await openSignedIn(ctx, `${native.url}/`)
  // What Capacitor's SystemBars sets on Android (and env() gives on an iPhone with a notch).
  await page.addStyleTag({ content: ':root { --safe-area-inset-top: 47px; --safe-area-inset-bottom: 34px; }' })
  await waitFor(page, errors, '[aria-roledescription="passport booklet"]')
  const row = await page.locator('.topbar-row').boundingBox()
  assert.ok(row.y >= 47, `top bar content below the notch (y=${row.y})`)
  const pad = await page.locator('main').evaluate((m) => parseFloat(getComputedStyle(m).paddingBottom))
  assert.ok(pad >= 40 + 34, `page bottom clears the home indicator (${pad})`)
  await shot(page, 'native-safe-area')
  assert.deepEqual(errors, [])
  await ctx.close()
})
