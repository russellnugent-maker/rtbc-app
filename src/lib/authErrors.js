// Runner-facing wording for auth failures. Never shows Supabase's own message, a status code or a
// URL (standing rule): anything not recognised gets the generic line.

export const GENERIC = 'Something went wrong. Check your connection and try again.'

export function friendlyAuthError(err) {
  const m = String(err?.message || err || '')
  const status = Number(err?.status) || 0
  if (/invalid login/i.test(m)) return 'That email and password don’t match. Try again, or reset your password.'
  if (/already registered/i.test(m)) return 'That email already has an account. Sign in instead.'
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox for the link.'
  if (/token has expired|otp.*(expired|invalid)|invalid.*(token|otp)/i.test(m)) return 'That code is wrong or has expired. Check the latest email, or send a new code.'
  if (status === 429 || /rate limit|only request this after/i.test(m)) return 'Too many emails in a short time. Wait a minute, then try again.'
  if (/should be different/i.test(m)) return 'Choose a password different from your current one.'
  if (/password should be at least|weak password/i.test(m)) return 'That password is too short. Use at least 8 characters.'
  return GENERIC
}

/**
 * With shouldCreateUser: false, Supabase refuses a code or link for an email with no account.
 * The runner sees the same "on its way" notice either way, so the form never reveals who has an
 * account.
 */
export const isNoAccountForOtp = (err) => /signups not allowed|user not found/i.test(String(err?.message || err || ''))

/**
 * A tapped auth link that failed comes back with the error in the URL fragment (or query), e.g.
 * #error=access_denied&error_code=otp_expired. Returns the runner-facing line, or null.
 */
export function linkError(hash = '', search = '') {
  const p = new URLSearchParams(String(hash).replace(/^#/, ''))
  const q = new URLSearchParams(String(search).replace(/^\?/, ''))
  const code = p.get('error_code') || q.get('error_code')
  const error = p.get('error') || q.get('error')
  if (!code && !error) return null
  if (code === 'otp_expired') return 'That link has expired or was already used. Send yourself a new one, or sign in with your password.'
  return 'That link didn’t work. Send yourself a new one, or sign in with your password.'
}

/** The 6-digit email code: digits only (spaces and dashes from a paste are dropped). */
export function normaliseCode(input) {
  const digits = String(input || '').replace(/\D/g, '').slice(0, 6)
  return { digits, valid: digits.length === 6 }
}
