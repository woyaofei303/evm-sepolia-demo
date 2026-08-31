// Market 功能把数据解析与页面放在同一目录；这里只保留展示所需的产品、价格和时间。
export type MarketTick = {
  product: string
  price: number
  time: string
}

export type MarketTrade = MarketTick & {
  id: string
  side: 'buy' | 'sell'
  size: number
}

export type BookUpdate = {
  price: number
  quantity: number
  side: 'bid' | 'offer'
  time: string
}

export type BookLevel = Pick<BookUpdate, 'price' | 'quantity'>

export type OrderBook = {
  asks: BookLevel[]
  bids: BookLevel[]
}

export type BookSnapshot = {
  book: OrderBook
  time: string
}

export type Candle = {
  start: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  firstTradeAt: number
  lastTradeAt: number
}

export type CoinbaseMessage =
  | { type: 'ticker'; tick: MarketTick }
  | { type: 'trades'; trades: MarketTrade[] }
  | {
      type: 'book'
      product: string
      replace: boolean
      updates: BookUpdate[]
    }

export type MarketMode = 'live' | 'mock'

export type MarketStreamState = {
  book: OrderBook
  candles: Candle[]
  metrics: {
    lastDataAt: number
    messages: number
    renderBatches: number
  }
  snapshotStatus: string
  status: string
  ticks: MarketTick[]
  trades: MarketTrade[]
}

export type MarketWorkerCommand =
  { type: 'resume' } | { type: 'start'; mode: MarketMode }

export type MarketWorkerEvent = {
  state: MarketStreamState
  type: 'state'
}

/** Coinbase REST candles: [time, low, high, open, close, volume]. */
export function parseCoinbaseCandlesSnapshot(
  payload: unknown,
  limit = 300,
): Candle[] {
  if (!Array.isArray(payload)) return []

  return payload
    .flatMap((row) => {
      if (!Array.isArray(row) || row.length < 6) return []
      const [time, low, high, open, close, volume] = row.map(Number)
      if (
        ![time, low, high, open, close, volume].every(Number.isFinite) ||
        time < 0 ||
        low <= 0 ||
        high < low ||
        open < low ||
        open > high ||
        close < low ||
        close > high ||
        volume < 0
      )
        return []
      const start = time * 1_000
      return [
        {
          close,
          firstTradeAt: start,
          high,
          lastTradeAt: start,
          low,
          open,
          start,
          volume,
        } satisfies Candle,
      ]
    })
    .toSorted((left, right) => left.start - right.start)
    .slice(-Math.max(1, limit))
}

/** Coinbase REST level=2 book becomes the worker's full replacement snapshot. */
export function parseCoinbaseBookSnapshot(
  payload: unknown,
  limit = 100,
): BookSnapshot | undefined {
  if (!payload || typeof payload !== 'object') return
  const data = payload as Record<string, unknown>
  if (
    !Array.isArray(data.asks) ||
    !Array.isArray(data.bids) ||
    typeof data.time !== 'string'
  )
    return

  const parseSide = (rows: unknown[], side: BookUpdate['side']) =>
    rows.flatMap((row) => {
      if (!Array.isArray(row) || row.length < 2) return []
      const price = Number(row[0])
      const quantity = Number(row[1])
      return Number.isFinite(price) &&
        Number.isFinite(quantity) &&
        price > 0 &&
        quantity > 0
        ? [{ price, quantity, side, time: data.time as string }]
        : []
    })

  return {
    book: applyBookUpdates(
      { asks: [], bids: [] },
      [...parseSide(data.asks, 'offer'), ...parseSide(data.bids, 'bid')],
      limit,
    ),
    time: data.time,
  }
}

/** Level2 的 quantity 是该价位最新总量；0 表示删除，不是增量相加。 */
export function applyBookUpdates(
  book: OrderBook,
  updates: readonly BookUpdate[],
  limit = 12,
): OrderBook {
  const applySide = (
    levels: readonly BookLevel[],
    side: BookUpdate['side'],
  ) => {
    const next = new Map(levels.map((level) => [level.price, level.quantity]))
    for (const update of updates) {
      if (update.side !== side) continue
      if (update.quantity === 0) next.delete(update.price)
      else next.set(update.price, update.quantity)
    }
    return [...next.entries()]
      .map(([price, quantity]) => ({ price, quantity }))
      .sort((left, right) =>
        side === 'bid' ? right.price - left.price : left.price - right.price,
      )
      .slice(0, Math.max(1, limit))
  }

  return {
    asks: applySide(book.asks, 'offer'),
    bids: applySide(book.bids, 'bid'),
  }
}

/** 逐笔成交聚合为 OHLCV；迟到消息只修正对应周期，不会覆盖较新的开收盘。 */
export function updateCandles(
  candles: readonly Candle[],
  trade: MarketTrade,
  intervalMs = 60_000,
  limit = 30,
): Candle[] {
  const tradeAt = Date.parse(trade.time)
  if (!Number.isFinite(tradeAt) || intervalMs <= 0) return [...candles]
  const start = Math.floor(tradeAt / intervalMs) * intervalMs
  const current = candles.find((candle) => candle.start === start)
  const next = current
    ? candles.map((candle) =>
        candle !== current
          ? candle
          : {
              ...candle,
              close: tradeAt >= candle.lastTradeAt ? trade.price : candle.close,
              firstTradeAt: Math.min(candle.firstTradeAt, tradeAt),
              high: Math.max(candle.high, trade.price),
              lastTradeAt: Math.max(candle.lastTradeAt, tradeAt),
              low: Math.min(candle.low, trade.price),
              open: tradeAt < candle.firstTradeAt ? trade.price : candle.open,
              volume: candle.volume + trade.size,
            },
      )
    : [
        ...candles,
        {
          close: trade.price,
          firstTradeAt: tradeAt,
          high: trade.price,
          lastTradeAt: tradeAt,
          low: trade.price,
          open: trade.price,
          start,
          volume: trade.size,
        },
      ]

  return next
    .toSorted((left, right) => left.start - right.start)
    .slice(-Math.max(1, limit))
}

type CoinbasePayload = {
  channel?: unknown
  timestamp?: unknown
  events?: Array<{
    product_id?: unknown
    type?: unknown
    tickers?: Array<{ product_id?: unknown; price?: unknown }>
    trades?: Array<{
      product_id?: unknown
      price?: unknown
      size?: unknown
      side?: unknown
      time?: unknown
      trade_id?: unknown
    }>
    updates?: Array<{
      side?: unknown
      price_level?: unknown
      new_quantity?: unknown
      event_time?: unknown
    }>
  }>
}

/** 把外部 WebSocket 的三种频道收敛为页面唯一信任的数据结构。 */
export function parseCoinbaseMessage(
  message: string,
): CoinbaseMessage | undefined {
  try {
    const data = JSON.parse(message) as CoinbasePayload
    const fallbackTime =
      typeof data.timestamp === 'string'
        ? data.timestamp
        : new Date().toISOString()

    if (data.channel === 'ticker') {
      const tick = parseCoinbaseTicker(message)
      return tick ? { type: 'ticker', tick } : undefined
    }

    if (data.channel === 'market_trades') {
      const trades = (
        data.events?.flatMap((event) => event.trades ?? []) ?? []
      ).flatMap((trade) => {
        const price = Number(trade.price)
        const size = Number(trade.size)
        const side =
          typeof trade.side === 'string' ? trade.side.toLowerCase() : ''
        if (
          typeof trade.product_id !== 'string' ||
          typeof trade.trade_id !== 'string' ||
          !Number.isFinite(price) ||
          !Number.isFinite(size) ||
          size <= 0 ||
          (side !== 'buy' && side !== 'sell')
        )
          return []
        return [
          {
            id: trade.trade_id,
            price,
            product: trade.product_id,
            side,
            size,
            time: typeof trade.time === 'string' ? trade.time : fallbackTime,
          } satisfies MarketTrade,
        ]
      })
      return trades.length ? { type: 'trades', trades } : undefined
    }

    if (data.channel === 'l2_data') {
      const event = data.events?.[0]
      if (typeof event?.product_id !== 'string') return
      const updates = (event.updates ?? []).flatMap((update) => {
        const price = Number(update.price_level)
        const quantity = Number(update.new_quantity)
        if (
          (update.side !== 'bid' && update.side !== 'offer') ||
          !Number.isFinite(price) ||
          !Number.isFinite(quantity) ||
          quantity < 0
        )
          return []
        return [
          {
            price,
            quantity,
            side: update.side,
            time:
              typeof update.event_time === 'string'
                ? update.event_time
                : fallbackTime,
          } satisfies BookUpdate,
        ]
      })
      return updates.length
        ? {
            type: 'book',
            product: event.product_id,
            replace: event.type === 'snapshot',
            updates,
          }
        : undefined
    }
  } catch {
    return
  }
}

/** 解析 Coinbase ticker 消息；心跳、畸形 JSON 和无效价格都返回 undefined。 */
export function parseCoinbaseTicker(message: string): MarketTick | undefined {
  try {
    // 外部 WebSocket 数据属于不可信输入，因此先以 unknown 字段描述边界。
    const data = JSON.parse(message) as CoinbasePayload
    const ticker = data.events?.[0]?.tickers?.[0]
    const price = Number(ticker?.price)
    // 只接受 ticker 频道、字符串产品 ID 和有限数值价格。
    if (
      data.channel !== 'ticker' ||
      typeof ticker?.product_id !== 'string' ||
      !Number.isFinite(price)
    )
      return
    return {
      product: ticker.product_id,
      price,
      time:
        typeof data.timestamp === 'string'
          ? data.timestamp
          : new Date().toISOString(),
    }
  } catch {
    return
  }
}

/** 追加一个元素并只保留最后 limit 条，防止长连接无限占用内存。 */
export function appendBounded<T>(
  items: readonly T[],
  item: T,
  limit: number,
): T[] {
  return [...items, item].slice(-Math.max(1, limit))
}

/** 指数退避重连，最长等待 15 秒，兼顾恢复速度和服务端压力。 */
export function retryDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, 15_000)
}
