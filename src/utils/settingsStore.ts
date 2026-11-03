import { useEffect, useState } from 'react'
import { getSettings, updateSettings } from '../services/api'
import { PosSettings } from '../types'

export const DEFAULT_SETTINGS: PosSettings = {
  cashierName: 'Kasun P.',
  restaurantName: 'CATAMARAN BEACH RESTAURANT',
  restaurantTagline: 'BEACHFRONT DINING · BAR · SURF',
  restaurantPhone: '+94 91 224 8890 | +94 77 123 4567',
  restaurantAddress: 'DEWATA BEACH, GALLE, SRI LANKA',
  defaultServiceCharge: 10,
  defaultPaymentMethod: 'Cash',
  autoPrintReceipt: true,
  instagramHandle: '@catamaranbeachrestaurant',
  softwareCredit: 'Software by Nexion Solution'
}

const STORAGE_KEY = 'catamaran_pos_settings'

export function getLocalSettings(): PosSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
    }
  } catch (e) {
    console.warn('Failed to read settings from localStorage', e)
  }
  return DEFAULT_SETTINGS
}

export function saveLocalSettings(settings: Partial<PosSettings>): PosSettings {
  const current = getLocalSettings()
  const updated = { ...current, ...settings }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('pos-settings-updated', { detail: updated }))
  } catch (e) {
    console.warn('Failed to save settings to localStorage', e)
  }
  return updated
}

export function usePosSettings(): {
  settings: PosSettings
  saveSettings: (newSettings: Partial<PosSettings>) => Promise<PosSettings>
  isLoading: boolean
} {
  const [settings, setSettings] = useState<PosSettings>(getLocalSettings)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  useEffect(() => {
    const handleUpdate = (e: Event): void => {
      const detail = (e as CustomEvent<PosSettings>).detail
      if (detail) setSettings(detail)
    }
    window.addEventListener('pos-settings-updated', handleUpdate)

    // Fetch latest settings from backend API
    getSettings()
      .then((remote) => {
        if (remote) {
          const merged = saveLocalSettings(remote)
          setSettings(merged)
        }
      })
      .catch(() => {
        // Local storage fallback is already active
      })

    return () => {
      window.removeEventListener('pos-settings-updated', handleUpdate)
    }
  }, [])

  const handleSave = async (newSettings: Partial<PosSettings>): Promise<PosSettings> => {
    setIsLoading(true)
    // Instant local update for zero delay
    const local = saveLocalSettings(newSettings)
    setSettings(local)
    try {
      // Sync to MongoDB backend
      const remote = await updateSettings(newSettings)
      const merged = saveLocalSettings(remote)
      setSettings(merged)
      return merged
    } catch (err) {
      console.warn('Backend settings sync failed, keeping local settings:', err)
      return local
    } finally {
      setIsLoading(false)
    }
  }

  return { settings, saveSettings: handleSave, isLoading }
}
