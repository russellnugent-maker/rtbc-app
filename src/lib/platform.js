// The ONE place that decides whether this is the store app or the website (build spec §2).
//
// The native bundle (`npm run build:native`, Vite mode 'native') only ever runs inside the
// Capacitor shell, so the build mode alone makes it native. The mode is a BUILD-TIME constant:
// in the native bundle `NATIVE` folds to `true`, and everything behind `!NATIVE` (entry, sign-up,
// the YNM offer, the review queue) is removed from the bundle, not just hidden. It also lets the
// native screens be previewed in a desktop browser. The Capacitor check covers a web build that
// is ever loaded inside the shell.
import { Capacitor } from '@capacitor/core'

export const NATIVE = import.meta.env.MODE === 'native' || Capacitor.isNativePlatform()

export const isNative = () => NATIVE
