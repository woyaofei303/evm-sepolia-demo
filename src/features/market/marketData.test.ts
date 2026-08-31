// 用一条端到端样例覆盖行情解析、有界队列和重连退避三个纯函数。
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyBookUpdates,
  appendBounded,
  parseCoinbaseBookSnapshot,
  parseCoinbaseCandlesSnapshot,
  parseCoinbaseMessage,
  parseCoinbaseTicker,
  retryDelay,
  updateCandles,
} from './marketData.ts'

test('REST snapshots normalize, sort, validate, and bound candles and depth', () => {
  assert.deepEqual(
    parseCoinbaseCandlesSnapshot(
      [[120, 9, 13, 10, 12, 4], [60, 8, 11, 9, 10, 3], ['bad']],
      2,
    ),
    [
      {
        close: 10,
        firstTradeAt: 60_000,
        high: 11,
        lastTradeAt: 60_000,
        low: 8,
        open: 9,
        start: 60_000,
        volume: 3,
      },
      {
        close: 12,
        firstTradeAt: 120_000,
        high: 13,
        lastTradeAt: 120_000,
        low: 9,
        open: 10,
        start: 120_000,
        volume: 4,
      },
    ],
  )

  assert.deepEqual(
    parseCoinbaseBookSnapshot(
      {
        asks: [
          ['13', '2', 1],
          ['12', '1', 1],
        ],
        bids: [
          ['10', '3', 1],
          ['11', '4', 1],
        ],
        time: '2026-08-21T08:00:00Z',
      },
      1,
    ),
    {
      book: {
        asks: [{ price: 12, quantity: 1 }],
        bids: [{ price: 11, quantity: 4 }],
      },
      time: '2026-08-21T08:00:00Z',
    },
  )
  assert.equal(parseCoinbaseBookSnapshot({ bids: [] }), undefined)
})

test('market updates are parsed, bounded, and backed off', () => {
  // 模拟 Coinbase 实际 ticker 消息，确认字符串价格会转为 number。
  const tick = parseCoinbaseTicker(
    JSON.stringify({
      channel: 'ticker',
      timestamp: '2026-08-21T08:00:00Z',
      events: [{ tickers: [{ product_id: 'ETH-USD', price: '4321.50' }] }],
    }),
  )

  assert.deepEqual(tick, {
    product: 'ETH-USD',
    price: 4321.5,
    time: '2026-08-21T08:00:00Z',
  })
  // 队列应丢弃最旧元素，退避应从 1 秒增长并封顶 15 秒。
  assert.deepEqual(appendBounded([1, 2, 3], 4, 3), [2, 3, 4])
  assert.equal(retryDelay(0), 1_000)
  assert.equal(retryDelay(8), 15_000)
  assert.equal(parseCoinbaseTicker('{"channel":"heartbeats"}'), undefined)
})

test('level2 updates replace, remove, sort, and bound the visible book', () => {
  const book = applyBookUpdates(
    { asks: [], bids: [] },
    [
      { price: 4320, quantity: 1.5, side: 'bid', time: '2026-08-21T08:00:00Z' },
      { price: 4319, quantity: 2, side: 'bid', time: '2026-08-21T08:00:00Z' },
      { price: 4323, quantity: 1, side: 'offer', time: '2026-08-21T08:00:00Z' },
      { price: 4324, quantity: 3, side: 'offer', time: '2026-08-21T08:00:00Z' },
    ],
    2,
  )
  const updated = applyBookUpdates(
    book,
    [
      { price: 4320, quantity: 0, side: 'bid', time: '2026-08-21T08:00:01Z' },
      { price: 4321, quantity: 4, side: 'bid', time: '2026-08-21T08:00:01Z' },
      {
        price: 4323,
        quantity: 2.5,
        side: 'offer',
        time: '2026-08-21T08:00:01Z',
      },
    ],
    2,
  )

  assert.deepEqual(updated, {
    asks: [
      { price: 4323, quantity: 2.5 },
      { price: 4324, quantity: 3 },
    ],
    bids: [
      { price: 4321, quantity: 4 },
      { price: 4319, quantity: 2 },
    ],
  })
})

test('trades form bounded candles without letting late messages corrupt open and close', () => {
  const trade = (price: number, size: number, time: string, id: string) => ({
    id,
    price,
    product: 'ETH-USD',
    side: 'buy' as const,
    size,
    time,
  })

  let candles = updateCandles(
    [],
    trade(100, 2, '2026-08-21T08:00:30Z', '1'),
    60_000,
    2,
  )
  candles = updateCandles(
    candles,
    trade(90, 1, '2026-08-21T08:00:10Z', '2'),
    60_000,
    2,
  )
  candles = updateCandles(
    candles,
    trade(110, 0.5, '2026-08-21T08:01:00Z', '3'),
    60_000,
    2,
  )

  assert.deepEqual(candles, [
    {
      close: 100,
      firstTradeAt: Date.parse('2026-08-21T08:00:10Z'),
      high: 100,
      lastTradeAt: Date.parse('2026-08-21T08:00:30Z'),
      low: 90,
      open: 90,
      start: Date.parse('2026-08-21T08:00:00Z'),
      volume: 3,
    },
    {
      close: 110,
      firstTradeAt: Date.parse('2026-08-21T08:01:00Z'),
      high: 110,
      lastTradeAt: Date.parse('2026-08-21T08:01:00Z'),
      low: 110,
      open: 110,
      start: Date.parse('2026-08-21T08:01:00Z'),
      volume: 0.5,
    },
  ])
})

test('Coinbase messages normalize ticker, trades, and level2 updates', () => {
  const ticker = parseCoinbaseMessage(
    JSON.stringify({
      channel: 'ticker',
      timestamp: '2026-08-21T08:00:00Z',
      events: [{ tickers: [{ product_id: 'ETH-USD', price: '4321.50' }] }],
    }),
  )
  const trades = parseCoinbaseMessage(
    JSON.stringify({
      channel: 'market_trades',
      timestamp: '2026-08-21T08:00:01Z',
      events: [
        {
          trades: [
            {
              product_id: 'ETH-USD',
              price: '4322',
              size: '0.25',
              side: 'BUY',
              time: '2026-08-21T08:00:01Z',
              trade_id: '7',
            },
          ],
        },
      ],
    }),
  )
  const book = parseCoinbaseMessage(
    JSON.stringify({
      channel: 'l2_data',
      timestamp: '2026-08-21T08:00:02Z',
      events: [
        {
          product_id: 'ETH-USD',
          updates: [
            {
              side: 'bid',
              price_level: '4320',
              new_quantity: '1.5',
              event_time: '2026-08-21T08:00:02Z',
            },
          ],
        },
      ],
    }),
  )

  assert.deepEqual(ticker, {
    type: 'ticker',
    tick: { product: 'ETH-USD', price: 4321.5, time: '2026-08-21T08:00:00Z' },
  })
  assert.deepEqual(trades, {
    type: 'trades',
    trades: [
      {
        id: '7',
        price: 4322,
        product: 'ETH-USD',
        side: 'buy',
        size: 0.25,
        time: '2026-08-21T08:00:01Z',
      },
    ],
  })
  assert.deepEqual(book, {
    type: 'book',
    product: 'ETH-USD',
    replace: false,
    updates: [
      {
        price: 4320,
        quantity: 1.5,
        side: 'bid',
        time: '2026-08-21T08:00:02Z',
      },
    ],
  })
  assert.deepEqual(
    parseCoinbaseMessage(
      JSON.stringify({
        channel: 'l2_data',
        timestamp: '2026-08-21T08:00:03Z',
        events: [
          {
            product_id: 'ETH-USD',
            type: 'snapshot',
            updates: [
              {
                side: 'offer',
                price_level: '4323',
                new_quantity: '1',
              },
            ],
          },
        ],
      }),
    ),
    {
      product: 'ETH-USD',
      replace: true,
      type: 'book',
      updates: [
        {
          price: 4323,
          quantity: 1,
          side: 'offer',
          time: '2026-08-21T08:00:03Z',
        },
      ],
    },
  )
  assert.equal(parseCoinbaseMessage('{"channel":"market_trades"}'), undefined)
})
