import { NextRequest, NextResponse } from 'next/server'

import {
  isMarketResolution,
  type MarketResolution,
} from '../../../../features/market/marketData'
import {
  readOkxBook,
  readOkxCandles,
} from '../../../../features/market/okxServer'

export async function GET(request: NextRequest) {
  const candidate = request.nextUrl.searchParams.get('resolution') ?? '1'
  const resolution: MarketResolution = isMarketResolution(candidate)
    ? candidate
    : '1'
  const [bookResult, candleResult] = await Promise.allSettled([
    readOkxBook(),
    readOkxCandles(resolution, undefined, 1),
  ])
  const book = bookResult.status === 'fulfilled' ? bookResult.value : undefined
  const latestCandle =
    candleResult.status === 'fulfilled' ? candleResult.value.at(-1) : undefined

  return NextResponse.json(
    { book, latestCandle },
    {
      headers: { 'cache-control': 'no-store' },
      status: book || latestCandle ? 200 : 502,
    },
  )
}
