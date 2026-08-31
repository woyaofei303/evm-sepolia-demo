import assert from 'node:assert/strict'
import test from 'node:test'

import type { Candle } from './marketData.ts'
import {
  createTradingViewDatafeed,
  selectHistoryBars,
  type TradingViewBar,
} from './tradingViewDatafeed.ts'

const candle = (start: number, close: number): Candle => ({
  close,
  firstTradeAt: start,
  high: close + 1,
  lastTradeAt: start,
  low: close - 1,
  open: close - 0.5,
  start,
  volume: close / 10,
})

test('TradingView history honors countBack and excludes the right boundary', () => {
  assert.deepEqual(
    selectHistoryBars(
      [candle(60_000, 10), candle(120_000, 20), candle(180_000, 30)],
      { countBack: 2, to: 180 },
    ),
    [
      { close: 10, high: 11, low: 9, open: 9.5, time: 60_000, volume: 1 },
      {
        close: 20,
        high: 21,
        low: 19,
        open: 19.5,
        time: 120_000,
        volume: 2,
      },
    ],
  )
})

test('TradingView realtime publishes changed bars until the listener unsubscribes', () => {
  const feed = createTradingViewDatafeed()
  const received: TradingViewBar[] = []
  feed.datafeed.subscribeBars(
    {} as never,
    '1' as never,
    (bar) => received.push(bar),
    'chart-1',
    () => undefined,
  )

  const first = [candle(60_000, 10)]
  feed.update(first)
  feed.update(first)
  feed.update([candle(60_000, 11)])
  feed.datafeed.unsubscribeBars('chart-1')
  feed.update([candle(120_000, 12)])

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
