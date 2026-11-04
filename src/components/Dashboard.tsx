import logoImg from '../assets/logo.png'
import React, { useEffect, useMemo, useState } from 'react'
import { formatLKR } from '../data/demoData'
import { getBills, getInventoryItems, getRentals, getSurfboards } from '../services/api'
import { downloadBillPDF } from '../utils/billPdfGenerator'
import { downloadReceiptAsPDF, printThermalReceipt } from '../utils/printReceiptHelper'
import {
  ActiveRental,
  CompletedRental,
  HistoryBill,
  InventoryItem,
  NavigationPage,
  RecentBill,
  Surfboard,
  SurfboardFleetCategory,
  SurfLesson
} from '../types'
import {
  IconAlertTriangle,
  IconCard,
  IconCash,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconDownload,
  IconEye,
  IconInfo,
  IconInventory,
  IconPlus,
  IconPrinter,
  IconProfit,
  IconRotateCcw,
  IconSales,
  IconSparkles,
  IconSurfboard,
  IconSurfLessons,
  IconX
} from './Icons'

interface DashboardProps {
  onNavigate: (page: NavigationPage) => void
  boards?: Surfboard[]
  activeRentals?: ActiveRental[]
  completedRentals?: CompletedRental[]
}

export const Dashboard: React.FC<DashboardProps> = ({
  onNavigate,
  boards,
  activeRentals,
  completedRentals
}) => {
  const [bills, setBills] = useState<HistoryBill[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [localBoards, setLocalBoards] = useState<Surfboard[]>([])
  const [localActiveRentals, setLocalActiveRentals] = useState<ActiveRental[]>([])
  const [localCompletedRentals, setLocalCompletedRentals] = useState<CompletedRental[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const [selectedBill, setSelectedBill] = useState<RecentBill | null>(null)
  const [billFilter, setBillFilter] = useState<string>('All')
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string): void => {
    setToast(msg)
    setTimeout(() => {
      setToast((current) => (current === msg ? null : current))
    }, 3800)
  }

  const [todayFormatted] = useState(() =>
    new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date())
  )

  const [todayStr] = useState(() => new Date().toISOString().split('T')[0])

  const loadDashboardData = async (): Promise<void> => {
    try {
      setIsLoading(true)
      const [bData, invData, boardsData, rentalsData] = await Promise.all([
        getBills().catch(() => []),
        getInventoryItems().catch(() => []),
        getSurfboards().catch(() => []),
        getRentals().catch(() => ({ active: [], completed: [] }))
      ])
      setBills(bData)
      setInventoryItems(invData)
      setLocalBoards(boardsData)
      setLocalActiveRentals(rentalsData.active)
      setLocalCompletedRentals(rentalsData.completed)
    } catch (err) {
      console.error('Error loading dashboard data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false
    async function init(): Promise<void> {
      try {
        setIsLoading(true)
        const [bData, invData, boardsData, rentalsData] = await Promise.all([
          getBills().catch(() => []),
          getInventoryItems().catch(() => []),
          getSurfboards().catch(() => []),
          getRentals().catch(() => ({ active: [], completed: [] }))
        ])
        if (!ignore) {
          setBills(bData)
          setInventoryItems(invData)
          setLocalBoards(boardsData)
          setLocalActiveRentals(rentalsData.active)
          setLocalCompletedRentals(rentalsData.completed)
        }
      } catch (err) {
        console.error('Error loading dashboard data:', err)
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }
    init()
    return () => {
      ignore = true
    }
  }, [])

  // Dynamic fleet summary from live boards state
  const currentBoards = boards && boards.length > 0 ? boards : localBoards
  const currentActiveRentals =
    activeRentals && activeRentals.length > 0 ? activeRentals : localActiveRentals
  const currentCompletedRentals =
    completedRentals && completedRentals.length > 0 ? completedRentals : localCompletedRentals

  const totalFleet = currentBoards.length
  const availableBoards = currentBoards.filter((b) => b.status === 'Available').length
  const rentedBoards = currentBoards.filter((b) => b.status === 'Rented').length
  const repairBoards = currentBoards.filter((b) => b.status === 'Under Repair').length
  const damagedBoards = currentBoards.filter((b) => b.status === 'Damaged').length

  const availablePct = totalFleet > 0 ? Math.round((availableBoards / totalFleet) * 100) : 0
  const rentedPct = totalFleet > 0 ? Math.round((rentedBoards / totalFleet) * 100) : 0
  const repairPct = totalFleet > 0 ? Math.round((repairBoards / totalFleet) * 100) : 0
  const damagedPct = totalFleet > 0 ? Math.round((damagedBoards / totalFleet) * 100) : 0

  // Live bills calculations
  const todayBills = useMemo(() => {
    return bills.filter((b) => b.date === todayStr && b.status !== 'Cancelled')
  }, [bills, todayStr])

  const settledBills = useMemo(() => {
    return todayBills.filter((b) => b.status === 'Settled')
  }, [todayBills])

  const baseSales = useMemo(() => {
    return settledBills.reduce((acc, b) => acc + b.total, 0)
  }, [settledBills])

  const baseCash = useMemo(() => {
    return settledBills
      .filter((b) => b.paymentMethod.toLowerCase().includes('cash'))
      .reduce((acc, b) => acc + b.total, 0)
  }, [settledBills])

  const baseCard = useMemo(() => {
    return settledBills
      .filter((b) => b.paymentMethod.toLowerCase().includes('card'))
      .reduce((acc, b) => acc + b.total, 0)
  }, [settledBills])

  const baseTransactions = settledBills.length

  // Rental income & payment tracking (only rentals returned today count towards today's sales)
  const paidRentals = useMemo(() => {
    return currentCompletedRentals.filter(
      (r) => r.returnDate === todayStr && r.paymentStatus === 'Paid'
    )
  }, [currentCompletedRentals, todayStr])

  const unpaidRentals = useMemo(() => {
    return currentCompletedRentals.filter((r) => r.paymentStatus === 'Unpaid')
  }, [currentCompletedRentals])

  const rentalIncomeTotal = useMemo(() => {
    return paidRentals.reduce((sum, r) => sum + r.totalCharged, 0)
  }, [paidRentals])

  const rentalCashTotal = useMemo(() => {
    return paidRentals
      .filter((r) => r.paymentMethod.toLowerCase().includes('cash'))
      .reduce((sum, r) => sum + r.totalCharged, 0)
  }, [paidRentals])

  const rentalCardTotal = useMemo(() => {
    return paidRentals
      .filter((r) => r.paymentMethod.toLowerCase().includes('card'))
      .reduce((sum, r) => sum + r.totalCharged, 0)
  }, [paidRentals])

  const rentalUnpaidTotal = useMemo(() => {
    return unpaidRentals.reduce((sum, r) => sum + r.totalCharged, 0)
  }, [unpaidRentals])

  // Combined Sales figures (Counter bills + Confirmed paid rental revenue)
  const combinedTodaySales = baseSales + rentalIncomeTotal
  const combinedCashReceived = baseCash + rentalCashTotal
  const combinedCardReceived = baseCard + rentalCardTotal
  const combinedTransactions = baseTransactions + paidRentals.length
  const estimatedProfit = Math.round(combinedTodaySales * 0.55)
  const estimatedCOGS = Math.max(0, combinedTodaySales - estimatedProfit)

  // Revenue Mix & Performance indicators
  const restaurantSalesPct =
    combinedTodaySales > 0 ? Math.round((baseSales / combinedTodaySales) * 100) : 0
  const rentalSalesPct =
    combinedTodaySales > 0 ? Math.round((rentalIncomeTotal / combinedTodaySales) * 100) : 0
  const cashPct =
    combinedTodaySales > 0 ? Math.round((combinedCashReceived / combinedTodaySales) * 100) : 0
  const cardPct =
    combinedTodaySales > 0 ? Math.round((combinedCardReceived / combinedTodaySales) * 100) : 0
  const avgOrderValue =
    combinedTransactions > 0 ? Math.round(combinedTodaySales / combinedTransactions) : 0

  const handleDownloadRecentBill = async (bill: RecentBill): Promise<void> => {
    const hasModal = document.getElementById('dash-thermal-print-target')
    if (hasModal && selectedBill?.billNumber === bill.billNumber) {
      await downloadReceiptAsPDF(
        'dash-thermal-print-target',
        `Catamaran_Receipt_${bill.billNumber}`
      )
    } else {
      await downloadBillPDF({
        billNumber: bill.billNumber,
        date: todayFormatted,
        time: bill.time,
        orderType: bill.saleType,
        customerName: 'Guest',
        cashier: bill.cashier || 'Cashier',
        paymentMethod: bill.paymentMethod,
        items: bill.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.total
        })),
        subtotal: bill.total,
        total: bill.total,
        status: bill.status
      })
    }
    showToast(`Downloaded official 58mm receipt for ${bill.billNumber}`)
  }

  // Recent Bills from MongoDB
  const recentBills = useMemo(() => {
    return bills.slice(0, 15).map((b) => ({
      billNumber: b.billNumber,
      time: b.time,
      saleType: b.saleType,
      paymentMethod: b.paymentMethod,
      total: b.total,
      status: (b.status === 'Refunded' ? 'Refunded' : 'Settled') as 'Settled' | 'Refunded',
      cashier: b.cashier,
      items: b.items
    }))
  }, [bills])

  const filteredBills = useMemo(() => {
    return recentBills.filter((bill) => {
      if (billFilter === 'All') return true
      return bill.saleType.toLowerCase().includes(billFilter.toLowerCase())
    })
  }, [recentBills, billFilter])

  // Low stock items from MongoDB
  const lowStockItems = useMemo(() => {
    return inventoryItems
      .filter((item) => item.currentQuantity <= item.reorderThreshold)
      .map((item) => ({
        id: item.id,
        name: item.productName,
        category: item.category,
        currentStock: item.currentQuantity,
        reorderPoint: item.reorderThreshold,
        unit: item.unit,
        urgency: (item.currentQuantity === 0 ? 'Critical' : 'Low') as 'Critical' | 'Low'
      }))
  }, [inventoryItems])

  const categoriesSummary = useMemo(() => {
    const cats: SurfboardFleetCategory[] = [
      'Soft-top Foamies',
      'Epoxy Funboards',
      'Performance Shortboards',
      'Classic Longboards'
    ]
    return cats.map((catName) => {
      const inCat = currentBoards.filter((b) => b.category === catName)
      const avail = inCat.filter((b) => b.status === 'Available').length
      return {
        category: catName,
        total: inCat.length,
        available: avail
      }
    })
  }, [currentBoards])

  // Surf lessons schedule (live list, empty if none booked)
  const lessons: SurfLesson[] = []
  const completedLessons = lessons.filter((l) => l.status === 'Completed').length
  const activeLessons = lessons.filter((l) => l.status === 'In Progress').length
  const upcomingLessons = lessons.filter((l) => l.status === 'Upcoming').length
  const totalStudents = lessons.reduce((acc, l) => acc + l.pax, 0)

  return (
    <div className="dashboard-container">
      {/* Toast Notification */}
      {toast && (
        <div className="dashboard-toast" role="status">
          <IconInfo size={16} />
          <span>{toast}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* Dashboard Header Banner */}
      <section className="dashboard-header-panel">
        <div className="header-meta">
          <div className="header-top-row">
            <span className="system-location-tag">Dewata Beach · Sri Lanka</span>
            <div className="demo-notice-badge">
              <span className="demo-pulse-dot" style={{ backgroundColor: '#10b981' }} />
              <span>MONGODB ATLAS · LIVE DATA</span>
            </div>
          </div>
          <h1 className="dashboard-heading">Dashboard Overview</h1>
          <p className="dashboard-subheading">
            Live business summary for <strong>{todayFormatted}</strong> · Shift 01 (07:00 – 19:00)
          </p>
        </div>

        {/* Primary Quick Actions */}
        <div className="header-quick-actions">
          <button
            type="button"
            className="btn-action btn-action-primary"
            onClick={() => onNavigate('POS Billing')}
            title="Open POS billing terminal to create a new customer bill"
          >
            <IconPlus size={16} />
            <span>New Bill</span>
          </button>

          <button
            type="button"
            className="btn-action btn-action-secondary"
            onClick={() => onNavigate('Inventory')}
            title="Inspect current stock and low-quantity supplies"
          >
            <IconInventory size={16} />
            <span>Manage Stock</span>
          </button>

          <button
            type="button"
            className="btn-action btn-action-secondary"
            onClick={() => onNavigate('Surfboard Rentals')}
            title="View board availability and issue rental tickets"
          >
            <IconSurfboard size={16} />
            <span>Surfboard Rentals</span>
          </button>

          <button
            type="button"
            className="btn-action btn-action-outline"
            onClick={loadDashboardData}
            title="Refresh dashboard metrics from cloud database"
            disabled={isLoading}
          >
            <IconRotateCcw size={15} />
            <span>{isLoading ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      </section>

      {/* Cloud Sync Status Callout */}
      <div
        className="demo-disclaimer-strip"
        style={{
          borderColor: 'rgba(16, 185, 129, 0.25)',
          backgroundColor: 'rgba(16, 185, 129, 0.05)'
        }}
      >
        <div className="strip-content">
          <IconCheck size={14} className="strip-icon" style={{ color: '#10b981' }} />
          <span className="strip-text">
            <strong>MongoDB Atlas Live Connected:</strong> Real-time figures for bills, rentals, and
            warehouse inventory are synced with your cloud database.
          </span>
        </div>
        <span
          className="strip-tag"
          style={{ color: '#059669', borderColor: 'rgba(5, 150, 105, 0.3)' }}
        >
          Cloud Live
        </span>
      </div>

      {/* 4 Financial Key Metrics (Sales, Cash, Card, Gross Profit) */}
      <section className="metrics-grid" aria-label="Financial Highlights">
        {/* Metric 1: Today's Sales */}
        <div className="metric-card metric-card-sales">
          <div className="metric-card-header">
            <div className="metric-icon-box metric-icon-teal">
              <IconSales size={20} />
            </div>
            <span className="metric-badge metric-badge-positive">Live Database</span>
          </div>
          <div className="metric-body">
            <span className="metric-label">Today&apos;s Combined Sales</span>
            <div className="metric-value-row">
              <span className="metric-primary-value">{formatLKR(combinedTodaySales)}</span>
            </div>
            <div className="metric-footer-note">
              <span>
                Counter: {formatLKR(baseSales)} + Rentals: {formatLKR(rentalIncomeTotal)} (
                {combinedTransactions} txs)
              </span>
            </div>
          </div>
        </div>

        {/* Metric 2: Cash Received */}
        <div className="metric-card metric-card-cash">
          <div className="metric-card-header">
            <div className="metric-icon-box metric-icon-emerald">
              <IconCash size={20} />
            </div>
            <span className="metric-badge metric-badge-neutral">
              {Math.round((combinedCashReceived / (combinedTodaySales || 1)) * 100)}% of total
            </span>
          </div>
          <div className="metric-body">
            <span className="metric-label">Cash Received</span>
            <div className="metric-value-row">
              <span className="metric-primary-value">{formatLKR(combinedCashReceived)}</span>
            </div>
            <div className="metric-footer-note">
              <span>
                Counter: {formatLKR(baseCash)} + Rentals: {formatLKR(rentalCashTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Metric 3: Card Received */}
        <div className="metric-card metric-card-card">
          <div className="metric-card-header">
            <div className="metric-icon-box metric-icon-blue">
              <IconCard size={20} />
            </div>
            <span className="metric-badge metric-badge-neutral">
              {Math.round((combinedCardReceived / (combinedTodaySales || 1)) * 100)}% of total
            </span>
          </div>
          <div className="metric-body">
            <span className="metric-label">Card Received</span>
            <div className="metric-value-row">
              <span className="metric-primary-value">{formatLKR(combinedCardReceived)}</span>
            </div>
            <div className="metric-footer-note">
              <span>
                Counter: {formatLKR(baseCard)} + Rentals: {formatLKR(rentalCardTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Metric 4: Gross Profit */}
        <div className="metric-card metric-card-profit">
          <div className="metric-card-header">
            <div className="metric-icon-box metric-icon-navy">
              <IconProfit size={20} />
            </div>
            <span className="metric-badge metric-badge-positive">~55% est. margin</span>
          </div>
          <div className="metric-body">
            <span className="metric-label">Estimated Gross Profit</span>
            <div className="metric-value-row">
              <span className="metric-primary-value">{formatLKR(estimatedProfit)}</span>
            </div>
            <div className="metric-footer-note">
              <span>Est. COGS: {formatLKR(estimatedCOGS)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Executive Performance Strip: Revenue Mix & Real-time Insights */}
      <section className="dashboard-perf-strip">
        <div className="perf-strip-card">
          <div className="perf-strip-header">
            <div className="perf-title-group">
              <IconSparkles size={16} className="text-teal" />
              <span className="perf-strip-title">Today&apos;s Revenue Mix</span>
            </div>
            <span className="perf-strip-badge">Department Breakdown</span>
          </div>
          <div className="perf-bar-wrap">
            <div className="perf-progress-bar">
              <div
                className="perf-bar-segment seg-food"
                style={{ width: `${restaurantSalesPct}%` }}
                title={`Restaurant F&B: ${formatLKR(baseSales)} (${restaurantSalesPct}%)`}
              />
              <div
                className="perf-bar-segment seg-rental"
                style={{ width: `${rentalSalesPct}%` }}
                title={`Surfboard Rentals: ${formatLKR(rentalIncomeTotal)} (${rentalSalesPct}%)`}
              />
            </div>
            <div className="perf-bar-legend">
              <div className="perf-legend-item">
                <span className="perf-dot dot-food" />
                <span className="perf-legend-label">Restaurant F&amp;B:</span>
                <strong className="perf-legend-val">{formatLKR(baseSales)} ({restaurantSalesPct}%)</strong>
              </div>
              <div className="perf-legend-item">
                <span className="perf-dot dot-rental" />
                <span className="perf-legend-label">Surf Rentals:</span>
                <strong className="perf-legend-val">{formatLKR(rentalIncomeTotal)} ({rentalSalesPct}%)</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="perf-strip-kpis">
          <div className="perf-mini-kpi">
            <span className="mini-kpi-label">Avg. Ticket (AOV)</span>
            <strong className="mini-kpi-val text-teal">{formatLKR(avgOrderValue)}</strong>
            <span className="mini-kpi-hint">Across {combinedTransactions} transactions</span>
          </div>

          <div className="perf-mini-kpi">
            <span className="mini-kpi-label">Payment Split</span>
            <div className="mini-split-bar">
              <div className="split-cash" style={{ width: `${cashPct}%` }} title={`Cash: ${cashPct}%`} />
              <div className="split-card" style={{ width: `${cardPct}%` }} title={`Card: ${cardPct}%`} />
            </div>
            <div className="mini-split-text">
              <span className="text-emerald">{cashPct}% Cash</span>
              <span className="text-indigo">{cardPct}% Card</span>
            </div>
          </div>

          <div className="perf-mini-kpi">
            <span className="mini-kpi-label">Boards In Water</span>
            <strong className="mini-kpi-val text-blue">{rentedBoards} / {totalFleet}</strong>
            <span className="mini-kpi-hint">{rentedPct}% fleet utilized</span>
          </div>

          <div className="perf-mini-kpi">
            <span className="mini-kpi-label">Stock Status</span>
            <strong className={`mini-kpi-val ${lowStockItems.length > 0 ? 'text-rose' : 'text-emerald'}`}>
              {lowStockItems.length === 0 ? 'Healthy' : `${lowStockItems.length} Low`}
            </strong>
            <span className="mini-kpi-hint">
              {lowStockItems.length > 0 ? 'Action required' : 'Stock optimal'}
            </span>
          </div>
        </div>
      </section>

      {/* Middle Operations Grid: Rentals, Lessons, Stock Alerts */}
      <section className="operations-grid">
        {/* Surfboard Rental Status Widget */}
        <div className="card-panel">
          <div className="card-panel-header">
            <div className="card-title-group">
              <div className="card-title-icon-wrapper">
                <IconSurfboard size={18} />
              </div>
              <div>
                <h2 className="card-title">Surfboard Rental Status</h2>
                <p className="card-subtitle">
                  Current fleet allocation · {currentActiveRentals.length} active sessions
                </p>
              </div>
            </div>
            <button
              type="button"
              className="card-header-link"
              onClick={() => onNavigate('Surfboard Rentals')}
            >
              <span>Fleet View</span>
              <IconChevronRight size={14} />
            </button>
          </div>

          <div className="rental-status-body">
            {/* 4 Status KPI Counters */}
            <div className="rental-status-counters">
              <div className="rental-counter-box status-available">
                <span className="counter-label">Available</span>
                <span className="counter-number">{availableBoards}</span>
                <span className="counter-percent">{availablePct}% of fleet</span>
              </div>

              <div className="rental-counter-box status-rented">
                <span className="counter-label">Rented</span>
                <span className="counter-number">{rentedBoards}</span>
                <span className="counter-percent">{rentedPct}% active</span>
              </div>

              <div className="rental-counter-box status-repair">
                <span className="counter-label">Under Repair</span>
                <span className="counter-number">{repairBoards}</span>
                <span className="counter-percent">{repairPct}% workshop</span>
              </div>

              <div className="rental-counter-box status-damaged">
                <span className="counter-label">Damaged</span>
                <span className="counter-number">{damagedBoards}</span>
                <span className="counter-percent">{damagedPct}% inspection</span>
              </div>
            </div>

            {/* Segmented Distribution Bar */}
            <div className="rental-progress-container">
              <div
                className="segmented-bar"
                role="progressbar"
                aria-label="Fleet status distribution"
              >
                <div
                  className="bar-segment seg-available"
                  style={{ width: `${availablePct}%` }}
                  title={`Available: ${availableBoards} boards (${availablePct}%)`}
                />
                <div
                  className="bar-segment seg-rented"
                  style={{ width: `${rentedPct}%` }}
                  title={`Rented: ${rentedBoards} boards (${rentedPct}%)`}
                />
                <div
                  className="bar-segment seg-repair"
                  style={{ width: `${repairPct}%` }}
                  title={`Under Repair: ${repairBoards} boards (${repairPct}%)`}
                />
                <div
                  className="bar-segment seg-damaged"
                  style={{ width: `${damagedPct}%` }}
                  title={`Damaged: ${damagedBoards} boards (${damagedPct}%)`}
                />
              </div>

              <div className="bar-legend">
                <span className="legend-item">
                  <span className="legend-dot dot-available" /> Available ({availableBoards})
                </span>
                <span className="legend-item">
                  <span className="legend-dot dot-rented" /> Rented ({rentedBoards})
                </span>
                <span className="legend-item">
                  <span className="legend-dot dot-repair" /> Repair ({repairBoards})
                </span>
                <span className="legend-item">
                  <span className="legend-dot dot-damaged" /> Damaged ({damagedBoards})
                </span>
              </div>
            </div>

            {/* Rental Revenue Strip */}
            <div className="dashboard-rental-rev-strip">
              <div className="rev-strip-item">
                <span className="rev-strip-label">Today&apos;s Rental Income</span>
                <span className="rev-strip-val text-teal">{formatLKR(rentalIncomeTotal)}</span>
                <span className="rev-strip-note">{paidRentals.length} confirmed paid</span>
              </div>
              <div className="rev-strip-divider" />
              <div className="rev-strip-item">
                <span className="rev-strip-label">Outstanding Tab Charges</span>
                <span className={`rev-strip-val ${rentalUnpaidTotal > 0 ? 'text-amber' : ''}`}>
                  {formatLKR(rentalUnpaidTotal)}
                </span>
                <span className="rev-strip-note">
                  {unpaidRentals.length > 0
                    ? `${unpaidRentals.length} pending settlement`
                    : 'All settled'}
                </span>
              </div>
            </div>

            {/* Category breakdown table */}
            <div className="rental-categories-list">
              <span className="categories-list-title">Board Categories breakdown</span>
              <div className="category-rows-wrapper">
                {categoriesSummary.map((cat) => (
                  <div key={cat.category} className="category-row">
                    <span className="cat-name">{cat.category}</span>
                    <div className="cat-counts">
                      <span className="cat-avail" title="Available">
                        {cat.available} avail
                      </span>
                      <span className="cat-divider">/</span>
                      <span className="cat-total" title="Total in category">
                        {cat.total} total
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Today's Surf Lessons Summary Widget */}
        <div className="card-panel">
          <div className="card-panel-header">
            <div className="card-title-group">
              <div className="card-title-icon-wrapper">
                <IconSurfLessons size={18} />
              </div>
              <div>
                <h2 className="card-title">Today&apos;s Surf Lessons</h2>
                <p className="card-subtitle">Coaching roster & schedule</p>
              </div>
            </div>
            <button
              type="button"
              className="card-header-link"
              onClick={() => onNavigate('Surf Lessons')}
            >
              <span>Schedule</span>
              <IconChevronRight size={14} />
            </button>
          </div>

          <div className="lessons-body">
            {/* Status pills summary */}
            <div className="lessons-summary-pills">
              <div className="summary-pill">
                <span className="pill-number">{lessons.length}</span>
                <span className="pill-label">Sessions</span>
              </div>
              <div className="summary-pill">
                <span className="pill-number">{totalStudents}</span>
                <span className="pill-label">Students</span>
              </div>
              <div className="summary-pill">
                <span className="pill-number">{completedLessons}</span>
                <span className="pill-label">Completed</span>
              </div>
              <div className="summary-pill status-pill-active">
                <span className="pill-number">{activeLessons}</span>
                <span className="pill-label">In Water</span>
              </div>
              <div className="summary-pill">
                <span className="pill-number">{upcomingLessons}</span>
                <span className="pill-label">Upcoming</span>
              </div>
            </div>

            {/* List of lessons */}
            <div className="lessons-schedule-list">
              {lessons.length === 0 ? (
                <div style={{ padding: '28px 16px', textAlign: 'center', color: '#64748b' }}>
                  <IconSurfLessons
                    size={28}
                    style={{ color: '#94a3b8', margin: '0 auto 8px', display: 'block' }}
                  />
                  <strong style={{ display: 'block', color: '#334155', fontSize: '14px' }}>
                    No surf lessons scheduled
                  </strong>
                  <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                    Scheduled coaching sessions will appear here when booked.
                  </p>
                </div>
              ) : (
                lessons.map((lesson) => {
                  let badgeClass = 'badge-upcoming'
                  if (lesson.status === 'Completed') badgeClass = 'badge-completed'
                  if (lesson.status === 'In Progress') badgeClass = 'badge-active'

                  return (
                    <div key={lesson.id} className="lesson-item">
                      <div className="lesson-time-col">
                        <IconClock size={13} className="time-icon" />
                        <span>{lesson.time.split(' - ')[0]}</span>
                      </div>

                      <div className="lesson-info-col">
                        <div className="lesson-title-row">
                          <strong className="lesson-title">{lesson.title}</strong>
                          <span className="lesson-pax">{lesson.pax} pax</span>
                        </div>
                        <div className="lesson-meta-row">
                          <span className="lesson-instructor">{lesson.instructor}</span>
                          <span className="lesson-dot-sep">•</span>
                          <span className="lesson-level">{lesson.level}</span>
                        </div>
                      </div>

                      <div className="lesson-status-col">
                        <span className={`lesson-status-badge ${badgeClass}`}>{lesson.status}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Low Stock Alerts Widget */}
        <div className="card-panel">
          <div className="card-panel-header">
            <div className="card-title-group">
              <div className="card-title-icon-wrapper title-icon-alert">
                <IconAlertTriangle size={18} />
              </div>
              <div>
                <h2 className="card-title">Low Stock Alerts</h2>
                <p className="card-subtitle">
                  {lowStockItems.length} items below reorder threshold
                </p>
              </div>
            </div>
            <button
              type="button"
              className="card-header-link"
              onClick={() => onNavigate('Inventory')}
            >
              <span>Inventory</span>
              <IconChevronRight size={14} />
            </button>
          </div>

          <div className="stock-alerts-body">
            <div className="stock-items-list">
              {lowStockItems.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#64748b' }}>
                  <IconCheck
                    size={28}
                    style={{ color: '#10b981', margin: '0 auto 8px', display: 'block' }}
                  />
                  <strong>Stock levels healthy</strong>
                  <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                    All tracked inventory items are above their reorder thresholds.
                  </p>
                </div>
              ) : (
                lowStockItems.map((item) => {
                  const isCritical = item.urgency === 'Critical'

                  return (
                    <div key={item.id} className="stock-alert-item">
                      <div className="stock-item-info">
                        <div className="stock-name-row">
                          <strong className="stock-item-name">{item.name}</strong>
                          <span
                            className={`stock-urgency-badge ${isCritical ? 'urgency-critical' : 'urgency-warning'}`}
                          >
                            {isCritical ? 'Critical' : 'Low'}
                          </span>
                        </div>
                        <span className="stock-category-name">{item.category}</span>
                      </div>

                      <div className="stock-quantities">
                        <div className="stock-count-box">
                          <span className="stock-current-val">{item.currentStock}</span>
                          <span className="stock-unit">{item.unit}</span>
                        </div>
                        <span className="stock-reorder-hint">
                          Min: {item.reorderPoint} {item.unit}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="stock-reorder-btn"
                        onClick={() => onNavigate('Inventory')}
                        title="Open Inventory to receive stock purchase"
                      >
                        <span>Restock</span>
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            <div className="stock-alert-footer">
              <span className="stock-footer-tip">
                Tip: Low-stock items are highlighted in red when stock is below 5 units.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Bills Table Section */}
      <section className="bills-section">
        <div className="card-panel">
          <div className="card-panel-header bills-panel-header">
            <div>
              <h2 className="card-title">Recent Bills & Transactions</h2>
              <p className="card-subtitle">
                Latest customer invoices settled at counter terminals today
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="table-filter-pills">
              {['All', 'Restaurant', 'Rental', 'Lesson'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`filter-pill ${billFilter === tab ? 'filter-pill-active' : ''}`}
                  onClick={() => setBillFilter(tab)}
                >
                  {tab === 'All' ? 'All Transactions' : tab}
                </button>
              ))}
            </div>
          </div>

          <div className="bills-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bill Number</th>
                  <th>Time</th>
                  <th>Sale Type</th>
                  <th>Payment Method</th>
                  <th className="th-number">Total (LKR)</th>
                  <th>Status</th>
                  <th className="th-action">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.map((bill) => {
                  let typeTone = 'type-restaurant'
                  if (bill.saleType.includes('Rental')) typeTone = 'type-rental'
                  if (bill.saleType.includes('Lesson')) typeTone = 'type-lesson'
                  if (bill.saleType.includes('Retail')) typeTone = 'type-retail'
                  if (bill.saleType.includes('Combo')) typeTone = 'type-combo'

                  return (
                    <tr
                      key={bill.billNumber}
                      className="table-row-clickable"
                      onClick={() => setSelectedBill(bill)}
                    >
                      <td className="bill-num-cell">
                        <span className="bill-number-text">{bill.billNumber}</span>
                      </td>

                      <td className="time-cell">
                        <span className="bill-time">{bill.time}</span>
                      </td>

                      <td>
                        <span className={`sale-type-pill ${typeTone}`}>{bill.saleType}</span>
                      </td>

                      <td>
                        <div className="payment-method-cell">
                          {bill.paymentMethod.startsWith('Cash') ? (
                            <IconCash size={14} className="pay-icon pay-cash" />
                          ) : (
                            <IconCard size={14} className="pay-icon pay-card" />
                          )}
                          <span>{bill.paymentMethod}</span>
                        </div>
                      </td>

                      <td className="th-number">
                        <strong className="bill-total-amount">{formatLKR(bill.total)}</strong>
                      </td>

                      <td>
                        <span className="status-settled-pill">
                          <IconCheck size={12} />
                          <span>{bill.status}</span>
                        </span>
                      </td>

                      <td className="th-action">
                        <div className="dash-table-actions">
                          <button
                            type="button"
                            className="btn-table-action dash-action-view"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedBill(bill)
                            }}
                            title="View receipt summary"
                          >
                            <IconEye size={12} />
                            <span>View</span>
                          </button>
                          <button
                            type="button"
                            className="btn-table-action dash-action-pdf"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDownloadRecentBill(bill)
                            }}
                            title="Download official PDF invoice"
                          >
                            <IconDownload size={12} />
                            <span>PDF</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {filteredBills.length === 0 && (
                  <tr>
                    <td colSpan={7} className="table-empty-row">
                      No bills match the selected filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bills-table-footer">
            <span className="footer-count-text">
              Showing {filteredBills.length} of {bills.length} bills from database
            </span>
            <span
              className="demo-footer-badge"
              style={{ backgroundColor: '#10b981', color: '#fff' }}
            >
              MongoDB Atlas Live
            </span>
          </div>
        </div>
      </section>

      {/* Bill Receipt Preview Modal */}
      {selectedBill && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedBill(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-bill-title"
        >
          <div className="bill-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="bill-modal-header">
              <div>
                <span className="modal-kicker">Catamaran Beach Restaurant · Official Guest Bill</span>
                <h3 id="modal-bill-title" className="modal-title">
                  {selectedBill.billNumber}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedBill(null)}
                aria-label="Close bill preview"
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="bill-receipt-paper" id="dash-thermal-print-target">
              <div className="receipt-header-center">
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
                  <img src={logoImg} alt="Catamaran Beach Restaurant" style={{ maxHeight: '60px', width: 'auto' }} />
                </div>
                <span className="receipt-brand">CATAMARAN BEACH RESTAURANT</span>
                <span className="receipt-sub">Dewata Beach, Galle, Sri Lanka</span>
                <span className="receipt-date">
                  {todayFormatted} · {selectedBill.time}
                </span>
                <span className="receipt-cashier">Cashier: {selectedBill.cashier}</span>
              </div>

              <div className="receipt-divider" />

              <div className="receipt-meta-grid">
                <div>
                  <span className="receipt-meta-label">Sale Category</span>
                  <strong className="receipt-meta-val">{selectedBill.saleType}</strong>
                </div>
                <div>
                  <span className="receipt-meta-label">Payment</span>
                  <strong className="receipt-meta-val">{selectedBill.paymentMethod}</strong>
                </div>
              </div>

              <div className="receipt-divider" />

              <table className="receipt-items-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="th-qty">Qty</th>
                    <th className="th-price">Rate</th>
                    <th className="th-amount">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBill.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td className="th-qty">{item.quantity}</td>
                      <td className="th-price">{formatLKR(item.unitPrice)}</td>
                      <td className="th-amount">{formatLKR(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="receipt-divider" />

              <div className="receipt-summary-lines">
                <div className="receipt-line">
                  <span>Subtotal</span>
                  <span>{formatLKR(selectedBill.total)}</span>
                </div>
                <div className="receipt-line">
                  <span>Service & Tax (Inclusive)</span>
                  <span>Rs. 0.00</span>
                </div>
                <div className="receipt-line-total">
                  <span>Grand Total</span>
                  <strong className="receipt-total-val">{formatLKR(selectedBill.total)}</strong>
                </div>
              </div>

              <div className="receipt-footer-text">
                <span>Thank you for dining at Catamaran Beach Restaurant!</span>
                <span className="receipt-demo-watermark">OFFICIAL RECEIPT COPY</span>
              </div>
            </div>

            <div className="modal-actions-row">
              <button
                type="button"
                className="btn-print"
                onClick={() => {
                  printThermalReceipt('dash-thermal-print-target')
                }}
              >
                <IconPrinter size={16} />
                <span>Print 58mm Receipt</span>
              </button>

              <button
                type="button"
                className="btn-print"
                style={{ backgroundColor: '#0284c7', color: '#ffffff', borderColor: '#0284c7' }}
                onClick={() => handleDownloadRecentBill(selectedBill)}
                title="Download official PDF invoice"
              >
                <IconDownload size={16} />
                <span>Download PDF</span>
              </button>

              <button type="button" className="btn-dismiss" onClick={() => setSelectedBill(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
