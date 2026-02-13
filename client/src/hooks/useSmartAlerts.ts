import { useEffect, useRef } from 'react'
import { useScreenerStore, type SmartAlert } from '../store/screener'
import { getTickersLinear, getKline } from '../api/bybit'
import type { KlineInterval } from '../api/bybit'

interface CoinData {
  symbol: string
  price: number
  priceChange24h: number
  volume24h: number
  volatility24h: number
}

const SYMBOL_COOLDOWN_MS = 24 * 60 * 60 * 1000
const MAX_KLINE_COINS_PER_ALERT = 200
const KLINE_CONCURRENCY = 10

export function useSmartAlerts() {
  const {
    smartAlerts,
    telegramChatId,
    smartAlertsSettings,
    addNotification,
    markSmartAlertSent,
    setSmartAlertsChecking,
    addSmartAlertsCheckLog,
  } = useScreenerStore()
  const checkIntervalRef = useRef<number>()

  // Функция для проверки оповещений
  const checkAlerts = async () => {
    if (!telegramChatId || smartAlerts.length === 0) {
      addSmartAlertsCheckLog({
        time: Date.now(),
        alertName: 'System',
        checkedCoins: 0,
        matchedCoins: 0,
        sentSymbols: [],
        error: !telegramChatId ? 'Telegram Chat ID не настроен' : 'Нет активных оповещений',
      })
      return
    }

    setSmartAlertsChecking(true)

    try {
      // Получаем текущие данные всех монет
      const tickersResponse = await getTickersLinear()
      console.log('[SmartAlerts] Got tickers:', tickersResponse.list?.length || 0)
      const currentData = new Map<string, CoinData>()

      // Обрабатываем тикеры
      tickersResponse.list.forEach((ticker: any) => {
        const prevPrice = parseFloat(ticker.prevPrice24h) || parseFloat(ticker.lastPrice)
        const currentPrice = parseFloat(ticker.lastPrice)
        const priceChange = ((currentPrice - prevPrice) / prevPrice) * 100
        const volume = parseFloat(ticker.turnover24h)
        const high = parseFloat(ticker.highPrice24h)
        const low = parseFloat(ticker.lowPrice24h)
        const volatility = ((high - low) / prevPrice) * 100

        currentData.set(ticker.symbol, {
          symbol: ticker.symbol,
          price: currentPrice,
          priceChange24h: priceChange,
          volume24h: volume,
          volatility24h: volatility
        })
      })

      console.log('[SmartAlerts] Parsed coins:', currentData.size)

      // Ограничиваем количество оповещений, чтобы не перегружать проверки
      const alertsToCheck = smartAlerts.slice(0, Math.max(1, smartAlertsSettings.maxAlerts || 50))

      const coinsSortedByVolume = Array.from(currentData.values()).sort((a, b) => b.volume24h - a.volume24h)

      // Проверяем каждое включенное оповещение
      for (const alert of alertsToCheck) {
        if (!alert.enabled) continue

        const alertStartTime = Date.now()
        let checkedCount = 0
        let matchedCount = 0
        const sentSymbols: string[] = []

        // Фильтруем монеты по черному списку и объему
        const filteredCoins = coinsSortedByVolume.filter((coin) => {
          if (alert.blacklist.includes(coin.symbol)) return false
          if (alert.minVolume && coin.volume24h < alert.minVolume) return false
          if (alert.maxVolume && coin.volume24h > alert.maxVolume) return false
          return true
        })
        checkedCount = filteredCoins.length

        console.log('[SmartAlerts] Alert:', alert.name, {
          totalCoins: coinsSortedByVolume.length,
          afterFilter: filteredCoins.length,
          blacklist: alert.blacklist.length,
          minVolume: alert.minVolume,
          maxVolume: alert.maxVolume,
          sampleCoin: coinsSortedByVolume[0]?.symbol,
          sampleVolume: coinsSortedByVolume[0]?.volume24h
        })

        // Кулдаун 24ч по каждой монете (если включено)
        const now = Date.now()
        const sentMap = alert.sentBySymbol ?? {}
        const eligibleCoins = smartAlertsSettings.autoFilter
          ? filteredCoins.filter((c) => {
              const last = sentMap[c.symbol]
              return !last || now - last >= SYMBOL_COOLDOWN_MS
            })
          : filteredCoins

        const triggeredSymbols: string[] = []

        // Проверяем разные типы оповещений
        switch (alert.type) {
          case 'price_increase':
            if (alert.timePeriod === '24h') {
              for (const coin of eligibleCoins) {
                if (coin.priceChange24h >= alert.threshold) triggeredSymbols.push(coin.symbol)
              }
            } else {
              const timeMs = getTimePeriodMs(alert.timePeriod)
              const coins = eligibleCoins.slice(0, MAX_KLINE_COINS_PER_ALERT)
              const checks = await mapLimit(
                coins,
                KLINE_CONCURRENCY,
                async (coin) => (await checkPriceIncreaseForCoin(alert, coin.symbol, timeMs)) ? coin.symbol : null
              )
              for (const sym of checks) {
                if (sym) triggeredSymbols.push(sym)
              }
            }
            break

          case 'price_decrease':
            if (alert.timePeriod === '24h') {
              for (const coin of eligibleCoins) {
                if (coin.priceChange24h <= -alert.threshold) triggeredSymbols.push(coin.symbol)
              }
            } else {
              const timeMs = getTimePeriodMs(alert.timePeriod)
              const coins = eligibleCoins.slice(0, MAX_KLINE_COINS_PER_ALERT)
              const checks = await mapLimit(
                coins,
                KLINE_CONCURRENCY,
                async (coin) => (await checkPriceDecreaseForCoin(alert, coin.symbol, timeMs)) ? coin.symbol : null
              )
              for (const sym of checks) {
                if (sym) triggeredSymbols.push(sym)
              }
            }
            break

          case 'volatility':
            for (const coin of eligibleCoins) {
              if (coin.volatility24h >= alert.threshold) triggeredSymbols.push(coin.symbol)
            }
            break

          case 'volume_spike':
            {
              const timeMs = getTimePeriodMs(alert.timePeriod)
              const coins = eligibleCoins.slice(0, MAX_KLINE_COINS_PER_ALERT)
              const checks = await mapLimit(
                coins,
                KLINE_CONCURRENCY,
                async (coin) => (await checkVolumeSpikeForCoin(alert, coin.symbol, timeMs)) ? coin.symbol : null
              )
              for (const sym of checks) {
                if (sym) triggeredSymbols.push(sym)
              }
            }
            break

          case 'density_appearance':
            {
              const coins = eligibleCoins.slice(0, MAX_KLINE_COINS_PER_ALERT)
              const checks = await mapLimit(
                coins,
                KLINE_CONCURRENCY,
                async (coin) => (await checkDensityAppearanceForCoin(alert, coin.symbol)) ? coin.symbol : null
              )
              for (const sym of checks) {
                if (sym) triggeredSymbols.push(sym)
              }
            }
            break
        }

        if (triggeredSymbols.length > 0) {
          matchedCount = triggeredSymbols.length
          sentSymbols.push(...triggeredSymbols)

          // Разбиваем на батчи по 100 монет для Telegram
          const BATCH_SIZE = 100
          const batches: string[][] = []
          for (let i = 0; i < triggeredSymbols.length; i += BATCH_SIZE) {
            batches.push(triggeredSymbols.slice(i, i + BATCH_SIZE))
          }

          // Отправляем каждый батч отдельным сообщением
          for (let i = 0; i < batches.length; i++) {
            const batch = batches[i]
            const symbolsText = batch.join(', ')
            const batchInfo = batches.length > 1 ? ` (часть ${i + 1}/${batches.length})` : ''
            const msg = `${getAlertIcon(alert.type)} ${alert.name}${batchInfo}\nМонеты: ${symbolsText}\nУсловие: ${getTypeLabel(alert)}\nПериод: ${alert.timePeriod}`

            const success = await sendTelegramNotification(telegramChatId, msg)
            if (!success) {
              console.error('[SmartAlerts] Failed to send notification for batch', i + 1)
              // Продолжаем отправку других батчей даже если один не удался
            }
          }

          addNotification({
            title: 'Умное оповещение',
            body: `Найдено ${triggeredSymbols.length} монет по условию "${alert.name}"`,
            type: 'info',
          })

          markSmartAlertSent(alert.id, triggeredSymbols)
        }

        // Логируем результат проверки
        addSmartAlertsCheckLog({
          time: alertStartTime,
          alertName: alert.name,
          checkedCoins: checkedCount,
          matchedCoins: matchedCount,
          sentSymbols: sentSymbols.slice(0, 20),
        })
      }

    } catch (error) {
      console.error('Error checking smart alerts:', error)
      addSmartAlertsCheckLog({
        time: Date.now(),
        alertName: 'System',
        checkedCoins: 0,
        matchedCoins: 0,
        sentSymbols: [],
        error: String(error),
      })
    } finally {
      setSmartAlertsChecking(false)
    }
  }

  const checkPriceIncreaseForCoin = async (alert: SmartAlert, symbol: string, timeMs: number): Promise<boolean> => {
    try {
      const interval = getIntervalForTimePeriod(alert.timePeriod)
      const limit = Math.ceil(timeMs / (60 * 1000))

      const klineResponse = await getKline(symbol, interval, Math.min(limit, 100))
      if (!klineResponse.list || klineResponse.list.length < 2) return false

      const candles = klineResponse.list
      const oldPrice = parseFloat(candles[0][4])
      const currentPrice = parseFloat(candles[candles.length - 1][4])
      const priceChange = ((currentPrice - oldPrice) / oldPrice) * 100
      return priceChange >= alert.threshold
    } catch (error) {
      console.error(`Error checking price increase for ${symbol}:`, error)
      return false
    }
  }

  const checkPriceDecreaseForCoin = async (alert: SmartAlert, symbol: string, timeMs: number): Promise<boolean> => {
    try {
      const interval = getIntervalForTimePeriod(alert.timePeriod)
      const limit = Math.ceil(timeMs / (60 * 1000))

      const klineResponse = await getKline(symbol, interval, Math.min(limit, 100))
      if (!klineResponse.list || klineResponse.list.length < 2) return false

      const candles = klineResponse.list
      const oldPrice = parseFloat(candles[0][4])
      const currentPrice = parseFloat(candles[candles.length - 1][4])
      const priceChange = ((currentPrice - oldPrice) / oldPrice) * 100
      return priceChange <= -alert.threshold
    } catch (error) {
      console.error(`Error checking price decrease for ${symbol}:`, error)
      return false
    }
  }

  const checkVolumeSpikeForCoin = async (alert: SmartAlert, symbol: string, timeMs: number): Promise<boolean> => {
    try {
      const interval = getIntervalForTimePeriod(alert.timePeriod)
      const limit = Math.ceil(timeMs / (60 * 1000))

      const klineResponse = await getKline(symbol, interval, Math.min(limit, 100))
      if (!klineResponse.list || klineResponse.list.length < 2) return false

      const candles = klineResponse.list
      const volumes = candles.map((candle) => parseFloat(candle[5]))
      const avgVolume = volumes.slice(0, -1).reduce((sum, vol) => sum + vol, 0) / (volumes.length - 1)
      const currentVolume = volumes[volumes.length - 1]
      const volumeIncrease = ((currentVolume - avgVolume) / avgVolume) * 100
      return volumeIncrease >= alert.threshold
    } catch (error) {
      console.error(`Error checking volume spike for ${symbol}:`, error)
      return false
    }
  }

  const checkDensityAppearanceForCoin = async (alert: SmartAlert, symbol: string): Promise<boolean> => {
    try {
      const klineResponse = await getKline(symbol, '1', 60)
      if (!klineResponse.list || klineResponse.list.length < 20) return false

      const candles = klineResponse.list.slice(-20)
      const prices = candles.map((candle) => parseFloat(candle[4]))
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)
      const priceRange = ((maxPrice - minPrice) / minPrice) * 100
      return priceRange <= alert.threshold
    } catch (error) {
      console.error(`Error checking density for ${symbol}:`, error)
      return false
    }
  }

  // Вспомогательные функции
  const getTimePeriodMs = (period: SmartAlert['timePeriod']): number => {
    switch (period) {
      case '1h': return 60 * 60 * 1000
      case '2h': return 2 * 60 * 60 * 1000
      case '3h': return 3 * 60 * 60 * 1000
      case '6h': return 6 * 60 * 60 * 1000
      case '10h': return 10 * 60 * 60 * 1000
      case '16h': return 16 * 60 * 60 * 1000
      case '24h': return 24 * 60 * 60 * 1000
      default: return 2 * 60 * 60 * 1000
    }
  }

  const getIntervalForTimePeriod = (period: SmartAlert['timePeriod']): KlineInterval => {
    switch (period) {
      case '1h': return '1'
      case '2h': return '3'
      case '3h': return '5'
      case '6h': return '15'
      case '10h': return '30'
      case '16h': return '60'
      case '24h': return '60'
      default: return '1'
    }
  }

  const sendTelegramNotification = async (chatId: string, message: string) => {
    try {
      const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      const url = isDev ? '/api/notify' : `${window.location.origin}/api/notify`
      
      console.log('[Telegram] Sending notification:', { chatId, message, url })
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramChatId: chatId, text: message }),
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        console.error('[Telegram] API Error:', response.status, result)
        return false
      }
      
      console.log('[Telegram] Success:', result)
      return true
      
    } catch (error) {
      console.error('[Telegram] Error sending notification:', error)
      return false
    }
  }

  // Запускаем проверку по настраиваемому интервалу
  useEffect(() => {
    checkAlerts() // Первая проверка сразу

    const intervalMs = 10_000
    checkIntervalRef.current = window.setInterval(checkAlerts, intervalMs)
    
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
    }
  }, [smartAlerts, telegramChatId, smartAlertsSettings.maxAlerts, smartAlertsSettings.autoFilter])

  return null
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let index = 0

  const workers = new Array(Math.max(1, limit)).fill(0).map(async () => {
    while (true) {
      const i = index
      index += 1
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  })

  await Promise.all(workers)
  return out
}

function getAlertIcon(type: SmartAlert['type']): string {
  switch (type) {
    case 'price_increase':
      return '📈'
    case 'price_decrease':
      return '�'
    case 'volatility':
      return '📊'
    case 'volume_spike':
      return '📈'
    case 'density_appearance':
      return '🎯'
    default:
      return '🔔'
  }
}

function getTypeLabel(alert: SmartAlert): string {
  switch (alert.type) {
    case 'price_increase':
      return `Рост цены ≥ ${alert.threshold}%`
    case 'price_decrease':
      return `Падение цены ≥ ${alert.threshold}%`
    case 'volatility':
      return `Волатильность ≥ ${alert.threshold}%`
    case 'volume_spike':
      return `Всплеск объёма ≥ ${alert.threshold}%`
    case 'density_appearance':
      return `Плотность (диапазон) ≤ ${alert.threshold}%`
    default:
      return String(alert.type)
  }
}
