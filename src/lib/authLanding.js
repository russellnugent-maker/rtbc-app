// Imported FIRST in main.jsx: reads a failed auth link's error from the URL before the Supabase
// client starts and tidies the address bar.
import { linkError } from './authErrors.js'

export const landingLinkError = typeof window === 'undefined' ? null : linkError(window.location.hash, window.location.search)
