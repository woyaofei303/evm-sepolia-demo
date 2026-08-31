import {
  applyBookUpdates,
  appendBounded,
  parseCoinbaseBookSnapshot,
  parseCoinbaseCandlesSnapshot,
  parseCoinbaseMessage,
  retryDelay,
  updateCandles,
  type BookUpdate,
  type MarketMode,
  type MarketStreamState,
  type MarketTick,
  type MarketTrade,
  type MarketWorkerCommand,
  type MarketWorkerEvent,
} from './marketData'

const PRODUCT = 'ETH-USD'
const WS_URL = 'wss://advanced-trade-ws.coinbase.com'

type WorkerScope = {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<MarketWorkerCommand>) => void,
  ): void
  postMessage(event: MarketWorkerEvent): void
}

const workerScope = self as unknown as WorkerScope

let mode: MarketMode = 'live'
let liveReady = false
let attempt = 0
let socket: WebSocket | undefined
let pendingTick: MarketTick | undefined
let pendingTrades: MarketTrade[] = []
let pendingBookUpdates: BookUpdate[] = []
let replaceBookOnFlush = false
let messageCount = 0
let dirty = false

let state: MarketStreamState = emptyState()

function emptyState(): MarketStreamState {
  return {
    book: { asks: [], bids: [] },
    candles: [],
    metrics: { lastDataAt: 0, messages: 0, renderBatches: 0 },
    snapshotStatus: '等待全量快照',
    status: '正在启动 Worker…',
    ticks: [],
    trades: [],
  }
}

function setStatus(status: string) {
  state.status = status
  dirty = true
}

function publish() {
  if (!dirty) return
  state.metrics = {
    ...state.metrics,
    messages: messageCount,
    renderBatches: state.metrics.renderBatches + 1,
  }
  workerScope.postMessage({ state, type: 'state' })
  dirty = false
}

function queueMessage(message: ReturnType<typeof parseCoinbaseMessage>) {
  if (!message) return
  state.metrics.lastDataAt = Date.now()
  if (message.type === 'ticker') pendingTick = message.tick
  if (message.type === 'trades') {
    pendingTrades = [...pendingTrades, ...message.trades].slice(-200)
  }
  if (message.type === 'book') {
    if (message.replace) {
      pendingBookUpdates = message.updates.slice(-500)
      replaceBookOnFlush = true
    } else {
      pendingBookUpdates = [...pendingBookUpdates, ...message.updates].slice(
        -500,
      )
    }
  }
}

function flush() {
  if (pendingTick) {
    state.ticks = appendBounded(state.ticks, pendingTick, 40)
    pendingTick = undefined
    dirty = true
  }
  if (pendingTrades.length) {
    state.trades = [...state.trades, ...pendingTrades].slice(-40)
    state.candles = pendingTrades.reduce(
      (candles, trade) => updateCandles(candles, trade, 60_000, 300),
      state.candles,
    )
    pendingTrades = []
    dirty = true
  }
  if (pendingBookUpdates.length) {
    state.book = applyBookUpdates(
      replaceBookOnFlush ? { asks: [], bids: [] } : state.book,
      pendingBookUpdates,
      100,
    )
    pendingBookUpdates = []
    replaceBookOnFlush = false
    dirty = true
  }
  publish()
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json() as Promise<unknown>
}

async function loadSnapshots() {
  state.snapshotStatus = '正在拉取 K 线与 Level2…'
  setStatus('正在加载 REST 全量快照…')
  publish()

  let payload: unknown
  try {
    payload = await fetchJson('/api/market/snapshot')
  } catch {
    payload = null
  }
  const snapshot =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {}
  let loaded = 0
  const candles = parseCoinbaseCandlesSnapshot(snapshot.candles)
  if (candles.length) {
    state.candles = candles
    loaded += 1
  }
  const book = parseCoinbaseBookSnapshot(snapshot.book)
  if (book) {
    state.book = book.book
    loaded += 1
  }

  state.snapshotStatus =
    loaded === 2
      ? `已加载 ${state.candles.length} 根 K 线 / Level2 全量盘口`
      : loaded === 1
        ? '部分快照可用；缺失部分等待 WebSocket 补齐'
        : '快照失败；继续使用 WebSocket 实时数据'
  liveReady = true
  dirty = true
}

function connect() {
  if (
    !liveReady ||
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING
  )
    return

  setStatus(attempt ? `正在第 ${attempt + 1} 次重连…` : '正在连接 WebSocket…')
  socket = new WebSocket(WS_URL)
  socket.onopen = () => {
    attempt = 0
    setStatus('实时数据 · Coinbase ETH-USD')
    for (const channel of ['ticker', 'market_trades', 'level2', 'heartbeats']) {
      socket?.send(
        JSON.stringify({ channel, product_ids: [PRODUCT], type: 'subscribe' }),
      )
    }
  }
  socket.onmessage = (event) => {
    messageCount += 1
    queueMessage(parseCoinbaseMessage(String(event.data)))
  }
  socket.onerror = () => setStatus('数据流出错，正在等待重连…')
  socket.onclose = () => {
    socket = undefined
    const delay = retryDelay(attempt++)
    setStatus(`连接已断开，将在 ${delay / 1_000} 秒后重试…`)
    setTimeout(connect, delay)
  }
}

async function startLive() {
  await loadSnapshots()
  connect()
}

function startMock() {
  const currentMinute = Math.floor(Date.now() / 60_000) * 60_000
  state.candles = Array.from({ length: 60 }, (_, index) => {
    const start = currentMinute - (59 - index) * 60_000
    const open = 3_500 + ((index % 7) - 3) * 4
    const close = open + (index % 2 ? -3 : 5)
    return {
      close,
      firstTradeAt: start,
      high: Math.max(open, close) + 2,
      lastTradeAt: start,
      low: Math.min(open, close) - 2,
      open,
      start,
      volume: 1 + (index % 5),
    }
  })
  state.book = applyBookUpdates(
    { asks: [], bids: [] },
    Array.from({ length: 12 }, (_, index) => [
      {
        price: 3_499 - index,
        quantity: 1 + index / 10,
        side: 'bid' as const,
        time: new Date().toISOString(),
      },
      {
        price: 3_501 + index,
        quantity: 1.5 + index / 10,
        side: 'offer' as const,
        time: new Date().toISOString(),
      },
    ]).flat(),
    100,
  )
  state.snapshotStatus = '已加载本地 K 线 / Level2 全量快照'
  setStatus('确定性本地 Worker 数据流 · ETH-USD')
  let sample = 0
  setInterval(() => {
    const time = new Date().toISOString()
    const price = 3_500 + [0, 0.1, -0.1, 0.2, -0.2][sample % 5]
    const side = sample % 2 ? 'sell' : 'buy'
    messageCount += 3
    queueMessage({
      tick: { price, product: `${PRODUCT}（模拟）`, time },
      type: 'ticker',
    })
    queueMessage({
      trades: [
        {
          id: String(sample),
          price,
          product: PRODUCT,
          side,
          size: 0.1 + (sample % 4) * 0.05,
          time,
        },
      ],
      type: 'trades',
    })
    queueMessage({
      product: PRODUCT,
      replace: false,
      type: 'book',
      updates: [
        { price: price - 1, quantity: 1, side: 'bid', time },
        { price: price + 1, quantity: 1.5, side: 'offer', time },
      ],
    })
    sample += 1
  }, 500)
  dirty = true
}

function start(nextMode: MarketMode) {
  mode = nextMode
  attempt = 0
  messageCount = 0
  pendingTick = undefined
  pendingTrades = []
  pendingBookUpdates = []
  replaceBookOnFlush = false
  state = emptyState()
  dirty = true
  publish()
  if (mode === 'mock') startMock()
  else void startLive()
}

setInterval(flush, 250)

workerScope.addEventListener('message', (event) => {
  if (event.data.type === 'start') start(event.data.mode)
  if (event.data.type === 'resume' && mode === 'live') connect()
})
