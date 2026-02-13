import { useState, useEffect, useMemo } from 'react'
import { getTickersLinear } from '../api/bybit'
import s from './DensityMap.module.css'

interface DensityLevel {
  price: number
  volume: number
  side: 'buy' | 'sell'
  density: number
  densityRatio: number // Соотношение плотности к общему объему
  turnover24h: number
  supportStrength: 'weak' | 'medium' | 'strong'
}

interface DensityFilters {
  minVolume: number
  maxVolume: number
  minDensity: number
  maxDensity: number
  minDensityRatio: number // Минимальное соотношение плотности к объему
  maxDistance: number // Максимальное расстояние от текущей цены в %
}

const TOP_SYMBOLS_BY_VOLUME = 50
const MIN_DENSITY_RATIO = 1.5 // Плотность должна быть в 1.5 раза выше среднего

export default function DensityMap() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT')
  const [symbols, setSymbols] = useState<string[]>([])
  const [densityLevels, setDensityLevels] = useState<DensityLevel[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<DensityFilters>({
    minVolume: 1000000,
    maxVolume: 0,
    minDensity: 100000,
    maxDensity: 0,
    minDensityRatio: 2.0,
    maxDistance: 2.0
  })

  // Загружаем список символов
  useEffect(() => {
    getTickersLinear().then((res) => {
      const list = res.list
        .map((t: any) => t.symbol)
        .filter((sym: string) => sym.endsWith('USDT'))
        .sort()
      setSymbols(list)
    })
  }, [])

  // Загружаем данные плотности для выбранного символа
  const fetchDensityData = async () => {
    setLoading(true)
    try {
      // Получаем order book
      const orderbookResponse = await fetch(`https://api.bybit.com/v5/market/orderbook?symbol=${selectedSymbol}&category=linear&limit=1000`)
      const orderbook = await orderbookResponse.json()
      
      if (!orderbook.result || !orderbook.result.b || !orderbook.result.a) {
        console.error('Invalid orderbook data')
        return
      }

      // Получаем текущие данные о объеме
      const tickersResponse = await getTickersLinear()
      const ticker = tickersResponse.list.find((t: any) => t.symbol === selectedSymbol)
      const turnover24h = ticker ? parseFloat(ticker.turnover24h) : 0
      const currentPrice = ticker ? parseFloat(ticker.lastPrice) : 0

      const bids = orderbook.result.b // Buy ордера (поддержка)
      const asks = orderbook.result.a // Sell ордера (сопротивление)

      const densityData: DensityLevel[] = []

      // Анализируем buy side (уровни поддержки)
      for (let i = 0; i < Math.min(bids.length, 200); i++) {
        const price = parseFloat(bids[i][0])
        const volume = parseFloat(bids[i][1])
        const distanceFromCurrent = Math.abs((price - currentPrice) / currentPrice) * 100

        // Рассчитываем локальную плотность - сумма объемов в окне вокруг этого уровня
        let localDensity = volume
        for (let j = Math.max(0, i - 5); j < Math.min(i + 5, bids.length); j++) {
          localDensity += parseFloat(bids[j][1])
        }

        // Рассчитываем соотношение плотности к общему объему
        const densityRatio = turnover24h > 0 ? localDensity / (turnover24h / 1440) : 0 // Объем в минуту

        // Определяем силу поддержки
        let supportStrength: 'weak' | 'medium' | 'strong' = 'weak'
        if (densityRatio >= 3.0) supportStrength = 'strong'
        else if (densityRatio >= 1.5) supportStrength = 'medium'

        densityData.push({
          price,
          volume,
          side: 'buy',
          density: localDensity,
          densityRatio,
          turnover24h,
          supportStrength
        })
      }

      // Анализируем sell side (уровни сопротивления)
      for (let i = 0; i < Math.min(asks.length, 200); i++) {
        const price = parseFloat(asks[i][0])
        const volume = parseFloat(asks[i][1])
        const distanceFromCurrent = Math.abs((price - currentPrice) / currentPrice) * 100

        let localDensity = volume
        for (let j = Math.max(0, i - 5); j < Math.min(i + 5, asks.length); j++) {
          localDensity += parseFloat(asks[j][1])
        }

        const densityRatio = turnover24h > 0 ? localDensity / (turnover24h / 1440) : 0

        let supportStrength: 'weak' | 'medium' | 'strong' = 'weak'
        if (densityRatio >= 3.0) supportStrength = 'strong'
        else if (densityRatio >= 1.5) supportStrength = 'medium'

        densityData.push({
          price,
          volume,
          side: 'sell',
          density: localDensity,
          densityRatio,
          turnover24h,
          supportStrength
        })
      }

      setDensityLevels(densityData)
    } catch (error) {
      console.error('Error fetching density data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Фильтруем данные
  const filteredData = useMemo(() => {
    return densityLevels.filter(d => {
      const distanceFromCurrent = d.turnover24h > 0 ? 
        Math.abs((d.price - (densityLevels.find(dl => dl.turnover24h > 0)?.price || 0)) / d.price) * 100 : 0

      return d.volume >= filters.minVolume &&
             (filters.maxVolume === 0 || d.volume <= filters.maxVolume) &&
             d.density >= filters.minDensity &&
             (filters.maxDensity === 0 || d.density <= filters.maxDensity) &&
             d.densityRatio >= filters.minDensityRatio &&
             distanceFromCurrent <= filters.maxDistance
    })
  }, [densityLevels, filters])

  // Сортируем данные
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => b.density - a.density)
  }, [filteredData])

  useEffect(() => {
    if (selectedSymbol) {
      fetchDensityData()
    }
  }, [selectedSymbol])

  // Автообновление каждые 30 секунд
  useEffect(() => {
    const interval = setInterval(fetchDensityData, 30000)
    return () => clearInterval(interval)
  }, [selectedSymbol])

  const getStrengthColor = (strength: string) => {
    switch (strength) {
      case 'strong': return '#22c55e'
      case 'medium': return '#f59e0b'
      case 'weak': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getSideIcon = (side: string) => {
    return side === 'buy' ? '🟢' : '🔴'
  }

  return (
    <div className={s.densityMap}>
      <div className={s.header}>
        <h2>🎯 Карта плотностей ордеров</h2>
        <div className={s.controls}>
          <select 
            value={selectedSymbol} 
            onChange={(e) => setSelectedSymbol(e.target.value)}
            disabled={loading}
          >
            {symbols.map(sym => (
              <option key={sym} value={sym}>{sym.replace('USDT', '')}</option>
            ))}
          </select>
          <button onClick={fetchDensityData} disabled={loading}>
            {loading ? '🔄 Загрузка...' : '🔄 Обновить'}
          </button>
        </div>
      </div>

      <div className={s.filters}>
        <h3>🔍 Фильтры высокой плотности</h3>
        <div className={s.filterGrid}>
          <div className={s.filterGroup}>
            <label>Мин. объем ордера:</label>
            <input
              type="number"
              value={filters.minVolume}
              onChange={(e) => setFilters(prev => ({ ...prev, minVolume: Number(e.target.value) }))}
              placeholder="1000000"
            />
            <small>Минимальный объем на уровне</small>
          </div>
          
          <div className={s.filterGroup}>
            <label>Макс. объем:</label>
            <input
              type="number"
              value={filters.maxVolume}
              onChange={(e) => setFilters(prev => ({ ...prev, maxVolume: Number(e.target.value) }))}
              placeholder="0 = без огр."
            />
            <small>0 = без ограничения</small>
          </div>
          
          <div className={s.filterGroup}>
            <label>Мин. плотность:</label>
            <input
              type="number"
              value={filters.minDensity}
              onChange={(e) => setFilters(prev => ({ ...prev, minDensity: Number(e.target.value) }))}
              placeholder="100000"
            />
            <small>Сумма объемов вокруг уровня</small>
          </div>
          
          <div className={s.filterGroup}>
            <label>Соотнош. плотн/объема:</label>
            <input
              type="number"
              step="0.1"
              value={filters.minDensityRatio}
              onChange={(e) => setFilters(prev => ({ ...prev, minDensityRatio: Number(e.target.value) }))}
              placeholder="2.0"
            />
            <small>Плотность / (объем/1440мин)</small>
          </div>
          
          <div className={s.filterGroup}>
            <label>Макс. расстояние от цены:</label>
            <input
              type="number"
              step="0.1"
              value={filters.maxDistance}
              onChange={(e) => setFilters(prev => ({ ...prev, maxDistance: Number(e.target.value) }))}
              placeholder="2.0"
            />
            <small>В процентах от текущей цены</small>
          </div>
        </div>
      </div>

      <div className={s.results}>
        <h3>📊 Найденные уровни ({sortedData.length})</h3>
        {loading ? (
          <div className={s.loading}>
            <div className={s.spinner}></div>
            <span>Загрузка данных плотности...</span>
          </div>
        ) : sortedData.length === 0 ? (
          <div className={s.noResults}>
            <p>🔍 Уровни с высокой плотностью не найдены</p>
            <p>Попробуйте уменьшить фильтры или выберите другую монету</p>
          </div>
        ) : (
          <div className={s.densityTable}>
            <div className={s.tableHeader}>
              <div>Монета</div>
              <div>Цена</div>
              <div>Объем</div>
              <div>Плотность</div>
              <div>Соотношение</div>
              <div>Сила</div>
              <div>Сторона</div>
            </div>
            {sortedData.slice(0, 50).map((level, index) => (
              <div key={index} className={s.tableRow}>
                <div>{selectedSymbol.replace('USDT', '')}</div>
                <div>{level.price.toFixed(4)}</div>
                <div>{(level.volume / 1000000).toFixed(2)}M</div>
                <div>{(level.density / 1000000).toFixed(2)}M</div>
                <div>{level.densityRatio.toFixed(1)}x</div>
                <div style={{ color: getStrengthColor(level.supportStrength) }}>
                  {level.supportStrength === 'strong' ? '💪' : 
                   level.supportStrength === 'medium' ? '👊' : '👎'}
                </div>
                <div>{getSideIcon(level.side)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={s.info}>
        <h3>ℹ️ Как это работает</h3>
        <ul>
          <li><strong>Плотность</strong> - сумма объемов ордеров в окне вокруг уровня цены</li>
          <li><strong>Соотношение</strong> - плотность относительно среднего объема в минуту</li>
          <li><strong>Высокая плотность</strong> - уровень где цена может оттолкнуться или пробить</li>
          <li><strong>Зеленые уровни</strong> - поддержка (buy ордера)</li>
          <li><strong>Красные уровни</strong> - сопротивление (sell ордера)</li>
        </ul>
      </div>
    </div>
  )
}
