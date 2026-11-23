// The ONE place that decides whether this is the store app or the website (build spec §2).
//
// The native bundle (`npm run build:native`, Vite mode 'native') only ever runs inside the
// Capacitor shell, so the build mode alone makes it native. The mode is a BUILD-TIME constant:
// in the native bundle `NATIVE` folds to `true`, and everything behind `!NATIVE` (entry, sign-up,
// the YNM offer, the review queue) is removed from the bundle, not just hidden. It also lets the
// native screens be previewed in a desktop browser. The Capacitor check covers a web build that
// is ever loaded inside the shell.
import { Capacitor } from '@capacitor/core'
import { YNM_OFFER_URL, YNM_APP_STORE_URL, YNM_PLAY_URL } from './routes.js'

export const NATIVE = import.meta.env.MODE === 'native' || Capacitor.isNativePlatform()

export const isNative = () => NATIVE

// "Training plan" tab and the back-cover YNM card: the web offer on the website, YNM's App Store /
// Google Play listing in the store app.
// Written inline so the native build folds NATIVE to true and drops the web offer URL entirely
// (check:native proves it).
export const TRAINING_URL = NATIVE
  ? (Capacitor.getPlatform() === 'ios' ? YNM_APP_STORE_URL : YNM_PLAY_URL)
  : YNM_OFFER_URL
