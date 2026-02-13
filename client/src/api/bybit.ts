// In dev, call backend directly to avoid proxy issues; in prod use direct Bybit API
const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
const BASE = isDev ? 'http://localhost:4001/api/bybit/v5' : 'https://api.bybit.com/v5'

async function bybit<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = isDev ? new URL(BASE + path, window.location.origin) : new URL(BASE + path)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const r = await fetch(url.toString())
  if (!r.ok) throw new Error(await r.text())
  const j = await r.json()
  if (j.retCode !== 0) throw new Error(j.retMsg || 'Bybit API error')
  return j.result as T
}

async function bybitWithRetry<T>(path: string, params?: Record<string, string>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const url = isDev ? new URL(BASE + path, window.location.origin) : new URL(BASE + path)
      if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
      
      const r = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      })
      
      if (!r.ok) {
        const errorText = await r.text()
        throw new Error(`HTTP ${r.status}: ${errorText}`)
      }
      
      const text = await r.text()
      let j
      try {
        j = JSON.parse(text)
      } catch (parseError) {
        console.error('JSON parse error:', parseError, 'Response text:', text.substring(0, 200))
        throw new Error(`Invalid JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
      }
      
      if (j.retCode !== 0) throw new Error(j.retMsg || 'Bybit API error')
      return j.result as T
    } catch (e) {
      console.warn(`Retry ${i + 1}/${retries} for ${path}:`, e)
      if (i === retries - 1) throw e
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))) // Exponential backoff
    }
  }
  throw new Error('Max retries exceeded')
}

export type TickerLinear = {
  symbol: string
  lastPrice: string
  indexPrice: string
  markPrice: string
  prevPrice24h: string
  price24hPcnt: string
  highPrice24h: string
  lowPrice24h: string
  turnover24h: string
  volume24h: string
  fundingRate: string
  nextFundingTime: string
  openInterest: string
  openInterestValue: string
  bid1Price: string
  ask1Price: string
  bid1Size: string
  ask1Size: string
}

export type TickersResult = { category: string; list: TickerLinear[] }

export function getTickersLinear(): Promise<TickersResult> {
  return bybit<TickersResult>('/market/tickers', { category: 'linear' })
}

export type KlineInterval = '1' | '3' | '5' | '15' | '30' | '60' | '120' | '240' | '360' | '720' | 'D' | 'W' | 'M'

export type KlineCandle = [string, string, string, string, string, string, string]
// [startTime, open, high, low, close, volume, turnover]

export function getKline(symbol: string, interval: KlineInterval, limit = 200): Promise<{ list: KlineCandle[] }> {
  const end = Date.now()
  const start = end - limit * intervalMs(interval)
  return bybitWithRetry<{ symbol: string; category: string; list: KlineCandle[] }>('/market/kline', {
    category: 'linear',
    symbol,
    interval,
    start: String(start),
    end: String(end),
    limit: String(limit),
  })
}

// Try to fetch recent trades (trading records). start/end in ms since epoch.
export function getTrades(_symbol: string, _start: number, _end: number, _limit = 500): Promise<{ list: any[] } | null> {
  // Временно отключаем так как эндпоинт не работает
  return Promise.resolve(null)
  
  /*
  try {
    return bybit<{ list: any[] }>('/market/trading-records', {
      category: 'linear',
      symbol,
      limit: String(limit),
      start: String(start),
      end: String(end),
    })
  } catch (e) {
    return Promise.resolve(null)
  }
  */
}

function intervalMs(interval: KlineInterval): number {
  const m: Record<string, number> = {
    '1': 60 * 1000, '3': 3 * 60 * 1000, '5': 5 * 60 * 1000, '15': 15 * 60 * 1000,
    '30': 30 * 60 * 1000, '60': 60 * 60 * 1000, '120': 2 * 60 * 60 * 1000,
    '240': 4 * 60 * 60 * 1000, '360': 6 * 60 * 1000, '720': 12 * 60 * 1000,
    D: 24 * 60 * 60 * 1000, W: 7 * 24 * 60 * 60 * 1000, M: 30 * 24 * 60 * 60 * 1000,
  }
  return m[interval] ?? 60 * 60 * 1000
}

export type OrderbookResult = {
  s: string
  b: [string, string][] // [price, size]
  a: [string, string][]
  ts: number
}

export function getOrderbook(symbol: string, limit = 200): Promise<OrderbookResult> {
  return bybit<OrderbookResult>('/market/orderbook', { category: 'linear', symbol, limit: String(limit) })
}

export type OpenInterestResult = {
  symbol: string
  category: string
  list: { openInterest: string; timestamp: string }[]
}

export function getOpenInterest(symbol: string, interval: '5min' | '15min' | '30min' | '1h' | '4h' | '1d' = '1h'): Promise<OpenInterestResult> {
  return bybit<OpenInterestResult>('/market/open-interest/history', {
    category: 'linear',
    symbol,
    intervalTime: interval,
    limit: '200',
  })
}

export type FundingRateResult = {
  category: string
  list: { symbol: string; fundingRate: string; fundingRateTimestamp: string }[]
}

export function getFundingRate(symbol: string): Promise<FundingRateResult> {
  return bybit<FundingRateResult>('/market/funding/history', {
    category: 'linear',
    symbol,
    limit: '1',
  })
}

export const TIMEFRAME_INTERVALS: Record<string, KlineInterval> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
}
