import assert from 'node:assert/strict'
import test from 'node:test'

import {
  aggregateYearCandles,
  applyBookUpdates,
  appendBounded,
  mergeRealtimeCandle,
  parseOkxBookSnapshot,
  parseOkxCandles,
  parseOkxMessage,
  retryDelay,
  toOkxBar,
} from './marketData.ts'

test('OKX snapshots normalize, sort, validate, and aggregate annual bars', () => {
  const candles = parseOkxCandles(
    {
      data: [
        ['1738368000000', '12', '15', '11', '14', '4'],
        ['1735689600000', '10', '13', '9', '12', '3'],
        ['bad'],
      ],
    },
    '1',
  )
  assert.deepEqual(candles, [
    {
      close: 12,
      high: 13,
      low: 9,
      open: 10,
      start: 1_735_689_600_000,
      volume: 3,
    },
    {
      close: 14,
      high: 15,
      low: 11,
      open: 12,
      start: 1_738_368_000_000,
      volume: 4,
    },
  ])
  assert.deepEqual(aggregateYearCandles(candles), [
    {
      close: 14,
      high: 15,
      low: 9,
      open: 10,
      start: Date.UTC(2025, 0, 1),
      volume: 7,
    },
  ])
  assert.equal(toOkxBar('12M'), '1Mutc')
})

test('OKX ticker, trades, candle, and order book messages are parsed', () => {
  assert.deepEqual(
    parseOkxMessage(
      JSON.stringify({
        arg: { channel: 'tickers', instId: 'ETH-USDT-SWAP' },
        data: [
          {
            instId: 'ETH-USDT-SWAP',
            last: '4321.50',
            ts: '1787302800000',
          },
        ],
      }),
    ),
    {
      tick: {
        price: 4321.5,
        product: 'ETH-USDT-SWAP',
        time: '2026-08-21T09:00:00.000Z',
      },
      type: 'ticker',
    },
  )
  assert.deepEqual(
    parseOkxMessage(
      JSON.stringify({
        arg: { channel: 'trades', instId: 'ETH-USDT-SWAP' },
        data: [
          {
            instId: 'ETH-USDT-SWAP',
            px: '4322',
            side: 'buy',
            sz: '0.25',
            tradeId: '7',
            ts: '1787302801000',
          },
        ],
      }),
    ),
    {
      trades: [
        {
          id: '7',
          price: 4322,
          product: 'ETH-USDT-SWAP',
          side: 'buy',
          size: 0.25,
          time: '2026-08-21T09:00:01.000Z',
        },
      ],
      type: 'trades',
    },
  )
  assert.deepEqual(
    parseOkxMessage(
      JSON.stringify({
        arg: { channel: 'candle1m', instId: 'ETH-USDT-SWAP' },
        data: [['1787302800000', '10', '12', '9', '11', '4']],
      }),
    ),
    {
      candle: {
        close: 11,
        high: 12,
        low: 9,
        open: 10,
        start: 1_787_302_800_000,
        volume: 4,
      },
      channel: 'candle1m',
      type: 'candle',
    },
  )
})

test('order book snapshots and updates stay sorted and bounded', () => {
  const snapshot = parseOkxBookSnapshot(
    {
      data: [
        {
          asks: [
            ['13', '2'],
            ['12', '1'],
          ],
          bids: [
            ['10', '3'],
            ['11', '4'],
          ],
          ts: '1787302800000',
        },
      ],
    },
    1,
  )
  assert.deepEqual(snapshot?.book, {
    asks: [{ price: 12, quantity: 1 }],
    bids: [{ price: 11, quantity: 4 }],
  })
  assert.deepEqual(
    applyBookUpdates(
      snapshot!.book,
      [
        { price: 11, quantity: 0, side: 'bid', time: snapshot!.time },
        { price: 11.5, quantity: 2, side: 'bid', time: snapshot!.time },
      ],
      1,
    ).bids,
    [{ price: 11.5, quantity: 2 }],
  )
  assert.deepEqual(appendBounded([1, 2, 3], 4, 3), [2, 3, 4])
  assert.equal(retryDelay(8), 15_000)
})

test('annual realtime merge applies monthly volume deltas once', () => {
  const annual = {
    close: 110,
    high: 120,
    low: 80,
    open: 90,
    start: Date.UTC(2026, 0, 1),
    volume: 1_000,
  }
  const priorMonth = {
    close: 110,
    high: 115,
    low: 100,
    open: 105,
    start: Date.UTC(2026, 8, 1),
    volume: 100,
  }
  const nextMonth = { ...priorMonth, close: 121, high: 121, volume: 103 }

  assert.deepEqual(mergeRealtimeCandle(annual, nextMonth, '12M', priorMonth), {
    ...annual,
    close: 121,
    high: 121,
    volume: 1_003,
  })
})
