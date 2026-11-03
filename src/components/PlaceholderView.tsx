import React from 'react'
import { NavigationPage } from '../types'
import { IconChevronRight, IconInfo } from './Icons'

interface PlaceholderViewProps {
  pageName: NavigationPage
  description: string
  onReturnToDashboard: () => void
}

export const PlaceholderView: React.FC<PlaceholderViewProps> = ({
  pageName,
  description,
  onReturnToDashboard
}) => {
  return (
    <div className="placeholder-container">
      <div className="card-panel placeholder-card">
        <div className="placeholder-icon-ring">
          <IconInfo size={28} />
        </div>

        <span className="placeholder-kicker">MODULE IN DESIGN QUEUE</span>
        <h2 className="placeholder-title">{pageName}</h2>
        <p className="placeholder-desc">{description}</p>

        <div className="placeholder-notice-box">
          <strong>Dashboard Review Phase:</strong> We are currently reviewing the redesigned
          Catamaran Surf Club Dashboard. This screen is reserved for subsequent implementation after
          the Dashboard layout is approved.
        </div>

        <div className="placeholder-actions">
          <button
            type="button"
            className="btn-action btn-action-primary"
            onClick={onReturnToDashboard}
          >
            <span>Return to Dashboard</span>
            <IconChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
