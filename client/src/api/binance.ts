const BASE = 'https://api.binance.com'

export type BinanceTicker = {
  symbol: string
  priceChange: string
  priceChangePercent: string
  weightedAvgPrice: string
  prevClosePrice: string
  lastPrice: string
  lastQty: string
  bidPrice: string
  bidQty: string
  askPrice: string
  askQty: string
  openPrice: string
  highPrice: string
  lowPrice: string
  volume: string
  quoteVolume: string
  openTime: number
  closeTime: number
  firstId: number
  lastId: number
  count: number
}

export type BinanceKline = [
  number, // openTime
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // closeTime
  string, // quoteAssetVolume
  number, // numberOfTrades
  string, // takerBuyBaseAssetVolume
  string, // takerBuyQuoteAssetVolume
  string  // ignore
]

export async function binance<T>(path: string): Promise<T> {
  const url = new URL(BASE + path)
  const r = await fetch(url.toString())
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export function getBinanceTickers(): Promise<BinanceTicker[]> {
  return binance<BinanceTicker[]>('/api/v3/ticker/24hr')
}

export function getBinanceKline(symbol: string, interval: string, limit = 200): Promise<BinanceKline[]> {
  return binance<BinanceKline[]>(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)
}

export function convertBybitSymbolToBinance(symbol: string): string {
  // Bybit использует USDT, Binance тоже USDT для фьючерсов
  // Для спотов: BTCUSDT -> BTCUSDT
  // Для фьючерсов: BTCUSDT -> BTCUSDT (Binance также использует USDT)
  return symbol.replace('USDT', 'USDT')
}

export function convertBinanceToBybitFormat(tickers: BinanceTicker[]): any[] {
  return tickers.map(ticker => ({
    symbol: ticker.symbol,
    lastPrice: ticker.lastPrice,
    price24hPcnt: (parseFloat(ticker.priceChangePercent) / 100).toString(),
    turnover24h: ticker.quoteVolume,
    highPrice24h: ticker.highPrice,
    lowPrice24h: ticker.lowPrice,
    prevPrice24h: ticker.prevClosePrice,
    volume24h: ticker.volume,
    tradeCount24h: ticker.count.toString()
  }))
}
