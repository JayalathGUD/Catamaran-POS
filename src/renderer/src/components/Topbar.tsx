import React from 'react'
import { NavigationPage } from '../types'
import { IconClock, IconInfo } from './Icons'

interface TopbarProps {
  currentPage: NavigationPage
  onResetDemo?: () => void
}

export const Topbar: React.FC<TopbarProps> = ({ currentPage }) => {
  const todayFormatted = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date())

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

        <div className="topbar-divider" />

        {/* Date Display */}
        <div className="topbar-date">
          <IconClock size={15} className="topbar-date-icon" />
          <span>{todayFormatted}</span>
        </div>

        <div className="topbar-divider" />

        {/* Local POS Terminal State */}
        <div className="terminal-badge">
          <span className="status-ping" />
          <span>Terminal 01 · Counter Main</span>
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
