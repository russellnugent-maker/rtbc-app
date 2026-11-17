// Photos from the phone in the store app (phase 5).
//
// Why not just <input type="file"> as on the web: on Android, Capacitor's file chooser opens the
// camera OR the file picker, never a choice of both (BridgeWebChromeClient.onShowFileChooser:
// `capture` set → camera only; otherwise → the system picker, no camera). The Camera plugin's
// Prompt source asks "Take a photo / Choose from your photos" on both Android and iOS.
// iOS needs NSCameraUsageDescription and NSPhotoLibraryUsageDescription (ios/App/App/Info.plist).
//
// Only called on native (callers gate on NATIVE). The plugin is imported dynamically, so the web
// bundle never loads it.

/** A cancelled prompt or camera is not an error: the runner changed their mind. */
export const isCancelled = (e) => /cancel/i.test(String(e?.message || e || ''))

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp' }

/** The photo as a File the existing upload code takes, or null if the runner cancelled. */
export async function takeOrChoosePhoto(header = 'Add a photo') {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  let photo
  try {
    photo = await Camera.getPhoto({
      source: CameraSource.Prompt,
      resultType: CameraResultType.Uri,
      quality: 85,
      width: 2000,              // a 12 MP original is far more than a certificate or medal needs
      correctOrientation: true,
      saveToGallery: false,     // so no "add to photos" permission is needed
      promptLabelHeader: header,
      promptLabelPicture: 'Take a photo',
      promptLabelPhoto: 'Choose from your photos',
      promptLabelCancel: 'Cancel',
    })
  } catch (e) {
    if (isCancelled(e)) return null
    throw new Error('Could not open the camera or your photos. Check the app’s permissions in Settings.')
  }
  const blob = await (await fetch(photo.webPath)).blob()
  const ext = String(photo.format || 'jpeg').toLowerCase()
  const type = blob.type && blob.type.startsWith('image/') ? blob.type : (MIME[ext] || 'image/jpeg')
  return new File([blob], `photo.${ext === 'jpeg' ? 'jpg' : ext}`, { type })
}
