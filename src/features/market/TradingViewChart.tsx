'use client'

import { useEffect, useRef, useState } from 'react'

import { widget } from '../../../public/charting_library'
import type { ResolutionString } from '../../../public/charting_library'
import type { Candle, MarketMode, MarketResolution } from './marketData'
import {
  createTradingViewDatafeed,
  defaultResolution,
  requestMockHistory,
} from './tradingViewDatafeed'

export function TradingViewChart({
  candle,
  mode,
  onResolutionChange,
  resolution,
}: {
  candle?: Candle
  mode: MarketMode
  onResolutionChange: (resolution: MarketResolution) => void
  resolution: MarketResolution
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<InstanceType<typeof widget> | null>(null)
  const chartReadyRef = useRef(false)
  const resolutionRef = useRef(resolution)
  const [feed] = useState(() =>
    createTradingViewDatafeed({
      loadHistory: mode === 'mock' ? requestMockHistory : undefined,
      onResolutionChange,
    }),
  )

  useEffect(() => {
    feed.update(resolution, candle)
  }, [candle, feed, resolution])

  useEffect(() => {
    resolutionRef.current = resolution
    if (chartReadyRef.current) {
      void chartRef.current
        ?.activeChart()
        .setResolution(resolution as ResolutionString)
    }
  }, [resolution])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
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
      interval: defaultResolution,
      library_path: '/charting_library/',
      loading_screen: {
        backgroundColor: '#020617',
        foregroundColor: '#22c55e',
      },
      locale: 'zh',
      symbol: 'ETH-USDT-SWAP',
      theme: 'dark',
      timezone: 'Etc/UTC',
    })
    chartRef.current = chart

    chart.onChartReady(() => {
      chartReadyRef.current = true
      if (resolutionRef.current !== defaultResolution) {
        void chart
          .activeChart()
          .setResolution(resolutionRef.current as ResolutionString)
      }
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
      chartReadyRef.current = false
      chartRef.current = null
      clearTimeout(ratioTimer)
      chart.remove()
      feed.dispose()
    }
  }, [feed])

  return (
    <div
      aria-label="OKX ETH-USDT 永续合约 K 线"
      className="tradingview-chart"
      ref={containerRef}
      role="region"
    />
  )
}
