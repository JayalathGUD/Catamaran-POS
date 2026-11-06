import { usePosSettings } from '../utils/settingsStore'
import { useSoftwareUpdate } from '../utils/updateStore'
import React, { useEffect, useRef, useState } from 'react'
import { InventoryItem, NavigationPage } from '../types'
import { IconAlertTriangle, IconChevronRight, IconClock, IconInfo, IconX } from './Icons'

interface TopbarProps {
  currentPage: NavigationPage
  onResetDemo?: () => void
  lowStockItems?: InventoryItem[]
  onNavigate?: (page: NavigationPage) => void
}

export const Topbar: React.FC<TopbarProps> = ({ currentPage, lowStockItems = [], onNavigate }) => {
  const { settings } = usePosSettings()
  const [updateState, { restartAndInstall, restoreBanner }] = useSoftwareUpdate()
  const [showStockDropdown, setShowStockDropdown] = useState<boolean>(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const todayFormatted = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date())

  // Close dropdown when clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowStockDropdown(false)
      }
    }
    if (showStockDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showStockDropdown])

  const lowStockCount = lowStockItems.length

  return (
    <header className="app-topbar">
      <div className="topbar-left">
        <div className="topbar-breadcrumbs">
          <span className="crumb-root">Catamaran Surf Club</span>
          <span className="crumb-separator">/</span>
          <span className="crumb-current">{currentPage}</span>
        </div>
      </div>

      <div className="topbar-right">
        {/* Software Update Indicators & Quick Restore Buttons */}
        {updateState.status === 'downloading' && (
          <div
            className="topbar-update-banner"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1d4ed8',
              fontSize: '11px',
              fontWeight: 600
            }}
          >
            <span className="demo-badge-dot" style={{ backgroundColor: '#3b82f6' }} />
            <span>Downloading Update: {updateState.percent ?? 0}%</span>
          </div>
        )}

        {updateState.status === 'downloaded' && (
          <button
            type="button"
            className="topbar-update-btn"
            onClick={restartAndInstall}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 13px',
              borderRadius: '20px',
              backgroundColor: '#059669',
              border: '1px solid #047857',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(5, 150, 105, 0.4)'
            }}
            title="Click to restart and install update"
          >
            <span>🚀 Update Ready! Restart Now</span>
          </button>
        )}

        {updateState.isDismissed && updateState.status === 'available' && (
          <button
            type="button"
            className="topbar-update-btn"
            onClick={restoreBanner}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 13px',
              borderRadius: '20px',
              backgroundColor: '#0284c7',
              border: '1px solid #0369a1',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)'
            }}
            title="Click to view update details and install"
          >
            <span>⚡ Update v{updateState.latestVersion || 'New'} Available!</span>
          </button>
        )}

        {/* Live System Status Badge */}
        <div
          className="demo-badge-indicator"
          style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}
          title="Connected to Live MongoDB Atlas Database"
        >
          <span className="demo-badge-dot" style={{ backgroundColor: '#10b981' }} />
          <span className="demo-badge-text" style={{ color: '#166534', fontWeight: 600 }}>
            LIVE SYSTEM
          </span>
        </div>

        {/* Real-Time Low Stock Alert Button & Popover */}
        <div className="topbar-alert-wrapper" ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={`topbar-stock-alert-btn ${lowStockCount > 0 ? 'alert-active' : 'alert-healthy'}`}
            onClick={() => setShowStockDropdown((prev) => !prev)}
            title={
              lowStockCount > 0
                ? `${lowStockCount} items below minimum stock threshold! Click to inspect.`
                : 'All tracked inventory items are at healthy levels.'
            }
          >
            {lowStockCount > 0 ? (
              <>
                <span className="stock-alert-dot-pulse" />
                <IconAlertTriangle size={14} className="stock-alert-icon" />
                <span className="stock-alert-text">
                  <strong>{lowStockCount}</strong> Low Stock
                </span>
              </>
            ) : (
              <>
                <span className="stock-healthy-dot" />
                <span className="stock-healthy-text">Stock OK</span>
              </>
            )}
          </button>

          {/* Floating Dropdown Inspection Popover */}
          {showStockDropdown && (
            <div className="topbar-stock-popover" onClick={(e) => e.stopPropagation()}>
              <div className="topbar-stock-popover-header">
                <div className="popover-title-row">
                  <IconAlertTriangle
                    size={16}
                    style={{ color: lowStockCount > 0 ? '#b45309' : '#059669' }}
                  />
                  <div>
                    <h4 className="popover-heading">Real-Time Stock Alerts</h4>
                    <span className="popover-sub">
                      {lowStockCount > 0
                        ? `${lowStockCount} ${lowStockCount === 1 ? 'item requires' : 'items require'} attention`
                        : 'All items within safe levels'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="popover-close-btn"
                  onClick={() => setShowStockDropdown(false)}
                  title="Close popup"
                >
                  <IconX size={14} />
                </button>
              </div>

              <div className="topbar-stock-popover-body">
                {lowStockCount === 0 ? (
                  <div className="stock-healthy-empty">
                    <span style={{ fontSize: '24px' }}>✅</span>
                    <strong style={{ fontSize: '12px', color: '#065f46' }}>Inventory Levels Healthy</strong>
                    <p style={{ fontSize: '11px', color: '#64748b', margin: '2px 0 0' }}>
                      All tracked products are above their safety reorder thresholds.
                    </p>
                  </div>
                ) : (
                  <div className="topbar-stock-items-list">
                    {lowStockItems.map((item) => {
                      const isCritical = item.currentQuantity <= 0
                      return (
                        <div key={item.id} className="topbar-stock-item-row">
                          <div className="item-info">
                            <span className="item-code-badge">{item.code}</span>
                            <strong className="item-name">{item.productName}</strong>
                            <span className="item-cat">{item.category}</span>
                          </div>
                          <div className="item-stock-box">
                            <span className={`stock-status-pill ${isCritical ? 'critical' : 'warning'}`}>
                              {isCritical ? 'Out of Stock (0)' : `Only ${item.currentQuantity} left`}
                            </span>
                            <span className="stock-min-hint">
                              Min: {item.reorderThreshold} {item.unit || ''}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {onNavigate && (
                <div className="topbar-stock-popover-footer">
                  <button
                    type="button"
                    className="topbar-go-inventory-btn"
                    onClick={() => {
                      setShowStockDropdown(false)
                      onNavigate('Inventory')
                    }}
                  >
                    <span>Open Inventory Management</span>
                    <IconChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="topbar-divider" />

        <div className="topbar-divider" />

        {/* Date Display */}
        <div className="topbar-date">
          <IconClock size={15} className="topbar-date-icon" />
          <span>{todayFormatted}</span>
        </div>

        <div className="topbar-divider" />

        {/* Active Cashier & Terminal State */}
        <div className="terminal-badge" title="Active Cashier configured in Settings">
          <span className="status-ping" />
          <span>Cashier: <strong>{settings.cashierName || 'Kasun P.'}</strong></span>
        </div>

        {/* Connected state */}
        <div className="demo-environment-pill" title="Connected to MongoDB Atlas Backend">
          <IconInfo size={14} />
          <span>Live POS</span>
        </div>
      </div>
    </header>
  )
}
