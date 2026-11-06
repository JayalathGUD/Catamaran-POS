import { useEffect, useState } from 'react'

export interface SoftwareUpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'
  currentVersion: string
  latestVersion?: string
  text: string
  percent?: number
  releaseName?: string
  releaseNotes?: string
  releaseUrl?: string
  isDismissed: boolean
  isSimulated?: boolean
  lastChecked: string | null
}

const DEFAULT_CURRENT_VERSION = '1.0.1'

let currentState: SoftwareUpdateState = {
  status: 'idle',
  currentVersion: DEFAULT_CURRENT_VERSION,
  text: 'System up to date',
  percent: 0,
  isDismissed: false,
  isSimulated: false,
  lastChecked: null
}

const listeners = new Set<(state: SoftwareUpdateState) => void>()

function notifyListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener({ ...currentState })
    } catch (err) {
      console.error('Update store listener error:', err)
    }
  })
}

export function getSoftwareUpdateState(): SoftwareUpdateState {
  return { ...currentState }
}

export function updateSoftwareState(partial: Partial<SoftwareUpdateState>): void {
  currentState = {
    ...currentState,
    ...partial
  }
  notifyListeners()
}

// ----------------------------------------------------------------------
// Core Actions
// ----------------------------------------------------------------------

export async function checkForSoftwareUpdates(simulate = false, simVersion = '1.1.0'): Promise<SoftwareUpdateState> {
  updateSoftwareState({
    status: 'checking',
    text: simulate ? 'Simulating update check...' : 'Checking for latest software updates...'
  })

  // 1. If running in Electron and NOT simulating, query Electron auto-updater first
  if (window.electronAPI?.checkForUpdates && !simulate) {
    try {
      const electronRes = await window.electronAPI.checkForUpdates()
      if (electronRes && electronRes.status === 'ok') {
        // Electron updater will fire 'update-message' if available
      }
    } catch {
      // Fallback to backend API check below
    }
  }

  // 2. Query Backend Update Endpoint
  try {
    const url = simulate
      ? `http://127.0.0.1:5000/api/system/check-update?simulate=true&version=${encodeURIComponent(simVersion)}`
      : 'http://127.0.0.1:5000/api/system/check-update'

    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Failed to reach update server`)
    }

    const data = await res.json()
    const nowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    if (data.updateAvailable) {
      updateSoftwareState({
        status: 'available',
        currentVersion: data.currentVersion || DEFAULT_CURRENT_VERSION,
        latestVersion: data.latestVersion || simVersion,
        releaseName: data.releaseName || `Catamaran POS v${data.latestVersion || simVersion}`,
        releaseNotes: data.releaseNotes || 'New enhancements and bug fixes available.',
        releaseUrl: data.releaseUrl || 'https://github.com/JayalathGUD/Catamaran-POS/releases',
        text: `New Software Update Available: v${data.latestVersion || simVersion}!`,
        percent: 0,
        isDismissed: false,
        isSimulated: Boolean(data.isSimulated),
        lastChecked: nowStr
      })
    } else {
      updateSoftwareState({
        status: 'up-to-date',
        currentVersion: data.currentVersion || DEFAULT_CURRENT_VERSION,
        latestVersion: data.currentVersion || DEFAULT_CURRENT_VERSION,
        text: `Catamaran POS is up to date (v${data.currentVersion || DEFAULT_CURRENT_VERSION})`,
        isDismissed: false,
        isSimulated: false,
        lastChecked: nowStr
      })
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Network error'
    updateSoftwareState({
      status: 'error',
      text: `Update check failed: ${errorMsg}`,
      lastChecked: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    })
  }

  return getSoftwareUpdateState()
}

export function restartAndInstallUpdate(): void {
  if (window.electronAPI?.restartAndInstallUpdate) {
    window.electronAPI.restartAndInstallUpdate()
  } else if (currentState.releaseUrl) {
    window.open(currentState.releaseUrl, '_blank')
  } else {
    window.open('https://github.com/JayalathGUD/Catamaran-POS/releases', '_blank')
  }
}

export function dismissUpdateBanner(): void {
  updateSoftwareState({ isDismissed: true })
}

export function restoreUpdateBanner(): void {
  updateSoftwareState({ isDismissed: false })
}

export function simulateSoftwareUpdate(version = '1.1.0'): void {
  checkForSoftwareUpdates(true, version)
}

export function resetSoftwareUpdateState(): void {
  updateSoftwareState({
    status: 'idle',
    currentVersion: DEFAULT_CURRENT_VERSION,
    latestVersion: undefined,
    text: 'System up to date',
    percent: 0,
    isDismissed: false,
    isSimulated: false,
    releaseName: undefined,
    releaseNotes: undefined,
    releaseUrl: undefined
  })
}

// ----------------------------------------------------------------------
// Listen to Electron Auto-Updater IPC
// ----------------------------------------------------------------------
if (typeof window !== 'undefined') {
  if (window.electronAPI?.onUpdateMessage) {
    window.electronAPI.onUpdateMessage((msg) => {
      const nowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      if (msg.status === 'available') {
        updateSoftwareState({
          status: 'available',
          latestVersion: msg.version,
          text: msg.text || `Update v${msg.version} available! Downloading in background...`,
          isDismissed: false,
          lastChecked: nowStr
        })
      } else if (msg.status === 'downloading') {
        updateSoftwareState({
          status: 'downloading',
          percent: msg.percent ?? 0,
          text: msg.text || `Downloading update: ${msg.percent}%`,
          isDismissed: false
        })
      } else if (msg.status === 'downloaded') {
        updateSoftwareState({
          status: 'downloaded',
          latestVersion: msg.version,
          text: msg.text || `Update v${msg.version} downloaded! Restart application to apply.`,
          isDismissed: false,
          percent: 100
        })
      } else if (msg.status === 'up-to-date') {
        updateSoftwareState({
          status: 'up-to-date',
          text: msg.text || 'Catamaran POS is up to date',
          lastChecked: nowStr
        })
      } else if (msg.status === 'error') {
        updateSoftwareState({
          status: 'error',
          text: msg.text || 'Update check error',
          lastChecked: nowStr
        })
      }
    })
  }

  // Automatic periodic check (startup after 4 seconds, and every 30 minutes)
  setTimeout(() => {
    checkForSoftwareUpdates().catch(() => {})
  }, 4000)

  setInterval(() => {
    checkForSoftwareUpdates().catch(() => {})
  }, 30 * 60 * 1000)
}

// ----------------------------------------------------------------------
// React Hook
// ----------------------------------------------------------------------
export function useSoftwareUpdate(): [
  SoftwareUpdateState,
  {
    checkForUpdates: (simulate?: boolean, version?: string) => Promise<SoftwareUpdateState>
    restartAndInstall: () => void
    dismissBanner: () => void
    restoreBanner: () => void
    simulateUpdate: (version?: string) => void
    resetUpdate: () => void
  }
] {
  const [state, setState] = useState<SoftwareUpdateState>(currentState)

  useEffect(() => {
    const listener = (newState: SoftwareUpdateState) => {
      setState(newState)
    }
    listeners.add(listener)
    // Synchronize current initial state
    setState({ ...currentState })
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return [
    state,
    {
      checkForUpdates: checkForSoftwareUpdates,
      restartAndInstall: restartAndInstallUpdate,
      dismissBanner: dismissUpdateBanner,
      restoreBanner: restoreUpdateBanner,
      simulateUpdate: simulateSoftwareUpdate,
      resetUpdate: resetSoftwareUpdateState
    }
  ]
}
