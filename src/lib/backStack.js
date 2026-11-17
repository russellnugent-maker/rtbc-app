// What the Android back button closes first: sheets and viewers register here while open.
// The newest one closes first. Plain module state; the web never calls closeTopOverlay.
import { useEffect } from 'react'

const stack = []

/** Register a close function; returns the unregister. */
export function pushOverlay(close) {
  stack.push(close)
  return () => { const i = stack.lastIndexOf(close); if (i >= 0) stack.splice(i, 1) }
}

export const overlayOpen = () => stack.length > 0

/** Close the newest overlay. False if there was none. */
export function closeTopOverlay() {
  const close = stack[stack.length - 1]
  if (!close) return false
  close()
  return true
}

/** While `open`, the back button runs `close`. */
export function useBackClose(open, close) {
  useEffect(() => (open ? pushOverlay(close) : undefined), [open, close])
}
