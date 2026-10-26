import React, { useEffect, useMemo, useState } from 'react'
import { formatLKR, formatLKRCompact } from '../data/demoData'
import { getOpenBills, payBill, updateBillStatus, updateOpenBillItems } from '../services/api'
import { HistoryBill, NavigationPage } from '../types'
import {
  IconAlertTriangle,
  IconCard,
  IconCash,
  IconCheck,
  IconClock,
  IconFilter,
  IconInfo,
  IconPlus,
  IconPrinter,
  IconReceipt,
  IconRotateCcw,
  IconSearch,
  IconTrash,
  IconX
} from './Icons'

interface OpenBillsProps {
  onNavigate: (page: NavigationPage) => void
  onSelectBillForAddItems: (billId: string) => void
}

type OrderTypeFilter = 'All' | 'Dine-in' | 'Takeaway'

export const OpenBills: React.FC<OpenBillsProps> = ({
  onNavigate,
  onSelectBillForAddItems
}) => {
  const [bills, setBills] = useState<HistoryBill[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderTypeFilter>('All')

  // Modals state
  const [billToPay, setBillToPay] = useState<HistoryBill | null>(null)
  const [payMethod, setPayMethod] = useState<'Cash' | 'Card'>('Cash')
  const [payCashTendered, setPayCashTendered] = useState<string>('')
  const [isSubmittingPay, setIsSubmittingPay] = useState<boolean>(false)
  const [payError, setPayError] = useState<string | null>(null)

  const [billToCancel, setBillToCancel] = useState<HistoryBill | null>(null)
  const [cancelReason, setCancelReason] = useState<string>('Guest left without ordering / cancelled order')
  const [isCancelling, setIsCancelling] = useState<boolean>(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const [billToEditRef, setBillToEditRef] = useState<HistoryBill | null>(null)
  const [newCustomerRef, setNewCustomerRef] = useState<string>('')
  const [isSavingRef, setIsSavingRef] = useState<boolean>(false)

  const [settledReceiptBill, setSettledReceiptBill] = useState<HistoryBill | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string): void => {
    setToast(msg)
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr))
    }, 4000)
  }

  // Load Open Bills from Backend MongoDB Atlas
  const loadOpenBills = async (): Promise<void> => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const data = await getOpenBills()
      setBills(data)
    } catch (err: unknown) {
      console.error('Failed to load open bills:', err)
      const msg = err instanceof Error ? err.message : 'Could not load open bills'
      setFetchError(msg)
      showToast('Could not load open bills from database.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false
    async function init(): Promise<void> {
      try {
        const data = await getOpenBills()
        if (!ignore) {
          setBills(data)
        }
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : 'Could not load open bills'
          setFetchError(msg)
        }
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

  // Filter bills
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        q === '' ||
        b.billNumber.toLowerCase().includes(q) ||
        (b.customerName && b.customerName.toLowerCase().includes(q)) ||
        b.items.some((it) => it.name.toLowerCase().includes(q))
      const matchesOrderType = orderTypeFilter === 'All' || b.orderType === orderTypeFilter
      return matchesSearch && matchesOrderType
    })
  }, [bills, searchQuery, orderTypeFilter])

  // Aggregate stats
  const totalOpenAmount = useMemo(() => {
    return bills.reduce((sum, b) => sum + b.total, 0)
  }, [bills])

  const totalOpenItemsCount = useMemo(() => {
    return bills.reduce(
      (sum, b) => sum + b.items.reduce((iSum, it) => iSum + it.quantity, 0),
      0
    )
  }, [bills])

  // Handle Pay & Close Bill
  const handleConfirmPayment = async (): Promise<void> => {
    if (!billToPay) return
    setIsSubmittingPay(true)
    setPayError(null)
    try {
      const paymentMethodString = payMethod === 'Cash' ? 'Cash' : 'Card (Visa/MC)'
      const updated = await payBill(billToPay.id, {
        paymentMethod: paymentMethodString,
        cashier: 'Kasun P.'
      })

      showToast(`Bill #${updated.billNumber} paid and settled successfully!`)
      setSettledReceiptBill(updated)
      setBillToPay(null)
      setPayCashTendered('')
      // Refresh open bills list
      await loadOpenBills()
    } catch (err: unknown) {
      console.error('Payment failed:', err)
      const msg = err instanceof Error ? err.message : 'Failed to process payment'
      setPayError(msg)
      showToast(`Payment failed: ${msg}`)
    } finally {
      setIsSubmittingPay(false)
    }
  }

  // Handle Cancel Bill with Safe Stock Restoration
  const handleConfirmCancel = async (): Promise<void> => {
    if (!billToCancel) return
    setIsCancelling(true)
    setCancelError(null)
    try {
      await updateBillStatus(billToCancel.id, 'Cancelled', cancelReason)
      showToast(`Bill #${billToCancel.billNumber} cancelled. Stock restored to inventory.`)
      setBillToCancel(null)
      await loadOpenBills()
    } catch (err: unknown) {
      console.error('Cancel failed:', err)
      const msg = err instanceof Error ? err.message : 'Failed to cancel bill'
      setCancelError(msg)
      showToast(`Cancellation failed: ${msg}`)
    } finally {
      setIsCancelling(false)
    }
  }

  // Handle Quick Edit Customer Reference
  const handleSaveCustomerRef = async (): Promise<void> => {
    if (!billToEditRef) return
    setIsSavingRef(true)
    try {
      await updateOpenBillItems(billToEditRef.id, {
        items: billToEditRef.items,
        customerName: newCustomerRef.trim()
      })
      showToast(`Customer reference updated to "${newCustomerRef.trim() || 'None'}"`)
      setBillToEditRef(null)
      await loadOpenBills()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not update reference')
    } finally {
      setIsSavingRef(false)
    }
  }

  const parseTendered = parseFloat(payCashTendered) || 0
  const changeDue = billToPay ? Math.max(0, parseTendered - billToPay.total) : 0

  return (
    <div className="open-bills-view-container">
      {/* Toast Alert */}
      {toast && (
        <div className="dashboard-toast" role="status">
          <IconInfo size={16} />
          <span>{toast}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="open-bills-top-bar">
        <div>
          <div className="open-bills-kicker-row">
            <span className="open-bills-kicker">RESTAURANT &amp; BAR TAB MANAGEMENT</span>
            <span className="open-bills-live-badge">
              <span className="live-pulse-dot" />
              {bills.length} ACTIVE {bills.length === 1 ? 'TAB' : 'TABS'}
            </span>
          </div>
          <h1 className="open-bills-title">Open Bills &amp; Customer Tabs</h1>
          <p className="open-bills-sub">
            Add items at different times for active guests, update quantities, and collect a single payment when closing tabs.
          </p>
        </div>

        <div className="open-bills-top-actions">
          <button
            type="button"
            className="btn-refresh-open-bills"
            onClick={loadOpenBills}
            disabled={isLoading}
            title="Refresh open bills from database"
          >
            <IconRotateCcw size={15} className={isLoading ? 'spin-icon' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="btn-new-open-bill"
            onClick={() => onNavigate('POS Billing')}
          >
            <IconPlus size={16} />
            <span>+ Start New Bill</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Summary Row */}
      <div className="open-bills-kpi-grid">
        <div className="open-kpi-card">
          <div className="open-kpi-header">
            <span className="open-kpi-label">TOTAL UNPAID TABS</span>
            <span className="open-kpi-badge warning">{bills.length} Open</span>
          </div>
          <div className="open-kpi-val">{bills.length}</div>
          <span className="open-kpi-hint">
            {bills.filter((b) => b.orderType === 'Dine-in').length} Dine-in ·{' '}
            {bills.filter((b) => b.orderType === 'Takeaway').length} Takeaway
          </span>
        </div>

        <div className="open-kpi-card highlight">
          <div className="open-kpi-header">
            <span className="open-kpi-label">TOTAL UNSETTLED BALANCE</span>
            <span className="open-kpi-badge teal">Live Total</span>
          </div>
          <div className="open-kpi-val teal">{formatLKR(totalOpenAmount)}</div>
          <span className="open-kpi-hint">Sum of all open tabs awaiting checkout</span>
        </div>

        <div className="open-kpi-card">
          <div className="open-kpi-header">
            <span className="open-kpi-label">ITEMS ON TAB</span>
            <span className="open-kpi-badge neutral">Stock Reserved</span>
          </div>
          <div className="open-kpi-val">{totalOpenItemsCount}</div>
          <span className="open-kpi-hint">Units served to guests awaiting payment</span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="open-bills-toolbar">
        <div className="open-bills-search-box">
          <IconSearch size={16} className="search-icon-inside" />
          <input
            type="text"
            placeholder="Search by Bill #, Customer Name, Table ref, or Item..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="open-bills-search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <IconX size={14} />
            </button>
          )}
        </div>

        <div className="open-bills-filter-group">
          <div className="filter-pill-label">
            <IconFilter size={14} />
            <span>Order Type:</span>
          </div>
          {(['All', 'Dine-in', 'Takeaway'] as OrderTypeFilter[]).map((type) => (
            <button
              key={type}
              type="button"
              className={`filter-pill-btn ${orderTypeFilter === type ? 'active' : ''}`}
              onClick={() => setOrderTypeFilter(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Error Callout */}
      {fetchError && (
        <div className="open-bills-error-banner" role="alert">
          <IconAlertTriangle size={18} />
          <div>
            <strong>Database Connection Warning:</strong> {fetchError}
          </div>
          <button type="button" onClick={loadOpenBills} className="btn-retry-inline">
            Retry
          </button>
        </div>
      )}

      {/* Main Content Area: Cards Grid */}
      {isLoading ? (
        <div className="open-bills-loading-state">
          <IconRotateCcw size={28} className="spin-icon text-teal" />
          <p>Loading active customer tabs from MongoDB Atlas...</p>
        </div>
      ) : filteredBills.length === 0 ? (
        <div className="open-bills-empty-state">
          <div className="empty-state-icon-circle">
            <IconReceipt size={36} />
          </div>
          <h3>No Open Bills Found</h3>
          <p>
            {searchQuery || orderTypeFilter !== 'All'
              ? 'No unpaid bills match your current search and filter criteria.'
              : 'All customer tabs are currently settled. There are no unpaid bills open right now.'}
          </p>
          <div className="empty-state-actions">
            {searchQuery || orderTypeFilter !== 'All' ? (
              <button
                type="button"
                className="btn-clear-filters"
                onClick={() => {
                  setSearchQuery('')
                  setOrderTypeFilter('All')
                }}
              >
                Reset Filters
              </button>
            ) : (
              <button
                type="button"
                className="btn-start-bill-empty"
                onClick={() => onNavigate('POS Billing')}
              >
                <IconPlus size={16} />
                <span>Open a New Tab in POS</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="open-bills-cards-grid">
          {filteredBills.map((bill) => {
            const itemCount = bill.items.reduce((s, it) => s + it.quantity, 0)
            return (
              <div key={bill.id} className="open-bill-card">
                {/* Card Top: Bill Number, Badge, Order Type */}
                <div className="open-bill-card-top">
                  <div className="open-bill-header-left">
                    <span className="open-bill-number">{bill.billNumber}</span>
                    <span className="open-bill-status-pill">
                      <span className="status-dot-amber" />
                      OPEN
                    </span>
                  </div>
                  <div className="open-bill-header-right">
                    <span className="open-bill-ordertype-pill">{bill.orderType}</span>
                  </div>
                </div>

                {/* Customer Reference Banner */}
                <div className="open-bill-customer-bar">
                  <div className="customer-ref-text">
                    <span className="ref-label">Guest / Reference:</span>
                    <span className="ref-value">
                      {bill.customerName ? bill.customerName : <em className="text-faint">No reference assigned</em>}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-edit-ref-inline"
                    onClick={() => {
                      setBillToEditRef(bill)
                      setNewCustomerRef(bill.customerName || '')
                    }}
                    title="Edit customer or table reference"
                  >
                    Edit
                  </button>
                </div>

                {/* Time & Cashier details */}
                <div className="open-bill-meta-bar">
                  <span className="meta-item">
                    <IconClock size={13} />
                    <span>Created: {bill.time} · {bill.date}</span>
                  </span>
                  <span className="meta-item cashier-meta">
                    Cashier: {bill.cashier}
                  </span>
                </div>

                {/* Items Summary List */}
                <div className="open-bill-items-container">
                  <div className="open-bill-items-heading">
                    <span>Current Items ({itemCount} total):</span>
                    <span className="text-muted">Rate / Amount</span>
                  </div>
                  <div className="open-bill-items-scroll">
                    <table className="open-bill-items-table">
                      <tbody>
                        {bill.items.map((item, idx) => (
                          <tr key={item.id || `it-${idx}`} className="open-item-row">
                            <td className="item-name-cell">
                              <span className="item-qty-tag">{item.quantity}×</span>
                              <span className="item-name-text">{item.name}</span>
                              {item.code && <span className="item-code-tag">({item.code})</span>}
                            </td>
                            <td className="item-price-cell">
                              <span className="item-unit-rate">{formatLKRCompact(item.unitPrice)}</span>
                              <span className="item-line-total">{formatLKR(item.total)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Card Financial Totals */}
                <div className="open-bill-totals-box">
                  <div className="totals-row subtotal-row">
                    <span>Subtotal:</span>
                    <span>{formatLKR(bill.subtotal)}</span>
                  </div>
                  {bill.discount > 0 && (
                    <div className="totals-row discount-row text-rose">
                      <span>Discount:</span>
                      <span>-{formatLKR(bill.discount)}</span>
                    </div>
                  )}
                  {bill.serviceCharge > 0 && (
                    <div className="totals-row service-row">
                      <span>Service Charge (10%):</span>
                      <span>{formatLKR(bill.serviceCharge)}</span>
                    </div>
                  )}
                  <div className="totals-row final-total-row">
                    <strong>TOTAL DUE:</strong>
                    <strong className="final-total-val">{formatLKR(bill.total)}</strong>
                  </div>
                </div>

                {/* Action Buttons: Add Items, Pay & Close, Cancel */}
                <div className="open-bill-actions-row">
                  <button
                    type="button"
                    className="btn-card-add-items"
                    onClick={() => onSelectBillForAddItems(bill.id)}
                    title="Open in POS Billing terminal to add more items"
                  >
                    <IconPlus size={15} />
                    <span>Add Items</span>
                  </button>

                  <button
                    type="button"
                    className="btn-card-pay"
                    onClick={() => {
                      setBillToPay(bill)
                      setPayMethod('Cash')
                      setPayCashTendered('')
                      setPayError(null)
                    }}
                    title="Collect payment and settle bill"
                  >
                    <IconCash size={15} />
                    <span>Pay &amp; Close</span>
                  </button>

                  <button
                    type="button"
                    className="btn-card-cancel"
                    onClick={() => {
                      setBillToCancel(bill)
                      setCancelReason('Guest left / order cancelled')
                      setCancelError(null)
                    }}
                    title="Safely cancel unpaid tab and restore stock"
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 1: PAY & CLOSE BILL CHECKOUT DIALOG                    */}
      {/* ============================================================ */}
      {billToPay && (
        <div className="pos-modal-backdrop" onClick={() => !isSubmittingPay && setBillToPay(null)}>
          <div className="pos-pay-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="pos-pay-dialog-header">
              <div className="pay-dialog-title-area">
                <div className="pay-icon-circle">
                  <IconCash size={22} />
                </div>
                <div>
                  <h3 className="pay-modal-title">Pay &amp; Close Bill</h3>
                  <span className="pay-modal-sub">
                    Bill #{billToPay.billNumber} {billToPay.customerName ? `· ${billToPay.customerName}` : ''}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn-dialog-close"
                onClick={() => setBillToPay(null)}
                disabled={isSubmittingPay}
              >
                <IconX size={18} />
              </button>
            </div>

            <div className="pos-pay-dialog-body">
              {payError && (
                <div className="pos-modal-error-alert" role="alert">
                  <IconAlertTriangle size={16} />
                  <span>{payError}</span>
                </div>
              )}

              {/* Bill Items Review List */}
              <div className="pay-review-box">
                <span className="pay-review-label">Items on this Bill ({billToPay.items.length}):</span>
                <div className="pay-items-scroll">
                  {billToPay.items.map((it, idx) => (
                    <div key={it.id || idx} className="pay-item-line">
                      <span>{it.quantity}× {it.name}</span>
                      <span>{formatLKR(it.total)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Due Banner */}
              <div className="pay-total-banner">
                <span className="pay-total-label">Final Amount Due:</span>
                <span className="pay-total-amount">{formatLKR(billToPay.total)}</span>
              </div>

              {/* Payment Method Selector */}
              <div className="pay-method-section">
                <label className="pay-section-label">Select Payment Method:</label>
                <div className="pay-method-options">
                  <button
                    type="button"
                    className={`pay-method-pill ${payMethod === 'Cash' ? 'active' : ''}`}
                    onClick={() => setPayMethod('Cash')}
                  >
                    <IconCash size={18} />
                    <span>Cash</span>
                  </button>
                  <button
                    type="button"
                    className={`pay-method-pill ${payMethod === 'Card' ? 'active' : ''}`}
                    onClick={() => setPayMethod('Card')}
                  >
                    <IconCard size={18} />
                    <span>Card (Visa / Mastercard)</span>
                  </button>
                </div>
              </div>

              {/* Cash Tendered Field (if cash) */}
              {payMethod === 'Cash' && (
                <div className="pay-cash-tendered-box">
                  <div className="tendered-row">
                    <label htmlFor="tendered-amount-input">Cash Tendered (Rs.):</label>
                    <input
                      id="tendered-amount-input"
                      type="number"
                      placeholder="e.g. 5000"
                      value={payCashTendered}
                      onChange={(e) => setPayCashTendered(e.target.value)}
                      className="pay-tendered-input"
                      min="0"
                      step="50"
                    />
                  </div>
                  {parseTendered > 0 && (
                    <div className="change-due-row">
                      <span>Change Due:</span>
                      <strong className={`change-val ${parseTendered >= billToPay.total ? 'text-emerald' : 'text-amber'}`}>
                        {parseTendered >= billToPay.total
                          ? formatLKR(changeDue)
                          : `Insufficient by ${formatLKR(billToPay.total - parseTendered)}`}
                      </strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pos-pay-dialog-actions">
              <button
                type="button"
                className="btn-cancel-pay-dialog"
                onClick={() => setBillToPay(null)}
                disabled={isSubmittingPay}
              >
                Back / Keep Open
              </button>
              <button
                type="button"
                className="btn-confirm-pay-dialog"
                onClick={handleConfirmPayment}
                disabled={isSubmittingPay}
              >
                {isSubmittingPay ? (
                  <>
                    <IconRotateCcw size={16} className="spin-icon" />
                    <span>Settling Tab...</span>
                  </>
                ) : (
                  <>
                    <IconCheck size={16} />
                    <span>Confirm &amp; Settle ({formatLKR(billToPay.total)})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: SAFE BILL CANCELLATION CONFIRMATION                 */}
      {/* ============================================================ */}
      {billToCancel && (
        <div className="pos-modal-backdrop" onClick={() => !isCancelling && setBillToCancel(null)}>
          <div className="pos-cancel-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="pos-cancel-dialog-header">
              <div className="cancel-icon-circle">
                <IconAlertTriangle size={22} />
              </div>
              <div>
                <h3 className="cancel-modal-title">Cancel Unpaid Bill?</h3>
                <span className="cancel-modal-sub">
                  Bill #{billToCancel.billNumber} · Total {formatLKR(billToCancel.total)}
                </span>
              </div>
            </div>

            <div className="pos-cancel-dialog-body">
              {cancelError && (
                <div className="pos-modal-error-alert" role="alert">
                  <IconAlertTriangle size={16} />
                  <span>{cancelError}</span>
                </div>
              )}

              <div className="cancel-stock-warning">
                <IconInfo size={16} className="warning-info-icon" />
                <p>
                  <strong>Inventory Safety Notice:</strong> All items in this bill will be safely restored to available inventory automatically, and an audit stock adjustment will be recorded.
                </p>
              </div>

              <div className="cancel-reason-group">
                <label htmlFor="cancel-reason-select" className="field-label-text">
                  Cancellation Reason:
                </label>
                <select
                  id="cancel-reason-select"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="filter-select select-full-width"
                >
                  <option value="Guest left without ordering / cancelled order">
                    Guest left without ordering / cancelled order
                  </option>
                  <option value="Duplicate or accidental tab created">
                    Duplicate or accidental tab created
                  </option>
                  <option value="Wrong table or order entered">
                    Wrong table or order entered
                  </option>
                  <option value="Kitchen / Beverage unavailable">
                    Kitchen / Beverage unavailable
                  </option>
                  <option value="Manager discretion">Manager discretion</option>
                </select>
              </div>
            </div>

            <div className="pos-cancel-dialog-actions">
              <button
                type="button"
                className="btn-keep-open-cancel"
                onClick={() => setBillToCancel(null)}
                disabled={isCancelling}
              >
                Keep Bill Open
              </button>
              <button
                type="button"
                className="btn-confirm-cancel"
                onClick={handleConfirmCancel}
                disabled={isCancelling}
              >
                {isCancelling ? 'Restoring Stock...' : 'Yes, Cancel Bill & Restore Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: EDIT CUSTOMER REFERENCE                             */}
      {/* ============================================================ */}
      {billToEditRef && (
        <div className="pos-modal-backdrop" onClick={() => !isSavingRef && setBillToEditRef(null)}>
          <div className="pos-ref-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="pos-ref-dialog-header">
              <h3 className="ref-modal-title">Edit Customer / Table Reference</h3>
              <span className="ref-modal-sub">Bill #{billToEditRef.billNumber}</span>
            </div>

            <div className="pos-ref-dialog-body">
              <label htmlFor="edit-customer-ref-input" className="field-label-text">
                Guest Name / Table / Identifier:
              </label>
              <input
                id="edit-customer-ref-input"
                type="text"
                value={newCustomerRef}
                onChange={(e) => setNewCustomerRef(e.target.value)}
                placeholder="e.g. Table 4, Liam (Beach), John Surfer..."
                className="ref-text-input"
                autoFocus
              />
            </div>

            <div className="pos-ref-dialog-actions">
              <button
                type="button"
                className="btn-dismiss-ref"
                onClick={() => setBillToEditRef(null)}
                disabled={isSavingRef}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-save-ref"
                onClick={handleSaveCustomerRef}
                disabled={isSavingRef}
              >
                {isSavingRef ? 'Saving...' : 'Save Reference'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 4: 58mm THERMAL RECEIPT MODAL FOR SETTLED BILL         */}
      {/* ============================================================ */}
      {settledReceiptBill && (
        <div className="pos-receipt-modal-backdrop" onClick={() => setSettledReceiptBill(null)}>
          <div className="pos-receipt-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="receipt-modal-header">
              <div>
                <span className="thermal-kicker">Thermal Print Preview</span>
                <h3 className="receipt-modal-title">Official Sales Receipt</h3>
                <span className="receipt-printer-type">58 mm Epson TM-T88 Printer</span>
              </div>
              <button
                type="button"
                className="receipt-btn-close"
                onClick={() => setSettledReceiptBill(null)}
              >
                <IconX size={18} />
              </button>
            </div>

            <div className="receipt-scroll-container">
              <div className="thermal-receipt-paper-58mm">
                {/* Header */}
                <div className="t-center t-header">
                  <div className="t-brand">CATAMARAN SURF CLUB</div>
                  <div className="t-sub">BEACH BAR &amp; SURF SCHOOL</div>
                  <div className="t-address">Yaddehimulla Road, Unawatuna, Galle</div>
                  <div className="t-address">Tel: +94 91 222 4589 · Sri Lanka</div>
                </div>

                <div className="t-rule-dash" />

                {/* Metadata */}
                <div className="t-meta">
                  <div className="t-flex">
                    <span>BILL NO:</span>
                    <strong className="t-bold">{settledReceiptBill.billNumber}</strong>
                  </div>
                  {settledReceiptBill.customerName && (
                    <div className="t-flex">
                      <span>CUSTOMER/REF:</span>
                      <strong>{settledReceiptBill.customerName}</strong>
                    </div>
                  )}
                  <div className="t-flex">
                    <span>DATE &amp; TIME:</span>
                    <span>{settledReceiptBill.date} {settledReceiptBill.time}</span>
                  </div>
                  <div className="t-flex">
                    <span>TYPE:</span>
                    <span>{settledReceiptBill.orderType.toUpperCase()} ({settledReceiptBill.saleType})</span>
                  </div>
                  <div className="t-flex">
                    <span>CASHIER:</span>
                    <span>{settledReceiptBill.cashier}</span>
                  </div>
                  <div className="t-flex">
                    <span>STATUS:</span>
                    <strong className="text-emerald">PAID / SETTLED</strong>
                  </div>
                </div>

                <div className="t-rule-dash" />

                {/* All Cumulative Items Table */}
                <table className="t-table">
                  <thead>
                    <tr>
                      <th className="t-th-item">ITEM</th>
                      <th className="t-th-qty">QTY</th>
                      <th className="t-th-rate">PRICE</th>
                      <th className="t-th-amt">AMT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settledReceiptBill.items.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td className="t-td-item">{item.name}</td>
                        <td className="t-td-qty">{item.quantity}</td>
                        <td className="t-td-rate">{item.unitPrice}</td>
                        <td className="t-td-amt">{item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="t-rule-dash" />

                {/* Financial Summary */}
                <div className="t-summary-block">
                  <div className="t-flex">
                    <span>SUBTOTAL:</span>
                    <span>{formatLKR(settledReceiptBill.subtotal)}</span>
                  </div>
                  {settledReceiptBill.discount > 0 && (
                    <div className="t-flex">
                      <span>DISCOUNT:</span>
                      <span>-{formatLKR(settledReceiptBill.discount)}</span>
                    </div>
                  )}
                  {settledReceiptBill.serviceCharge > 0 && (
                    <div className="t-flex">
                      <span>SERVICE CHARGE:</span>
                      <span>{formatLKR(settledReceiptBill.serviceCharge)}</span>
                    </div>
                  )}
                  <div className="t-rule-dash" />
                  <div className="t-flex t-total-line">
                    <strong>TOTAL PAID:</strong>
                    <strong>{formatLKR(settledReceiptBill.total)}</strong>
                  </div>
                  <div className="t-flex">
                    <span>PAYMENT METHOD:</span>
                    <span>{settledReceiptBill.paymentMethod.toUpperCase()}</span>
                  </div>
                </div>

                <div className="t-rule-double" />

                {/* Footer Watermark */}
                <div className="t-center t-footer">
                  <span className="t-watermark">*** OFFICIAL SALES RECEIPT ***</span>
                  <span>SURF · DINE · CHILL</span>
                  <span>Thank you for visiting!</span>
                  <span className="t-paper-cut">[ - - - - - CUT HERE - - - - - ]</span>
                </div>
              </div>
            </div>

            <div className="thermal-modal-actions">
              <button
                type="button"
                className="btn-print-58mm"
                onClick={() => {
                  showToast('Print command sent to 58mm thermal printer (EPSON TM-T88)')
                }}
              >
                <IconPrinter size={16} />
                <span>Print 58mm Receipt</span>
              </button>

              <button
                type="button"
                className="btn-dismiss"
                onClick={() => setSettledReceiptBill(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
