// Hands a share picture to the phone's own share menu.
// Store app: saved to the app's cache folder, then the native share sheet (@capacitor/share).
// Website: the Web Share API with the file where the browser supports it (phones), otherwise the
// picture is downloaded so the runner can post it themselves (desktop).
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { NATIVE } from './platform.js'

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1])
  r.onerror = () => reject(r.error)
  r.readAsDataURL(blob)
})

const cancelled = (e) => /cancel|abort/i.test(`${e?.name} ${e?.message}`)

/** Returns 'shared' | 'downloaded' | 'cancelled'. Throws on a real failure. */
export async function shareImage(blob, { filename, text, title }) {
  if (NATIVE) {
    const { uri } = await Filesystem.writeFile({
      path: filename, data: await toBase64(blob), directory: Directory.Cache,
    })
    try {
      await Share.share({ title, text, files: [uri], dialogTitle: title })
      return 'shared'
    } catch (e) {
      if (cancelled(e)) return 'cancelled'
      throw e
    }
  }

  const file = new File([blob], filename, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, title })
      return 'shared'
    } catch (e) {
      if (cancelled(e)) return 'cancelled'
      throw e
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'downloaded'
}
