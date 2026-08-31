import assert from 'node:assert/strict'
import test from 'node:test'

import { learningSwapAbi } from './learningSwapContract.ts'
import {
  DEFAULT_SLIPPAGE,
  maximumTransactionCost,
  minimumAmountOut,
  parseSlippageBps,
} from './slippage.ts'

// 最常用路径：0.5% = 50 bps，10_000 最小单位报价的最低到账应是 9_950。
test('converts a 0.5% quote tolerance to minimum output', () => {
  const bps = parseSlippageBps('0.5')

  assert.equal(bps, 50n)
  assert.equal(minimumAmountOut(10_000n, bps), 9_950n)
})

// 边界测试确保 UI 属性被绕过时，纯函数仍只接受设计允许的 0%～5%。
test('accepts only slippage from 0% through 5%', () => {
  assert.equal(parseSlippageBps('0'), 0n)
  assert.equal(parseSlippageBps('5'), 500n)
  assert.throws(() => parseSlippageBps('-0.01'), /滑点必须在 0% 到 5% 之间/)
  assert.throws(() => parseSlippageBps('5.01'), /滑点必须在 0% 到 5% 之间/)
  assert.throws(() => parseSlippageBps('5.001'), /滑点必须在 0% 到 5% 之间/)
})

test('transaction budget includes transferred value and the maximum gas fee', () => {
  assert.equal(maximumTransactionCost(1_000_000n, 21_000n, 30n), 1_630_000n)
  assert.throws(() => maximumTransactionCost(-1n, 21_000n, 30n), /不能小于零/)
})

// 这项测试验证相邻 learningSwapContract.ts 的 ABI，不属于滑点算法；放在这里是为了避免只含一个断言的测试文件。
test('exposes the complete teaching exchange interface', () => {
  // ABI 同时包含 function 和 event；两者都有 name，因此这里只提取名称做教学接口清单检查。
  const names: string[] = learningSwapAbi.flatMap((item) =>
    'name' in item ? [item.name] : [],
  )

  assert.equal(DEFAULT_SLIPPAGE, '0.5')
  // 循环让失败消息直接指出缺少哪个函数/事件，比比较整份大型 ABI 更容易定位。
  for (const name of [
    'owner',
    'token',
    'initialized',
    'closed',
    'getReserves',
    'quoteTokenForEth',
    'quoteEthForToken',
    'initialize',
    'swapTokenForEth',
    'swapEthForToken',
    'close',
    'Initialized',
    'Swap',
    'Closed',
  ]) {
    assert.ok(names.includes(name), `LearningSwap ABI 缺少 ${name}`)
  }
})
