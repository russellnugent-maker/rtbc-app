import { supabase } from './supabase.js'

// Shrink phone photos before upload (a 12 MP photo becomes ~250 KB) so they
// load quickly in the passport. Falls back to the original file if the
// browser can't decode it (e.g. HEIC outside Safari).
export async function shrinkImage(file, max = 1200, quality = 0.84) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d').drawImage(bmp, 0, 0, w, h)
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality))
    return blob ? { blob, type: 'image/jpeg', ext: 'jpg' } : null
  } catch { return null }
}

export async function uploadPhoto(userId, file, kind) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo.')
  const small = await shrinkImage(file)
  const body = small?.blob || file
  if (body.size > 8 * 1024 * 1024) throw new Error('That photo is too large (over 8 MB).')
  const ext = small?.ext || (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${userId}/${kind}-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('rtbc-photos').upload(path, body, { contentType: small?.type || file.type })
  if (error) throw error
  return path
}

const cache = new Map()
export async function photoUrl(path) {
  if (!path) return null
  const hit = cache.get(path)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data } = await supabase.storage.from('rtbc-photos').createSignedUrl(path, 3600)
  if (data?.signedUrl) cache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 })
  return data?.signedUrl || null
}
