'use client'

import { useEffect, useRef, useState } from 'react'

import { widget } from '../../../public/charting_library'
import type { Candle } from './marketData'
import { createTradingViewDatafeed, oneMinute } from './tradingViewDatafeed'

export function TradingViewChart({ candles }: { candles: readonly Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [feed] = useState(createTradingViewDatafeed)
  const ready = candles.length > 0

  useEffect(() => {
    feed.update(candles)
  }, [candles, feed])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !ready) return
    let ratioTimer: ReturnType<typeof setTimeout> | undefined

    const chart = new widget({
      autosize: true,
      container,
      datafeed: feed.datafeed,
      disabled_features: [
        'header_symbol_search',
        'symbol_search_hot_key',
        'volume_force_overlay',
      ],
      interval: oneMinute,
      library_path: '/charting_library/',
      loading_screen: {
        backgroundColor: '#ffffff',
        foregroundColor: '#16835e',
      },
      locale: 'zh',
      symbol: 'ETH-USD',
      theme: 'light',
      timezone: 'Etc/UTC',
    })

    chart.onChartReady(() => {
      const chartApi = chart.activeChart()
      chartApi.dataReady(() => {
        ratioTimer = setTimeout(() => {
          const heights = chartApi.getAllPanesHeight()
          if (heights.length !== 2) return
          const totalHeight = heights[0] + heights[1]
          chartApi.setAllPanesHeight([
            Math.round(totalHeight * 0.75),
            Math.round(totalHeight * 0.25),
          ])
        })
      })
    })

    return () => {
      clearTimeout(ratioTimer)
      chart.remove()
    }
  }, [feed, ready])

  return (
    <div
      aria-label={`ETH-USD 最近 ${candles.length} 根 1 分钟 K 线`}
      className="tradingview-chart"
      ref={containerRef}
      role="region"
    />
  )
}
