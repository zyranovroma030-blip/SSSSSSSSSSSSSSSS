import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts'
import { getTickersLinear, getKline, type KlineInterval } from '../api/bybit'
import { useScreenerStore } from '../store/screener'
import SmartAlertButton from '../components/SmartAlertButton'
import { useBybitTickers } from '../hooks/useBybitTickers'
import type { TimeframeKey } from '../types'
import s from './Coins.module.css'

const TIMEFRAME_INTERVALS: Record<TimeframeKey, KlineInterval> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': 'D'
}

function notifyTelegram(telegramChatId: string, text: string) {
  fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegramChatId, text }),
  }).catch(() => {})
}

export default function Coins() {
  const { symbol: symbolFromUrl } = useParams<{ symbol: string }>()
  const [searchParams] = useSearchParams()
  const symbolFromQuery = searchParams.get('symbol')
  const [symbol, setSymbol] = useState(symbolFromUrl || symbolFromQuery || 'BTCUSDT')
  const {
    coinsTimeframe,
    setCoinsTimeframe,
    priceAlerts,
    addPriceAlert,
    removePriceAlert,
    markPriceAlertFired,
    addNotification,
    telegramChatId,
    favoriteCoins,
    addFavoriteCoin,
    removeFavoriteCoin,
    isFavoriteCoin,
  } = useScreenerStore()
  const [tickers, setTickers] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [addAlertMode, setAddAlertMode] = useState(false)
  const [_localAlerts, _setLocalAlerts] = useState<any[]>([])
  const chartRef = useRef<HTMLDivElement>(null)
  const chartApiRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const priceLinesRef = useRef<Map<string, { line: ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>; price: number }>>(new Map())

  useEffect(() => {
    setSymbol(symbolFromUrl || symbolFromQuery || 'BTCUSDT')
  }, [symbolFromUrl, symbolFromQuery])

  const loadTickers = () => {
    getTickersLinear().then((res) => {
      const map: Record<string, any> = {}
      res.list.forEach((t: any) => {
        const prev = parseFloat(t.prevPrice24h) || parseFloat(t.lastPrice)
        const high = parseFloat(t.highPrice24h)
        const low = parseFloat(t.lowPrice24h)
        map[t.symbol] = {
          ...t,
          volatility24hPct: prev ? ((high - low) / prev) * 100 : 0,
          volume24hUsd: parseFloat(t.turnover24h) || 0,
          priceChange24hPct: (parseFloat(t.price24hPcnt) || 0) * 100,
          fundingRateNum: parseFloat(t.fundingRate) || 0,
          // try read trades count if present in API response (fallback to undefined)
          tradeCount24h: (t.tradeCount24h ?? t.totalTrades ?? undefined),
        }
      })
      setTickers(map)
      setLoading(false)
    }).catch(() => setLoading(false))
  }
  useEffect(() => {
    loadTickers()
  }, [])
  const hasAlertsForSymbol = priceAlerts.some((a) => a.symbol === symbol && !a.fired)
  useEffect(() => {
    if (!hasAlertsForSymbol) return
    const t = setInterval(loadTickers, 8000)
    return () => clearInterval(t)
  }, [hasAlertsForSymbol])

  useEffect(() => {
    if (!chartRef.current || !symbol) return
    const chart = createChart(chartRef.current, {
      layout: { background: { color: '#13161e' }, textColor: '#8b92a0' },
      grid: { 
        vertLines: { 
          color: 'rgba(255,255,255,0.05)',
          style: 0 // сплошная линия
        }, 
        horzLines: { 
          color: 'rgba(255,255,255,0.05)',
          style: 0 // сплошная линия
        } 
      },
      width: chartRef.current.clientWidth,
      height: Math.max(400, chartRef.current.clientHeight || 500),
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.2 } },
      timeScale: { borderVisible: false, timeVisible: true },
    })
    const candle = chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', borderVisible: false })
    candleSeriesRef.current = candle
    const volume = chart.addHistogramSeries({ color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: '' })
    volumeSeriesRef.current = volume
    chart.priceScale('').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 }, borderVisible: false })
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })
    chartApiRef.current = chart

    // Глобальный кэш для хранения данных графиков
const chartDataCache = new Map<string, any[]>()

const loadKline = () => {
      const interval = TIMEFRAME_INTERVALS[coinsTimeframe] ?? '15'
      const cacheKey = `${symbol}-${interval}`
      
      console.log(`Loading chart for ${symbol}, interval: ${interval}`)
      
      // Проверяем кэш сначала
      if (chartDataCache.has(cacheKey)) {
        console.log(`Using cached data for ${symbol}`)
        const cachedData = chartDataCache.get(cacheKey)!
        const candles: any[] = []
        const vols: any[] = []
        cachedData.forEach((c) => {
          const t = parseInt(c[0], 10) / 1000
          candles.push({ time: t, open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]) })
          vols.push({ time: t, value: parseFloat(c[5]), color: parseFloat(c[4]) >= parseFloat(c[1]) ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)' })
        })
        if (candle && volume) {
          candle.setData(candles.reverse())
          volume.setData(vols.reverse())
          chart.timeScale().fitContent()
        }
        return
      }
      
      // Если нет в кэше, загружаем с API
      console.log(`Fetching fresh data for ${symbol}`)
      getKline(symbol, interval as KlineInterval, 400).then((res) => {
        const data: any[] = (res.list || [])
        console.log(`Received ${data.length} candles for ${symbol}`)
        chartDataCache.set(cacheKey, data) // Сохраняем в кэш
        
        const candles: any[] = []
        const vols: any[] = []
        data.forEach((c) => {
          const t = parseInt(c[0], 10) / 1000
          candles.push({ time: t, open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]) })
          vols.push({ time: t, value: parseFloat(c[5]), color: parseFloat(c[4]) >= parseFloat(c[1]) ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)' })
        })
        if (candle && volume) {
          candle.setData(candles.reverse())
          volume.setData(vols.reverse())
          chart.timeScale().fitContent()
        }
      }).catch((e) => {
        console.error('Error loading chart data:', e)
        setLoading(false)
      })
    }

    loadKline()
    const klineTimer = window.setInterval(loadKline, 15_000)

    // WebSocket relay to local server for realtime candle updates
    try {
      const wsUrl = `ws://localhost:4001`
      const ws = new WebSocket(wsUrl)
      const interval = TIMEFRAME_INTERVALS[coinsTimeframe] ?? '15'
      ws.addEventListener('open', () => {
        try {
          ws.send(JSON.stringify({ type: 'subscribe', symbol, interval }))
        } catch (e) {}
      })
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg?.type === 'kline' && msg.symbol === symbol && msg.interval === interval) {
            const c = msg.candle
            const candleSeries = candleSeriesRef.current
            const volSeries = volumeSeriesRef.current
            const chart = chartApiRef.current
            
            // Проверяем что график еще не удален
            if (!chart || !candleSeries) return
            
            try {
              candleSeries.update({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })
            } catch (e) {
              // График был удален, игнорируем ошибку
              return
            }
            
            if (volSeries && typeof c.volume !== 'undefined') {
              const color = c.close >= c.open ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'
              try { 
                volSeries.update({ time: c.time, value: c.volume, color }) 
              } catch (e) {
                // График был удален, игнорируем ошибку
              }
            }
          }
        } catch (e) {}
      })
      ws.addEventListener('error', () => {})

      // cleanup websocket on unmount or symbol change
      const cleanupWs = () => {
        try {
          ws.send(JSON.stringify({ type: 'unsubscribe', symbol, interval }))
        } catch (e) {}
        try { ws.close() } catch (e) {}
      }

      // ensure ws closed on effect cleanup
      var __wsCleanup = cleanupWs
    } catch (e) {
      // ignore WS errors
    }

    const onResize = () => {
      if (chartRef.current && chartApiRef.current)
        chartApiRef.current.applyOptions({ width: chartRef.current.clientWidth, height: chartRef.current.clientHeight })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.clearInterval(klineTimer)
      try { if (typeof __wsCleanup === 'function') __wsCleanup() } catch (e) {}
      window.removeEventListener('resize', onResize)
      priceLinesRef.current.clear()
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
      chart.remove()
      chartApiRef.current = null
    }
  }, [symbol, coinsTimeframe])

  // allow clicking on a price line to delete the alert (when not in add mode)
  useEffect(() => {
    const chart = chartApiRef.current
    if (!chart) return
    const handler = (param: { point?: { x: number; y: number } }) => {
      if (!param.point) return
      // do nothing in add alert mode
      if (addAlertMode) return
      const clickedPrice = candleSeriesRef.current?.coordinateToPrice(param.point.y)
      if (!clickedPrice) return
      // find nearest price line within pixel tolerance
      let foundId: string | null = null
      const TOLERANCE_PX = 8
      for (const [id, obj] of priceLinesRef.current.entries()) {
        try {
          const series = candleSeriesRef.current
          // try to get Y coordinate of the price on this series
          const yLine = (series as any).priceToCoordinate ? (series as any).priceToCoordinate(obj.price) : null
          if (yLine != null) {
            const dy = Math.abs(yLine - param.point.y)
            if (dy <= TOLERANCE_PX) { foundId = id; break }
          } else {
            // fallback to relative price check (if coordinate not available)
            const rel = Math.abs(obj.price - clickedPrice) / (obj.price || 1)
            if (rel < 0.002) { foundId = id; break }
          }
        } catch (e) {
          continue
        }
      }
      if (foundId) {
        // remove from store
        try { removePriceAlert(foundId) } catch (e) {}
        // also try to remove from local storage alerts if present
        try {
          const raw = localStorage.getItem('bybit-screener-alerts')
          const arr = raw ? JSON.parse(raw) : []
          const next = arr.filter((a: any) => a.id !== foundId)
          localStorage.setItem('bybit-screener-alerts', JSON.stringify(next))
        } catch (e) {}
      }
    }
    chart.subscribeClick(handler)
    return () => chart.unsubscribeClick(handler)
  }, [addAlertMode, removePriceAlert])

  // Ценовые уровни и клик для добавления
  useEffect(() => {
    const candle = candleSeriesRef.current
    const chart = chartApiRef.current
    if (!candle || !chart) return
    // combine alerts from store and from localStorage so locally saved alerts
    // are rendered immediately on chart load/navigation
    const buildAlertsList = (): any[] => {
      let list = priceAlerts.filter((a) => a.symbol === symbol)
      try {
        const raw = localStorage.getItem('bybit-screener-alerts')
        const local = raw ? JSON.parse(raw) : []
        const localForSymbol = (local || []).filter((a: any) => a.symbol === symbol)
        const ids = new Set(list.map((a) => a.id))
        for (const la of localForSymbol) if (!ids.has(la.id)) list.push(la)
      } catch (e) {}
      return list
    }

    const alertsForSymbol = buildAlertsList()
    const seen = new Set<string>()
    for (const a of alertsForSymbol) {
      if (a.fired) {
        // Удаляем сработавшие уведомления с графика
        if (priceLinesRef.current.has(a.id)) {
          const obj = priceLinesRef.current.get(a.id)!
          if (obj && candle) candle.removePriceLine(obj.line)
          priceLinesRef.current.delete(a.id)
        }
        continue
      }
      seen.add(a.id)
      if (priceLinesRef.current.has(a.id)) continue
      const line = candle.createPriceLine({
        price: a.price,
        color: '#7c3aed',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `Уведомление ${a.price}`,
      })
      priceLinesRef.current.set(a.id, { line, price: a.price })
    }
    for (const [id] of priceLinesRef.current) {
      if (!seen.has(id)) {
        const obj = priceLinesRef.current.get(id)!
        if (obj) candle.removePriceLine(obj.line)
        priceLinesRef.current.delete(id)
      }
    }
    // listen to storage changes so lines from localStorage appear when they change
    const onStorage = () => {
      try {
        const list = buildAlertsList()
        for (const a of list) {
          if (a.fired) continue
          if (priceLinesRef.current.has(a.id)) continue
          const ln = candle.createPriceLine({ price: a.price, color: '#7c3aed', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: `Уведомление ${a.price}` })
          priceLinesRef.current.set(a.id, { line: ln, price: a.price })
        }
      } catch (e) {}
    }
    window.addEventListener('storage', onStorage)
    // also trigger once after short delay to catch late writes
    const delayed = window.setTimeout(onStorage, 200)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.clearTimeout(delayed)
    }
  }, [symbol, priceAlerts])

  // Клик по графику в режиме добавления уровня
  useEffect(() => {
    const chart = chartApiRef.current
    const candle = candleSeriesRef.current
    if (!chart || !candle || !addAlertMode) return
    const handler = (param: { point?: { x: number; y: number } }) => {
      if (!param.point) return
      const price = candle.coordinateToPrice(param.point.y)
      if (price == null || Number(price) <= 0) return
      // Определяем направление на основе текущей цены
      const lastPrice = parseFloat(tickers[symbol]?.lastPrice || '0')
      const direction = price > lastPrice ? 'above' : 'below'
      addPriceAlert({ symbol, price: Number(price), direction })
      setAddAlertMode(false)
    }
    chart.subscribeClick(handler)
    return () => chart.unsubscribeClick(handler)
  }, [addAlertMode, symbol, addPriceAlert, tickers])

  // Проверка срабатывания ценовых оповещений
  useEffect(() => {
    if (!symbol || !tickers[symbol]) return
    const lastPrice = parseFloat(tickers[symbol].lastPrice)
    if (!lastPrice) return
    const toFire = priceAlerts.filter((a) => {
      if (a.symbol !== symbol || a.fired) return false
      // Проверяем только достижение цены без допуска
      const isActuallyReached = a.direction === 'above' 
        ? lastPrice >= a.price
        : lastPrice <= a.price
      return isActuallyReached
    })
    for (const a of toFire) {
      markPriceAlertFired(a.id)
      const msg = `${symbol}: уведомление на цене ${a.price} (текущая ${lastPrice.toFixed(4)})`
      addNotification({ title: 'Цена достигнута', body: msg, type: 'price_alert' })
      if (telegramChatId) notifyTelegram(telegramChatId, '🔔 ' + msg)
    }
  }, [symbol, tickers, priceAlerts, markPriceAlertFired, addNotification, telegramChatId])

  const coin = tickers[symbol]
  // fetch trades count for symbol (24h) when coin changes
  useEffect(() => {
    if (!symbol) return
    const fetchTrades = async () => {
      try {
        const end = Date.now()
        const start = end - 24 * 60 * 60 * 1000
        // dynamic import to avoid circular issues
        const api = await import('../api/bybit')
        const res = await api.getTrades(symbol, start, end, 1000)
        const count = res && Array.isArray((res as any).list) ? (res as any).list.length : undefined
        if (typeof count !== 'undefined') {
          setTickers((prev) => ({ ...(prev || {}), [symbol]: { ...(prev?.[symbol] || {}), tradeCount24h: count } }))
        }
      } catch (e) {}
    }
    fetchTrades()
  }, [symbol])
  const timeframes: TimeframeKey[] = ['1m', '5m', '15m', '1h', '4h', '1d']
  const [sortBy, setSortBy] = useState<'volume' | 'price_change' | 'favorites'>('volume')
  const coinsList = Object.keys(tickers).sort((a, b) => {
    if (sortBy === 'favorites') {
      const aFav = isFavoriteCoin(a)
      const bFav = isFavoriteCoin(b)
      if (aFav && !bFav) return -1
      if (!aFav && bFav) return 1
      if (aFav && bFav) {
        const aFavData = favoriteCoins.find(c => c.symbol === a)
        const bFavData = favoriteCoins.find(c => c.symbol === b)
        return (bFavData?.addedAt ?? 0) - (aFavData?.addedAt ?? 0)
      }
      return 0
    }
    if (sortBy === 'volume') {
      return (tickers[b]?.volume24hUsd ?? 0) - (tickers[a]?.volume24hUsd ?? 0)
    } else {
      return (tickers[b]?.priceChange24hPct ?? 0) - (tickers[a]?.priceChange24hPct ?? 0)
    }
  }).slice(0, 80)

  return (
    <div className={s.wrap}>
      <div className={s.chartArea}>
        <div className={s.chartToolbar}>
          <input
            className={s.symbolInput}
            placeholder="Поиск монеты"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          />
          <div className={s.tfRow}>
            {timeframes.map((tf) => (
              <button key={tf} className={tf === coinsTimeframe ? s.tfActive : s.tfBtn} onClick={() => setCoinsTimeframe(tf)}>{tf}</button>
            ))}
          </div>
          <button
            className={addAlertMode ? s.addAlertActive : s.indicatorBtn}
            title="Добавить уведомление на уровне цены (клик по графику)"
            onClick={() => setAddAlertMode(!addAlertMode)}
          >
            {addAlertMode ? 'Кликните по графику' : '+ Уведомление по цене'}
          </button>
          <button className={s.indicatorBtn}>Индикаторы</button>
        </div>
        <div className={s.chartLabel}>
          {symbol} — {coinsTimeframe}
          <button
            className={`${s.favoriteBtnChart} ${isFavoriteCoin(symbol) ? s.favoriteBtnChartActive : ''}`}
            onClick={() => {
              if (isFavoriteCoin(symbol)) {
                removeFavoriteCoin(symbol)
              } else {
                addFavoriteCoin(symbol)
              }
            }}
            title={isFavoriteCoin(symbol) ? 'Удалить из избранного' : 'Добавить в избранное'}
          >
            {isFavoriteCoin(symbol) ? '★' : '☆'}
          </button>
        </div>
        
        <div className={s.chart} ref={chartRef}>
          {loading && (
            <div className={s.chartLoading}>
              <div className={s.spinner}></div>
              <span>Загрузка графика...</span>
            </div>
          )}
          {!loading && coin && (
            <div className={s.techOverlay}>
              <div className={s.techItemTop}><span>Объём (24h)</span><span>{formatVol(coin.turnover24h)}</span></div>
              <div className={s.techItemTop}><span>Изм (24h)</span><span className={coin.priceChange24hPct >= 0 ? 'green' : 'red'}>{coin.priceChange24hPct.toFixed(2)}%</span></div>
              <div className={s.techItemTop}><span>Вол (24h)</span><span>{coin.volatility24hPct.toFixed(2)}%</span></div>
              <div className={s.techItemTop}><span>Фандинг</span><span>{((coin.fundingRateNum || 0) * 100).toFixed(4)}%</span></div>
              <div className={s.techItemTop}><span>Сделок (24h)</span><span>{coin.tradeCount24h ?? '-'}</span></div>
            </div>
          )}
        </div>
        {/* Список пользовательских ценовых оповещений для текущей монеты (store + локальные из Alerts) */}
        <AlertsForSymbol symbol={symbol} />
      </div>
      <aside className={s.sidebar}>
        <div className={s.tableHeader}>Монеты</div>
        <div className={s.sortButtons}>
          <button 
            className={sortBy === 'favorites' ? s.sortActive : s.sortBtn}
            onClick={() => setSortBy('favorites')}
          >
            Избранные ★
          </button>
          <button 
            className={sortBy === 'volume' ? s.sortActive : s.sortBtn}
            onClick={() => setSortBy('volume')}
          >
            По объёму ↕
          </button>
          <button 
            className={sortBy === 'price_change' ? s.sortActive : s.sortBtn}
            onClick={() => setSortBy('price_change')}
          >
            По изменению ↕
          </button>
        </div>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Монета</th>
              <th>Объём</th>
              <th>%</th>
              <th>★</th>
            </tr>
          </thead>
          <tbody>
            {coinsList.length > 0 ? coinsList.map((sym) => {
              const t = tickers[sym]
              if (!t) return null
              const isFav = isFavoriteCoin(sym)
              return (
                <tr key={sym} className={`${symbol === sym ? s.selected : ''} ${isFav ? s.favoriteRow : ''}`} onClick={() => setSymbol(sym)}>
                  <td>{sym.replace('USDT', '')}</td>
                  <td>{formatVol(t.turnover24h)}</td>
                  <td className={t.priceChange24hPct >= 0 ? 'green' : 'red'}>{t.priceChange24hPct.toFixed(2)}%</td>
                  <td>
                    <button
                      className={s.favoriteBtn}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isFav) {
                          removeFavoriteCoin(sym)
                        } else {
                          addFavoriteCoin(sym)
                        }
                      }}
                      title={isFav ? 'Удалить из избранного' : 'Добавить в избранное'}
                    >
                      {isFav ? '★' : '☆'}
                    </button>
                  </td>
                </tr>
              )
            }) : null}
          </tbody>
         </table>
        </aside>
    </div>
  )
}

function formatVol(v: string): string {
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return '-'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B$'
  if (n >= 1e6) return (n / 1e6).toFixed(0) + 'M$'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K$'
  return n.toFixed(0) + '$'
}

function AlertsForSymbol({ symbol }: { symbol: string }) {
  const ALERTS_STORAGE_KEY = 'bybit-screener-alerts'
  const [localAlerts, setLocalAlerts] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem(ALERTS_STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    const handler = () => {
      try {
        const raw = localStorage.getItem(ALERTS_STORAGE_KEY)
        setLocalAlerts(raw ? JSON.parse(raw) : [])
      } catch { }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const removeLocalAlert = (id: string) => {
    const next = localAlerts.filter((a) => a.id !== id)
    setLocalAlerts(next)
    try { localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(next)) } catch (e) {}
    // notify server about sync if needed
    try { fetch('/api/alerts/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegramChatId: '', alerts: next }) }) } catch (e) {}
  }

  const alertsForSymbol = localAlerts.filter(a => a.symbol === symbol)
  return (
    <>
      {alertsForSymbol.length > 0 && (
        <aside className={s.alertsBlock} style={{ marginTop: 12 }}>
          <div className={s.alertsHeader}>Оповещения для {symbol}</div>
          <div className={s.alertsList}>
            {alertsForSymbol.map((a) => (
              <div key={a.id} className={s.alertRow}>
                <span>{a.name || a.type} {a.symbol ? `(${a.symbol})` : ''}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={s.smallBtn} onClick={() => removeLocalAlert(a.id)}>Удалить</button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}
    </>
  )
}
