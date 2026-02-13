import { useScreenerStore } from '../../client/src/store/screener'
import { getTickersLinear, getKline } from '../../client/src/api/bybit'
import type { SmartAlert } from '../../client/src/types'

// Функция для проверки умных оповещений (работает на сервере)
export async function POST() {
  try {
    console.log('[Background] Starting smart alerts check')
    
    // Получаем данные из хранилища (в реальном проекте нужно использовать базу данных)
    // Для демонстрации используем localStorage симуляцию
    const alerts = await getSmartAlertsFromStorage()
    const telegramChatId = await getTelegramChatIdFromStorage()
    
    if (!telegramChatId) {
      console.log('[Background] No Telegram chat ID configured')
      return new Response(JSON.stringify({ error: 'No Telegram chat ID' }), { status: 400 })
    }
    
    if (alerts.length === 0) {
      console.log('[Background] No smart alerts configured')
      return new Response(JSON.stringify({ success: true, message: 'No alerts to check' }))
    }
    
    // Получаем текущие данные монет
    const tickersResponse = await getTickersLinear()
    const currentData = new Map<string, any>()
    
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
        lastPrice: currentPrice,
        priceChange24hPct: priceChange,
        volume24hUsd: volume,
        volatility24hPct: volatility
      })
    })
    
    const triggeredAlerts = []
    
    // Проверяем каждое оповещение
    for (const alert of alerts) {
      const triggeredSymbols = []
      
      for (const [symbol, coinData] of currentData.entries()) {
        let isTriggered = false
        
        switch (alert.type) {
          case 'price_increase':
            if (coinData.priceChange24hPct >= alert.threshold) {
              isTriggered = true
            }
            break
            
          case 'price_decrease':
            if (coinData.priceChange24hPct <= -alert.threshold) {
              isTriggered = true
            }
            break
            
          case 'volatility':
            if (coinData.volatility24hPct >= alert.threshold) {
              isTriggered = true
            }
            break
            
          case 'volume_spike':
            if (coinData.volume24hUsd >= alert.threshold * 1000000) {
              isTriggered = true
            }
            break
        }
        
        if (isTriggered) {
          triggeredSymbols.push(symbol)
        }
      }
      
      if (triggeredSymbols.length > 0) {
        triggeredAlerts.push({
          alert,
          symbols: triggeredSymbols.slice(0, 10) // Ограничиваем для Telegram
        })
      }
    }
    
    // Отправляем уведомления
    for (const { alert, symbols } of triggeredAlerts) {
      const message = `🚨 ${alert.name}\nМонеты: ${symbols.join(', ')}\nУсловие: ${getAlertTypeLabel(alert)}\nПериод: ${alert.timePeriod}`
      
      await sendTelegramMessage(telegramChatId, message)
      console.log(`[Background] Sent notification for alert "${alert.name}" with ${symbols.length} symbols`)
    }
    
    console.log(`[Background] Checked ${alerts.length} alerts, triggered ${triggeredAlerts.length}`)
    
    return new Response(JSON.stringify({ 
      success: true, 
      checked: alerts.length, 
      triggered: triggeredAlerts.length 
    }))
    
  } catch (error) {
    console.error('[Background] Error checking smart alerts:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
}

// Вспомогательные функции
async function getSmartAlertsFromStorage(): Promise<SmartAlert[]> {
  // В реальном проекте здесь будет запрос к базе данных
  // Для демонстрации возвращаем пустой массив
  return []
}

async function getTelegramChatIdFromStorage(): Promise<string | null> {
  // В реальном проекте здесь будет запрос к базе данных
  // Для демонстрации возвращаем null
  return null
}

async function sendTelegramMessage(chatId: string, message: string) {
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Telegram API error: ${error}`)
  }
  
  return response.json()
}

function getAlertTypeLabel(alert: SmartAlert): string {
  switch (alert.type) {
    case 'price_increase': return `Рост цены ≥ ${alert.threshold}%`
    case 'price_decrease': return `Падение цены ≥ ${alert.threshold}%`
    case 'volatility': return `Волатильность ≥ ${alert.threshold}%`
    case 'volume_spike': return `Всплеск объёма ≥ ${alert.threshold}M`
    case 'density_appearance': return `Плотность ≤ ${alert.threshold}%`
    default: return String(alert.type)
  }
}
