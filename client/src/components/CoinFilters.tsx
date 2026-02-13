import { useState, useEffect } from 'react'
import { useScreenerStore } from '../store/screener'
import type { CoinMetric } from '../types'
import s from './CoinFilters.module.css'

interface CoinFilters {
  volumeMin: number
  volumeMax: number
  priceChangeMin: number
  priceChangeMax: number
  volatilityMin: number
  volatilityMax: number
}

interface CoinFiltersProps {
  onFiltersChange: (filters: CoinFilters) => void
  onSearchChange: (search: string) => void
  coins: any[]
}

const DEFAULT_FILTERS: CoinFilters = {
  volumeMin: 0,
  volumeMax: 0,
  priceChangeMin: -100,
  priceChangeMax: 100,
  volatilityMin: 0,
  volatilityMax: 100
}

export function CoinFilters({ onFiltersChange, onSearchChange, coins }: CoinFiltersProps) {
  const { coinFilters: savedFilters, saveCoinFilters } = useScreenerStore()
  const [filters, setFilters] = useState<CoinFilters>(savedFilters || DEFAULT_FILTERS)
  const [searchTerm, setSearchTerm] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)

  // Calculate max values from current coins
  const maxVolume = Math.max(...coins.map(c => c.volume24hUsd), 1000000)
  const maxVolatility = Math.max(...coins.map(c => c.volatility24hPct), 100)

  useEffect(() => {
    onFiltersChange(filters)
    saveCoinFilters(filters)
  }, [filters, onFiltersChange, saveCoinFilters])

  useEffect(() => {
    onSearchChange(searchTerm)
  }, [searchTerm, onSearchChange])

  const handleFilterChange = (key: keyof CoinFilters, value: number) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setSearchTerm('')
  }

  return (
    <div className={s.coinFilters}>
      <div className={s.filtersHeader}>
        <input
          type="text"
          placeholder="🔍 Поиск монеты..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
          className={s.searchInput}
        />
        <button 
          className={s.toggleFiltersBtn}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? '📉 Фильтры' : '📊 Фильтры'}
        </button>
        {isExpanded && (
          <button 
            className={s.resetFiltersBtn}
            onClick={resetFilters}
          >
            🔄 Сброс
          </button>
        )}
      </div>

      {isExpanded && (
        <div className={s.filtersContent}>
          <div className={s.filterGroup}>
            <label>Объём (24h):</label>
            <div className={s.rangeInputs}>
              <input
                type="number"
                placeholder="Мин"
                value={filters.volumeMin || ''}
                onChange={(e) => handleFilterChange('volumeMin', Number(e.target.value))}
                min="0"
                step="100000"
              />
              <span>-</span>
              <input
                type="number"
                placeholder="Макс"
                value={filters.volumeMax || ''}
                onChange={(e) => handleFilterChange('volumeMax', Number(e.target.value))}
                min="0"
                max={maxVolume}
                step="100000"
              />
            </div>
          </div>

          <div className={s.filterGroup}>
            <label>Изменение цены (%):</label>
            <div className={s.rangeInputs}>
              <input
                type="number"
                placeholder="Мин"
                value={filters.priceChangeMin}
                onChange={(e) => handleFilterChange('priceChangeMin', Number(e.target.value))}
                min="-100"
                max="100"
                step="0.1"
              />
              <span>-</span>
              <input
                type="number"
                placeholder="Макс"
                value={filters.priceChangeMax}
                onChange={(e) => handleFilterChange('priceChangeMax', Number(e.target.value))}
                min="-100"
                max="100"
                step="0.1"
              />
            </div>
          </div>

          <div className={s.filterGroup}>
            <label>Волатильность (%):</label>
            <div className={s.rangeInputs}>
              <input
                type="number"
                placeholder="Мин"
                value={filters.volatilityMin}
                onChange={(e) => handleFilterChange('volatilityMin', Number(e.target.value))}
                min="0"
                max={maxVolatility}
                step="0.1"
              />
              <span>-</span>
              <input
                type="number"
                placeholder="Макс"
                value={filters.volatilityMax}
                onChange={(e) => handleFilterChange('volatilityMax', Number(e.target.value))}
                min="0"
                max={maxVolatility}
                step="0.1"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
