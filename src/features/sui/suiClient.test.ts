import assert from 'node:assert/strict'
import test from 'node:test'

import { readCounterValue } from './suiClient.ts'

test('Sui shared Counter JSON only accepts unsigned integer values', () => {
  assert.equal(readCounterValue({ value: '42' }), '42')
  assert.equal(readCounterValue({ value: 7 }), '7')
  assert.equal(readCounterValue({ value: '-1' }), undefined)
  assert.equal(readCounterValue({ fields: { value: '42' } }), undefined)
})
