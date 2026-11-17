// Run with: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { isNetworkError, loadSnapshot, updateSnapshot, clearSnapshot, OFFLINE_KEY, savedAtLabel } from './offline.js'

const mem = () => {
  const m = new Map()
  return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v) }, remove: async (k) => { m.delete(k) } }
}
const PASSPORT = { id: 'p1', passport_no: 1, status: 'active', photo_path: 'u1/passport-a.jpg' }

test('no signal is told apart from being signed out or refused', () => {
  assert.equal(isNetworkError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), true)
  assert.equal(isNetworkError({ message: 'TypeError: Failed to fetch' }), true)          // Chrome / Android WebView
  assert.equal(isNetworkError({ message: 'TypeError: Load failed' }), true)             // Safari / iOS WKWebView
  assert.equal(isNetworkError({ message: 'The Internet connection appears to be offline.' }), true)
  assert.equal(isNetworkError({ name: 'AuthApiError', message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 }), false)
  assert.equal(isNetworkError({ message: 'JWT expired', code: 'PGRST301' }), false)
  assert.equal(isNetworkError(null), false)
})

test('passport, then stamps: both kept, with when it was saved', async () => {
  const s = mem()
  await updateSnapshot(s, 'u1', { profile: { full_name: 'R N' }, passport: PASSPORT }, new Date('2026-11-17T04:00:00Z'))
  await updateSnapshot(s, 'u1', { subs: [{ id: 's1', province: 'Free State', status: 'approved' }] }, new Date('2026-11-17T04:42:00Z'))
  const snap = await loadSnapshot(s)
  assert.equal(snap.passport.id, 'p1')
  assert.equal(snap.subs.length, 1)
  assert.equal(snap.profile.full_name, 'R N')
  assert.equal(snap.savedAt, '2026-11-17T04:42:00.000Z')
  assert.equal(savedAtLabel(snap.savedAt), '17 Nov, 06:42')
})

test("another runner's copy is replaced, never merged", async () => {
  const s = mem()
  await updateSnapshot(s, 'u1', { passport: PASSPORT, subs: [{ id: 's1' }] })
  await updateSnapshot(s, 'u2', { passport: { id: 'p2' } })
  const snap = await loadSnapshot(s)
  assert.equal(snap.userId, 'u2')
  assert.deepEqual(snap.subs, [])
})

test('only the current passport photo is kept, and only if small enough', async () => {
  const s = mem()
  await updateSnapshot(s, 'u1', { passport: PASSPORT, photos: { 'u1/passport-a.jpg': 'data:image/jpeg;base64,AAAA', 'u1/old.jpg': 'data:x' } })
  assert.deepEqual(Object.keys((await loadSnapshot(s)).photos), ['u1/passport-a.jpg'])
  await updateSnapshot(s, 'u1', { photos: { 'u1/passport-a.jpg': 'x'.repeat(800_000) } })
  assert.deepEqual((await loadSnapshot(s)).photos, {})
})

test('without a passport nothing is saved; a damaged copy reads as none; clear removes it', async () => {
  const s = mem()
  assert.equal(await updateSnapshot(s, 'u1', { subs: [] }), null)
  assert.equal(s.m.size, 0)
  s.m.set(OFFLINE_KEY, '{not json')
  assert.equal(await loadSnapshot(s), null)
  await updateSnapshot(s, 'u1', { passport: PASSPORT })
  await clearSnapshot(s)
  assert.equal(await loadSnapshot(s), null)
})
