import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import solc from 'solc'

import { counterAbi } from './counterAbi.ts'

test('Counter ABI exposes owner-only setNumber and its event', () => {
  const names = counterAbi.map((item) => item.name)

  assert.ok(names.includes('owner'))
  assert.ok(names.includes('setNumber'))
  assert.ok(names.includes('NumberSet'))
})

test('Counter exposes owner transfer and its event', () => {
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: 'Solidity',
        sources: {
          'Counter.sol': {
            content: readFileSync(
              path.join(process.cwd(), 'contracts', 'Counter.sol'),
              'utf8',
            ),
          },
        },
        settings: { outputSelection: { '*': { '*': ['abi'] } } },
      }),
    ),
  )
  const compilerErrors = (output.errors ?? []).filter(
    (error: { severity: string }) => error.severity === 'error',
  )
  assert.deepEqual(compilerErrors, [])

  const names = output.contracts['Counter.sol'].Counter.abi.flatMap(
    (item: { name?: string }) => (item.name ? [item.name] : []),
  )
  assert.ok(names.includes('transferOwnership'))
  assert.ok(names.includes('OwnershipTransferred'))
})
