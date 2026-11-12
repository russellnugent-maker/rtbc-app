import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The marketing page stays at /, the web app lives at /app/
export default defineConfig({
  base: '/app/',
  plugins: [react()],
})
