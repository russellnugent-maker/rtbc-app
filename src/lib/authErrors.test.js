// Run with: npm test
// Runner-facing auth wording: no raw Supabase messages, codes or URLs ever reach the screen.
import test from 'node:test'
import assert from 'node:assert/strict'
import { friendlyAuthError, isNoAccountForOtp, linkError, normaliseCode, GENERIC } from './authErrors.js'
import { OTP_LENGTH, codeLabel } from './authConfig.js'

test('known failures get plain wording', () => {
  assert.match(friendlyAuthError({ message: 'Invalid login credentials', status: 400 }), /don’t match/)
  assert.match(friendlyAuthError({ message: 'Token has expired or is invalid', status: 403 }), /code is wrong or has expired/)
  assert.match(friendlyAuthError({ message: 'email rate limit exceeded', status: 429 }), /Wait a minute/)
  assert.match(friendlyAuthError({ message: 'For security purposes, you can only request this after 42 seconds.' }), /Wait a minute/)
})

test('anything unrecognised is the generic line, never the raw message', () => {
  const raw = { message: 'FetchError: request to https://lkazcbvczleavcwlosrx.supabase.co/auth/v1/otp failed, 500', status: 500 }
  assert.equal(friendlyAuthError(raw), GENERIC)
  assert.equal(friendlyAuthError(undefined), GENERIC)
})

test('a code asked for an email with no account looks the same as one that was sent', () => {
  assert.equal(isNoAccountForOtp({ message: 'Signups not allowed for otp' }), true)
  assert.equal(isNoAccountForOtp({ message: 'Invalid login credentials' }), false)
})

test('a failed auth link in the URL becomes a plain line', () => {
  assert.match(linkError('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'), /expired or was already used/)
  assert.match(linkError('', '?error=server_error'), /didn’t work/)
  assert.equal(linkError('#access_token=abc&refresh_token=def'), null)
  assert.equal(linkError('', ''), null)
})

test('the email code: pasted spaces and dashes are dropped; the length comes from config', () => {
  assert.equal(OTP_LENGTH, 8)   // the shared project's setting (13 Nov 2026)
  assert.deepEqual(normaliseCode(' 1234 5678 ', OTP_LENGTH), { digits: '12345678', valid: true })
  assert.deepEqual(normaliseCode('1234-5678', OTP_LENGTH), { digits: '12345678', valid: true })
  assert.equal(normaliseCode('123456', OTP_LENGTH).valid, false)          // a 6-digit code is short
  assert.equal(normaliseCode('123456789', OTP_LENGTH).digits, '12345678') // extra digits dropped
  assert.deepEqual(normaliseCode('123 456', 6), { digits: '123456', valid: true })
})

test('the code is named with the right article', () => {
  assert.equal(codeLabel(8), 'an 8-digit code')
  assert.equal(codeLabel(6), 'a 6-digit code')
  assert.equal(codeLabel(), 'an 8-digit code')
})
