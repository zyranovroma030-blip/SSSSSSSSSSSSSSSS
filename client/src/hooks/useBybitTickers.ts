import { useState, useEffect } from 'react'
import { getTickersLinear } from '../api/bybit'
import type { CoinMetric } from '../types'
import type { TickerLinear } from '../api/bybit'

const DEFAULT_VOLUME_MIN = 70 // в сотнях тысяч $ (70 = $7M)
/** 0 = без ограничения по максимуму */
const DEFAULT_TOP_N = 50

function toCoinMetric(t: TickerLinear): CoinMetric {
  const prev = parseFloat(t.prevPrice24h) || parseFloat(t.lastPrice)
  const high = parseFloat(t.highPrice24h)
  const low = parseFloat(t.lowPrice24h)
  const volatility24hPct = prev ? ((high - low) / prev) * 100 : 0
  const volume24hUsd = parseFloat(t.turnover24h) || 0
  const priceChange24hPct = (parseFloat(t.price24hPcnt) || 0) * 100
  const openInterestUsd = parseFloat(t.openInterestValue) || 0
  const fundingRateNum = parseFloat(t.fundingRate) || 0
  return {
    ...t,
    volatility24hPct,
    volume24hUsd,
    priceChange24hPct,
    openInterestUsd,
    fundingRateNum,
  }
}

export interface UseTickersFilters {
  volumeMinUsd?: number
  /** 0 или не задан = без ограничения по максимуму */
  volumeMaxUsd?: number
  volatilityMinPct?: number
  volatilityMaxPct?: number
  priceChangeMinPct?: number
  priceChangeMaxPct?: number
  sortBy?: 'volume' | 'volatility' | 'price_change' | 'top_growth'
  sortDirection?: 'asc' | 'desc'
  blacklist?: string[]
  limit?: number
}

export function useBybitTickers(
  refreshKey: number,
  filters: UseTickersFilters = {}
) {
  const [list, setList] = useState<CoinMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const {
    volumeMinUsd = DEFAULT_VOLUME_MIN,
    volumeMaxUsd = 0,
    volatilityMinPct = 0,
    volatilityMaxPct = 100,
    priceChangeMinPct = -100,
    priceChangeMaxPct = 100,
    sortBy = 'volatility',
    sortDirection = 'desc',
    blacklist = [],
    limit = DEFAULT_TOP_N,
  } = filters

  // Конвертируем из сотен тысяч в реальные доллары
  const volumeMinUsdReal = volumeMinUsd * 100000
  const volumeMaxUsdReal = volumeMaxUsd * 100000

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getTickersLinear()
      .then((res) => {
        if (cancelled) return
        let coins: CoinMetric[] = res.list.map(toCoinMetric)
        const bl = new Set(blacklist.map((s) => s.toUpperCase()))
        
        // Логируем фильтрацию для отладки
        console.log('Blacklist:', Array.from(bl))
        console.log('All coins before filter:', coins.map(c => c.symbol))
        
        coins = coins.filter((c) => !bl.has(c.symbol))
        
        console.log('Coins after blacklist filter:', coins.map(c => c.symbol))
        
        coins = coins.filter((c) => {
          if (c.volume24hUsd < volumeMinUsdReal) return false
          if (volumeMaxUsdReal > 0 && c.volume24hUsd > volumeMaxUsdReal) return false
          if (c.volatility24hPct < volatilityMinPct || c.volatility24hPct > volatilityMaxPct) return false
          if (c.priceChange24hPct < priceChangeMinPct || c.priceChange24hPct > priceChangeMaxPct) return false
          return true
        })
        
        console.log('Final coins after all filters:', coins.map(c => c.symbol))
        
        const dir = sortDirection === 'asc' ? 1 : -1
        if (sortBy === 'volatility') {
          coins.sort((a, b) => (a.volatility24hPct - b.volatility24hPct) * dir)
        } else if (sortBy === 'volume') {
          coins.sort((a, b) => (a.volume24hUsd - b.volume24hUsd) * dir)
        } else if (sortBy === 'price_change' || sortBy === 'top_growth') {
          // "Рост" сортируем по реальному % изменения (не по модулю)
          coins.sort((a, b) => (a.priceChange24hPct - b.priceChange24hPct) * dir)
        }
        setList(coins.slice(0, limit))
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Ошибка загрузки')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey, volumeMinUsdReal, volumeMaxUsdReal, volatilityMinPct, volatilityMaxPct, priceChangeMinPct, priceChangeMaxPct, sortBy, sortDirection, limit, blacklist.join(',')])

  return { list, loading, error }
}
