import './lib/authLanding.js'   // first: reads a failed auth link's error before Supabase starts
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { captureRef } from './lib/provinces.js'
import { NATIVE } from './lib/platform.js'

captureRef()
// Website only: the Meta Pixel for the launch ads. Never part of the store app.
if (!NATIVE) import('./lib/metaPixel.js').then((m) => m.initPixel())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
