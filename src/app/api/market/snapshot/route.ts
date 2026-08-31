import { NextResponse } from 'next/server'

const PRODUCT_URL = 'https://api.exchange.coinbase.com/products/ETH-USD'

async function readPublicJson(path: string) {
  try {
    const response = await fetch(`${PRODUCT_URL}/${path}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    })
    return response.ok ? ((await response.json()) as unknown) : null
  } catch {
    return null
  }
}

export async function GET() {
  const [candles, book] = await Promise.all([
    readPublicJson('candles?granularity=60'),
    readPublicJson('book?level=2'),
  ])

  return NextResponse.json(
    { book, candles },
    {
      headers: { 'cache-control': 'no-store' },
      status: candles || book ? 200 : 502,
    },
  )
}
