import { NextRequest, NextResponse } from 'next/server'

import {
  isMarketResolution,
  type MarketResolution,
} from '../../../../features/market/marketData'
import { readOkxCandles } from '../../../../features/market/okxServer'

export async function GET(request: NextRequest) {
  const resolution = request.nextUrl.searchParams.get('resolution')
  if (!isMarketResolution(resolution)) {
    return NextResponse.json({ error: '不支持的 K 线周期。' }, { status: 400 })
  }
  const rawTo = Number(request.nextUrl.searchParams.get('to'))
  const rawLimit = Number(request.nextUrl.searchParams.get('limit'))
  const to = Number.isFinite(rawTo) && rawTo > 0 ? rawTo : undefined
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(300, rawLimit) : 300

  try {
    const candles = await readOkxCandles(
      resolution as MarketResolution,
      to,
      limit,
    )
    return NextResponse.json(
      { candles },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OKX 历史数据失败' },
      { status: 502 },
    )
  }
}
