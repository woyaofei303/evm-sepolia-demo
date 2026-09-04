import {
  MARKET_PRODUCT,
  parseOkxBookSnapshot,
  parseOkxCandles,
  toOkxBar,
  type Candle,
  type MarketResolution,
} from './marketData'

const OKX_REST_URL = 'https://www.okx.com/api/v5/market'

async function readOkx(path: string): Promise<unknown> {
  const response = await fetch(`${OKX_REST_URL}/${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`OKX HTTP ${response.status}`)
  const payload = (await response.json()) as {
    code?: unknown
    msg?: unknown
  }
  if (payload.code !== '0') {
    throw new Error(
      typeof payload.msg === 'string' ? payload.msg : 'OKX 返回错误',
    )
  }
  return payload
}

export async function readOkxCandles(
  resolution: MarketResolution,
  to: number | undefined,
  limit: number,
): Promise<Candle[]> {
  const pageSize = Math.min(300, Math.max(1, Math.floor(limit)))
  const sourceSize =
    resolution === '12M'
      ? Math.min(300, Math.max(24, pageSize * 12 + 12))
      : pageSize
  const params = new URLSearchParams({
    bar: toOkxBar(resolution),
    instId: MARKET_PRODUCT,
    limit: String(sourceSize),
  })
  if (to) params.set('after', String(to * 1_000))
  const candles = parseOkxCandles(
    await readOkx(`history-candles?${params}`),
    resolution,
  )
  const beforeBoundary = to
    ? candles.filter((candle) => candle.start < to * 1_000)
    : candles
  return beforeBoundary.slice(-pageSize)
}

export async function readOkxBook() {
  return parseOkxBookSnapshot(
    await readOkx(`books?instId=${MARKET_PRODUCT}&sz=100`),
  )
}
