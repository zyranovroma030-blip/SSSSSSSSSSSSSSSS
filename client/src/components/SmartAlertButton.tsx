import { useState } from 'react'
import { useScreenerStore, type SmartAlert } from '../store/screener'
import s from './SmartAlertButton.module.css'

interface SmartAlertButtonProps {
  symbol: string
  className?: string
}

export default function SmartAlertButton({ symbol, className }: SmartAlertButtonProps) {
  const { smartAlerts, addSmartAlert } = useScreenerStore()
  const [showModal, setShowModal] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<SmartAlert | null>(null)

  const handleQuickAlert = (type: SmartAlert['type']) => {
    const alert: Omit<SmartAlert, 'id' | 'createdAt' | 'lastTriggered'> = {
      name: `${type} для ${symbol}`,
      type,
      timePeriod: '2h',
      threshold: 20,
      minVolume: 1000000, // $1M минимальный объем
      maxVolume: 0, // без ограничения
      blacklist: ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'SOLUSDT'],
      enabled: true
    }
    
    addSmartAlert(alert)
    setShowModal(false)
  }

  const handleCustomAlert = () => {
    if (!selectedAlert) return
    
    const alert: Omit<SmartAlert, 'id' | 'createdAt' | 'lastTriggered'> = {
      name: selectedAlert.name || `Оповещение для ${symbol}`,
      type: selectedAlert.type,
      timePeriod: selectedAlert.timePeriod,
      threshold: selectedAlert.threshold,
      minVolume: selectedAlert.minVolume,
      maxVolume: selectedAlert.maxVolume,
      blacklist: selectedAlert.blacklist,
      enabled: true
    }
    
    addSmartAlert(alert)
    setShowModal(false)
    setSelectedAlert(null)
  }

  const handleEditAlert = (alert: SmartAlert) => {
    setSelectedAlert(alert)
    setShowModal(true)
  }

  const getTypeLabel = (type: SmartAlert['type']) => {
    switch (type) {
      case 'price_change':
        return 'Изменение цены'
      case 'volatility':
        return 'Волатильность'
      case 'volume_spike':
        return 'Всплеск объема'
      case 'density_appearance':
        return 'Плотность'
      default:
        return ''
    }
  }

  const getTimeLabel = (timePeriod: SmartAlert['timePeriod']) => {
    switch (timePeriod) {
      case '1h':
        return '1 час'
      case '2h':
        return '2 часа'
      case '3h':
        return '3 часа'
      case '6h':
        return '6 часов'
      case '24h':
        return '24 часа'
      default:
        return ''
    }
  }

  return (
    <>
      <button 
        className={`${s.alertButton} ${className || ''}`}
        onClick={() => setShowModal(true)}
        title="Управление умными оповещениями"
      >
        🔔
      </button>

      {showModal && (
        <div className={s.modal} onClick={() => setShowModal(false)}>
          <div className={s.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h3>Умные оповещения для {symbol}</h3>
              <button className={s.closeButton} onClick={() => setShowModal(false)}>×</button>
            </div>

            {/* Существующие оповещения */}
            {smartAlerts.filter(alert => 
              alert.name.toLowerCase().includes(symbol.toLowerCase()) || 
              alert.name.toLowerCase().includes(symbol.replace('USDT', '').toLowerCase())
            ).length > 0 && (
              <div className={s.existingAlerts}>
                <h4>Существующие оповещения</h4>
                <div className={s.alertList}>
                  {smartAlerts
                    .filter(alert => 
                      alert.name.toLowerCase().includes(symbol.toLowerCase()) || 
                      alert.name.toLowerCase().includes(symbol.replace('USDT', '').toLowerCase())
                    )
                    .map(alert => (
                      <div key={alert.id} className={s.alertItem}>
                        <div className={s.alertInfo}>
                          <strong>{alert.name}</strong>
                          <span className={s.alertType}>{getTypeLabel(alert.type)}</span>
                          <span className={s.alertPeriod}>{getTimeLabel(alert.timePeriod)}</span>
                          <span className={s.alertThreshold}>{alert.threshold}%</span>
                        </div>
                        <div className={s.alertActions}>
                          <button 
                            className={s.editButton}
                            onClick={() => handleEditAlert(alert)}
                          >
                            Изменить
                          </button>
                          <button 
                            className={s.deleteButton}
                            onClick={() => {
                              if (confirm(`Удалить оповещение "${alert.name}"?`)) {
                                // Используем глобальную функцию удаления
                                const { removeSmartAlert } = useScreenerStore.getState()
                                removeSmartAlert(alert.id)
                              }
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className={s.quickActions}>
              <h4>Быстрые оповещения</h4>
              <div className={s.actionButtons}>
                <button 
                  className={s.actionButton}
                  onClick={() => handleQuickAlert('price_change')}
                >
                  🚀 Рост цены
                </button>
                <button 
                  className={s.actionButton}
                  onClick={() => handleQuickAlert('volatility')}
                >
                  📊 Волатильность
                </button>
                <button 
                  className={s.actionButton}
                  onClick={() => handleQuickAlert('volume_spike')}
                >
                  📈 Всплеск объема
                </button>
                <button 
                  className={s.actionButton}
                  onClick={() => handleQuickAlert('density_appearance')}
                >
                  🎯 Плотность
                </button>
              </div>
            </div>

            {/* Форма создания/редактирования */}
            {(selectedAlert || !smartAlerts.some(alert => alert.name.includes(symbol))) && (
              <div className={s.customAlert}>
                <h4>{selectedAlert ? 'Редактировать оповещение' : 'Создать новое оповещение'}</h4>
                <div className={s.form}>
                  <div className={s.formGroup}>
                    <label>Название</label>
                    <input
                      type="text"
                      value={selectedAlert?.name || ''}
                      onChange={(e) => setSelectedAlert({
                        ...selectedAlert!,
                        name: e.target.value
                      })}
                      placeholder={`Оповещение для ${symbol}`}
                    />
                  </div>

                  <div className={s.formGroup}>
                    <label>Тип</label>
                    <select
                      value={selectedAlert?.type || 'price_change'}
                      onChange={(e) => setSelectedAlert({
                        ...selectedAlert!,
                        type: e.target.value as SmartAlert['type']
                      })}
                    >
                      <option value="price_change">Изменение цены</option>
                      <option value="volatility">Волатильность</option>
                      <option value="volume_spike">Всплеск объема</option>
                      <option value="density_appearance">Плотность</option>
                    </select>
                  </div>

                  <div className={s.formGroup}>
                    <label>Период</label>
                    <select
                      value={selectedAlert?.timePeriod || '2h'}
                      onChange={(e) => setSelectedAlert({
                        ...selectedAlert!,
                        timePeriod: e.target.value as SmartAlert['timePeriod']
                      })}
                    >
                      <option value="1h">1 час</option>
                      <option value="2h">2 часа</option>
                      <option value="3h">3 часа</option>
                      <option value="6h">6 часов</option>
                      <option value="24h">24 часа</option>
                    </select>
                  </div>

                  <div className={s.formGroup}>
                    <label>Порог (%)</label>
                    <input
                      type="number"
                      value={selectedAlert?.threshold || 20}
                      onChange={(e) => setSelectedAlert({
                        ...selectedAlert!,
                        threshold: parseFloat(e.target.value)
                      })}
                      min="0.1"
                      step="0.1"
                    />
                  </div>

                  <div className={s.formRow}>
                    <div className={s.formGroup}>
                      <label>Мин. объем ($)</label>
                      <input
                        type="number"
                        value={selectedAlert?.minVolume || 0}
                        onChange={(e) => setSelectedAlert({
                          ...selectedAlert!,
                          minVolume: parseFloat(e.target.value)
                        })}
                        min="0"
                        step="100000"
                      />
                    </div>
                    <div className={s.formGroup}>
                      <label>Макс. объем ($)</label>
                      <input
                        type="number"
                        value={selectedAlert?.maxVolume || 0}
                        onChange={(e) => setSelectedAlert({
                          ...selectedAlert!,
                          maxVolume: parseFloat(e.target.value)
                        })}
                        min="0"
                        step="100000"
                      />
                    </div>
                  </div>

                  <div className={s.formGroup}>
                    <label>Черный список</label>
                    <input
                      type="text"
                      value={selectedAlert?.blacklist?.join(', ') || 'BTCUSDT, ETHUSDT, XRPUSDT, SOLUSDT'}
                      onChange={(e) => setSelectedAlert({
                        ...selectedAlert!,
                        blacklist: e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
                      })}
                      placeholder="BTCUSDT, ETHUSDT, XRPUSDT, SOLUSDT"
                    />
                  </div>

                  <div className={s.formActions}>
                    <button 
                      className={s.cancelButton}
                      onClick={() => {
                        setShowModal(false)
                        setSelectedAlert(null)
                      }}
                    >
                      Отмена
                    </button>
                    <button 
                      className={s.createButton}
                      onClick={handleCustomAlert}
                      disabled={!selectedAlert}
                    >
                      {selectedAlert ? 'Сохранить изменения' : 'Создать и запустить'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
