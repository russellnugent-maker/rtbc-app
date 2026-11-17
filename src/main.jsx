import './lib/authLanding.js'   // first: reads a failed auth link's error before Supabase starts
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { captureRef } from './lib/provinces.js'
import { NATIVE } from './lib/platform.js'

captureRef()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

// Store app: the splash stays up until the first frame is drawn (launchAutoHide is off, so there
// is no flash of an empty page). Hidden here, not inside App, so that nothing App does (a slow
// network, an error) can leave the runner stuck on the splash.
if (NATIVE) {
  import('@capacitor/splash-screen').then(({ SplashScreen }) => {
    requestAnimationFrame(() => SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {}))
  })
}
