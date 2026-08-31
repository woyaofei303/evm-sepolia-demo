import type { Candle } from './marketData'
import type {
  Bar,
  IBasicDataFeed,
  LibrarySymbolInfo,
  ResolutionString,
  SubscribeBarsCallback,
} from '../../../public/charting_library'

export type TradingViewBar = Bar
export const oneMinute = '1' as ResolutionString

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

export function selectHistoryBars(
  candles: readonly Candle[],
  period: { countBack: number; to: number },
): TradingViewBar[] {
  return candles
    .filter((candle) => candle.start < period.to * 1_000)
    .slice(-Math.max(1, period.countBack))
    .map(toTradingViewBar)
}

const symbolInfo: LibrarySymbolInfo = {
  data_status: 'streaming',
  description: 'Ethereum / US Dollar',
  exchange: 'Coinbase',
  format: 'price',
  has_daily: false,
  has_intraday: true,
  intraday_multipliers: ['1'],
  listed_exchange: 'Coinbase',
  minmov: 1,
  name: 'ETH-USD',
  pricescale: 100,
  session: '24x7',
  supported_resolutions: [oneMinute],
  ticker: 'ETH-USD',
  timezone: 'Etc/UTC',
  type: 'crypto',
  visible_plots_set: 'ohlcv',
  volume_precision: 8,
}

export function createTradingViewDatafeed() {
  let candles: readonly Candle[] = []
  let lastBarKey = ''
  const listeners = new Map<string, SubscribeBarsCallback>()

  const datafeed: IBasicDataFeed = {
    getBars(_symbol, _resolution, period, onResult) {
      queueMicrotask(() => {
        const bars = selectHistoryBars(candles, period)
        onResult(bars, { noData: bars.length === 0 })
      })
    },
    onReady(callback) {
      queueMicrotask(() => callback({ supported_resolutions: [oneMinute] }))
    },
    resolveSymbol(_name, onResolve) {
      queueMicrotask(() => onResolve(symbolInfo))
    },
    searchSymbols(_input, _exchange, _type, onResult) {
      queueMicrotask(() => onResult([]))
    },
    subscribeBars(_symbol, _resolution, onTick, listenerGuid) {
      listeners.set(listenerGuid, onTick)
    },
    unsubscribeBars(listenerGuid) {
      listeners.delete(listenerGuid)
    },
  }

  return {
    datafeed,
    update(nextCandles: readonly Candle[]) {
      candles = nextCandles
      const latest = candles.at(-1)
      if (!latest) return
      const bar = toTradingViewBar(latest)
      const key = Object.values(bar).join(':')
      if (key === lastBarKey) return
      lastBarKey = key
      for (const listener of listeners.values()) listener(bar)
    },
  }
}
