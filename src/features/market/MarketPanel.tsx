'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  MARKET_RESOLUTIONS,
  type MarketMode,
  type MarketResolution,
  type MarketStreamState,
  type MarketWorkerCommand,
  type MarketWorkerEvent,
  type OrderBook,
} from './marketData'
import { TradingViewChart } from './TradingViewChart'

const initialMode: MarketMode =
  process.env.NEXT_PUBLIC_MARKET_MODE === 'mock' ? 'mock' : 'live'

const PERIOD_LABELS: Record<MarketResolution, string> = {
  '1S': '1s',
  '1': '1m',
  '3': '3m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '120': '2h',
  '240': '4h',
  '720': '12h',
  '1D': '1D',
  '3D': '3D',
  '1W': '1week',
  '12M': '1year',
}

const PERFORMANCE_LABELS = {
  realtime: '实时 · 250ms',
  saver: '资源保护 · 1000ms',
  throttled: '节流 · 500ms',
} as const

function emptyState(): MarketStreamState {
  return {
    book: { asks: [], bids: [] },
    metrics: {
      ackLatencyMs: 0,
      lastDataAt: 0,
      messages: 0,
      performanceMode: 'realtime',
      renderBatches: 0,
      sequence: 0,
    },
    resolution: '1',
    snapshotStatus: '等待 OKX 快照',
    status: '正在启动行情 Worker…',
    trades: [],
  }
}

function OrderBookTable({ book }: { book: OrderBook }) {
  const rows = Math.max(book.asks.length, book.bids.length)
  if (!rows) return <p className="muted">等待 Level2 全量盘口…</p>

  return (
    <div className="table-scroll">
      <table className="market-table">
        <thead>
          <tr>
            <th>买量</th>
            <th>买价</th>
            <th>卖价</th>
            <th>卖量</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, index) => {
            const bid = book.bids[index]
            const ask = book.asks[index]
            return (
              <tr key={`${bid?.price ?? 'x'}-${ask?.price ?? 'x'}`}>
                <td>{bid?.quantity.toFixed(4) ?? '—'}</td>
                <td className="positive">{bid?.price.toFixed(2) ?? '—'}</td>
                <td className="negative">{ask?.price.toFixed(2) ?? '—'}</td>
                <td>{ask?.quantity.toFixed(4) ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function MarketPanel() {
  const [mode, setMode] = useState<MarketMode>(initialMode)
  const [stream, setStream] = useState<MarketStreamState>(emptyState)
  const [now, setNow] = useState(() => Date.now())
  const workerRef = useRef<Worker | null>(null)
  const frameRef = useRef(0)
  const latestEventRef = useRef<MarketWorkerEvent | undefined>(undefined)
  const ackRef = useRef<{ sentAt: number; sequence: number } | undefined>(
    undefined,
  )

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const worker = new Worker(new URL('./marketWorker.ts', import.meta.url), {
      name: 'market-stream',
      type: 'module',
    })
    workerRef.current = worker
    const post = (command: MarketWorkerCommand) => worker.postMessage(command)

    worker.onmessage = (event: MessageEvent<MarketWorkerEvent>) => {
      if (event.data.type !== 'state') return
      latestEventRef.current = event.data
      if (frameRef.current) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0
        const latest = latestEventRef.current
        if (!latest) return
        latestEventRef.current = undefined
        ackRef.current = {
          sentAt: latest.sentAt,
          sequence: latest.sequence,
        }
        setStream(latest.state)
      })
    }
    worker.onerror = () => {
      setStream((current) => ({
        ...current,
        status: '行情 Worker 启动失败，请切换模拟模式或检查浏览器支持。',
      }))
    }

    const resume = () => post({ type: 'resume' })
    const pause = () => post({ type: 'pause' })
    const updateVisibility = () =>
      document.visibilityState === 'visible' ? resume() : pause()
    window.addEventListener('online', resume)
    window.addEventListener('offline', pause)
    document.addEventListener('visibilitychange', updateVisibility)

    let lastPressureAt = 0
    let observer: PerformanceObserver | undefined
    try {
      observer = new PerformanceObserver((entries) => {
        if (
          entries.getEntries().some((entry) => entry.duration >= 50) &&
          performance.now() - lastPressureAt > 2_000
        ) {
          lastPressureAt = performance.now()
          post({ type: 'pressure' })
        }
      })
      observer.observe({ entryTypes: ['longtask'] })
    } catch {
      observer = undefined
    }

    post({ mode, type: 'start' })
    if (document.visibilityState === 'hidden') pause()

    return () => {
      observer?.disconnect()
      window.removeEventListener('online', resume)
      window.removeEventListener('offline', pause)
      document.removeEventListener('visibilitychange', updateVisibility)
      cancelAnimationFrame(frameRef.current)
      latestEventRef.current = undefined
      ackRef.current = undefined
      worker.terminate()
      workerRef.current = null
    }
  }, [mode])

  useEffect(() => {
    const pending = ackRef.current
    if (!pending || pending.sequence !== stream.metrics.sequence) return
    ackRef.current = undefined
    workerRef.current?.postMessage({
      latencyMs: Date.now() - pending.sentAt,
      sequence: pending.sequence,
      type: 'ack',
    } satisfies MarketWorkerCommand)
  }, [stream.metrics.sequence])

  const setResolution = useCallback((resolution: MarketResolution) => {
    setStream((current) =>
      current.resolution === resolution
        ? current
        : { ...current, latestCandle: undefined, resolution },
    )
    workerRef.current?.postMessage({
      resolution,
      type: 'resolution',
    } satisfies MarketWorkerCommand)
  }, [])

  const latest = stream.latestTick
  const dataAge = stream.metrics.lastDataAt
    ? Math.max(0, now - stream.metrics.lastDataAt)
    : undefined
  const freshness =
    dataAge === undefined
      ? '等待实时数据'
      : dataAge > 10_000
        ? '已过期'
        : `${(dataAge / 1_000).toFixed(1)} 秒`

  const changeMode = (nextMode: MarketMode) => {
    if (nextMode === mode) return
    setStream(emptyState())
    setMode(nextMode)
  }

  return (
    <section className="market-section">
      <div className="section-heading">
        <div>
          <span className="step">MARKET-01</span>
          <h2>ETH-USDT 永续实时行情</h2>
        </div>
        <div className="actions compact-actions" aria-label="行情数据来源">
          <button
            className={mode === 'live' ? '' : 'secondary'}
            onClick={() => changeMode('live')}
            type="button"
          >
            实时
          </button>
          <button
            className={mode === 'mock' ? '' : 'secondary'}
            onClick={() => changeMode('mock')}
            type="button"
          >
            模拟
          </button>
        </div>
      </div>
      <p className="muted">
        Advanced Charts 按视窗向 OKX 分页拉取历史；实时行情在 Worker
        聚合，主线程通过 rAF 合帧、ACK 背压和长任务监控自动降级。
      </p>

      <dl className="facts market-facts">
        <div>
          <dt>连接</dt>
          <dd aria-live="polite">{stream.status}</dd>
        </div>
        <div>
          <dt>历史 / 快照</dt>
          <dd>{stream.snapshotStatus}</dd>
        </div>
        <div>
          <dt>最新价格</dt>
          <dd>
            {latest
              ? `${latest.price.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 2,
                })} USDT`
              : '等待更新…'}
          </dd>
        </div>
        <div>
          <dt>数据延迟</dt>
          <dd className={freshness === '已过期' ? 'error' : ''}>{freshness}</dd>
        </div>
        <div>
          <dt>性能档位</dt>
          <dd>
            {PERFORMANCE_LABELS[stream.metrics.performanceMode]} · ACK{' '}
            {stream.metrics.ackLatencyMs}ms
          </dd>
        </div>
        <div>
          <dt>消息 / 渲染批次</dt>
          <dd>
            {stream.metrics.messages} / {stream.metrics.renderBatches}
          </dd>
        </div>
      </dl>

      <div className="resolution-strip" aria-label="K 线周期">
        {MARKET_RESOLUTIONS.map((resolution) => (
          <button
            aria-pressed={stream.resolution === resolution}
            className={
              stream.resolution === resolution ? 'resolution-active' : ''
            }
            key={resolution}
            onClick={() => setResolution(resolution)}
            type="button"
          >
            {PERIOD_LABELS[resolution]}
          </button>
        ))}
      </div>

      <div className="market-terminal">
        <div className="market-pane market-chart-pane">
          <h3>
            TradingView Advanced Charts · {PERIOD_LABELS[stream.resolution]}
          </h3>
          <TradingViewChart
            candle={stream.latestCandle}
            key={mode}
            mode={mode}
            onResolutionChange={setResolution}
            resolution={stream.resolution}
          />
        </div>
        <div className="market-pane">
          <h3>Level2 盘口 · 最优 12 档</h3>
          <OrderBookTable book={stream.book} />
        </div>
        <div className="market-pane">
          <h3>最近成交 · 8 笔</h3>
          {stream.trades.length ? (
            <ol className="ticker-list" reversed>
              {stream.trades.toReversed().map((trade) => (
                <li key={trade.id}>
                  <span>
                    {new Date(trade.time).toLocaleTimeString()} ·{' '}
                    {trade.size.toFixed(4)} 张
                  </span>
                  <strong
                    className={trade.side === 'buy' ? 'positive' : 'negative'}
                  >
                    {trade.price.toFixed(2)}
                  </strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">等待逐笔成交…</p>
          )}
        </div>
      </div>
      <p className="muted">
        页面不限制历史总量；单次请求遵循 OKX 300 根上限并由图表继续分页。Worker
        仅保留 100 档/侧和 200 笔成交；盘口增量在 Worker
        内直接合并、不进入主线程队列，避免长连接内存增长。
      </p>
    </section>
  )
}
