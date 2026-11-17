// The passport on the device, so the store app opens it with no signal (phase 5).
//
// What is kept: the signed-in runner's id, profile, passport row, submissions (the stamps) and the
// passport photo as a small data URL. Medal photos are not kept (each is ~250 KB; Preferences is
// not a file store), so offline they simply don't show. Stamp artwork is bundled with the app.
//
// Storage is passed in (`store`: { get(key), set(key, value), remove(key) }), so `npm test` runs
// this with a Map. The app uses Capacitor Preferences (nativeStore below); the web keeps nothing.

export const OFFLINE_KEY = 'rtbc_offline_v1'
const MAX_PHOTO_CHARS = 700_000   // ~500 KB of image; a shrunk passport photo is ~250 KB

/** A failure that means "no signal", not "you are signed out" or "that was refused". */
export function isNetworkError(err) {
  if (!err) return false
  if (err.name === 'AuthRetryableFetchError') return true
  if (err.status === 0) return true
  return /failed to fetch|load failed|networkerror|network request failed|internet connection appears to be offline/i
    .test(String(err.message || err))
}

export async function loadSnapshot(store) {
  try {
    const raw = await store.get(OFFLINE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s?.userId || !s.passport?.id || !Array.isArray(s.subs)) return null
    return s
  } catch { return null }
}

/**
 * Merge `patch` into the saved copy. A different runner's copy is replaced, never mixed.
 * Returns the saved snapshot.
 */
export async function updateSnapshot(store, userId, patch, now = new Date()) {
  if (!userId) return null
  const prev = await loadSnapshot(store)
  const base = prev && prev.userId === userId ? prev : { userId, subs: [], photos: {} }
  const next = { ...base, ...patch, userId, savedAt: now.toISOString() }
  if (patch.photos) next.photos = { ...base.photos, ...patch.photos }
  // Keep only the current passport photo, and only if it is small enough to keep.
  const keep = next.passport?.photo_path
  next.photos = Object.fromEntries(Object.entries(next.photos || {})
    .filter(([path, url]) => path === keep && typeof url === 'string' && url.length <= MAX_PHOTO_CHARS))
  if (!next.passport?.id) return null   // nothing worth keeping without a passport
  try { await store.set(OFFLINE_KEY, JSON.stringify(next)) } catch { return null }
  return next
}

export async function clearSnapshot(store) {
  try { await store.remove(OFFLINE_KEY) } catch { /* nothing to clear */ }
}

/** "17 Nov, 06:42" in South African time, for the offline banner. */
export function savedAtLabel(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' })
}

let native
/** Capacitor Preferences, loaded only in the app. */
export function nativeStore() {
  native ||= import('@capacitor/preferences').then(({ Preferences }) => ({
    get: async (key) => (await Preferences.get({ key })).value,
    set: (key, value) => Preferences.set({ key, value }),
    remove: (key) => Preferences.remove({ key }),
  }))
  return native
}
