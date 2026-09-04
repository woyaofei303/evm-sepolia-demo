// 使用 Node 内置测试工具验证错误归一化，无需额外测试框架。
import assert from 'node:assert/strict'
import test from 'node:test'

import { getErrorMessage } from './errors.ts'

test('wallet and RPC failures become useful Chinese user messages', () => {
  // 覆盖用户拒绝、余额不足、RPC、钱包缺失、Solana 文案和未知错误。
  assert.equal(getErrorMessage({ code: 4001 }), '用户已在钱包中拒绝请求。')
  assert.equal(
    getErrorMessage(new Error('insufficient funds for gas * price + value')),
    'Sepolia ETH 不足，无法支付转账金额和手续费。',
  )
  assert.equal(
    getErrorMessage({ shortMessage: 'HTTP request failed.' }),
    'RPC 请求失败，请检查网络或公共 RPC。',
  )
  assert.equal(
    getErrorMessage(new Error('Provider not found.')),
    '未检测到浏览器扩展钱包，请安装或解锁钱包。',
  )
  assert.equal(
    getErrorMessage(
      new Error('insufficient funds'),
      'Solana Devnet',
      'Devnet SOL',
    ),
    'Devnet SOL 不足，无法支付转账金额和手续费。',
  )
  assert.equal(
    getErrorMessage(
      new Error(
        'Failed to send transaction: Transaction failed when it was simulated in order to estimate its resource limits.',
      ),
      'Solana Devnet',
      'Devnet SOL',
    ),
    'Solana 交易模拟失败，请检查 Devnet SOL 余额、收款地址和 RPC 后重试。',
  )
  assert.equal(
    getErrorMessage(
      new Error('destination matches source'),
      'Sui Devnet',
      'Devnet SUI',
    ),
    '收款地址不能与当前 Sui Devnet 账户相同，请填写另一个测试钱包地址。',
  )
  assert.equal(getErrorMessage(null), '未知的钱包或 RPC 错误。')
})
