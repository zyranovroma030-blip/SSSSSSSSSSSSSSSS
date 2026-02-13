import { useState, useEffect, useRef } from 'react'
import { createChart, IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts'
import { getKline, TIMEFRAME_INTERVALS } from '../api/bybit'
import { useScreenerStore } from '../store/screener'
import type { TimeframeKey } from '../types'
import type { KlineInterval } from '../api/bybit'

// Кэш для данных графиков
const chartDataCache = new Map<string, CandlestickData[]>()

interface MiniChartProps {
  symbol: string
  timeframe: TimeframeKey
  volume24h: string
  change24hPct: number
  volatility24hPct: number
  onExpand?: () => void
  className?: string
  candleCount?: number
}

export default function MiniChart({ symbol, timeframe, candleCount = 50, onExpand, volume24h, change24hPct, volatility24hPct, className }: MiniChartProps) {
  const { smartAlerts, addSmartAlert, addFavoriteCoin, removeFavoriteCoin, isFavoriteCoin } = useScreenerStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const [dataLoaded, setDataLoaded] = useState(false)
  // Временно отключаем ленивую загрузку для исправления проблемы
  const isVisible = true

  const interval = TIMEFRAME_INTERVALS[timeframe] ?? '15'

  useEffect(() => {
    if (!isVisible || !containerRef.current) return
    
    const chart = createChart(containerRef.current, {
      layout: { background: { color: 'transparent' }, textColor: '#8b92a0' },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
      width: containerRef.current.clientWidth,
      height: 180,
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.2 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } }
    })
    
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
    })
    chartRef.current = chart
    seriesRef.current = candlestickSeries

    const load = async () => {
      try {
        console.log(`[MiniChart] Starting load for ${symbol}, interval: ${interval}, count: ${candleCount}`)
        setDataLoaded(false)
        
        // Добавляем небольшую задержку чтобы избежать слишком многих одновременных запросов
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500))
        
        const reducedCount = candleCount // Используем полное количество свечей из настроек
        const cacheKey = `${symbol}-${interval}-${reducedCount}`
        
        if (!chartRef.current || !seriesRef.current) {
          console.log(`[MiniChart] Chart for ${symbol} is already disposed or not initialized, skipping load`)
          return
        }
        
        console.log(`[MiniChart] Cache key: ${cacheKey}`)
        
        // Проверяем кэш сначала
        let data: CandlestickData[] = []
        if (chartDataCache.has(cacheKey)) {
          data = chartDataCache.get(cacheKey)!
          console.log(`[MiniChart] Using cached data for ${symbol}:`, data.length, 'candles')
        } else {
          console.log(`[MiniChart] Cache miss for ${symbol}-${interval}-${reducedCount}, fetching from API...`)
          
          // Добавляем таймаут для запроса
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('API timeout')), 10000)
          )
          
          const res = await Promise.race([
            getKline(symbol, interval as KlineInterval, reducedCount),
            timeoutPromise
          ]) as any
          
          console.log(`Received API response for ${symbol}:`, res.list?.length || 0, 'candles')
          data = (res.list || [])
            .map((c: any) => {
              const [t, o, h, l, cl] = c
              return {
                time: (parseInt(t, 10) / 1000) as any,
                open: parseFloat(o),
                high: parseFloat(h),
                low: parseFloat(l),
                close: parseFloat(cl),
              }
            })
            .reverse()
          
          // Сохраняем в кэш
          chartDataCache.set(cacheKey, data)
        }
        
        if (chartRef.current && seriesRef.current) {
          if (data.length > 0) {
            console.log(`[MiniChart] Setting ${data.length} candles for ${symbol}`)
            seriesRef.current.setData(data)
            chartRef.current.timeScale().fitContent()
          } else {
            console.log(`[MiniChart] No data available for ${symbol}`)
          }
          setDataLoaded(true)
        } else {
          console.log(`[MiniChart] Chart for ${symbol} was disposed, data length: ${data.length}`)
          setDataLoaded(true)
        }
      } catch (e) {
        console.error(`Error loading data for ${symbol}:`, e)
        setDataLoaded(true)
        
        if (containerRef.current && !chartRef.current) {
          containerRef.current.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 160px; color: var(--text-muted); font-size: 12px;">
            Ошибка загрузки ${symbol}
            </div>
          `
        }
      }
    }

    // Вызываем функцию загрузки данных
    load()

    // Временно отключаем WebSocket для упрощения отладки
    /*
    const onRealtime = (c: any) => {
      try {
        if (seriesRef.current) {
          seriesRef.current.update({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close })
        }
      } catch (e) {
        // Игнорируем ошибки обновления если график уничтожен
      }
    }

    wsManager.subscribe(symbol, interval, onRealtime)
    */

    const onResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', onResize)
    return () => {
      // Временно отключаем WebSocket
      /*
      try {
        wsManager.unsubscribe(symbol, interval, onRealtime)
      } catch (e) {}
      */
      window.removeEventListener('resize', onResize)
      
      // Безопасное удаление графика
      try {
        if (chartRef.current) {
          chartRef.current.remove()
        }
      } catch (e) {
        // Игнорируем ошибки удаления если график уже уничтожен
      }
      chartRef.current = null
      seriesRef.current = null
    }
  }, [symbol, interval, candleCount])

  const isFav = isFavoriteCoin(symbol)
  const volShort = formatVolume(volume24h)
  const changeStr = (change24hPct >= 0 ? '+' : '') + change24hPct.toFixed(2) + '%'
  const volPctStr = volatility24hPct.toFixed(2) + '%'

  return (
    <div className={className} style={{ background: 'var(--bg-panel)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{symbol.replace('USDT', '')}.F</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            ОБ (24h): {volShort} · Изм (24h): <span className={change24hPct >= 0 ? 'green' : 'red'}>{changeStr}</span> · Вол (24h): {volPctStr}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => {
              if (isFav) {
                removeFavoriteCoin(symbol)
              } else {
                addFavoriteCoin(symbol)
              }
            }}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: isFav ? '#fbbf24' : '#666',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s'
            }}
            title={isFav ? 'Удалить из избранного' : 'Добавить в избранное'}
          >
            {isFav ? '★' : '☆'}
          </button>
          {onExpand && (
            <button 
              onClick={onExpand} 
              style={{ 
                padding: '6px 8px', 
                borderRadius: '6px', 
                background: 'transparent',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                color: 'var(--text-muted)'
              }} 
              title="Развернуть"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.color = 'var(--text)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2 2v-3M3 16h3a2 2 0 0 0 2 2v3m-18 0V5a2 2 0 0 0-2-2" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 160, position: 'relative' }}>
        {!dataLoaded && (
          <div style={{ 
            position: 'absolute', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            zIndex: 10
          }}>
            <div style={{ 
              width: '16px', 
              height: '16px', 
              border: '2px solid var(--border)', 
              borderTop: '2px solid var(--accent)',
              borderRadius: '50%',
              animation: `${spin} 0.5s linear infinite` // Ускорили анимацию
            }} />
            <span>Загрузка...</span> {/* Укоротили текст */}
          </div>
        )}
        <div ref={containerRef} style={{ flex: 1, minHeight: 160 }} />
        {dataLoaded && (
          <div style={{ 
            position: 'absolute', 
            bottom: '8px', 
            right: '8px',
            padding: '4px 8px',
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            borderRadius: '4px',
            fontSize: '10px',
            zIndex: 5
          }}>
            {symbol}
          </div>
        )}
      </div>
    </div>
  )
}

function formatVolume(v: string): string {
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return '-'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B$'
  if (n >= 1e6) return (n / 1e6).toFixed(0) + 'M$'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K$'
  return n.toFixed(0) + '$'
}

const spin = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`
