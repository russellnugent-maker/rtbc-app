import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core'
import { supabase } from '../lib/supabase.js'
import { deepLinkTarget, backAction } from '../lib/deepLink.js'
import { closeTopOverlay, overlayOpen } from '../lib/backStack.js'

// Store-app wiring that has no screen of its own (phase 5). Rendered by App only when NATIVE, so
// the web bundle drops it. Status bar: light text on the forest-green top bar (capacitor.config.json
// SystemBars.style = DARK); the Android navigation bar sits on the cream page, so it gets dark icons.
export default function NativeShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const path = useRef(location.pathname)
  useEffect(() => { path.current = location.pathname })

  useEffect(() => {
    SystemBars.setStyle({ style: SystemBarsStyle.Light, bar: SystemBarType.NavigationBar }).catch(() => {})
  }, [])

  useEffect(() => {
    let live = true
    const handles = []

    // A link that opened the app (universal link / App Link): sign in with the session it
    // carries, then go to the matching screen. Ignores anything that isn't ours.
    const open = async (url) => {
      const t = deepLinkTarget(url)
      if (!t) return
      if (t.session) await supabase.auth.setSession(t.session).catch(() => {})
      navigate(t.path, { replace: true })
    }

    import('@capacitor/app').then(async ({ App }) => {
      if (!live) return
      handles.push(await App.addListener('backButton', () => {
        const a = backAction({ overlayOpen: overlayOpen(), path: path.current })
        if (a === 'close-overlay') closeTopOverlay()
        // React Router keeps the in-app history position in history.state.idx; with nothing to go
        // back to (the app was opened on this page), go to the passport instead.
        else if (a === 'go-back') (window.history.state?.idx > 0 ? navigate(-1) : navigate('/', { replace: true }))
        else App.minimizeApp()
      }))
      handles.push(await App.addListener('appUrlOpen', ({ url }) => open(url)))
      const launch = await App.getLaunchUrl().catch(() => null)
      if (launch?.url) open(launch.url)
    })

    return () => { live = false; handles.forEach((h) => h.remove()) }
  }, [navigate])

  return null
}
