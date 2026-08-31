'use client'

import { useEffect, useState } from 'react'

import {
  type MarketMode,
  type MarketStreamState,
  type MarketWorkerCommand,
  type MarketWorkerEvent,
  type OrderBook,
} from './marketData'
import { TradingViewChart } from './TradingViewChart'

const initialMode: MarketMode =
  process.env.NEXT_PUBLIC_MARKET_MODE === 'mock' ? 'mock' : 'live'

const emptyState: MarketStreamState = {
  book: { asks: [], bids: [] },
  candles: [],
  metrics: { lastDataAt: 0, messages: 0, renderBatches: 0 },
  snapshotStatus: '等待全量快照',
  status: '正在启动 Worker…',
  ticks: [],
  trades: [],
}

function OrderBookTable({ book }: { book: OrderBook }) {
  const asks = book.asks.slice(0, 12)
  const bids = book.bids.slice(0, 12)
  const rows = Math.max(asks.length, bids.length)
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
            const bid = bids[index]
            const ask = asks[index]
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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const worker = new Worker(new URL('./marketWorker.ts', import.meta.url), {
      name: 'market-stream',
      type: 'module',
    })
    const post = (command: MarketWorkerCommand) => worker.postMessage(command)
    worker.onmessage = (event: MessageEvent<MarketWorkerEvent>) => {
      if (event.data.type === 'state') setStream(event.data.state)
    }
    worker.onerror = () => {
      setStream((current) => ({
        ...current,
        status: '行情 Worker 启动失败，请切换模拟模式或检查浏览器支持。',
      }))
    }
    const resume = () => post({ type: 'resume' })
    const resumeVisible = () => {
      if (document.visibilityState === 'visible') resume()
    }
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resumeVisible)
    post({ mode, type: 'start' })

    return () => {
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resumeVisible)
      worker.terminate()
    }
  }, [mode])

  const latest = stream.ticks.at(-1)
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
    setStream(emptyState)
    setMode(nextMode)
  }

  return (
    <section>
      <div className="section-heading">
        <div>
          <span className="step">06</span>
          <h2>实时行情交易终端</h2>
        </div>
        <div className="actions" aria-label="行情数据来源">
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
        Worker 先并行拉取 1 分钟 K 线与 Level2 全量快照，再连接 WebSocket 处理
        ticker、逐笔和盘口增量；主线程只接收每 250ms 一次的渲染快照。
      </p>

      <dl className="facts market-facts">
        <div>
          <dt>连接状态</dt>
          <dd aria-live="polite">{stream.status}</dd>
        </div>
        <div>
          <dt>全量快照</dt>
          <dd>{stream.snapshotStatus}</dd>
        </div>
        <div>
          <dt>最新价格</dt>
          <dd>
            {latest
              ? `$${latest.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : '等待更新…'}
          </dd>
        </div>
        <div>
          <dt>数据延迟</dt>
          <dd className={freshness === '已过期' ? 'error' : ''}>{freshness}</dd>
        </div>
        <div>
          <dt>消息 / Worker 推送</dt>
          <dd>
            {stream.metrics.messages} / {stream.metrics.renderBatches}
          </dd>
        </div>
      </dl>

      <div className="market-terminal">
        <div className="market-pane market-chart-pane">
          <h3>
            TradingView Advanced Charts · 1 分钟 K 线 · {stream.candles.length}{' '}
            根
          </h3>
          <TradingViewChart candles={stream.candles} />
        </div>
        <div className="market-pane">
          <h3>Level2 盘口 · 最优 12 档</h3>
          <OrderBookTable book={stream.book} />
        </div>
        <div className="market-pane">
          <h3>最近成交</h3>
          {stream.trades.length ? (
            <ol className="ticker-list" reversed>
              {stream.trades
                .slice(-8)
                .reverse()
                .map((trade) => (
                  <li key={trade.id}>
                    <span>
                      {new Date(trade.time).toLocaleTimeString()} ·{' '}
                      {trade.size.toFixed(4)} ETH
                    </span>
                    <strong
                      className={trade.side === 'buy' ? 'positive' : 'negative'}
                    >
                      ${trade.price.toFixed(2)}
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
        <code>NEXT_PUBLIC_MARKET_MODE=mock</code>{' '}
        可用于离线演示；模拟数据仍经过同一个 Worker、批处理、K
        线和盘口增量路径。
      </p>
    </section>
  )
}
