import React, { useEffect, useMemo, useState } from 'react'
import { formatLKR } from '../data/demoData'
import {
  getBills,
  getExpenses,
  getInventoryItems,
  getMenuItems,
  getRentals,
  getStockMovements,
  getSurfboards,
  type ExpenseRecord
} from '../services/api'
import {
  ActiveRental,
  CompletedRental,
  HistoryBill,
  InventoryItem,
  MenuItem,
  StockMovement,
  Surfboard
} from '../types'
import {
  IconAlertTriangle,
  IconCash,
  IconCheck,
  IconClock,
  IconExpenses,
  IconFilter,
  IconInfo,
  IconInventory,
  IconProfit,
  IconReceipt,
  IconReports,
  IconRotateCcw,
  IconSales,
  IconSurfboard,
  IconUtensils
} from './Icons'
import {
  exportReportToExcel,
  exportReportToPDF,
  ExportReportPayload
} from '../utils/reportExport'

type ReportTab = 'sales' | 'profit' | 'expenses' | 'inventory' | 'rentals'
type DatePreset = 'today' | 'this_month' | 'last_30_days' | 'all' | 'custom'

// Local Date Helpers (avoid UTC offset shift for Sri Lanka UTC+05:30)
const toLocalDateStr = (d: Date): string => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getTodayStr = (): string => toLocalDateStr(new Date())

const getMonthStartStr = (): string => {
  const now = new Date()
  return toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1))
}

const getLast30DaysStartStr = (): string => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return toLocalDateStr(d)
}

export const Reports: React.FC = () => {
  // Navigation tab
  const [activeTab, setActiveTab] = useState<ReportTab>('sales')

  // Date filters
  const [datePreset, setDatePreset] = useState<DatePreset>('this_month')
  const [startDate, setStartDate] = useState<string>(getMonthStartStr())
  const [endDate, setEndDate] = useState<string>(getTodayStr())

  // Raw Database Data
  const [bills, setBills] = useState<HistoryBill[]>([])
  const [activeRentals, setActiveRentals] = useState<ActiveRental[]>([])
  const [completedRentals, setCompletedRentals] = useState<CompletedRental[]>([])
  const [recordedExpenses, setRecordedExpenses] = useState<ExpenseRecord[]>([])
  const [cancelledExpenses, setCancelledExpenses] = useState<ExpenseRecord[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [surfboards, setSurfboards] = useState<Surfboard[]>([])

  // Loading & Error State
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [exportNotice, setExportNotice] = useState<string | null>(null)

  // Load all operational datasets
  const loadReportsData = async (): Promise<void> => {
    setIsLoading(true)
    setFetchError(null)

    try {
      const dateFilters =
        datePreset === 'all'
          ? undefined
          : { startDate: startDate || undefined, endDate: endDate || undefined }

      const [
        billsData,
        rentalsData,
        recExpData,
        canExpData,
        invData,
        movementsData,
        menuData,
        boardsData
      ] = await Promise.all([
        getBills(dateFilters).catch(() => []),
        getRentals(dateFilters).catch(() => ({ active: [], completed: [] })),
        getExpenses({
          startDate: datePreset === 'all' ? undefined : startDate || undefined,
          endDate: datePreset === 'all' ? undefined : endDate || undefined,
          status: 'Recorded'
        }).catch(() => []),
        getExpenses({
          startDate: datePreset === 'all' ? undefined : startDate || undefined,
          endDate: datePreset === 'all' ? undefined : endDate || undefined,
          status: 'Cancelled'
        }).catch(() => []),
        getInventoryItems().catch(() => []),
        getStockMovements(
          datePreset === 'all' ? undefined : { ...dateFilters, limit: 1000 }
        ).catch(() => []),
        getMenuItems().catch(() => []),
        getSurfboards().catch(() => [])
      ])

      setBills(billsData)
      setActiveRentals(rentalsData.active)
      setCompletedRentals(rentalsData.completed)
      setRecordedExpenses(recExpData)
      setCancelledExpenses(canExpData)
      setInventoryItems(invData)
      setStockMovements(movementsData)
      setMenuItems(menuData)
      setSurfboards(boardsData)
    } catch (err: unknown) {
      console.error('Failed to load reports dataset:', err)
      setFetchError(err instanceof Error ? err.message : 'Failed to retrieve reports data')
    } finally {
      setIsLoading(false)
    }
  }

  // Load on mount and when date boundaries change (expenses use server-side filter)
  useEffect(() => {
    void loadReportsData()
  }, [startDate, endDate, datePreset])

  // Handle Preset Change
  const handlePresetChange = (preset: DatePreset): void => {
    setDatePreset(preset)
    const today = getTodayStr()

    if (preset === 'today') {
      setStartDate(today)
      setEndDate(today)
    } else if (preset === 'this_month') {
      setStartDate(getMonthStartStr())
      setEndDate(today)
    } else if (preset === 'last_30_days') {
      setStartDate(getLast30DaysStartStr())
      setEndDate(today)
    } else if (preset === 'all') {
      setStartDate('')
      setEndDate('')
    }
  }

  const handleResetFilters = (): void => {
    handlePresetChange('this_month')
  }

  const handleExportClick = (type: 'PDF' | 'Excel'): void => {
    try {
      const payload: ExportReportPayload = {
        reportType: activeTab,
        startDate,
        endDate,
        sales: activeTab === 'sales' ? salesMetrics : undefined,
        profit:
          activeTab === 'profit'
            ? { ...profitMetrics, categories: expenseMetrics.categories }
            : undefined,
        expenses:
          activeTab === 'expenses'
            ? { ...expenseMetrics, records: recordedExpenses }
            : undefined,
        inventory:
          activeTab === 'inventory'
            ? {
                ...inventoryMetrics,
                allItems: inventoryItems,
                movements: filteredMovements
              }
            : undefined,
        rentals:
          activeTab === 'rentals'
            ? { ...rentalMetrics, completedRentals: filteredCompletedRentals }
            : undefined
      }

      if (type === 'PDF') {
        exportReportToPDF(payload)
        setExportNotice(`PDF Report (${activeTab.toUpperCase()}) successfully generated!`)
      } else {
        exportReportToExcel(payload)
        setExportNotice(`Excel Workbook (${activeTab.toUpperCase()}) successfully generated!`)
      }

      setTimeout(() => {
        setExportNotice(null)
      }, 5000)
    } catch (err: unknown) {
      console.error('Export error:', err)
      setFetchError(err instanceof Error ? err.message : 'Failed to export report')
    }
  }

  // -------------------------------------------------------------
  // Filtered Datasets based on selected date range
  // -------------------------------------------------------------
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      if (!startDate && !endDate) return true
      if (startDate && b.date < startDate) return false
      if (endDate && b.date > endDate) return false
      return true
    })
  }, [bills, startDate, endDate])

  const settledBills = useMemo(() => {
    return filteredBills.filter((b) => b.status === 'Settled')
  }, [filteredBills])

  const refundedOrCancelledBills = useMemo(() => {
    return filteredBills.filter((b) => b.status === 'Refunded' || b.status === 'Cancelled')
  }, [filteredBills])

  const filteredCompletedRentals = useMemo(() => {
    return completedRentals.filter((r) => {
      const returnDate = r.returnDate || r.startDate || ''
      if (!startDate && !endDate) return true
      if (startDate && returnDate < startDate) return false
      if (endDate && returnDate > endDate) return false
      return true
    })
  }, [completedRentals, startDate, endDate])

  const filteredMovements = useMemo(() => {
    return stockMovements.filter((m) => {
      const datePart = (m.timestamp || '').slice(0, 10)
      if (!startDate && !endDate) return true
      if (startDate && datePart < startDate) return false
      if (endDate && datePart > endDate) return false
      return true
    })
  }, [stockMovements, startDate, endDate])

  // -------------------------------------------------------------
  // Tab A: Sales Report Metrics
  // -------------------------------------------------------------
  const salesMetrics = useMemo(() => {
    const totalRestaurantSales = settledBills.reduce((acc, b) => acc + (b.total || 0), 0)
    const totalSettledCount = settledBills.length
    const averageBillValue = totalSettledCount > 0 ? totalRestaurantSales / totalSettledCount : 0

    const cashBills = settledBills.filter((b) => b.paymentMethod.toLowerCase().includes('cash'))
    const cardBills = settledBills.filter((b) => b.paymentMethod.toLowerCase().includes('card'))

    const cashSales = cashBills.reduce((acc, b) => acc + (b.total || 0), 0)
    const cardSales = cardBills.reduce((acc, b) => acc + (b.total || 0), 0)

    const dineInBills = settledBills.filter((b) => b.orderType === 'Dine-in')
    const takeawayBills = settledBills.filter((b) => b.orderType === 'Takeaway')

    const dineInSales = dineInBills.reduce((acc, b) => acc + (b.total || 0), 0)
    const takeawaySales = takeawayBills.reduce((acc, b) => acc + (b.total || 0), 0)

    const totalDiscounts = settledBills.reduce((acc, b) => acc + (b.discount || 0), 0)
    const totalServiceCharge = settledBills.reduce((acc, b) => acc + (b.serviceCharge || 0), 0)

    const refundedAmount = refundedOrCancelledBills
      .filter((b) => b.status === 'Refunded')
      .reduce((acc, b) => acc + (b.total || 0), 0)
    const cancelledCount = refundedOrCancelledBills.length

    // Product Best Sellers Aggregation
    const itemMap = new Map<
      string,
      { name: string; code: string; quantity: number; revenue: number }
    >()

    settledBills.forEach((b) => {
      b.items.forEach((item) => {
        const key = item.code || item.name
        const existing = itemMap.get(key)
        if (existing) {
          existing.quantity += item.quantity
          existing.revenue += item.total
        } else {
          itemMap.set(key, {
            name: item.name,
            code: item.code || 'N/A',
            quantity: item.quantity,
            revenue: item.total
          })
        }
      })
    })

    const bestSellers = Array.from(itemMap.values()).sort((a, b) => b.quantity - a.quantity)

    // Daily breakdown
    const dailyMap = new Map<
      string,
      {
        date: string
        billCount: number
        dineInSales: number
        takeawaySales: number
        cashSales: number
        cardSales: number
        totalSales: number
      }
    >()

    settledBills.forEach((b) => {
      const entry = dailyMap.get(b.date) || {
        date: b.date,
        billCount: 0,
        dineInSales: 0,
        takeawaySales: 0,
        cashSales: 0,
        cardSales: 0,
        totalSales: 0
      }
      entry.billCount += 1
      entry.totalSales += b.total
      if (b.orderType === 'Dine-in') entry.dineInSales += b.total
      else entry.takeawaySales += b.total
      if (b.paymentMethod.toLowerCase().includes('cash')) entry.cashSales += b.total
      else entry.cardSales += b.total

      dailyMap.set(b.date, entry)
    })

    const dailySummary = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date))

    return {
      totalRestaurantSales,
      totalSettledCount,
      averageBillValue,
      cashSales,
      cashCount: cashBills.length,
      cardSales,
      cardCount: cardBills.length,
      dineInSales,
      dineInCount: dineInBills.length,
      takeawaySales,
      takeawayCount: takeawayBills.length,
      totalDiscounts,
      totalServiceCharge,
      refundedAmount,
      cancelledCount,
      bestSellers,
      dailySummary
    }
  }, [settledBills, refundedOrCancelledBills])

  // -------------------------------------------------------------
  // Tab B: Profit & Loss Calculations
  // -------------------------------------------------------------
  const profitMetrics = useMemo(() => {
    // 1. Revenue Streams
    const restaurantRevenue = salesMetrics.totalRestaurantSales
    const rentalRevenue = filteredCompletedRentals
      .filter((r) => r.paymentStatus === 'Paid')
      .reduce((acc, r) => acc + (r.totalCharged || 0), 0)

    const totalCombinedRevenue = restaurantRevenue + rentalRevenue

    // 2. Cost of Goods Sold (COGS) Estimation
    // Cross-reference menu items (costPrice) and inventory items (unitCost)
    const costCatalog = new Map<string, number>()
    menuItems.forEach((m) => {
      if (m.code && typeof m.costPrice === 'number' && m.costPrice > 0) {
        costCatalog.set(m.code.toUpperCase(), m.costPrice)
      }
    })
    inventoryItems.forEach((inv) => {
      if (inv.code && typeof inv.unitCost === 'number' && inv.unitCost > 0) {
        if (!costCatalog.has(inv.code.toUpperCase())) {
          costCatalog.set(inv.code.toUpperCase(), inv.unitCost)
        }
      }
    })

    let knownCOGS = 0
    let totalItemsQuantitySold = 0
    let itemsWithCostQuantity = 0

    settledBills.forEach((b) => {
      b.items.forEach((item) => {
        const qty = item.quantity || 1
        totalItemsQuantitySold += qty
        const codeKey = (item.code || '').toUpperCase()
        const unitCost = costCatalog.get(codeKey)

        if (unitCost !== undefined && unitCost > 0) {
          knownCOGS += unitCost * qty
          itemsWithCostQuantity += qty
        }
      })
    })

    const costCoveragePercent =
      totalItemsQuantitySold > 0
        ? Math.round((itemsWithCostQuantity / totalItemsQuantitySold) * 100)
        : 100

    // 3. Gross Operating Profit
    const grossProfit = totalCombinedRevenue - knownCOGS
    const grossMarginPercent =
      totalCombinedRevenue > 0 ? (grossProfit / totalCombinedRevenue) * 100 : 0

    // 4. Operating Expenses
    const totalOperatingExpenses = recordedExpenses.reduce(
      (acc, exp) => acc + (exp.amount || 0),
      0
    )

    // 5. Net Operating Result
    const netOperatingResult = grossProfit - totalOperatingExpenses
    const netMarginPercent =
      totalCombinedRevenue > 0 ? (netOperatingResult / totalCombinedRevenue) * 100 : 0

    return {
      restaurantRevenue,
      rentalRevenue,
      totalCombinedRevenue,
      knownCOGS,
      costCoveragePercent,
      totalItemsQuantitySold,
      itemsWithCostQuantity,
      grossProfit,
      grossMarginPercent,
      totalOperatingExpenses,
      netOperatingResult,
      netMarginPercent
    }
  }, [salesMetrics.totalRestaurantSales, filteredCompletedRentals, menuItems, inventoryItems, settledBills, recordedExpenses])

  // -------------------------------------------------------------
  // Tab C: Expenses Breakdown Metrics
  // -------------------------------------------------------------
  const expenseMetrics = useMemo(() => {
    const totalActiveAmount = recordedExpenses.reduce((acc, e) => acc + (e.amount || 0), 0)
    const activeCount = recordedExpenses.length

    const totalCancelledAmount = cancelledExpenses.reduce((acc, e) => acc + (e.amount || 0), 0)
    const cancelledCount = cancelledExpenses.length

    // Category grouping
    const catMap = new Map<string, { category: string; amount: number; count: number }>()
    recordedExpenses.forEach((e) => {
      const entry = catMap.get(e.category) || { category: e.category, amount: 0, count: 0 }
      entry.amount += e.amount
      entry.count += 1
      catMap.set(e.category, entry)
    })

    const categories = Array.from(catMap.values()).sort((a, b) => b.amount - a.amount)

    // Payment methods grouping
    const payMap = new Map<string, { method: string; amount: number; count: number }>()
    recordedExpenses.forEach((e) => {
      const entry = payMap.get(e.paymentMethod) || { method: e.paymentMethod, amount: 0, count: 0 }
      entry.amount += e.amount
      entry.count += 1
      payMap.set(e.paymentMethod, entry)
    })

    const paymentMethods = Array.from(payMap.values()).sort((a, b) => b.amount - a.amount)

    return {
      totalActiveAmount,
      activeCount,
      totalCancelledAmount,
      cancelledCount,
      categories,
      paymentMethods
    }
  }, [recordedExpenses, cancelledExpenses])

  // -------------------------------------------------------------
  // Tab D: Inventory Metrics
  // -------------------------------------------------------------
  const inventoryMetrics = useMemo(() => {
    const totalTrackedItems = inventoryItems.length
    const lowStockItems = inventoryItems.filter((i) => i.currentQuantity <= i.reorderThreshold)
    const totalValuationAtCost = inventoryItems.reduce(
      (acc, i) => acc + i.currentQuantity * (i.unitCost || 0),
      0
    )
    const totalValuationAtRetail = inventoryItems.reduce(
      (acc, i) => acc + i.currentQuantity * (i.sellingPrice || 0),
      0
    )

    // Movements breakdown in selected period
    let purchaseCost = 0
    let purchaseUnits = 0
    let wastageCost = 0
    let wastageUnits = 0
    let adjustmentCount = 0
    let saleMovementUnits = 0

    filteredMovements.forEach((m) => {
      if (m.type === 'Purchase') {
        purchaseUnits += Math.abs(m.quantityChange)
        purchaseCost += m.totalCost || 0
      } else if (m.type === 'Wastage') {
        wastageUnits += Math.abs(m.quantityChange)
        wastageCost += m.totalCost || 0
      } else if (m.type === 'Adjustment') {
        adjustmentCount += 1
      } else if (m.type === 'Sale') {
        saleMovementUnits += Math.abs(m.quantityChange)
      }
    })

    return {
      totalTrackedItems,
      lowStockItems,
      totalValuationAtCost,
      totalValuationAtRetail,
      movementsCount: filteredMovements.length,
      purchaseCost,
      purchaseUnits,
      wastageCost,
      wastageUnits,
      adjustmentCount,
      saleMovementUnits
    }
  }, [inventoryItems, filteredMovements])

  // -------------------------------------------------------------
  // Tab E: Surfboard Rentals Metrics
  // -------------------------------------------------------------
  const rentalMetrics = useMemo(() => {
    const completedPaid = filteredCompletedRentals.filter((r) => r.paymentStatus === 'Paid')
    const totalRentalRevenue = completedPaid.reduce((acc, r) => acc + (r.totalCharged || 0), 0)
    const totalCompletedCount = filteredCompletedRentals.length

    const totalMinutes = completedPaid.reduce((acc, r) => acc + (r.durationMinutes || 0), 0)
    const avgDurationMins = completedPaid.length > 0 ? Math.round(totalMinutes / completedPaid.length) : 0

    // Board-level usage ranking
    const boardUsageMap = new Map<
      string,
      {
        boardName: string
        category: string
        rentalCount: number
        totalMinutes: number
        totalRevenue: number
      }
    >()

    completedPaid.forEach((r) => {
      const entry = boardUsageMap.get(r.boardName) || {
        boardName: r.boardName,
        category: r.boardCategory || 'Surfboard',
        rentalCount: 0,
        totalMinutes: 0,
        totalRevenue: 0
      }
      entry.rentalCount += 1
      entry.totalMinutes += r.durationMinutes || 0
      entry.totalRevenue += r.totalCharged || 0
      boardUsageMap.set(r.boardName, entry)
    })

    const boardRankings = Array.from(boardUsageMap.values()).sort(
      (a, b) => b.totalRevenue - a.totalRevenue
    )

    return {
      totalRentalRevenue,
      totalCompletedCount,
      activeRentalsCount: activeRentals.length,
      avgDurationMins,
      boardRankings,
      totalFleetCount: surfboards.length
    }
  }, [filteredCompletedRentals, activeRentals, surfboards])

  return (
    <div className="reports-page-wrapper">
      {/* Page Header */}
      <header className="reports-top-header">
        <div className="reports-header-text">
          <div className="reports-header-badge">
            <IconReports size={14} />
            <span>OPERATIONAL INTELLIGENCE & AUDITS</span>
          </div>
          <h1 className="reports-title">Reports & Business Analytics</h1>
          <p className="reports-subtitle">
            Audited financial breakdown, department revenues, inventory movement, and beach club performance.
          </p>
        </div>

        {/* Global Actions */}
        <div className="reports-header-actions">
          <button
            type="button"
            className="reports-btn reports-btn-outline"
            onClick={() => void loadReportsData()}
            disabled={isLoading}
            title="Reload live database data"
          >
            <IconRotateCcw
              size={14}
              style={isLoading ? { animation: 'spin 1s linear infinite' } : undefined}
            />
            <span>{isLoading ? 'Loading...' : 'Refresh Data'}</span>
          </button>

          <button
            type="button"
            className="reports-btn reports-btn-secondary"
            onClick={() => handleExportClick('Excel')}
            title="Export structured spreadsheet"
          >
            <span>Export Excel</span>
          </button>

          <button
            type="button"
            className="reports-btn reports-btn-primary"
            onClick={() => handleExportClick('PDF')}
            title="Export print-ready PDF document"
          >
            <span>Export PDF</span>
          </button>
        </div>
      </header>

      {/* Export Phase 4 Notice */}
      {exportNotice && (
        <div className="reports-notice-banner" role="status">
          <IconInfo size={16} />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* Error Banner */}
      {fetchError && (
        <div className="reports-error-banner" role="alert">
          <IconAlertTriangle size={16} />
          <span>{fetchError}</span>
        </div>
      )}

      {/* Unified Date Filtering Toolbar */}
      <section className="reports-filter-toolbar" aria-label="Date Range Controls">
        <div className="filter-presets-group">
          <span className="filter-group-label">Date Range:</span>
          <button
            type="button"
            className={`preset-chip ${datePreset === 'today' ? 'preset-chip-active' : ''}`}
            onClick={() => handlePresetChange('today')}
          >
            Today
          </button>
          <button
            type="button"
            className={`preset-chip ${datePreset === 'this_month' ? 'preset-chip-active' : ''}`}
            onClick={() => handlePresetChange('this_month')}
          >
            This Month
          </button>
          <button
            type="button"
            className={`preset-chip ${datePreset === 'last_30_days' ? 'preset-chip-active' : ''}`}
            onClick={() => handlePresetChange('last_30_days')}
          >
            Last 30 Days
          </button>
          <button
            type="button"
            className={`preset-chip ${datePreset === 'all' ? 'preset-chip-active' : ''}`}
            onClick={() => handlePresetChange('all')}
          >
            All Time
          </button>
        </div>

        {/* Custom Range Picker */}
        <div className="filter-custom-group">
          <div className="date-input-field">
            <label htmlFor="report-from-date">From</label>
            <input
              id="report-from-date"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setDatePreset('custom')
              }}
              max={endDate || getTodayStr()}
            />
          </div>

          <div className="date-input-field">
            <label htmlFor="report-to-date">To</label>
            <input
              id="report-to-date"
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setDatePreset('custom')
              }}
              min={startDate}
              max={getTodayStr()}
            />
          </div>

          <button
            type="button"
            className="reports-btn-reset"
            onClick={handleResetFilters}
            title="Reset to default This Month"
          >
            <IconFilter size={13} />
            <span>Reset</span>
          </button>
        </div>
      </section>

      {/* Report Module Navigation Tabs */}
      <nav className="reports-nav-tabs" aria-label="Reports Modules">
        <button
          type="button"
          className={`report-tab-btn ${activeTab === 'sales' ? 'report-tab-active' : ''}`}
          onClick={() => setActiveTab('sales')}
        >
          <IconSales size={16} />
          <span>Sales Report</span>
        </button>

        <button
          type="button"
          className={`report-tab-btn ${activeTab === 'profit' ? 'report-tab-active' : ''}`}
          onClick={() => setActiveTab('profit')}
        >
          <IconProfit size={16} />
          <span>Profit & Loss</span>
        </button>

        <button
          type="button"
          className={`report-tab-btn ${activeTab === 'expenses' ? 'report-tab-active' : ''}`}
          onClick={() => setActiveTab('expenses')}
        >
          <IconExpenses size={16} />
          <span>Expenses Report</span>
        </button>

        <button
          type="button"
          className={`report-tab-btn ${activeTab === 'inventory' ? 'report-tab-active' : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          <IconInventory size={16} />
          <span>Inventory Snapshot & Logs</span>
        </button>

        <button
          type="button"
          className={`report-tab-btn ${activeTab === 'rentals' ? 'report-tab-active' : ''}`}
          onClick={() => setActiveTab('rentals')}
        >
          <IconSurfboard size={16} />
          <span>Surfboard Rentals</span>
        </button>
      </nav>

      {/* ========================================================= */}
      {/* TAB A: SALES REPORT */}
      {/* ========================================================= */}
      {activeTab === 'sales' && (
        <div className="report-tab-content">
          {/* KPI Summary Grid */}
          <div className="reports-kpi-grid">
            <div className="report-kpi-card report-kpi-primary">
              <div className="kpi-header">
                <span className="kpi-title">Restaurant Net Sales</span>
                <span className="kpi-icon-pill kpi-icon-teal">
                  <IconCheck size={16} />
                </span>
              </div>
              <div className="kpi-value">{formatLKR(salesMetrics.totalRestaurantSales)}</div>
              <div className="kpi-subtext">
                From {salesMetrics.totalSettledCount} settled transactions
              </div>
            </div>

            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Average Bill Value</span>
                <span className="kpi-icon-pill">
                  <IconReceipt size={16} />
                </span>
              </div>
              <div className="kpi-value">{formatLKR(salesMetrics.averageBillValue)}</div>
              <div className="kpi-subtext">Per completed restaurant order</div>
            </div>

            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Cash vs Card</span>
                <span className="kpi-icon-pill">
                  <IconCash size={16} />
                </span>
              </div>
              <div className="kpi-dual-values">
                <div>
                  <span className="dual-label">Cash:</span> {formatLKR(salesMetrics.cashSales)}
                </div>
                <div>
                  <span className="dual-label">Card:</span> {formatLKR(salesMetrics.cardSales)}
                </div>
              </div>
              <div className="kpi-subtext">
                {salesMetrics.cashCount} cash · {salesMetrics.cardCount} card
              </div>
            </div>

            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Order Type Breakdown</span>
                <span className="kpi-icon-pill">
                  <IconUtensils size={16} />
                </span>
              </div>
              <div className="kpi-dual-values">
                <div>
                  <span className="dual-label">Dine-in:</span> {formatLKR(salesMetrics.dineInSales)}
                </div>
                <div>
                  <span className="dual-label">Takeaway:</span> {formatLKR(salesMetrics.takeawaySales)}
                </div>
              </div>
              <div className="kpi-subtext">
                {salesMetrics.dineInCount} dine-in · {salesMetrics.takeawayCount} takeaway
              </div>
            </div>
          </div>

          {/* Refunded & Cancelled Notice Banner */}
          {salesMetrics.cancelledCount > 0 && (
            <div className="reports-audit-alert">
              <IconInfo size={16} />
              <div>
                <strong>Audit Notice:</strong> {salesMetrics.cancelledCount} bill(s) marked as
                Refunded or Cancelled in this period (Totaling {formatLKR(salesMetrics.refundedAmount)}
                ). In accordance with standard accounting, these amounts are excluded from net sales.
              </div>
            </div>
          )}

          {/* Two-Column Section: Best Sellers & Daily Sales */}
          <div className="reports-split-section">
            {/* Best Selling Products */}
            <div className="reports-card-panel">
              <div className="panel-header">
                <h3 className="panel-title">Top Selling Menu Items</h3>
                <span className="panel-badge">{salesMetrics.bestSellers.length} products</span>
              </div>
              <div className="reports-table-container">
                <table className="reports-data-table">
                  <thead>
                    <tr>
                      <th>Product Name</th>
                      <th>Code</th>
                      <th className="num-col">Qty Sold</th>
                      <th className="num-col">Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesMetrics.bestSellers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="empty-table-cell">
                          No sales recorded in the selected date range.
                        </td>
                      </tr>
                    ) : (
                      salesMetrics.bestSellers.map((item, idx) => (
                        <tr key={item.code + idx}>
                          <td className="font-semibold">{item.name}</td>
                          <td>
                            <span className="code-pill">{item.code}</span>
                          </td>
                          <td className="num-col">{item.quantity}</td>
                          <td className="num-col font-semibold">{formatLKR(item.revenue)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Daily Sales Breakdown */}
            <div className="reports-card-panel">
              <div className="panel-header">
                <h3 className="panel-title">Daily Sales Summary</h3>
                <span className="panel-badge">{salesMetrics.dailySummary.length} days active</span>
              </div>
              <div className="reports-table-container">
                <table className="reports-data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="num-col">Bills</th>
                      <th className="num-col">Cash</th>
                      <th className="num-col">Card</th>
                      <th className="num-col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesMetrics.dailySummary.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="empty-table-cell">
                          No sales recorded in this period.
                        </td>
                      </tr>
                    ) : (
                      salesMetrics.dailySummary.map((d) => (
                        <tr key={d.date}>
                          <td className="font-mono">{d.date}</td>
                          <td className="num-col">{d.billCount}</td>
                          <td className="num-col">{formatLKR(d.cashSales)}</td>
                          <td className="num-col">{formatLKR(d.cardSales)}</td>
                          <td className="num-col font-semibold text-teal">
                            {formatLKR(d.totalSales)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB B: PROFIT & LOSS REPORT */}
      {/* ========================================================= */}
      {activeTab === 'profit' && (
        <div className="report-tab-content">
          {/* Transparency & Cost Coverage Disclosure */}
          <div className="reports-disclosure-banner">
            <IconInfo size={18} />
            <div>
              <div className="disclosure-title">
                Product Cost Coverage & Baseline Accounting Disclosure
              </div>
              <div className="disclosure-text">
                Cost of Goods Sold (COGS) is calculated based on current active catalog unit costs
                (Menu Items & Inventory Items). Historical supplier purchase fluctuations on past
                orders are not stored on individual bill items. Current cost coverage for settled
                items in this period is <strong>{profitMetrics.costCoveragePercent}%</strong> (
                {profitMetrics.itemsWithCostQuantity} of {profitMetrics.totalItemsQuantitySold} units
                sold have configured costs). Items without configured costs calculate at Rs. 0.00
                cost.
              </div>
            </div>
          </div>

          {/* Profit Summary KPIs */}
          <div className="reports-kpi-grid">
            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Total Operating Revenue</span>
                <span className="kpi-icon-pill">
                  <IconSales size={16} />
                </span>
              </div>
              <div className="kpi-value text-teal">
                {formatLKR(profitMetrics.totalCombinedRevenue)}
              </div>
              <div className="kpi-subtext">
                Restaurant: {formatLKR(profitMetrics.restaurantRevenue)} · Rentals:{' '}
                {formatLKR(profitMetrics.rentalRevenue)}
              </div>
            </div>

            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Catalog COGS (Est.)</span>
                <span className="kpi-icon-pill">
                  <IconInventory size={16} />
                </span>
              </div>
              <div className="kpi-value text-rose">{formatLKR(profitMetrics.knownCOGS)}</div>
              <div className="kpi-subtext">
                {profitMetrics.costCoveragePercent}% item cost coverage
              </div>
            </div>

            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Gross Operating Profit</span>
                <span className="kpi-icon-pill">
                  <IconProfit size={16} />
                </span>
              </div>
              <div className="kpi-value">{formatLKR(profitMetrics.grossProfit)}</div>
              <div className="kpi-subtext">
                Gross Margin: {profitMetrics.grossMarginPercent.toFixed(1)}%
              </div>
            </div>

            <div
              className={`report-kpi-card ${profitMetrics.netOperatingResult >= 0 ? 'report-kpi-positive' : 'report-kpi-negative'}`}
            >
              <div className="kpi-header">
                <span className="kpi-title">Net Operating Result</span>
                <span className="kpi-icon-pill">
                  <IconCheck size={16} />
                </span>
              </div>
              <div className="kpi-value">{formatLKR(profitMetrics.netOperatingResult)}</div>
              <div className="kpi-subtext">
                After {formatLKR(profitMetrics.totalOperatingExpenses)} in operating expenses
              </div>
            </div>
          </div>

          {/* Structured Income Statement Panel */}
          <div className="reports-card-panel">
            <div className="panel-header">
              <h3 className="panel-title">Club Operating Performance Statement</h3>
              <span className="panel-badge">
                {startDate || 'Start'} to {endDate || 'Present'}
              </span>
            </div>

            <table className="reports-statement-table">
              <tbody>
                <tr className="statement-section-heading">
                  <td colSpan={2}>1. REVENUE STREAMS</td>
                </tr>
                <tr>
                  <td className="indent-1">Restaurant & Cafe Sales (Settled Bills)</td>
                  <td className="num-col">{formatLKR(profitMetrics.restaurantRevenue)}</td>
                </tr>
                <tr>
                  <td className="indent-1">Surfboard Rentals (Completed & Paid)</td>
                  <td className="num-col">{formatLKR(profitMetrics.rentalRevenue)}</td>
                </tr>
                <tr className="statement-subtotal-row">
                  <td>TOTAL COMBINED OPERATING REVENUE</td>
                  <td className="num-col font-bold">
                    {formatLKR(profitMetrics.totalCombinedRevenue)}
                  </td>
                </tr>

                <tr className="statement-section-heading">
                  <td colSpan={2}>2. DIRECT COST OF GOODS SOLD</td>
                </tr>
                <tr>
                  <td className="indent-1">
                    Catalog Cost of Goods Sold (Sold Items with Recorded Cost)
                  </td>
                  <td className="num-col text-rose">({formatLKR(profitMetrics.knownCOGS)})</td>
                </tr>
                <tr className="statement-subtotal-row statement-highlight">
                  <td>GROSS OPERATING PROFIT (Revenue minus COGS)</td>
                  <td className="num-col font-bold text-teal">
                    {formatLKR(profitMetrics.grossProfit)}
                  </td>
                </tr>

                <tr className="statement-section-heading">
                  <td colSpan={2}>3. RECORDED OPERATING EXPENSES</td>
                </tr>
                {expenseMetrics.categories.length === 0 ? (
                  <tr>
                    <td className="indent-1 text-muted">No operating expenses recorded</td>
                    <td className="num-col">Rs. 0.00</td>
                  </tr>
                ) : (
                  expenseMetrics.categories.map((c) => (
                    <tr key={c.category}>
                      <td className="indent-1">{c.category}</td>
                      <td className="num-col">({formatLKR(c.amount)})</td>
                    </tr>
                  ))
                )}
                <tr className="statement-subtotal-row">
                  <td>TOTAL OPERATING EXPENSES</td>
                  <td className="num-col font-bold text-rose">
                    ({formatLKR(profitMetrics.totalOperatingExpenses)})
                  </td>
                </tr>

                <tr className="statement-total-row">
                  <td>NET OPERATING RESULT (Gross Profit minus Expenses)</td>
                  <td
                    className={`num-col font-bold ${profitMetrics.netOperatingResult >= 0 ? 'text-teal' : 'text-rose'}`}
                  >
                    {formatLKR(profitMetrics.netOperatingResult)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB C: EXPENSES REPORT */}
      {/* ========================================================= */}
      {activeTab === 'expenses' && (
        <div className="report-tab-content">
          <div className="reports-kpi-grid">
            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Total Active Expenses</span>
                <span className="kpi-icon-pill">
                  <IconExpenses size={16} />
                </span>
              </div>
              <div className="kpi-value text-rose">
                {formatLKR(expenseMetrics.totalActiveAmount)}
              </div>
              <div className="kpi-subtext">{expenseMetrics.activeCount} recorded transactions</div>
            </div>

            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Active Categories</span>
                <span className="kpi-icon-pill">
                  <IconFilter size={16} />
                </span>
              </div>
              <div className="kpi-value">{expenseMetrics.categories.length}</div>
              <div className="kpi-subtext">Expenditure departments</div>
            </div>

            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Cancelled Expenses (Audited)</span>
                <span className="kpi-icon-pill">
                  <IconAlertTriangle size={16} />
                </span>
              </div>
              <div className="kpi-value">{formatLKR(expenseMetrics.totalCancelledAmount)}</div>
              <div className="kpi-subtext">
                {expenseMetrics.cancelledCount} cancelled (excluded from totals)
              </div>
            </div>
          </div>

          <div className="reports-split-section">
            {/* Grouped by Category */}
            <div className="reports-card-panel">
              <div className="panel-header">
                <h3 className="panel-title">Expenses by Category</h3>
                <span className="panel-badge">{expenseMetrics.categories.length} categories</span>
              </div>
              <div className="reports-table-container">
                <table className="reports-data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="num-col">Records</th>
                      <th className="num-col">Amount</th>
                      <th className="num-col">% Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseMetrics.categories.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="empty-table-cell">
                          No active expenses found for this period.
                        </td>
                      </tr>
                    ) : (
                      expenseMetrics.categories.map((c) => {
                        const pct =
                          expenseMetrics.totalActiveAmount > 0
                            ? (c.amount / expenseMetrics.totalActiveAmount) * 100
                            : 0
                        return (
                          <tr key={c.category}>
                            <td className="font-semibold">{c.category}</td>
                            <td className="num-col">{c.count}</td>
                            <td className="num-col">{formatLKR(c.amount)}</td>
                            <td className="num-col font-mono">{pct.toFixed(1)}%</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Method Distribution */}
            <div className="reports-card-panel">
              <div className="panel-header">
                <h3 className="panel-title">Payment Method Breakdown</h3>
                <span className="panel-badge">{expenseMetrics.paymentMethods.length} methods</span>
              </div>
              <div className="reports-table-container">
                <table className="reports-data-table">
                  <thead>
                    <tr>
                      <th>Payment Method</th>
                      <th className="num-col">Count</th>
                      <th className="num-col">Total Outflow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseMetrics.paymentMethods.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="empty-table-cell">
                          No expense payment records found.
                        </td>
                      </tr>
                    ) : (
                      expenseMetrics.paymentMethods.map((p) => (
                        <tr key={p.method}>
                          <td className="font-semibold">{p.method}</td>
                          <td className="num-col">{p.count}</td>
                          <td className="num-col font-semibold">{formatLKR(p.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Detailed Expense Log */}
          <div className="reports-card-panel">
            <div className="panel-header">
              <h3 className="panel-title">Expense Transactions Log</h3>
              <span className="panel-badge">{recordedExpenses.length} records</span>
            </div>
            <div className="reports-table-container">
              <table className="reports-data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Payment Method</th>
                    <th>Recorded By</th>
                    <th className="num-col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recordedExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty-table-cell">
                        No recorded expenses in this date range.
                      </td>
                    </tr>
                  ) : (
                    recordedExpenses.map((e) => (
                      <tr key={e.id}>
                        <td className="font-mono">{e.date}</td>
                        <td className="font-semibold">{e.description}</td>
                        <td>
                          <span className="category-pill">{e.category}</span>
                        </td>
                        <td>{e.paymentMethod}</td>
                        <td className="text-muted">{e.recordedBy}</td>
                        <td className="num-col font-semibold text-rose">{formatLKR(e.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB D: INVENTORY REPORT */}
      {/* ========================================================= */}
      {activeTab === 'inventory' && (
        <div className="report-tab-content">
          {/* Inventory Disclaimer */}
          <div className="reports-disclosure-banner">
            <IconInfo size={18} />
            <div>
              <div className="disclosure-title">Current Warehouse Snapshot Notice</div>
              <div className="disclosure-text">
                Stock balances below reflect the live warehouse snapshot as of today. Historical
                end-of-day balances are not stored in database snapshots. Period activity
                (Purchases, Wastage, Adjustments, POS Sales) is tracked using timestamped stock
                movements.
              </div>
            </div>
          </div>

          <div className="reports-kpi-grid">
            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Current Inventory Value</span>
                <span className="kpi-icon-pill">
                  <IconInventory size={16} />
                </span>
              </div>
              <div className="kpi-value">{formatLKR(inventoryMetrics.totalValuationAtCost)}</div>
              <div className="kpi-subtext">
                Retail value: {formatLKR(inventoryMetrics.totalValuationAtRetail)}
              </div>
            </div>

            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Low Stock Alert</span>
                <span className="kpi-icon-pill kpi-icon-amber">
                  <IconAlertTriangle size={16} />
                </span>
              </div>
              <div className="kpi-value text-amber">
                {inventoryMetrics.lowStockItems.length} items
              </div>
              <div className="kpi-subtext">Below safety reorder threshold</div>
            </div>

            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Period Wastage</span>
                <span className="kpi-icon-pill kpi-icon-rose">
                  <IconAlertTriangle size={16} />
                </span>
              </div>
              <div className="kpi-value text-rose">{formatLKR(inventoryMetrics.wastageCost)}</div>
              <div className="kpi-subtext">
                {inventoryMetrics.wastageUnits} units written off
              </div>
            </div>

            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Period Purchases</span>
                <span className="kpi-icon-pill">
                  <IconCheck size={16} />
                </span>
              </div>
              <div className="kpi-value">{formatLKR(inventoryMetrics.purchaseCost)}</div>
              <div className="kpi-subtext">
                {inventoryMetrics.purchaseUnits} units restocked
              </div>
            </div>
          </div>

          {/* Low Stock Items Priority Table */}
          {inventoryMetrics.lowStockItems.length > 0 && (
            <div className="reports-card-panel">
              <div className="panel-header">
                <h3 className="panel-title">Low Stock & Reorder Requirements</h3>
                <span className="panel-badge badge-warning">
                  {inventoryMetrics.lowStockItems.length} require action
                </span>
              </div>
              <div className="reports-table-container">
                <table className="reports-data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Code</th>
                      <th>Category</th>
                      <th className="num-col">Current Stock</th>
                      <th className="num-col">Reorder Level</th>
                      <th className="num-col">Unit Cost</th>
                      <th>Supplier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryMetrics.lowStockItems.map((item) => (
                      <tr key={item.id}>
                        <td className="font-semibold text-amber">{item.productName}</td>
                        <td>
                          <span className="code-pill">{item.code}</span>
                        </td>
                        <td>{item.category}</td>
                        <td className="num-col font-bold text-rose">
                          {item.currentQuantity} {item.unit}
                        </td>
                        <td className="num-col">{item.reorderThreshold}</td>
                        <td className="num-col">{formatLKR(item.unitCost)}</td>
                        <td className="text-muted">{item.supplier || 'Primary Supplier'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stock Movements Log in Period */}
          <div className="reports-card-panel">
            <div className="panel-header">
              <h3 className="panel-title">Stock Movements Log</h3>
              <span className="panel-badge">{filteredMovements.length} log entries</span>
            </div>
            <div className="reports-table-container">
              <table className="reports-data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Product</th>
                    <th>Type</th>
                    <th className="num-col">Qty Change</th>
                    <th className="num-col">Balance After</th>
                    <th>Reason / Performed By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty-table-cell">
                        No inventory movements recorded in this period.
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((m) => (
                      <tr key={m.id}>
                        <td className="font-mono text-muted">
                          {(m.timestamp || '').slice(0, 16).replace('T', ' ')}
                        </td>
                        <td className="font-semibold">{m.productName}</td>
                        <td>
                          <span
                            className={`movement-pill movement-${(m.type || '').toLowerCase()}`}
                          >
                            {m.type}
                          </span>
                        </td>
                        <td
                          className={`num-col font-semibold ${m.quantityChange < 0 ? 'text-rose' : 'text-teal'}`}
                        >
                          {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                        </td>
                        <td className="num-col font-mono">{m.balanceAfter}</td>
                        <td>
                          {m.reason} {m.performedBy ? `(${m.performedBy})` : ''}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB E: SURFBOARD RENTALS REPORT */}
      {/* ========================================================= */}
      {activeTab === 'rentals' && (
        <div className="report-tab-content">
          <div className="reports-kpi-grid">
            <div className="report-kpi-card report-kpi-primary">
              <div className="kpi-header">
                <span className="kpi-title">Rental Revenue (Paid)</span>
                <span className="kpi-icon-pill kpi-icon-teal">
                  <IconSurfboard size={16} />
                </span>
              </div>
              <div className="kpi-value">{formatLKR(rentalMetrics.totalRentalRevenue)}</div>
              <div className="kpi-subtext">
                From {rentalMetrics.totalCompletedCount} completed rental sessions
              </div>
            </div>

            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Average Session Duration</span>
                <span className="kpi-icon-pill">
                  <IconClock size={16} />
                </span>
              </div>
              <div className="kpi-value">{rentalMetrics.avgDurationMins} mins</div>
              <div className="kpi-subtext">Average on-water surfboard time</div>
            </div>

            <div className="report-kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Active Fleet Status</span>
                <span className="kpi-icon-pill">
                  <IconCheck size={16} />
                </span>
              </div>
              <div className="kpi-value">{rentalMetrics.activeRentalsCount} out now</div>
              <div className="kpi-subtext">{rentalMetrics.totalFleetCount} total boards in club fleet</div>
            </div>
          </div>

          {/* Active Rentals Live Card (Separate from Completed) */}
          {activeRentals.length > 0 && (
            <div className="reports-card-panel">
              <div className="panel-header">
                <h3 className="panel-title">Active Surfboard Rentals (Currently on Water)</h3>
                <span className="panel-badge badge-info">{activeRentals.length} active</span>
              </div>
              <div className="reports-table-container">
                <table className="reports-data-table">
                  <thead>
                    <tr>
                      <th>Customer Name</th>
                      <th>Board</th>
                      <th>Category</th>
                      <th>Checked Out At</th>
                      <th>Agreed Rate</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRentals.map((r) => (
                      <tr key={r.id}>
                        <td className="font-semibold">{r.customerName}</td>
                        <td>{r.boardName}</td>
                        <td className="text-muted">{r.boardCategory}</td>
                        <td className="font-mono">
                          {r.startDate} {r.startTime}
                        </td>
                        <td>{formatLKR(r.agreedHourlyRate)}/hr</td>
                        <td>
                          <span className="status-active-pill">Active on Water</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Board-Level Usage & Performance Ranking */}
          <div className="reports-card-panel">
            <div className="panel-header">
              <h3 className="panel-title">Board-Level Utilization & Revenue Ranking</h3>
              <span className="panel-badge">{rentalMetrics.boardRankings.length} boards used</span>
            </div>
            <div className="reports-table-container">
              <table className="reports-data-table">
                <thead>
                  <tr>
                    <th>Board Name</th>
                    <th>Category</th>
                    <th className="num-col">Times Rented</th>
                    <th className="num-col">Total Minutes</th>
                    <th className="num-col">Revenue Generated</th>
                  </tr>
                </thead>
                <tbody>
                  {rentalMetrics.boardRankings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty-table-cell">
                        No completed surfboard rentals in the selected period.
                      </td>
                    </tr>
                  ) : (
                    rentalMetrics.boardRankings.map((b) => (
                      <tr key={b.boardName}>
                        <td className="font-semibold">{b.boardName}</td>
                        <td className="text-muted">{b.category}</td>
                        <td className="num-col">{b.rentalCount}</td>
                        <td className="num-col">{b.totalMinutes}m</td>
                        <td className="num-col font-semibold text-teal">
                          {formatLKR(b.totalRevenue)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Completed Rentals History Table */}
          <div className="reports-card-panel">
            <div className="panel-header">
              <h3 className="panel-title">Completed Rentals History</h3>
              <span className="panel-badge">{filteredCompletedRentals.length} sessions</span>
            </div>
            <div className="reports-table-container">
              <table className="reports-data-table">
                <thead>
                  <tr>
                    <th>Receipt #</th>
                    <th>Return Date & Time</th>
                    <th>Customer</th>
                    <th>Board</th>
                    <th>Duration</th>
                    <th>Payment</th>
                    <th className="num-col">Total Charged</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompletedRentals.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-table-cell">
                        No completed rental records found for this period.
                      </td>
                    </tr>
                  ) : (
                    filteredCompletedRentals.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span className="code-pill">{r.receiptNumber}</span>
                        </td>
                        <td className="font-mono text-muted">
                          {r.returnDate} {r.returnTime}
                        </td>
                        <td className="font-semibold">{r.customerName}</td>
                        <td>{r.boardName}</td>
                        <td>{r.durationDisplay || `${r.durationMinutes}m`}</td>
                        <td>{r.paymentMethod}</td>
                        <td className="num-col font-semibold text-teal">
                          {formatLKR(r.totalCharged)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
