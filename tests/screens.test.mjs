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

async function openSignedIn(ctx, base, { passport = PASSPORT, feeCents = 49900 } = {}) {
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
  return { page, errors, feeRequests }
}

/** Wait for a selector; if it never shows, fail with the page's own errors (a blank screen says nothing). */
async function waitFor(page, errors, selector) {
  try { await page.waitForSelector(selector, { timeout: 10_000 }) } catch (e) {
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
