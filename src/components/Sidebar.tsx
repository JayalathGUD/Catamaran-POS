import React from 'react'
import logoImg from '../assets/logo.png'
import { NavigationPage } from '../types'
import {
  IconBillHistory,

  IconDashboard,
  IconExpenses,
  IconInventory,
  IconMenuManagement,
  IconPos,
  IconReceipt,
  IconReports,
  IconSettings,
  IconSurfboard,
  IconSurfLessons
} from './Icons'

interface SidebarProps {
  currentPage: NavigationPage
  onSelectPage: (page: NavigationPage) => void
  lowStockCount?: number
  rentedBoardsCount?: number
  openBillsCount?: number
}

interface NavItem {
  id: NavigationPage
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  badge?: string | number
  badgeTone?: 'warning' | 'info' | 'default'
}

interface NavSection {
  title: string
  items: NavItem[]
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  lowStockCount = 0,
  rentedBoardsCount = 0,
  openBillsCount = 0
}) => {
  const sections: NavSection[] = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'Dashboard', label: 'Dashboard', icon: IconDashboard },
        { id: 'POS Billing', label: 'POS Billing', icon: IconPos },
        {
          id: 'Open Bills',
          label: 'Open Bills',
          icon: IconReceipt,
          badge: openBillsCount > 0 ? `${openBillsCount} open` : undefined,
          badgeTone: 'warning'
        },
        { id: 'Bill History', label: 'Bill History', icon: IconBillHistory }
      ]
    },
    {
      title: 'SURF CLUB SERVICES',
      items: [
        {
          id: 'Surfboard Rentals',
          label: 'Surfboard Rentals',
          icon: IconSurfboard,
          badge: rentedBoardsCount > 0 ? `${rentedBoardsCount} out` : undefined,
          badgeTone: 'info'
        },
        {
          id: 'Surf Lessons',
          label: 'Surf Lessons',
          icon: IconSurfLessons
        }
      ]
    },
    {
      title: 'CATALOG & STOCK',
      items: [
        { id: 'Menu Management', label: 'Menu Management', icon: IconMenuManagement },
        {
          id: 'Inventory',
          label: 'Inventory',
          icon: IconInventory,
          badge: lowStockCount > 0 ? `${lowStockCount} low` : undefined,
          badgeTone: 'warning'
        }
      ]
    },
    {
      title: 'ADMIN & SYSTEM',
      items: [
        { id: 'Expenses', label: 'Expenses', icon: IconExpenses },
        { id: 'Reports', label: 'Reports', icon: IconReports },
        { id: 'Settings', label: 'Settings', icon: IconSettings }
      ]
    }
  ]

  return (
    <aside className="app-sidebar" aria-label="Main Navigation">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="brand-logo-container">
          <img src={logoImg} alt="Catamaran Logo" className="brand-sidebar-logo-img" />
        </div>
        <div className="brand-text-container">
          <span className="brand-title">Catamaran Surf Club</span>
          <span className="brand-subtitle">POS &amp; Beach Hub</span>
        </div>
      </div>

      {/* Terminal Location Pill */}
      <div className="terminal-info-card">
        <div className="terminal-dot" />
        <div className="terminal-details">
          <span className="terminal-name">Dewata Beach, Galle</span>
          <span className="terminal-status">Online · Local POS</span>
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="sidebar-nav">
        {sections.map((section) => (
          <div key={section.title} className="nav-group">
            <span className="nav-group-heading">{section.title}</span>
            <ul className="nav-list">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = currentPage === item.id

                return (
                  <li key={item.id} className="nav-item">
                    <button
                      type="button"
                      className={`nav-button ${isActive ? 'nav-button-active' : ''}`}
                      onClick={() => onSelectPage(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="nav-icon-wrapper">
                        <Icon size={17} />
                      </span>
                      <span className="nav-label">{item.label}</span>
                      {item.badge !== undefined && (
                        <span className={`nav-badge nav-badge-${item.badgeTone || 'default'}`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Sidebar Footer */}
      <div className="sidebar-footer">
        <div className="cashier-card">
          <div className="cashier-avatar">DJ</div>
          <div className="cashier-meta">
            <span className="cashier-name">Dilshan J.</span>
            <span className="cashier-role">Duty Shift Supervisor</span>
          </div>
        </div>
        <div className="system-pill">
          <span>v1.0.0 (Win-x64)</span>
          <span className="system-env-tag" style={{ backgroundColor: '#10b981', color: '#ffffff' }}>
            LIVE
          </span>
        </div>
      </div>
    </aside>
  )
}
