import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TimeframeKey } from '../types'

export type LayoutColumns = 2 | 3 | 4

export interface WorkspaceFiltersState {
  volumeMinUsd: number
  volumeMaxUsd: number
  priceChangeMinPct: number
  priceChangeMaxPct: number
  volatilityMinPct: number
  volatilityMaxPct: number
  btcCorrelationMinPct: number
  btcCorrelationMaxPct: number
  blacklist: string[]
  candleCount: number
}

export interface WorkspaceSortState {
  sortType: 'price_change' | 'volume' | 'volatility'
  sortDirection: 'asc' | 'desc'
  sortTimeRange: string
  sortUpdateFreq: string
}

export interface AppNotification {
  id: string
  title: string
  body: string
  time: number
  read: boolean
  type?: 'price_alert' | 'info'
}

export interface PriceAlert {
  id: string
  symbol: string
  price: number
  direction: 'above' | 'below'
  createdAt: number
  fired: boolean
}

export interface SmartAlert {
  id: string
  name: string
  type: 'price_increase' | 'price_decrease' | 'volatility' | 'volume_spike' | 'density_appearance'
  timePeriod: '1h' | '2h' | '3h' | '6h' | '10h' | '16h' | '24h'
  threshold: number
  minVolume?: number
  maxVolume?: number
  blacklist: string[]
  enabled: boolean
  createdAt: number
  lastTriggered?: number
  sentBySymbol?: Record<string, number>
}

export interface AlertCheckLog {
  time: number
  alertName: string
  checkedCoins: number
  matchedCoins: number
  sentSymbols: string[]
  error?: string
}

export interface FavoriteCoin {
  symbol: string
  addedAt: number
}

export interface SmartAlertsSettings {
  checkIntervalMs: number
  maxAlerts: number
  autoFilter: boolean
  adaptiveThreshold: boolean
}

const DEFAULT_FILTERS: WorkspaceFiltersState = {
  volumeMinUsd: 0,
  volumeMaxUsd: 0, // 0 = без ограничения
  priceChangeMinPct: -100,
  priceChangeMaxPct: 100,
  volatilityMinPct: 0,
  volatilityMaxPct: 100,
  btcCorrelationMinPct: 0,
  btcCorrelationMaxPct: 100,
  // По умолчанию исключаем BTC, SOL, ETH, XRP
  blacklist: ['BTCUSDT', 'SOLUSDT', 'ETHUSDT', 'XRPUSDT'],
  candleCount: 400,
}

type ScreenerStore = {
  globalTimeframe: TimeframeKey
  setGlobalTimeframe: (tf: TimeframeKey) => void
  coinsTimeframe: TimeframeKey
  setCoinsTimeframe: (tf: TimeframeKey) => void
  refreshKey: number
  triggerRefresh: () => void
  selectedSymbol: string | null
  setSelectedSymbol: (s: string | null) => void
  // Рабочее пространство: фильтры и сортировка
  workspaceFilters: WorkspaceFiltersState
  workspaceSort: WorkspaceSortState
  setWorkspaceFilters: (f: Partial<WorkspaceFiltersState>) => void
  setWorkspaceSort: (s: Partial<WorkspaceSortState>) => void
  // Колонки (2, 3, 4)
  layoutColumns: LayoutColumns
  setLayoutColumns: (n: LayoutColumns) => void
  // Уведомления
  notifications: AppNotification[]
  addNotification: (n: Omit<AppNotification, 'id' | 'time' | 'read'>) => void
  markNotificationRead: (id: string) => void
  clearNotifications: () => void
  soundEnabled: boolean
  setSoundEnabled: (v: boolean) => void
  // Профиль: Telegram Chat ID (сохраняется между перезапусками)
  telegramChatId: string
  setTelegramChatId: (id: string) => void
  // Избранные монеты
  favoriteCoins: FavoriteCoin[]
  addFavoriteCoin: (symbol: string) => void
  removeFavoriteCoin: (symbol: string) => void
  isFavoriteCoin: (symbol: string) => boolean
  // Ценовые оповещения (старые)
  priceAlerts: PriceAlert[]
  addPriceAlert: (alert: Omit<PriceAlert, 'id' | 'createdAt' | 'fired'>) => void
  removePriceAlert: (id: string) => void
  markPriceAlertFired: (id: string) => void
  // Умные оповещения (новые)
  smartAlerts: SmartAlert[]
  addSmartAlert: (alert: Omit<SmartAlert, 'id' | 'createdAt' | 'lastTriggered' | 'sentBySymbol'>) => void
  removeSmartAlert: (id: string) => void
  updateSmartAlert: (id: string, updates: Partial<SmartAlert>) => void
  markSmartAlertSent: (id: string, symbols: string[]) => void
  resetSmartAlertCooldown: (id: string) => void

  smartAlertsSettings: SmartAlertsSettings
  setSmartAlertsSettings: (s: Partial<SmartAlertsSettings>) => void

  // Лог и статус проверки умных оповещений
  smartAlertsChecking: boolean
  setSmartAlertsChecking: (v: boolean) => void
  smartAlertsCheckLogs: AlertCheckLog[]
  addSmartAlertsCheckLog: (log: AlertCheckLog) => void
  clearSmartAlertsCheckLogs: () => void

  // Фильтры монет на странице Coins
  coinFilters: {
    volumeMin: number
    volumeMax: number
    priceChangeMin: number
    priceChangeMax: number
    volatilityMin: number
    volatilityMax: number
  }
  saveCoinFilters: (filters: any) => void
}

export const useScreenerStore = create<ScreenerStore>()(
    persist(
    (set) => ({
      globalTimeframe: '15m',
      setGlobalTimeframe: (globalTimeframe) => set({ globalTimeframe }),
      coinsTimeframe: '15m',
      setCoinsTimeframe: (coinsTimeframe) => set({ coinsTimeframe }),
      refreshKey: 0,
      triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
      selectedSymbol: null,
      setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),

      workspaceFilters: DEFAULT_FILTERS,
      workspaceSort: { sortType: 'price_change', sortDirection: 'desc', sortTimeRange: '24h', sortUpdateFreq: 'manual' },
      setWorkspaceFilters: (f) => set((s) => ({ workspaceFilters: { ...s.workspaceFilters, ...f } })),
      setWorkspaceSort: (sort) => set((s) => ({ workspaceSort: { ...s.workspaceSort, ...sort } })),

      layoutColumns: 3,
      setLayoutColumns: (layoutColumns) => set({ layoutColumns }),

      notifications: [],
      addNotification: (n) =>
        set((s) => ({
          notifications: [
            { ...n, id: crypto.randomUUID(), time: Date.now(), read: false },
            ...s.notifications,
          ].slice(0, 200),
        })),
      markNotificationRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((x) => (x.id === id ? { ...x, read: true } : x)),
        })),
      clearNotifications: () => set({ notifications: [] }),
      soundEnabled: true,
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),

      telegramChatId: '',
      setTelegramChatId: (telegramChatId) => set({ telegramChatId }),

      smartAlertsSettings: {
        checkIntervalMs: 10_000,
        maxAlerts: 50,
        autoFilter: true,
        adaptiveThreshold: false,
      },
      setSmartAlertsSettings: (next) =>
        set((s) => ({ smartAlertsSettings: { ...s.smartAlertsSettings, ...next } })),

      smartAlertsChecking: false,
      setSmartAlertsChecking: (smartAlertsChecking) => set({ smartAlertsChecking }),
      smartAlertsCheckLogs: [],
      addSmartAlertsCheckLog: (log) =>
        set((s) => ({
          smartAlertsCheckLogs: [log, ...s.smartAlertsCheckLogs].slice(0, 50),
        })),
      clearSmartAlertsCheckLogs: () => set({ smartAlertsCheckLogs: [] }),

      priceAlerts: [],
      addPriceAlert: (alert) =>
        set((s) => ({
          priceAlerts: [
            ...s.priceAlerts,
            { ...alert, id: crypto.randomUUID(), createdAt: Date.now(), fired: false },
          ],
        })),
      removePriceAlert: (id) => set((s) => ({ priceAlerts: s.priceAlerts.filter((a) => a.id !== id) })),
      markPriceAlertFired: (id) =>
        set((s) => ({
          priceAlerts: s.priceAlerts.map((a) => (a.id === id ? { ...a, fired: true } : a)),
        })),

      smartAlerts: [],
      addSmartAlert: (alert) =>
        set((s) => ({
          smartAlerts: [
            ...s.smartAlerts,
            {
              ...alert,
              id: crypto.randomUUID(),
              createdAt: Date.now(),
              lastTriggered: undefined,
              sentBySymbol: {},
            },
          ],
        })),
      removeSmartAlert: (id) => set((s) => ({ smartAlerts: s.smartAlerts.filter((a) => a.id !== id) })),
      updateSmartAlert: (id, updates) =>
        set((s) => ({
          smartAlerts: s.smartAlerts.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        })),
      markSmartAlertSent: (id, symbols) =>
        set((s) => {
          const now = Date.now()
          const setMap = new Set(symbols)
          return {
            smartAlerts: s.smartAlerts.map((a) => {
              if (a.id !== id) return a
              const prev = a.sentBySymbol ?? {}
              const next: Record<string, number> = { ...prev }
              for (const sym of setMap) {
                next[sym as string] = now
              }
              return { ...a, lastTriggered: now, sentBySymbol: next }
            }),
          }
        }),
      resetSmartAlertCooldown: (id) =>
        set((s) => ({
          smartAlerts: s.smartAlerts.map((a) =>
            a.id === id ? { ...a, sentBySymbol: {}, lastTriggered: undefined } : a
          ),
        })),

      favoriteCoins: [],
      addFavoriteCoin: (symbol) =>
        set((s) => {
          const exists = s.favoriteCoins.some(c => c.symbol === symbol)
          if (!exists) {
            return {
              favoriteCoins: [...s.favoriteCoins, { symbol, addedAt: Date.now() }],
            }
          }
          return s
        }),
      removeFavoriteCoin: (symbol) =>
        set((s) => ({
          favoriteCoins: s.favoriteCoins.filter((c) => c.symbol !== symbol),
        })),
      isFavoriteCoin: (symbol): boolean => {
        const state = useScreenerStore.getState()
        return state.favoriteCoins.some((c: FavoriteCoin) => c.symbol === symbol)
      },

      // Фильтры монет на странице Coins
      coinFilters: {
        volumeMin: 0,
        volumeMax: 0,
        priceChangeMin: -100,
        priceChangeMax: 100,
        volatilityMin: 0,
        volatilityMax: 100
      },
      saveCoinFilters: (filters) =>
        set((s) => ({
          coinFilters: { ...s.coinFilters, ...filters }
        })),
    }),
    {
      name: 'bybit-screener-store',
      partialize: (s) => ({
        globalTimeframe: s.globalTimeframe,
        coinsTimeframe: s.coinsTimeframe,
        workspaceFilters: s.workspaceFilters,
        workspaceSort: s.workspaceSort,
        layoutColumns: s.layoutColumns,
        soundEnabled: s.soundEnabled,
        telegramChatId: s.telegramChatId,
        favoriteCoins: s.favoriteCoins,
        priceAlerts: s.priceAlerts,
        smartAlerts: s.smartAlerts,
        smartAlertsSettings: s.smartAlertsSettings,
        coinFilters: s.coinFilters,
      }),
    }
  )
)
