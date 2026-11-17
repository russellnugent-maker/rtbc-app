// Run with: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { handleAccount, MSG } from './rtbcAccount.mjs'

const req = (method, { token = 'tok', origin = null, body } = {}) => new Request('https://runthebelovedcountry.co.za/.netlify/functions/rtbc-account', {
  method,
  headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}), 'content-type': 'application/json' },
  ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
})

const deps = (over = {}) => {
  const calls = { forward: [], log: [] }
  return {
    calls,
    userFromToken: async (t) => (t === 'tok' ? { id: 'u1' } : null),
    readContext: async () => ({ deletion_scheduled_for: null, club_member: true, ynm_subscription_source: 'Apple' }),
    forward: async (action, token) => { calls.forward.push([action, token]); return { ok: true, status: 200, body: { ok: true, scheduled_for: '2026-11-24T05:00:00.000Z' } } },
    log: (m, d) => calls.log.push([m, d]),
    ...over,
  }
}

test('GET: what the screen must warn about, read for the signed-in runner', async () => {
  const r = await handleAccount(req('GET'), deps())
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { deletion_scheduled_for: null, club_member: true, ynm_subscription: { source: 'apple' } })
})

test('POST request: forwarded to the shared deletion with the runner’s OWN token, never an id', async () => {
  const d = deps()
  const r = await handleAccount(req('POST', { body: { action: 'request', user_id: 'someone-else' } }), d)
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { ok: true, scheduled_for: '2026-11-24T05:00:00.000Z', already_scheduled: false })
  assert.deepEqual(d.calls.forward, [['request', 'tok']])
})

test('no token or a bad token: refused before anything is read or forwarded', async () => {
  for (const token of [null, 'nope']) {
    const d = deps()
    const r = await handleAccount(req('POST', { token, body: { action: 'request' } }), d)
    assert.equal(r.status, 401)
    assert.deepEqual(await r.json(), { error: MSG.signIn })
    assert.deepEqual(d.calls.forward, [])
  }
})

test('only request and cancel are accepted', async () => {
  for (const body of [{ action: 'purge' }, { action: 'delete' }, {}, 'not json']) {
    const d = deps()
    const r = await handleAccount(req('POST', { body }), d)
    assert.equal(r.status, 400, JSON.stringify(body))
    assert.deepEqual(d.calls.forward, [])
  }
})

test('a failure upstream: plain words to the runner, the detail only in the log', async () => {
  const d = deps({ forward: async () => ({ ok: false, status: 500, body: { error: 'stamp: column "x" does not exist' } }) })
  const r = await handleAccount(req('POST', { body: { action: 'request' } }), d)
  assert.equal(r.status, 502)
  const out = await r.json()
  assert.deepEqual(out, { error: MSG.failed })
  assert.doesNotMatch(JSON.stringify(out), /column|500|http/i)
  assert.equal(d.calls.log.length, 1)

  const d2 = deps({ readContext: async () => { throw new Error('relation "memberships" does not exist') } })
  const r2 = await handleAccount(req('GET'), d2)
  assert.equal(r2.status, 502)
  assert.deepEqual(await r2.json(), { error: MSG.context })
})

test('CORS: the two app origins only, and the preflight answers', async () => {
  for (const origin of ['capacitor://localhost', 'https://localhost']) {
    const r = await handleAccount(req('OPTIONS', { origin, token: null }), deps())
    assert.equal(r.status, 204)
    assert.equal(r.headers.get('access-control-allow-origin'), origin)
    assert.match(r.headers.get('access-control-allow-headers'), /authorization/)
  }
  const evil = await handleAccount(req('GET', { origin: 'https://evil.example' }), deps())
  assert.equal(evil.headers.get('access-control-allow-origin'), null)
})
