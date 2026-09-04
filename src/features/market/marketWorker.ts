import {
  applyBookUpdates,
  appendBounded,
  MARKET_PRODUCT,
  mergeRealtimeCandle,
  parseOkxMessage,
  retryDelay,
  toOkxCandleChannel,
  type Candle,
  type MarketMode,
  type MarketPerformanceMode,
  type MarketResolution,
  type MarketStreamState,
  type MarketTick,
  type MarketTrade,
  type MarketWorkerCommand,
  type MarketWorkerEvent,
} from './marketData'

const PUBLIC_WS = 'wss://ws.okx.com:8443/ws/v5/public'
const BUSINESS_WS = 'wss://ws.okx.com:8443/ws/v5/business'
const REFRESH_MS: Record<MarketPerformanceMode, number> = {
  realtime: 250,
  saver: 1_000,
  throttled: 500,
}

type WorkerScope = {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<MarketWorkerCommand>) => void,
  ): void
  postMessage(event: MarketWorkerEvent): void
}

const workerScope = self as unknown as WorkerScope
let mode: MarketMode = 'live'
let resolution: MarketResolution = '1'
let performanceMode: MarketPerformanceMode = 'realtime'
let paused = false
let dirty = false
let inFlight = 0
let sequence = 0
let messageCount = 0
let renderBatches = 0
let ackLatencyMs = 0
let recoverySince = 0
let lastPressureAt = 0
let publicSocket: WebSocket | undefined
let businessSocket: WebSocket | undefined
let publicAttempt = 0
let businessAttempt = 0
let publicReconnect: ReturnType<typeof setTimeout> | undefined
let businessReconnect: ReturnType<typeof setTimeout> | undefined
let flushTimer: ReturnType<typeof setTimeout> | undefined
let mockTimer: ReturnType<typeof setInterval> | undefined
let snapshotController: AbortController | undefined
let pendingTick: MarketTick | undefined
let pendingTrades: MarketTrade[] = []
let latestSourceCandle: Candle | undefined
let sample = 0
let state = emptyState()

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
    resolution,
    snapshotStatus: '等待 OKX 快照',
    status: '正在启动行情 Worker…',
    trades: [],
  }
}

function setStatus(status: string) {
  state.status = status
  dirty = true
}

function visibleState(nextSequence: number): MarketStreamState {
  return {
    ...state,
    book: {
      asks: state.book.asks.slice(0, 12),
      bids: state.book.bids.slice(0, 12),
    },
    metrics: {
      ...state.metrics,
      ackLatencyMs,
      messages: messageCount,
      performanceMode,
      renderBatches,
      sequence: nextSequence,
    },
    trades: state.trades.slice(-8),
  }
}

function publish() {
  if (!dirty || inFlight || paused) return
  sequence += 1
  renderBatches += 1
  const sentAt = Date.now()
  inFlight = sequence
  workerScope.postMessage({
    sentAt,
    sequence,
    state: visibleState(sequence),
    type: 'state',
  })
  dirty = false
}

function scheduleFlush() {
  clearTimeout(flushTimer)
  if (paused) return
  flushTimer = setTimeout(() => {
    flush()
    scheduleFlush()
  }, REFRESH_MS[performanceMode])
}

function flush() {
  if (pendingTick) {
    state.latestTick = pendingTick
    pendingTick = undefined
    dirty = true
  }
  if (pendingTrades.length) {
    state.trades = [...state.trades, ...pendingTrades].slice(-200)
    pendingTrades = []
    dirty = true
  }
  publish()
}

function acceptMessage(raw: string) {
  const message = parseOkxMessage(raw)
  if (!message) return
  messageCount += 1
  state.metrics.lastDataAt = Date.now()
  if (message.type === 'ticker') pendingTick = message.tick
  if (message.type === 'trades') {
    pendingTrades = [...pendingTrades, ...message.trades].slice(-200)
  }
  if (message.type === 'book') {
    state.book = applyBookUpdates(
      message.replace ? { asks: [], bids: [] } : state.book,
      message.updates,
      100,
    )
    dirty = true
  }
  if (
    message.type === 'candle' &&
    message.channel === toOkxCandleChannel(resolution)
  ) {
    state.latestCandle = mergeRealtimeCandle(
      state.latestCandle,
      message.candle,
      resolution,
      latestSourceCandle,
    )
    latestSourceCandle = message.candle
    dirty = true
  }
}

async function fetchJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
    signal,
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json() as Promise<unknown>
}

async function loadSnapshot(includeBook: boolean) {
  snapshotController?.abort()
  const controller = new AbortController()
  snapshotController = controller
  state.snapshotStatus = includeBook
    ? '正在加载盘口与最新 K 线…'
    : '正在切换 K 线周期…'
  dirty = true
  publish()
  try {
    const url = includeBook
      ? `/api/market/snapshot?resolution=${resolution}`
      : `/api/market/candles?resolution=${resolution}&limit=1`
    const payload = (await fetchJson(url, controller.signal)) as {
      book?: { book?: MarketStreamState['book'] }
      candles?: Candle[]
      latestCandle?: Candle
    }
    if (includeBook && payload.book?.book) state.book = payload.book.book
    state.latestCandle = includeBook
      ? payload.latestCandle
      : payload.candles?.at(-1)
    latestSourceCandle = undefined
    state.snapshotStatus = state.latestCandle
      ? '快照已就绪；历史 K 线按需分页'
      : '快照部分失败；等待 WebSocket 补齐'
  } catch {
    if (!controller.signal.aborted) {
      state.snapshotStatus = '快照失败；继续使用 WebSocket 实时数据'
    }
  } finally {
    if (snapshotController === controller) snapshotController = undefined
    dirty = true
  }
}

function sendSubscription(
  socket: WebSocket | undefined,
  op: 'subscribe' | 'unsubscribe',
  channels: string[],
) {
  if (socket?.readyState !== WebSocket.OPEN) return
  socket.send(
    JSON.stringify({
      op,
      args: channels.map((channel) => ({ channel, instId: MARKET_PRODUCT })),
    }),
  )
}

function connectPublic() {
  if (
    paused ||
    mode !== 'live' ||
    publicSocket?.readyState === WebSocket.OPEN ||
    publicSocket?.readyState === WebSocket.CONNECTING
  )
    return
  setStatus(
    publicAttempt
      ? `OKX 公共流第 ${publicAttempt + 1} 次重连…`
      : '正在连接 OKX 公共流…',
  )
  const socket = new WebSocket(PUBLIC_WS)
  publicSocket = socket
  socket.onopen = () => {
    publicAttempt = 0
    setStatus('实时数据 · OKX ETH-USDT 永续')
    sendSubscription(socket, 'subscribe', ['tickers', 'trades', 'books'])
  }
  socket.onmessage = (event) => acceptMessage(String(event.data))
  socket.onerror = () => setStatus('OKX 公共流出错，等待重连…')
  socket.onclose = () => {
    if (publicSocket === socket) publicSocket = undefined
    if (paused || mode !== 'live') return
    const delay = retryDelay(publicAttempt++)
    publicReconnect = setTimeout(connectPublic, delay)
  }
}

function connectBusiness() {
  if (
    paused ||
    mode !== 'live' ||
    businessSocket?.readyState === WebSocket.OPEN ||
    businessSocket?.readyState === WebSocket.CONNECTING
  )
    return
  const socket = new WebSocket(BUSINESS_WS)
  businessSocket = socket
  socket.onopen = () => {
    businessAttempt = 0
    sendSubscription(socket, 'subscribe', [toOkxCandleChannel(resolution)])
  }
  socket.onmessage = (event) => acceptMessage(String(event.data))
  socket.onerror = () => setStatus('OKX K 线流出错，等待重连…')
  socket.onclose = () => {
    if (businessSocket === socket) businessSocket = undefined
    if (paused || mode !== 'live') return
    const delay = retryDelay(businessAttempt++)
    businessReconnect = setTimeout(connectBusiness, delay)
  }
}

function disconnectLive() {
  clearTimeout(publicReconnect)
  clearTimeout(businessReconnect)
  publicReconnect = undefined
  businessReconnect = undefined
  publicSocket?.close()
  businessSocket?.close()
  publicSocket = undefined
  businessSocket = undefined
}

function startLive() {
  void loadSnapshot(true)
  connectPublic()
  connectBusiness()
}

function resolutionStart(now: number): number {
  if (resolution === '12M') {
    return Date.UTC(new Date(now).getUTCFullYear(), 0, 1)
  }
  const units: Record<Exclude<MarketResolution, '12M'>, number> = {
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
  const unit = units[resolution]
  return Math.floor(now / unit) * unit
}

function startMock() {
  setStatus('确定性本地 Worker 数据流 · ETH-USDT-SWAP')
  state.snapshotStatus = '本地模拟快照已就绪'
  const seed = 3_500
  state.book = applyBookUpdates(
    { asks: [], bids: [] },
    Array.from({ length: 12 }, (_, index) => [
      {
        price: seed - index - 1,
        quantity: 1 + index / 10,
        side: 'bid' as const,
        time: new Date().toISOString(),
      },
      {
        price: seed + index + 1,
        quantity: 1.5 + index / 10,
        side: 'offer' as const,
        time: new Date().toISOString(),
      },
    ]).flat(),
  )
  const emit = () => {
    const now = Date.now()
    const time = new Date(now).toISOString()
    const price = seed + [0, 0.1, -0.1, 0.2, -0.2][sample % 5]
    const side = sample % 2 ? 'sell' : 'buy'
    const start = resolutionStart(now)
    const current =
      state.latestCandle?.start === start ? state.latestCandle : undefined
    state.latestCandle = {
      close: price,
      high: Math.max(current?.high ?? price, price),
      low: Math.min(current?.low ?? price, price),
      open: current?.open ?? price,
      start,
      volume: (current?.volume ?? 0) + 0.1,
    }
    messageCount += 3
    pendingTick = { price, product: `${MARKET_PRODUCT}（模拟）`, time }
    pendingTrades = appendBounded(
      pendingTrades,
      {
        id: String(sample),
        price,
        product: MARKET_PRODUCT,
        side,
        size: 0.1 + (sample % 4) * 0.05,
        time,
      },
      200,
    )
    state.book = applyBookUpdates(
      state.book,
      [
        { price: price - 1, quantity: 1, side: 'bid', time },
        { price: price + 1, quantity: 1.5, side: 'offer', time },
      ],
      100,
    )
    state.metrics.lastDataAt = now
    dirty = true
    sample += 1
  }
  emit()
  mockTimer = setInterval(emit, 100)
}

function stopSources() {
  snapshotController?.abort()
  snapshotController = undefined
  clearInterval(mockTimer)
  mockTimer = undefined
  disconnectLive()
}

function pause() {
  if (paused) return
  paused = true
  stopSources()
  clearTimeout(flushTimer)
  flushTimer = undefined
}

function resume() {
  if (!paused) return
  paused = false
  scheduleFlush()
  if (mode === 'mock') startMock()
  else startLive()
}

function start(nextMode: MarketMode) {
  stopSources()
  paused = false
  mode = nextMode
  performanceMode = 'realtime'
  resolution = '1'
  sequence = 0
  inFlight = 0
  messageCount = 0
  renderBatches = 0
  ackLatencyMs = 0
  recoverySince = 0
  lastPressureAt = 0
  publicAttempt = 0
  businessAttempt = 0
  pendingTick = undefined
  pendingTrades = []
  latestSourceCandle = undefined
  state = emptyState()
  dirty = true
  scheduleFlush()
  if (mode === 'mock') startMock()
  else startLive()
}

function setResolution(next: MarketResolution) {
  if (next === resolution) return
  const previousChannel = toOkxCandleChannel(resolution)
  resolution = next
  state.resolution = next
  state.latestCandle = undefined
  latestSourceCandle = undefined
  dirty = true
  if (mode === 'mock') return
  sendSubscription(businessSocket, 'unsubscribe', [previousChannel])
  sendSubscription(businessSocket, 'subscribe', [toOkxCandleChannel(next)])
  void loadSnapshot(false)
}

function acknowledge(command: Extract<MarketWorkerCommand, { type: 'ack' }>) {
  if (command.sequence !== inFlight) return
  inFlight = 0
  ackLatencyMs = Math.max(0, Math.round(command.latencyMs))
  const now = Date.now()
  const previousMode = performanceMode
  if (ackLatencyMs > 500) performanceMode = 'saver'
  else if (ackLatencyMs > 200 && performanceMode === 'realtime') {
    performanceMode = 'throttled'
  } else if (ackLatencyMs <= 80 && now - lastPressureAt > 10_000) {
    recoverySince ||= now
    if (now - recoverySince >= 10_000) {
      performanceMode = performanceMode === 'saver' ? 'throttled' : 'realtime'
      recoverySince = now
    }
  } else {
    recoverySince = 0
  }
  if (performanceMode !== previousMode) dirty = true
}

workerScope.addEventListener('message', (event) => {
  const command = event.data
  if (command.type === 'start') start(command.mode)
  if (command.type === 'pause') pause()
  if (command.type === 'resume') resume()
  if (command.type === 'resolution') setResolution(command.resolution)
  if (command.type === 'ack') acknowledge(command)
  if (command.type === 'pressure') {
    lastPressureAt = Date.now()
    recoverySince = 0
    performanceMode = 'saver'
    dirty = true
  }
})
