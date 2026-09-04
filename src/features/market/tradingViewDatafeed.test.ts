import assert from 'node:assert/strict'
import test from 'node:test'

import type { Candle } from './marketData.ts'
import {
  createTradingViewDatafeed,
  normalizeHistoryBars,
  type TradingViewBar,
} from './tradingViewDatafeed.ts'

const candle = (start: number, close: number): Candle => ({
  close,
  high: close + 1,
  low: close - 1,
  open: close - 0.5,
  start,
  volume: close / 10,
})

test('TradingView history is ascending, unique, and excludes the right boundary', () => {
  assert.deepEqual(
    normalizeHistoryBars(
      [
        candle(120_000, 20),
        candle(60_000, 10),
        candle(120_000, 21),
        candle(180_000, 30),
      ],
      180,
    ),
    [
      { close: 10, high: 11, low: 9, open: 9.5, time: 60_000, volume: 1 },
      {
        close: 21,
        high: 22,
        low: 20,
        open: 20.5,
        time: 120_000,
        volume: 2.1,
      },
    ],
  )
})

test('TradingView deduplicates history and routes realtime by resolution', async () => {
  let loads = 0
  const feed = createTradingViewDatafeed({
    loadHistory: async () => {
      loads += 1
      await Promise.resolve()
      return [candle(60_000, 10)]
    },
  })
  const period = { countBack: 300, firstDataRequest: true, from: 0, to: 120 }
  const getBars = () =>
    new Promise<TradingViewBar[]>((resolve, reject) => {
      feed.datafeed.getBars(
        {} as never,
        '1' as never,
        period,
        (bars) => resolve(bars),
        reject,
      )
    })
  const [first, second] = await Promise.all([getBars(), getBars()])
  assert.equal(loads, 1)
  assert.deepEqual(first, second)

  const received: TradingViewBar[] = []
  feed.datafeed.subscribeBars(
    {} as never,
    '1' as never,
    (bar) => received.push(bar),
    'chart-1',
    () => undefined,
  )
  feed.update('3', candle(60_000, 9))
  feed.update('1', candle(60_000, 10))
  feed.update('1', candle(60_000, 10))
  feed.update('1', candle(60_000, 11))
  feed.datafeed.unsubscribeBars('chart-1')
  feed.update('1', candle(120_000, 12))
  feed.dispose()

  assert.deepEqual(received, [
    { close: 10, high: 11, low: 9, open: 9.5, time: 60_000, volume: 1 },
    {
      close: 11,
      high: 12,
      low: 10,
      open: 10.5,
      time: 60_000,
      volume: 1.1,
    },
  ])
})
