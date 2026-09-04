export const MARKET_PRODUCT = 'ETH-USDT-SWAP'

export const MARKET_RESOLUTIONS = [
  '1S',
  '1',
  '3',
  '5',
  '15',
  '30',
  '60',
  '120',
  '240',
  '720',
  '1D',
  '3D',
  '1W',
  '12M',
] as const

export type MarketResolution = (typeof MARKET_RESOLUTIONS)[number]
export type MarketMode = 'live' | 'mock'
export type MarketPerformanceMode = 'realtime' | 'throttled' | 'saver'

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
}

export type OkxMessage =
  | { type: 'ticker'; tick: MarketTick }
  | { type: 'trades'; trades: MarketTrade[] }
  | {
      type: 'book'
      product: string
      replace: boolean
      updates: BookUpdate[]
    }
  | { type: 'candle'; candle: Candle; channel: string }

export type MarketStreamState = {
  book: OrderBook
  latestCandle?: Candle
  latestTick?: MarketTick
  metrics: {
    ackLatencyMs: number
    lastDataAt: number
    messages: number
    performanceMode: MarketPerformanceMode
    renderBatches: number
    sequence: number
  }
  resolution: MarketResolution
  snapshotStatus: string
  status: string
  trades: MarketTrade[]
}

export type MarketWorkerCommand =
  | { type: 'ack'; latencyMs: number; sequence: number }
  | { type: 'pause' }
  | { type: 'pressure' }
  | { type: 'resolution'; resolution: MarketResolution }
  | { type: 'resume' }
  | { type: 'start'; mode: MarketMode }

export type MarketWorkerEvent = {
  sentAt: number
  sequence: number
  state: MarketStreamState
  type: 'state'
}

const OKX_BARS: Record<MarketResolution, string> = {
  '1S': '1s',
  '1': '1m',
  '3': '3m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1H',
  '120': '2H',
  '240': '4H',
  '720': '12Hutc',
  '1D': '1Dutc',
  '3D': '3Dutc',
  '1W': '1Wutc',
  // OKX 没有 1 年 K 线；历史和实时都以 UTC 月线聚合。
  '12M': '1Mutc',
}

export function isMarketResolution(value: unknown): value is MarketResolution {
  return MARKET_RESOLUTIONS.includes(value as MarketResolution)
}

export function toOkxBar(resolution: MarketResolution): string {
  return OKX_BARS[resolution]
}

export function toOkxCandleChannel(resolution: MarketResolution): string {
  return `candle${toOkxBar(resolution)}`
}

function parseCandleRow(row: unknown): Candle | undefined {
  if (!Array.isArray(row) || row.length < 6) return
  const [start, open, high, low, close, volume] = row.slice(0, 6).map(Number)
  if (
    ![start, open, high, low, close, volume].every(Number.isFinite) ||
    start < 0 ||
    low <= 0 ||
    high < low ||
    open < low ||
    open > high ||
    close < low ||
    close > high ||
    volume < 0
  )
    return
  return { close, high, low, open, start, volume }
}

function utcYearStart(timestamp: number): number {
  return Date.UTC(new Date(timestamp).getUTCFullYear(), 0, 1)
}

export function aggregateYearCandles(candles: readonly Candle[]): Candle[] {
  const years = new Map<number, Candle>()
  for (const candle of candles.toSorted(
    (left, right) => left.start - right.start,
  )) {
    const start = utcYearStart(candle.start)
    const current = years.get(start)
    years.set(
      start,
      current
        ? {
            ...current,
            close: candle.close,
            high: Math.max(current.high, candle.high),
            low: Math.min(current.low, candle.low),
            volume: current.volume + candle.volume,
          }
        : { ...candle, start },
    )
  }
  return [...years.values()]
}

/** OKX REST/WS K 线均为 [ts,o,h,l,c,vol,...]，接口默认倒序返回。 */
export function parseOkxCandles(
  payload: unknown,
  resolution: MarketResolution,
): Candle[] {
  const rows =
    payload && typeof payload === 'object'
      ? (payload as { data?: unknown }).data
      : payload
  if (!Array.isArray(rows)) return []
  const candles = rows
    .flatMap((row) => {
      const candle = parseCandleRow(row)
      return candle ? [candle] : []
    })
    .toSorted((left, right) => left.start - right.start)
  return resolution === '12M' ? aggregateYearCandles(candles) : candles
}

function parseBookRows(
  rows: unknown,
  side: BookUpdate['side'],
  time: string,
): BookUpdate[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 2) return []
    const price = Number(row[0])
    const quantity = Number(row[1])
    return Number.isFinite(price) &&
      Number.isFinite(quantity) &&
      price > 0 &&
      quantity >= 0
      ? [{ price, quantity, side, time }]
      : []
  })
}

export function parseOkxBookSnapshot(
  payload: unknown,
  limit = 100,
): BookSnapshot | undefined {
  if (!payload || typeof payload !== 'object') return
  const row = (payload as { data?: unknown[] }).data?.[0]
  if (!row || typeof row !== 'object') return
  const data = row as { asks?: unknown; bids?: unknown; ts?: unknown }
  if (typeof data.ts !== 'string') return
  const time = new Date(Number(data.ts)).toISOString()
  return {
    book: applyBookUpdates(
      { asks: [], bids: [] },
      [
        ...parseBookRows(data.asks, 'offer', time),
        ...parseBookRows(data.bids, 'bid', time),
      ],
      limit,
    ),
    time,
  }
}

/** 把 OKX 外部消息收敛为页面唯一信任的数据结构。 */
export function parseOkxMessage(message: string): OkxMessage | undefined {
  if (message === 'pong') return
  try {
    const payload = JSON.parse(message) as {
      action?: unknown
      arg?: { channel?: unknown; instId?: unknown }
      data?: unknown[]
    }
    const channel = payload.arg?.channel
    const product = payload.arg?.instId
    if (typeof channel !== 'string' || typeof product !== 'string') return

    if (channel === 'tickers') {
      const row = payload.data?.at(-1) as
        { instId?: unknown; last?: unknown; ts?: unknown } | undefined
      const price = Number(row?.last)
      const timestamp = Number(row?.ts)
      if (!Number.isFinite(price) || !Number.isFinite(timestamp)) return
      return {
        tick: {
          price,
          product: typeof row?.instId === 'string' ? row.instId : product,
          time: new Date(timestamp).toISOString(),
        },
        type: 'ticker',
      }
    }

    if (channel === 'trades') {
      const trades = (payload.data ?? []).flatMap((value) => {
        const row = value as {
          instId?: unknown
          px?: unknown
          side?: unknown
          sz?: unknown
          tradeId?: unknown
          ts?: unknown
        }
        const price = Number(row.px)
        const size = Number(row.sz)
        const timestamp = Number(row.ts)
        if (
          typeof row.tradeId !== 'string' ||
          (row.side !== 'buy' && row.side !== 'sell') ||
          !Number.isFinite(price) ||
          !Number.isFinite(size) ||
          !Number.isFinite(timestamp) ||
          size <= 0
        )
          return []
        return [
          {
            id: row.tradeId,
            price,
            product: typeof row.instId === 'string' ? row.instId : product,
            side: row.side,
            size,
            time: new Date(timestamp).toISOString(),
          } satisfies MarketTrade,
        ]
      })
      return trades.length ? { trades, type: 'trades' } : undefined
    }

    if (channel === 'books') {
      const updates = (payload.data ?? []).flatMap((value) => {
        const row = value as { asks?: unknown; bids?: unknown; ts?: unknown }
        const timestamp = Number(row.ts)
        if (!Number.isFinite(timestamp)) return []
        const time = new Date(timestamp).toISOString()
        return [
          ...parseBookRows(row.asks, 'offer', time),
          ...parseBookRows(row.bids, 'bid', time),
        ]
      })
      return updates.length
        ? {
            product,
            replace: payload.action === 'snapshot',
            type: 'book',
            updates,
          }
        : undefined
    }

    if (channel.startsWith('candle')) {
      const candle = parseCandleRow(payload.data?.at(-1))
      return candle ? { candle, channel, type: 'candle' } : undefined
    }
  } catch {
    return
  }
}

/** Level2 的 quantity 是该价位最新总量；0 表示删除，不是增量相加。 */
export function applyBookUpdates(
  book: OrderBook,
  updates: readonly BookUpdate[],
  limit = 100,
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

/** 1 年周期由 OKX 月线聚合；首个实时月线只修正快照，不重复累计成交量。 */
export function mergeRealtimeCandle(
  current: Candle | undefined,
  incoming: Candle,
  resolution: MarketResolution,
  previousSource?: Candle,
): Candle {
  if (resolution !== '12M') return incoming
  const start = utcYearStart(incoming.start)
  if (!current || current.start !== start) return { ...incoming, start }
  const sameSource = previousSource?.start === incoming.start
  const sourceInYear =
    previousSource && utcYearStart(previousSource.start) === start
  const addedVolume = sameSource
    ? Math.max(0, incoming.volume - previousSource.volume)
    : sourceInYear
      ? incoming.volume
      : 0
  return {
    ...current,
    close: incoming.close,
    high: Math.max(current.high, incoming.high),
    low: Math.min(current.low, incoming.low),
    volume: current.volume + addedVolume,
  }
}

export function appendBounded<T>(
  items: readonly T[],
  item: T,
  limit: number,
): T[] {
  return [...items, item].slice(-Math.max(1, limit))
}

export function retryDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, 15_000)
}
