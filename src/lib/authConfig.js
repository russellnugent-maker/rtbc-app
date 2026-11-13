// Auth settings that mirror the shared Supabase project (Energy Lab, YNM and RTBC share one).
//
// OTP_LENGTH: the email code length. The project-wide setting is 8 (Auth > Email > OTP length,
// confirmed by Russell 13 Nov 2026; YNM may depend on it), so 8 is the default. If the project
// setting ever changes, set VITE_AUTH_OTP_LENGTH in the Netlify build env (and .env.local) to
// match; no code change. Anything outside 6–10 falls back to 8.
const fromEnv = Number(import.meta.env?.VITE_AUTH_OTP_LENGTH)
export const OTP_LENGTH = Number.isInteger(fromEnv) && fromEnv >= 6 && fromEnv <= 10 ? fromEnv : 8

/** "an 8-digit code", "a 6-digit code". */
export const codeLabel = (n = OTP_LENGTH) => `${n === 8 ? 'an' : 'a'} ${n}-digit code`
