import React, { useEffect, useMemo, useState } from 'react'
import { formatLKR } from '../data/demoData'
import { getBills, updateBillStatus } from '../services/api'
import { BillOrderType, BillStatus, HistoryBill, NavigationPage } from '../types'
import { ProfessionalReceipt } from './ProfessionalReceipt'
import { downloadBillPDF } from '../utils/billPdfGenerator'
import {
  IconAlertTriangle,
  IconCard,
  IconCash,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconDownload,
  IconEye,
  IconFilter,
  IconInfo,
  IconPrinter,
  IconReceipt,
  IconRotateCcw,
  IconSearch,
  IconUtensils,
  IconX
} from './Icons'

interface BillHistoryProps {
  onNavigate: (page: NavigationPage) => void
}

type DateRangeFilter = 'All' | 'Today' | 'Yesterday' | 'Last 7 Days' | 'This Month'
type PaymentFilter = 'All' | 'Cash' | 'Card' | 'Split'
type OrderTypeFilter = 'All' | BillOrderType
type StatusFilter = 'All' | BillStatus

export const BillHistory: React.FC<BillHistoryProps> = ({ onNavigate }) => {
  // Live bills loaded from MongoDB Atlas
  const [bills, setBills] = useState<HistoryBill[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isRefunding, setIsRefunding] = useState<boolean>(false)

  // Filters State
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRangeFilter>('All')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('All')
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderTypeFilter>('All')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')

  // Pagination State
  const [currentPageNum, setCurrentPageNum] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(8)

  // Modals State
  const [selectedBill, setSelectedBill] = useState<HistoryBill | null>(null)
  const [reprintBill, setReprintBill] = useState<HistoryBill | null>(null)
  const [kotBill, setKotBill] = useState<HistoryBill | null>(null)
  const [refundCandidate, setRefundCandidate] = useState<HistoryBill | null>(null)
  const [refundReason, setRefundReason] = useState<string>('Guest request / order change')
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string): void => {
    setToast(msg)
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr))
    }, 4000)
  }

  const handleDownloadBill = (bill: HistoryBill): void => {
    try {
      downloadBillPDF(bill)
      showToast(`Bill #${bill.billNumber} downloaded as PDF!`)
    } catch (err) {
      console.error('Failed to download bill:', err)
      showToast('Could not download PDF bill.')
    }
  }

  // Load bills from MongoDB Atlas
  const loadBills = async (): Promise<void> => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const data = await getBills()
      setBills(data)
    } catch (err: unknown) {
      console.error('Failed to load bills:', err)
      const msg = err instanceof Error ? err.message : 'Could not load bills'
      setFetchError(msg)
      showToast('Could not load bill records from database.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false

    async function initLoad(): Promise<void> {
      try {
        const data = await getBills()
        if (!ignore) {
          setBills(data)
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Failed to load bills:', err)
          const msg = err instanceof Error ? err.message : 'Could not load bills'
          setFetchError(msg)
          showToast('Could not load bill records from database.')
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    initLoad()

    return () => {
      ignore = true
    }
  }, [])

  const [todayStr] = useState<string>(() => new Date().toISOString().split('T')[0])

  const dateThresholds = useMemo(() => {
    const d = new Date(todayStr + 'T00:00:00')
    const y = new Date(d)
    y.setDate(y.getDate() - 1)
    const yesterdayStr = y.toISOString().split('T')[0]
    const s = new Date(d)
    s.setDate(s.getDate() - 7)
    const sevenDaysStr = s.toISOString().split('T')[0]
    const monthPrefix = todayStr.slice(0, 7)
    return { today: todayStr, yesterday: yesterdayStr, last7Days: sevenDaysStr, monthPrefix }
  }, [todayStr])

  // Filtered Bills Calculation
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      // Search matching bill number, items, cashier, or sale type
      const matchesSearch =
        searchQuery.trim() === '' ||
        b.billNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.cashier.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.saleType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.items.some((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))

      // Date Range Filter (Dynamic based on system date)
      let matchesDate = true
      if (dateRange === 'Today') {
        matchesDate = b.date === dateThresholds.today
      } else if (dateRange === 'Yesterday') {
        matchesDate = b.date === dateThresholds.yesterday
      } else if (dateRange === 'Last 7 Days') {
        matchesDate = b.date >= dateThresholds.last7Days && b.date <= dateThresholds.today
      } else if (dateRange === 'This Month') {
        matchesDate = b.date.startsWith(dateThresholds.monthPrefix)
      }

      // Payment Filter
      let matchesPayment = true
      if (paymentFilter === 'Cash') {
        matchesPayment =
          b.paymentMethod === 'Cash' ||
          (!b.paymentMethod.toLowerCase().includes('split') &&
            b.paymentMethod.toLowerCase().includes('cash'))
      } else if (paymentFilter === 'Card') {
        matchesPayment =
          !b.paymentMethod.toLowerCase().includes('split') &&
          b.paymentMethod.startsWith('Card')
      } else if (paymentFilter === 'Split') {
        matchesPayment =
          b.paymentMethod.toLowerCase().includes('split') ||
          ((b.splitCashAmount ?? 0) > 0 && (b.splitCardAmount ?? 0) > 0)
      }

      // Order Type Filter
      const matchesOrderType = orderTypeFilter === 'All' || b.orderType === orderTypeFilter

      // Status Filter
      const matchesStatus = statusFilter === 'All' || b.status === statusFilter

      return matchesSearch && matchesDate && matchesPayment && matchesOrderType && matchesStatus
    })
  }, [bills, searchQuery, dateRange, paymentFilter, orderTypeFilter, statusFilter])

  // Summary Metrics based strictly on filtered dataset
  const summaryMetrics = useMemo(() => {
    const totalCount = filteredBills.length
    const settledBills = filteredBills.filter((b) => b.status === 'Settled')
    const totalSales = settledBills.reduce((sum, b) => sum + b.total, 0)
    const cashSales = settledBills.reduce((sum, b) => {
      if (b.splitCashAmount !== undefined && b.splitCashAmount > 0) {
        return sum + b.splitCashAmount
      }
      if (
        b.paymentMethod.toLowerCase().includes('cash') &&
        !b.paymentMethod.toLowerCase().includes('split')
      ) {
        return sum + b.total
      }
      return sum
    }, 0)
    const cardSales = settledBills.reduce((sum, b) => {
      if (b.splitCardAmount !== undefined && b.splitCardAmount > 0) {
        return sum + b.splitCardAmount
      }
      if (
        b.paymentMethod.toLowerCase().includes('card') &&
        !b.paymentMethod.toLowerCase().includes('split')
      ) {
        return sum + b.total
      }
      return sum
    }, 0)

    return { totalCount, totalSales, cashSales, cardSales }
  }, [filteredBills])

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredBills.length / pageSize))
  const paginatedBills = useMemo(() => {
    const start = (currentPageNum - 1) * pageSize
    return filteredBills.slice(start, start + pageSize)
  }, [filteredBills, currentPageNum, pageSize])

  // Reset pagination when filters change
  const handleFilterChange = (setter: () => void): void => {
    setter()
    setCurrentPageNum(1)
  }

  const resetAllFilters = (): void => {
    setSearchQuery('')
    setDateRange('All')
    setPaymentFilter('All')
    setOrderTypeFilter('All')
    setStatusFilter('All')
    setCurrentPageNum(1)
    showToast('Filters reset to default')
  }

  // Handle Refund in MongoDB Atlas
  const handleConfirmRefund = async (): Promise<void> => {
    if (!refundCandidate || isRefunding) return

    setIsRefunding(true)
    const nowTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })

    try {
      await updateBillStatus(refundCandidate.id, 'Refunded', refundReason)

      setBills((prev) =>
        prev.map((b) =>
          b.id === refundCandidate.id
            ? {
                ...b,
                status: 'Refunded',
                refundReason,
                refundedAt: nowTime
              }
            : b
        )
      )

      // Update opened detail view if active
      if (selectedBill && selectedBill.id === refundCandidate.id) {
        setSelectedBill((curr) =>
          curr
            ? {
                ...curr,
                status: 'Refunded',
                refundReason,
                refundedAt: nowTime
              }
            : null
        )
      }

      const billNum = refundCandidate.billNumber
      setRefundCandidate(null)
      showToast(`Bill #${billNum} marked as Refunded in MongoDB Atlas.`)
    } catch (err: unknown) {
      console.error('Failed to update refund in database:', err)
      const msg = err instanceof Error ? err.message : 'Refund update failed'
      showToast(`Refund error: ${msg}`)
    } finally {
      setIsRefunding(false)
    }
  }

  const formatSummaryItems = (items: HistoryBill['items']): string => {
    if (items.length === 0) return 'No items'
    if (items.length === 1) return `${items[0].name} (x${items[0].quantity})`
    if (items.length === 2)
      return `${items[0].name} (x${items[0].quantity}), ${items[1].name} (x${items[1].quantity})`
    return `${items[0].name} (x${items[0].quantity}) + ${items.length - 1} more`
  }

  return (
    <div className="bill-history-container">
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

      {/* Header Panel */}
      <section className="bill-history-header">
        <div className="header-meta">
          <div className="header-top-row">
            <button
              type="button"
              className="pos-back-link"
              onClick={() => onNavigate('Dashboard')}
              title="Return to Dashboard"
            >
              <IconChevronRight size={13} style={{ transform: 'rotate(180deg)' }} />
              <span>Dashboard</span>
            </button>
            <span className="crumb-separator">/</span>
            <span className="pos-kicker">🧾 Beach Club Invoices &amp; Audits</span>
            <div
              className="demo-notice-badge"
              style={
                fetchError
                  ? { backgroundColor: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }
                  : { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }
              }
            >
              <span
                className="demo-pulse-dot"
                style={fetchError ? { backgroundColor: '#ef4444' } : { backgroundColor: '#22c55e' }}
              />
              <span>{fetchError ? 'DATABASE OFFLINE' : 'MONGODB ATLAS · CONNECTED'}</span>
            </div>
          </div>
          <h1 className="dashboard-heading">Bill History & Invoices</h1>
          <p className="dashboard-subheading">
            Review, search, reprint, or inspect settled customer bills across all terminals
          </p>
        </div>

        {/* Action Button to switch to POS & Refresh */}
        <div className="header-quick-actions">
          <button
            type="button"
            className="btn-action btn-action-outline"
            onClick={loadBills}
            disabled={isLoading}
            title="Reload bills from database"
          >
            <IconRotateCcw
              size={14}
              style={isLoading ? { animation: 'spin 1s linear infinite' } : undefined}
            />
            <span>{isLoading ? 'Loading...' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            className="btn-action btn-action-primary"
            onClick={() => onNavigate('POS Billing')}
            title="Create a new sale in POS Billing"
          >
            <IconUtensils size={15} />
            <span>Open POS Terminal</span>
          </button>
        </div>
      </section>

      {/* Summary KPI Cards based on current dataset */}
      <section className="metrics-grid" aria-label="Bill History Highlights">
        {/* Metric 1: Total Bills */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-box metric-icon-navy">
              <IconReceipt size={19} />
            </div>
            <span className="metric-badge metric-badge-neutral">
              {filteredBills.length} matched
            </span>
          </div>
          <div className="metric-body">
            <span className="metric-label">Total Bills</span>
            <div className="metric-value-row">
              <span className="metric-primary-value">
                {summaryMetrics.totalCount} <span className="metric-unit-text">invoices</span>
              </span>
            </div>
            <div className="metric-footer-note">
              <span>Matching current search & filters</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Total Sales */}
        <div className="metric-card metric-card-sales">
          <div className="metric-card-header">
            <div className="metric-icon-box metric-icon-teal">
              <IconCheck size={19} />
            </div>
            <span className="metric-badge metric-badge-positive">Settled Sales</span>
          </div>
          <div className="metric-body">
            <span className="metric-label">Net Filtered Sales</span>
            <div className="metric-value-row">
              <span className="metric-primary-value">{formatLKR(summaryMetrics.totalSales)}</span>
            </div>
            <div className="metric-footer-note">
              <span>Excludes refunded or cancelled bills</span>
            </div>
          </div>
        </div>

        {/* Metric 3: Cash Sales */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-box metric-icon-emerald">
              <IconCash size={19} />
            </div>
            <span className="metric-badge metric-badge-neutral">
              {summaryMetrics.totalSales > 0
                ? `${Math.round((summaryMetrics.cashSales / summaryMetrics.totalSales) * 100)}%`
                : '0%'}
            </span>
          </div>
          <div className="metric-body">
            <span className="metric-label">Cash Receipts</span>
            <div className="metric-value-row">
              <span className="metric-primary-value">{formatLKR(summaryMetrics.cashSales)}</span>
            </div>
            <div className="metric-footer-note">
              <span>Settled cash drawer collections</span>
            </div>
          </div>
        </div>

        {/* Metric 4: Card Sales */}
        <div className="metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-box metric-icon-blue">
              <IconCard size={19} />
            </div>
            <span className="metric-badge metric-badge-neutral">
              {summaryMetrics.totalSales > 0
                ? `${Math.round((summaryMetrics.cardSales / summaryMetrics.totalSales) * 100)}%`
                : '0%'}
            </span>
          </div>
          <div className="metric-body">
            <span className="metric-label">Card Settlements</span>
            <div className="metric-value-row">
              <span className="metric-primary-value">{formatLKR(summaryMetrics.cardSales)}</span>
            </div>
            <div className="metric-footer-note">
              <span>Visa, Mastercard & Amex totals</span>
            </div>
          </div>
        </div>
      </section>

      {/* Filter and Search Bar Panel */}
      <section className="card-panel bill-filter-panel">
        <div className="bill-filter-grid">
          {/* Search Field */}
          <div className="pos-search-box search-full-height">
            <IconSearch size={16} className="pos-search-icon" />
            <input
              type="text"
              placeholder="Search by bill #, item, cashier, or sale type..."
              value={searchQuery}
              onChange={(e) => handleFilterChange(() => setSearchQuery(e.target.value))}
              className="pos-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => handleFilterChange(() => setSearchQuery(''))}
                aria-label="Clear search query"
              >
                <IconX size={14} />
              </button>
            )}
          </div>

          {/* Date Range Selector */}
          <div className="filter-select-group">
            <label htmlFor="filter-date-select" className="filter-select-label">
              <IconClock size={13} />
              <span>Date</span>
            </label>
            <select
              id="filter-date-select"
              value={dateRange}
              onChange={(e) =>
                handleFilterChange(() => setDateRange(e.target.value as DateRangeFilter))
              }
              className="filter-select"
            >
              <option value="All">All Dates</option>
              <option value="Today">Today (15 Oct)</option>
              <option value="Yesterday">Yesterday (14 Oct)</option>
              <option value="Last 7 Days">Last 7 Days</option>
              <option value="This Month">This Month (Oct 2026)</option>
            </select>
          </div>

          {/* Sale / Order Type Selector */}
          <div className="filter-select-group">
            <label htmlFor="filter-type-select" className="filter-select-label">
              <IconUtensils size={13} />
              <span>Type</span>
            </label>
            <select
              id="filter-type-select"
              value={orderTypeFilter}
              onChange={(e) =>
                handleFilterChange(() => setOrderTypeFilter(e.target.value as OrderTypeFilter))
              }
              className="filter-select"
            >
              <option value="All">All Types</option>
              <option value="Dine-in">Dine-in</option>
              <option value="Takeaway">Takeaway</option>
            </select>
          </div>

          {/* Payment Method Selector */}
          <div className="filter-select-group">
            <label htmlFor="filter-payment-select" className="filter-select-label">
              <IconCard size={13} />
              <span>Payment</span>
            </label>
            <select
              id="filter-payment-select"
              value={paymentFilter}
              onChange={(e) =>
                handleFilterChange(() => setPaymentFilter(e.target.value as PaymentFilter))
              }
              className="filter-select"
            >
              <option value="All">All Payments</option>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Split">Split (Cash + Card)</option>
            </select>
          </div>

          {/* Status Selector */}
          <div className="filter-select-group">
            <label htmlFor="filter-status-select" className="filter-select-label">
              <IconFilter size={13} />
              <span>Status</span>
            </label>
            <select
              id="filter-status-select"
              value={statusFilter}
              onChange={(e) =>
                handleFilterChange(() => setStatusFilter(e.target.value as StatusFilter))
              }
              className="filter-select"
            >
              <option value="All">All Statuses</option>
              <option value="Settled">Settled</option>
              <option value="Refunded">Refunded</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {/* Reset Filters button */}
          {(searchQuery ||
            dateRange !== 'All' ||
            paymentFilter !== 'All' ||
            orderTypeFilter !== 'All' ||
            statusFilter !== 'All') && (
            <button
              type="button"
              className="btn-reset-filters"
              onClick={resetAllFilters}
              title="Reset all filters"
            >
              <IconX size={13} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </section>

      {/* Main Bills Table Card */}
      <section className="card-panel bills-table-card">
        <div className="bills-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill Number</th>
                <th>Date & Time</th>
                <th>Order Type</th>
                <th>Sale Category</th>
                <th>Item Summary</th>
                <th>Payment</th>
                <th className="th-number">Total (LKR)</th>
                <th>Status</th>
                <th className="th-action">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedBills.map((bill) => {
                const isRefunded = bill.status === 'Refunded'
                const isCancelled = bill.status === 'Cancelled'

                return (
                  <tr
                    key={bill.id}
                    className="table-row-clickable"
                    onClick={() => setSelectedBill(bill)}
                  >
                    {/* Bill Number */}
                    <td className="bill-num-cell">
                      <span className="bill-number-text">{bill.billNumber}</span>
                    </td>

                    {/* Date and Time */}
                    <td>
                      <div className="table-datetime-cell">
                        <span className="date-text">{bill.date}</span>
                        <span className="time-text">{bill.time}</span>
                      </div>
                    </td>

                    {/* Dine-in / Takeaway */}
                    <td>
                      <span
                        className={`order-type-chip ${
                          bill.orderType === 'Dine-in' ? 'chip-dine-in' : 'chip-takeaway'
                        }`}
                      >
                        {bill.orderType}
                      </span>
                    </td>

                    {/* Sale Category */}
                    <td>
                      <span className="sale-category-text">{bill.saleType}</span>
                    </td>

                    {/* Item Summary */}
                    <td className="item-summary-cell" title={formatSummaryItems(bill.items)}>
                      <span className="item-summary-text">{formatSummaryItems(bill.items)}</span>
                    </td>

                    {/* Payment Method */}
                    <td>
                      <div className="payment-method-cell">
                        {bill.paymentMethod.toLowerCase().includes('split') ? (
                          <span style={{ color: '#0d9488', fontSize: '13px' }}>⚡</span>
                        ) : bill.paymentMethod === 'Cash' ? (
                          <IconCash size={14} className="pay-icon pay-cash" />
                        ) : (
                          <IconCard size={14} className="pay-icon pay-card" />
                        )}
                        <span>{bill.paymentMethod}</span>
                      </div>
                    </td>

                    {/* Total Amount */}
                    <td className="th-number">
                      <strong
                        className={`bill-total-amount ${
                          isRefunded || isCancelled ? 'amount-struck' : ''
                        }`}
                      >
                        {formatLKR(bill.total)}
                      </strong>
                    </td>

                    {/* Status Pill */}
                    <td>
                      {bill.status === 'Settled' && (
                        <span className="status-settled-pill">
                          <IconCheck size={12} />
                          <span>Settled</span>
                        </span>
                      )}
                      {bill.status === 'Refunded' && (
                        <span className="status-refunded-pill" title={bill.refundReason}>
                          <IconRotateCcw size={12} />
                          <span>Refunded</span>
                        </span>
                      )}
                      {bill.status === 'Cancelled' && (
                        <span className="status-cancelled-pill" title={bill.refundReason}>
                          <IconX size={12} />
                          <span>Cancelled</span>
                        </span>
                      )}
                    </td>

                    {/* Actions Cell */}
                    <td className="th-action" onClick={(e) => e.stopPropagation()}>
                      <div className="table-actions-cluster">
                        {/* View Details */}
                        <button
                          type="button"
                          className="btn-table-action btn-action-view"
                          onClick={() => setSelectedBill(bill)}
                          title="View complete bill details"
                        >
                          <IconEye size={12} />
                          <span>View</span>
                        </button>

                        {/* Reprint Receipt */}
                        <button
                          type="button"
                          className="btn-table-action btn-action-reprint"
                          onClick={() => setReprintBill(bill)}
                          title="Reprint receipt on 80mm printer"
                        >
                          <IconPrinter size={12} />
                          <span>Reprint</span>
                        </button>

                        {/* Download PDF Invoice */}
                        <button
                          type="button"
                          className="btn-table-action btn-action-download"
                          onClick={() => handleDownloadBill(bill)}
                          title="Download official PDF invoice"
                        >
                          <IconDownload size={12} />
                          <span>PDF</span>
                        </button>

                        {/* Refund Action (if not already refunded/cancelled) */}
                        {bill.status === 'Settled' ? (
                          <button
                            type="button"
                            className="btn-table-action btn-action-refund"
                            onClick={() => setRefundCandidate(bill)}
                            title="Process refund or cancellation for this settled bill"
                          >
                            <IconRotateCcw size={12} />
                            <span>Refund</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-table-action btn-action-disabled"
                            disabled
                            title={bill.status === 'Refunded' ? 'This bill has already been refunded' : 'This bill has been cancelled'}
                          >
                            {bill.status === 'Refunded' ? <IconRotateCcw size={12} /> : <IconX size={12} />}
                            <span>{bill.status === 'Refunded' ? 'Refunded' : 'Cancelled'}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}

              {/* Helpful Empty State */}
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="table-empty-container">
                    <div className="empty-history-box">
                      <div className="empty-icon-ring">
                        <IconRotateCcw
                          size={28}
                          style={{
                            animation: 'spin 1s linear infinite',
                            color: 'var(--teal-primary, #0d9488)'
                          }}
                        />
                      </div>
                      <strong className="empty-title">Loading Bills from Database...</strong>
                      <p className="empty-desc">
                        Fetching customer transactions from MongoDB Atlas
                      </p>
                    </div>
                  </td>
                </tr>
              ) : fetchError ? (
                <tr>
                  <td colSpan={9} className="table-empty-container">
                    <div className="empty-history-box">
                      <div className="empty-icon-ring" style={{ color: '#ef4444' }}>
                        <IconAlertTriangle size={28} />
                      </div>
                      <strong className="empty-title">Failed to load bills</strong>
                      <p className="empty-desc">{fetchError}</p>
                      <button
                        type="button"
                        className="btn-action btn-action-primary"
                        onClick={loadBills}
                      >
                        <IconRotateCcw size={14} />
                        <span>Retry Connection</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={9} className="table-empty-container">
                    <div className="empty-history-box">
                      <div className="empty-icon-ring">
                        <IconReceipt size={28} />
                      </div>
                      <strong className="empty-title">No settled bills in database yet</strong>
                      <p className="empty-desc">
                        As you complete sales at the POS terminal, customer invoices will appear
                        here in real-time.
                      </p>
                      <button
                        type="button"
                        className="btn-action btn-action-primary"
                        onClick={() => onNavigate('POS Billing')}
                      >
                        <IconUtensils size={14} />
                        <span>Go to POS Terminal</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : paginatedBills.length === 0 ? (
                <tr>
                  <td colSpan={9} className="table-empty-container">
                    <div className="empty-history-box">
                      <div className="empty-icon-ring">
                        <IconFilter size={24} />
                      </div>
                      <strong className="empty-title">No bills match your criteria</strong>
                      <p className="empty-desc">
                        No transactions found for the selected date range, payment method, or search
                        query.
                      </p>
                      <button
                        type="button"
                        className="btn-action btn-action-secondary"
                        onClick={resetAllFilters}
                      >
                        <span>Reset All Filters</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Pagination & Summary Bar */}
        <div className="bills-table-footer">
          <div className="footer-pagination-info">
            <span>
              Showing {filteredBills.length > 0 ? (currentPageNum - 1) * pageSize + 1 : 0} to{' '}
              {Math.min(currentPageNum * pageSize, filteredBills.length)} of{' '}
              <strong>{filteredBills.length}</strong> matching bills
            </span>
            <div className="page-size-selector">
              <label htmlFor="page-size-select">Rows per page:</label>
              <select
                id="page-size-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPageNum(1)
                }}
                className="small-select"
              >
                <option value={8}>8</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
              </select>
            </div>
          </div>

          {/* Page Controls */}
          {totalPages > 1 && (
            <div className="pagination-buttons">
              <button
                type="button"
                className="btn-page"
                disabled={currentPageNum === 1}
                onClick={() => setCurrentPageNum((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <div className="page-numbers-list">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                  <button
                    key={pg}
                    type="button"
                    className={`btn-page-num ${pg === currentPageNum ? 'page-num-active' : ''}`}
                    onClick={() => setCurrentPageNum(pg)}
                  >
                    {pg}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn-page"
                disabled={currentPageNum === totalPages}
                onClick={() => setCurrentPageNum((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </section>

      {/* MODAL 1: Detailed Bill / Receipt Modal */}
      {selectedBill && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedBill(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-modal-title"
        >
          <div className="bill-detail-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="bill-modal-header">
              <div>
                <span className="modal-kicker">Catamaran Beach Restaurant · Official Guest Bill</span>
                <h3 id="detail-modal-title" className="modal-title">
                  {selectedBill.billNumber}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedBill(null)}
                aria-label="Close bill details"
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="bill-modal-content-scroll">
              {/* Status Notice if Refunded or Cancelled */}
              {selectedBill.status !== 'Settled' && (
                <div
                  className={`detail-status-banner ${
                    selectedBill.status === 'Refunded' ? 'banner-refund' : 'banner-cancel'
                  }`}
                >
                  <IconAlertTriangle size={16} />
                  <div>
                    <strong>Status: {selectedBill.status.toUpperCase()}</strong>
                    <p>
                      {selectedBill.refundReason ||
                        'This bill was reversed/cancelled during shift.'}
                      {selectedBill.refundedAt && ` (Logged at ${selectedBill.refundedAt})`}
                    </p>
                  </div>
                </div>
              )}

              {/* Bill Details Metadata Grid */}
              <div className="detail-meta-grid">
                <div className="detail-meta-box">
                  <span className="detail-meta-label">Date & Time</span>
                  <strong className="detail-meta-val">
                    {selectedBill.date} · {selectedBill.time}
                  </strong>
                </div>
                <div className="detail-meta-box">
                  <span className="detail-meta-label">Sale Category</span>
                  <strong className="detail-meta-val">{selectedBill.saleType}</strong>
                </div>
                <div className="detail-meta-box">
                  <span className="detail-meta-label">Order Type</span>
                  <strong className="detail-meta-val">{selectedBill.orderType}</strong>
                </div>
                <div className="detail-meta-box">
                  <span className="detail-meta-label">Cashier</span>
                  <strong className="detail-meta-val">{selectedBill.cashier}</strong>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="detail-items-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Line Item</th>
                      <th className="th-qty">Qty</th>
                      <th className="th-price">Rate (LKR)</th>
                      <th className="th-amount">Amount (LKR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBill.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                        </td>
                        <td className="th-qty">{item.quantity}</td>
                        <td className="th-price">{formatLKR(item.unitPrice)}</td>
                        <td className="th-amount">{formatLKR(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Breakdown */}
              <div className="detail-totals-box">
                <div className="detail-total-line">
                  <span>Subtotal:</span>
                  <span>{formatLKR(selectedBill.subtotal)}</span>
                </div>
                {selectedBill.discount > 0 && (
                  <div className="detail-total-line text-discount">
                    <span>Discount Applied:</span>
                    <span>-{formatLKR(selectedBill.discount)}</span>
                  </div>
                )}
                {selectedBill.serviceCharge > 0 && (
                  <div className="detail-total-line">
                    <span>Service Charge (10%):</span>
                    <span>{formatLKR(selectedBill.serviceCharge)}</span>
                  </div>
                )}
                <div className="detail-grand-total">
                  <span>Grand Total:</span>
                  <strong className="grand-total-amount">{formatLKR(selectedBill.total)}</strong>
                </div>
                <div className="detail-payment-note">
                  <span>Settlement Method:</span>
                  <strong>{selectedBill.paymentMethod}</strong>
                </div>
                {selectedBill.amountTendered !== undefined && selectedBill.amountTendered > 0 && (
                  <div className="detail-total-line">
                    <span>Customer Tendered (දෙන මුදල):</span>
                    <strong>{formatLKR(selectedBill.amountTendered)}</strong>
                  </div>
                )}
                {selectedBill.changeDue !== undefined && (
                  <div className="detail-total-line text-change">
                    <span>Change Returned (ඉතිරි මුදල):</span>
                    <strong style={{ color: '#2563eb' }}>{formatLKR(selectedBill.changeDue)}</strong>
                  </div>
                )}
              </div>

              {/* Verification Audit */}
              <div className="modal-demo-disclaimer">
                <span>
                  Official settled transaction record for Catamaran Beach Restaurant &middot; Dewata Beach, Galle.
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="modal-actions-row">
              <button
                type="button"
                className="btn-print"
                onClick={() => {
                  setReprintBill(selectedBill)
                }}
              >
                <IconPrinter size={15} />
                <span>Reprint 80mm Receipt</span>
              </button>

              <button
                type="button"
                className="btn-print"
                style={{ backgroundColor: '#0284c7', color: '#ffffff', borderColor: '#0284c7' }}
                onClick={() => handleDownloadBill(selectedBill)}
                title="Download official PDF invoice"
              >
                <IconDownload size={15} />
                <span>Download PDF</span>
              </button>

              <button
                type="button"
                className="btn-print"
                style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderColor: '#cbd5e1' }}
                onClick={() => {
                  setKotBill(selectedBill)
                }}
                title="Generate Kitchen Order Ticket (KOT)"
              >
                <span>🍳 Kitchen KOT</span>
              </button>

              {selectedBill.status === 'Settled' && (
                <button
                  type="button"
                  className="btn-action-refund-modal"
                  onClick={() => setRefundCandidate(selectedBill)}
                >
                  <IconRotateCcw size={14} />
                  <span>Refund / Cancel</span>
                </button>
              )}

              <button type="button" className="btn-dismiss" onClick={() => setSelectedBill(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Professional Reprint Receipt & Print Dialog */}
      {reprintBill && (
        <ProfessionalReceipt
          billNumber={reprintBill.billNumber}
          date={reprintBill.date}
          time={reprintBill.time}
          orderType={reprintBill.orderType}
          customerName={reprintBill.customerName}
          cashier={reprintBill.cashier}
          paymentMethod={reprintBill.paymentMethod}
          items={reprintBill.items}
          subtotal={reprintBill.subtotal}
          discount={reprintBill.discount}
          serviceCharge={reprintBill.serviceCharge}
          total={reprintBill.total}
          amountTendered={reprintBill.amountTendered}
          changeDue={reprintBill.changeDue}
          splitCashAmount={reprintBill.splitCashAmount}
          splitCardAmount={reprintBill.splitCardAmount}
          isReprint={true}
          autoPrint={false}
          onClose={() => setReprintBill(null)}
        />
      )}

      {/* MODAL: Kitchen Order Ticket (KOT) */}
      {kotBill && (
        <ProfessionalReceipt
          billNumber={kotBill.billNumber}
          date={kotBill.date}
          time={kotBill.time}
          orderType={kotBill.orderType}
          customerName={kotBill.customerName}
          cashier={kotBill.cashier}
          paymentMethod={kotBill.paymentMethod}
          items={kotBill.items}
          subtotal={kotBill.subtotal}
          discount={kotBill.discount}
          serviceCharge={kotBill.serviceCharge}
          total={kotBill.total}
          amountTendered={kotBill.amountTendered}
          changeDue={kotBill.changeDue}
          splitCashAmount={kotBill.splitCashAmount}
          splitCardAmount={kotBill.splitCardAmount}
          isReprint={true}
          initialView="kitchen"
          autoPrint={false}
          onClose={() => setKotBill(null)}
        />
      )}

      {/* MODAL 3: Cancel/Refund Confirmation Dialog */}
      {refundCandidate && (
        <div
          className="modal-backdrop"
          onClick={() => setRefundCandidate(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-modal-title"
        >
          <div className="refund-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="refund-dialog-header">
              <div className="refund-icon-circle">
                <IconAlertTriangle size={20} />
              </div>
              <div>
                <h3 id="refund-modal-title" className="refund-title">
                  Confirm Bill Refund (Demo Mode)
                </h3>
                <span className="refund-sub">
                  Bill #{refundCandidate.billNumber} · Total {formatLKR(refundCandidate.total)}
                </span>
              </div>
            </div>

            <div className="refund-dialog-body">
              <div className="refund-warning-callout">
                <IconAlertTriangle size={18} className="warning-callout-icon" />
                <div className="warning-callout-text">
                  <strong>DEMO SIMULATION ONLY:</strong>
                  <p>
                    This action will update the local bill status to{' '}
                    <strong>&apos;Refunded&apos;</strong> in this session for review. No actual
                    financial debit, card reversal, or database modification will take place.
                  </p>
                </div>
              </div>

              <div className="refund-reason-field">
                <label htmlFor="refund-reason-select" className="field-label-text">
                  Select Refund / Cancellation Reason:
                </label>
                <select
                  id="refund-reason-select"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="filter-select select-full-width"
                >
                  <option value="Guest request / order change">Guest request / order change</option>
                  <option value="Billing mistake or duplicate entry">
                    Billing mistake or duplicate entry
                  </option>
                  <option value="Kitchen / Beverage delay">Kitchen / Beverage delay</option>
                  <option value="Lesson reschedule / Weather condition">
                    Lesson reschedule / Weather condition
                  </option>
                  <option value="Manager discretion">Manager discretion</option>
                </select>
              </div>
            </div>

            <div className="refund-dialog-actions">
              <button
                type="button"
                className="btn-cancel-refund"
                onClick={() => setRefundCandidate(null)}
              >
                Keep Bill Settled
              </button>
              <button type="button" className="btn-confirm-refund" onClick={handleConfirmRefund}>
                <IconRotateCcw size={14} />
                <span>Confirm Demo Refund</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
