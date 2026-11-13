import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Web: the marketing page stays at /, the web app lives at /app/.
// Native (`npm run build:native`, mode 'native'): Capacitor serves the bundle from the ROOT of
// capacitor://localhost (iOS) and https://localhost (Android), so the base is '/'. The landing
// page is not part of that bundle.
export default defineConfig(({ mode }) => ({
  base: mode === 'native' ? '/' : '/app/',
  plugins: [react()],
}))
