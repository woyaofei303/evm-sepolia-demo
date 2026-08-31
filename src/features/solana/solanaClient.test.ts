// Solana 功能测试与客户端放在同一目录，避免 shared 测试反向依赖具体功能。
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isSolanaDevnetWalletSupported,
  validateSplTransfer,
  validateSolTransfer,
} from './solanaClient.ts'

test('Solana transfer preflight rejects an empty balance and self-transfer', () => {
  assert.throws(
    () => validateSolTransfer(0n, 1_000_000n, 'sender', 'recipient'),
    /insufficient funds/,
  )
  assert.throws(
    () => validateSolTransfer(2_000_000n, 1_000_000n, 'sender', 'sender'),
    /destination matches source/,
  )
  assert.doesNotThrow(() =>
    validateSolTransfer(2_000_000n, 1_000_000n, 'sender', 'recipient'),
  )
})

test('Solana Devnet excludes wallets that route signing to Mainnet', () => {
  assert.equal(
    isSolanaDevnetWalletSupported('MetaMask', ['solana:devnet']),
    false,
  )
  assert.equal(
    isSolanaDevnetWalletSupported('Solflare', ['solana:devnet']),
    true,
  )
  assert.equal(
    isSolanaDevnetWalletSupported('Mainnet wallet', ['solana:mainnet']),
    false,
  )
})

test('SPL transfer preflight rejects invalid amount, insufficient tokens and self-transfer', () => {
  assert.throws(
    () => validateSplTransfer(10n, 0n, 'sender', 'recipient'),
    /greater than zero/,
  )
  assert.throws(
    () => validateSplTransfer(10n, 11n, 'sender', 'recipient'),
    /insufficient token funds/,
  )
  assert.throws(
    () => validateSplTransfer(10n, 10n, 'sender', 'sender'),
    /destination matches source/,
  )
  assert.doesNotThrow(() =>
    validateSplTransfer(10n, 10n, 'sender', 'recipient'),
  )
})
