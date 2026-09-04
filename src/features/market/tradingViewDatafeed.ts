import {
  MARKET_PRODUCT,
  MARKET_RESOLUTIONS,
  type Candle,
  type MarketResolution,
} from './marketData.ts'
import type {
  Bar,
  IBasicDataFeed,
  LibrarySymbolInfo,
  PeriodParams,
  ResolutionString,
  SubscribeBarsCallback,
} from '../../../public/charting_library'

export type TradingViewBar = Bar
export const defaultResolution = '1' as ResolutionString
export const supportedResolutions =
  MARKET_RESOLUTIONS as unknown as ResolutionString[]

type HistoryLoader = (
  resolution: MarketResolution,
  period: PeriodParams,
  signal: AbortSignal,
) => Promise<Candle[]>

export function toTradingViewBar(candle: Candle): TradingViewBar {
  return {
    close: candle.close,
    high: candle.high,
    low: candle.low,
    open: candle.open,
    time: candle.start,
    volume: candle.volume,
  }
}

export function normalizeHistoryBars(
  candles: readonly Candle[],
  to: number,
): TradingViewBar[] {
  return [
    ...new Map(
      candles
        .filter((candle) => candle.start < to * 1_000)
        .map((candle) => [candle.start, candle]),
    ).values(),
  ]
    .toSorted((left, right) => left.start - right.start)
    .map(toTradingViewBar)
}

const symbolInfo: LibrarySymbolInfo = {
  currency_code: 'USDT',
  data_status: 'streaming',
  description: 'Ethereum / Tether 永续合约',
  exchange: 'OKX',
  format: 'price',
  has_daily: true,
  has_intraday: true,
  has_seconds: true,
  has_weekly_and_monthly: true,
  intraday_multipliers: ['1', '3', '5', '15', '30', '60', '120', '240', '720'],
  daily_multipliers: ['1', '3'],
  listed_exchange: 'OKX',
  minmov: 1,
  monthly_multipliers: ['12'],
  name: MARKET_PRODUCT,
  pricescale: 100,
  seconds_multipliers: ['1'],
  session: '24x7',
  supported_resolutions: supportedResolutions,
  ticker: MARKET_PRODUCT,
  timezone: 'Etc/UTC',
  type: 'futures',
  visible_plots_set: 'ohlcv',
  volume_precision: 4,
  weekly_multipliers: ['1'],
}

const requestHistory: HistoryLoader = async (resolution, period, signal) => {
  const limit = Math.min(300, Math.max(2, Math.ceil(period.countBack)))
  const params = new URLSearchParams({
    limit: String(limit),
    resolution,
    to: String(period.to),
  })
  const response = await fetch(`/api/market/candles?${params}`, {
    cache: 'no-store',
    signal,
  })
  const payload = (await response.json()) as {
    candles?: Candle[]
    error?: string
  }
  if (!response.ok) throw new Error(payload.error || '历史 K 线请求失败')
  return payload.candles ?? []
}

function mockStart(
  resolution: MarketResolution,
  to: number,
  offset: number,
): number {
  if (resolution === '12M') {
    return Date.UTC(new Date(to).getUTCFullYear() - offset, 0, 1)
  }
  const durations: Record<Exclude<MarketResolution, '12M'>, number> = {
    '1S': 1_000,
    '1': 60_000,
    '3': 180_000,
    '5': 300_000,
    '15': 900_000,
    '30': 1_800_000,
    '60': 3_600_000,
    '120': 7_200_000,
    '240': 14_400_000,
    '720': 43_200_000,
    '1D': 86_400_000,
    '3D': 259_200_000,
    '1W': 604_800_000,
  }
  const duration = durations[resolution]
  return Math.floor(to / duration) * duration - offset * duration
}

export const requestMockHistory: HistoryLoader = async (resolution, period) => {
  const count = Math.min(300, Math.max(2, Math.ceil(period.countBack)))
  const to = period.to * 1_000
  return Array.from({ length: count }, (_, index) => {
    const start = mockStart(resolution, to, count - index)
    const open = 3_500 + ((index % 11) - 5) * 2
    const close = open + (index % 2 ? -2 : 3)
    return {
      close,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      open,
      start,
      volume: 10 + (index % 7),
    }
  })
}

export function createTradingViewDatafeed(options?: {
  loadHistory?: HistoryLoader
  onResolutionChange?: (resolution: MarketResolution) => void
}) {
  const loadHistory = options?.loadHistory ?? requestHistory
  const listeners = new Map<
    string,
    {
      lastKey: string
      lastTime: number
      onTick: SubscribeBarsCallback
      resolution: MarketResolution
    }
  >()
  const controllers = new Set<AbortController>()
  const inFlight = new Map<string, Promise<Candle[]>>()
  let disposed = false
  let activeResolution: MarketResolution | undefined

  const loadOnce = (resolution: MarketResolution, period: PeriodParams) => {
    const key = `${resolution}:${period.to}:${period.countBack}`
    const existing = inFlight.get(key)
    if (existing) return existing
    const controller = new AbortController()
    controllers.add(controller)
    const request = loadHistory(resolution, period, controller.signal).finally(
      () => {
        controllers.delete(controller)
        inFlight.delete(key)
      },
    )
    inFlight.set(key, request)
    return request
  }

  const datafeed: IBasicDataFeed = {
    getBars(_symbol, resolution, period, onResult, onError) {
      void loadOnce(resolution as MarketResolution, period)
        .then((candles) => {
          if (disposed) return
          const bars = normalizeHistoryBars(candles, period.to)
          onResult(bars, { noData: bars.length === 0 })
        })
        .catch((error) => {
          if (!disposed) {
            onError(
              error instanceof Error ? error.message : '历史 K 线请求失败',
            )
          }
        })
    },
    onReady(callback) {
      queueMicrotask(() =>
        callback({ supported_resolutions: supportedResolutions }),
      )
    },
    resolveSymbol(_name, onResolve) {
      queueMicrotask(() => onResolve(symbolInfo))
    },
    searchSymbols(_input, _exchange, _type, onResult) {
      queueMicrotask(() => onResult([]))
    },
    subscribeBars(_symbol, resolution, onTick, listenerGuid) {
      const next = resolution as MarketResolution
      listeners.set(listenerGuid, {
        lastKey: '',
        lastTime: 0,
        onTick,
        resolution: next,
      })
      if (next !== activeResolution) {
        activeResolution = next
        options?.onResolutionChange?.(next)
      }
    },
    unsubscribeBars(listenerGuid) {
      listeners.delete(listenerGuid)
    },
  }

  return {
    datafeed,
    dispose() {
      disposed = true
      for (const controller of controllers) controller.abort()
      controllers.clear()
      inFlight.clear()
      listeners.clear()
    },
    update(resolution: MarketResolution, candle: Candle | undefined) {
      if (!candle) return
      const bar = toTradingViewBar(candle)
      const key = Object.values(bar).join(':')
      for (const listener of listeners.values()) {
        if (
          listener.resolution !== resolution ||
          listener.lastKey === key ||
          bar.time < listener.lastTime
        )
          continue
        listener.lastKey = key
        listener.lastTime = bar.time
        listener.onTick(bar)
      }
    },
  }
}
