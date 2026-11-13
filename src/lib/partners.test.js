// Run with: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { rand, entryCharityLine, BINAH_BACK_COVER_LINE, BINAH_URL } from './partners.js'

test('the /enter line reads the fee it is given, so a price change carries through', () => {
  assert.equal(entryCharityLine(49900), 'R50 of your R499 entry goes to the Binah Legacy Center.')
  assert.equal(entryCharityLine(59900), 'R50 of your R599 entry goes to the Binah Legacy Center.')
})

test('no usable fee: the line drops the entry amount instead of showing a wrong one', () => {
  for (const f of [null, undefined, 0, -100, 'abc', 499.5]) {
    assert.equal(entryCharityLine(f), 'R50 of your entry goes to the Binah Legacy Center.', String(f))
  }
})

test('rands: whole amounts without cents, odd amounts with them', () => {
  assert.equal(rand(5000), 'R50')
  assert.equal(rand(49950), 'R499.50')
})

test('back cover line and link', () => {
  assert.equal(BINAH_BACK_COVER_LINE, 'R50 of every entry goes to the Binah Legacy Center.')
  assert.equal(BINAH_URL, 'https://legacycenter.co.za')
})
