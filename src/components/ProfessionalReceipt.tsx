import { getLocalSettings } from '../utils/settingsStore'
import React, { useState } from 'react'
import logoImg from '../assets/logo.png'
import { formatLKR } from '../data/demoData'
import { IconChevronRight, IconDownload, IconPrinter, IconX } from './Icons'
import { downloadBillPDF } from '../utils/billPdfGenerator'
import { downloadReceiptAsPDF, printThermalReceipt } from '../utils/printReceiptHelper'

export interface ReceiptItem {
  id?: string
  name: string
  quantity: number
  unitPrice: number
  total: number
  code?: string
}

export interface ProfessionalReceiptProps {
  billNumber: string
  date?: string
  time?: string
  orderType: string
  customerName?: string
  cashier?: string
  paymentMethod: string
  items: ReceiptItem[]
  subtotal: number
  discount?: number
  serviceCharge?: number
  total: number
  amountTendered?: number
  changeDue?: number
  splitCashAmount?: number
  splitCardAmount?: number
  isReprint?: boolean
  autoPrint?: boolean
  initialView?: 'customer' | 'kitchen'
  onClose: () => void
  onNewSale?: () => void
}

export const ProfessionalReceipt: React.FC<ProfessionalReceiptProps> = ({
  billNumber,
  date,
  time,
  orderType,
  customerName,
  cashier,
  paymentMethod = 'Cash',
  items,
  subtotal,
  discount = 0,
  serviceCharge = 0,
  total,
  amountTendered,
  changeDue,
  splitCashAmount,
  splitCardAmount,
  isReprint = false,
  autoPrint = false,
  initialView = 'customer',
  onClose,
  onNewSale
}) => {
  const [receiptView, setReceiptView] = useState<'customer' | 'kitchen'>(initialView)

  const isSplit =
    paymentMethod.toLowerCase().includes('split') ||
    (splitCashAmount !== undefined && splitCashAmount > 0 && splitCardAmount !== undefined && splitCardAmount > 0)
  const isCash = !isSplit && paymentMethod.toLowerCase().includes('cash')

  const resolvedSplitCash =
    splitCashAmount ??
    (isSplit
      ? (() => {
          const match = paymentMethod.match(/Cash:\s*(?:Rs\.\s*)?([0-9,.]+)/i)
          return match ? parseFloat(match[1].replace(/,/g, '')) : undefined
        })()
      : undefined)

  const resolvedSplitCard =
    splitCardAmount ??
    (isSplit
      ? (() => {
          const match = paymentMethod.match(/Card:\s*(?:Rs\.\s*)?([0-9,.]+)/i)
          return match ? parseFloat(match[1].replace(/,/g, '')) : undefined
        })()
      : undefined)

  // Calculate reliable cash tendered and change due
  const safeTotal = Number(total || 0)
  const safeTendered =
    typeof amountTendered === 'number' && amountTendered > 0
      ? amountTendered
      : isCash
        ? safeTotal
        : isSplit
          ? (resolvedSplitCash ?? 0) + (resolvedSplitCard ?? 0)
          : safeTotal
  const safeChange =
    typeof changeDue === 'number'
      ? changeDue
      : isCash
        ? Math.max(0, safeTendered - safeTotal)
        : 0

  const appSettings = getLocalSettings()
  const displayCashier = cashier || appSettings.cashierName || 'Kasun P.'
  const displayRestaurantName = appSettings.restaurantName || 'CATAMARAN BEACH RESTAURANT'
  const displayTagline = appSettings.restaurantTagline || 'BEACHFRONT DINING · BAR · SURF'
  const displayAddress = appSettings.restaurantAddress || 'Yaddehimulla Road, Unawatuna, Galle'
  const displayHotline = 'TEL: ' + (appSettings.restaurantPhone || '+94 91 224 8890 | +94 77 123 4567')
  const displayCredit = appSettings.softwareCredit || 'Software by Nexion Solution'

  const totalQuantity = items.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0)

  // Current date/time fallback
  const now = new Date()
  const displayDate =
    date ||
    now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  const displayTime =
    time ||
    now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })

  const handlePrint = (): void => {
    printThermalReceipt('thermal-print-target')
  }

  const handlePrintKitchen = (): void => {
    setReceiptView('kitchen')
  }

  const handlePrintCustomer = (): void => {
    setReceiptView('customer')
  }

  const handleDownloadPdf = async (): Promise<void> => {
    const prefix = receiptView === 'kitchen' ? 'Catamaran_KOT_' : 'Catamaran_Receipt_'
    const success = await downloadReceiptAsPDF('thermal-print-target', `${prefix}${billNumber}`)
    if (!success) {
      await downloadBillPDF({
        billNumber,
        date: displayDate,
        time: displayTime,
        orderType,
        customerName,
        cashier: displayCashier,
        paymentMethod,
        items,
        subtotal,
        discount,
        serviceCharge,
        total: safeTotal,
        amountTendered: safeTendered,
        changeDue: safeChange,
        splitCashAmount: resolvedSplitCash,
        splitCardAmount: resolvedSplitCard,
        status: 'Settled'
      })
    }
  }

  return (
    <div
      className="modal-backdrop receipt-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
    >
      <div className="thermal-receipt-modal pro-receipt-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Modal Window Header */}
        <div className="thermal-modal-header pro-receipt-header">
          <div className="thermal-header-meta">
            <span className="thermal-kicker">
              {isReprint
                ? 'Duplicate Guest Check'
                : receiptView === 'kitchen'
                  ? 'Kitchen Order Ticket · 58mm Thermal'
                  : 'Official Bill · 58mm Thermal Ready'}
            </span>
            <h3 id="receipt-modal-title" className="thermal-title">
              {receiptView === 'kitchen' ? 'Kitchen Order Ticket (KOT)' : 'Catamaran Beach Restaurant'}
            </h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close receipt preview"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* View Switcher: Customer Bill vs Kitchen Bill (KOT) */}
        <div className="receipt-view-tabs">
          <button
            type="button"
            className={`receipt-tab-btn ${receiptView === 'customer' ? 'active' : ''}`}
            onClick={() => setReceiptView('customer')}
          >
            <span>🧾 Customer Bill</span>
          </button>
          <button
            type="button"
            className={`receipt-tab-btn ${receiptView === 'kitchen' ? 'active' : ''}`}
            onClick={() => setReceiptView('kitchen')}
          >
            <span>🍳 Kitchen Bill (KOT)</span>
          </button>
        </div>

        {/* Scrollable Preview Container */}
        <div
          className="thermal-paper-scroll"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          {/* Print Target (This container alone is printed when window.print() is called) */}
          <div
            className="thermal-paper-58mm pro-receipt-paper"
            id="thermal-print-target"
            style={{
              backgroundColor: '#ffffff',
              height: 'auto',
              minHeight: 'fit-content',
              flexShrink: 0
            }}
          >
            {receiptView === 'kitchen' ? (
              /* ========================================================
                 KITCHEN ORDER TICKET (KOT) VIEW (58mm Thermal Optimized)
                 ======================================================== */
              <div className="kot-ticket-content">
                {/* 1. Header */}
                <div className="t-center kot-header">
                  <div className="kot-badge-title">*** KITCHEN ORDER TICKET (KOT) ***</div>
                  <h2 className="kot-restaurant-name">{displayRestaurantName}</h2>
                  <div className="kot-order-badge-row">
                    <span className="kot-order-type-badge">
                      {orderType.toUpperCase()}
                      {customerName ? ` · ${customerName.toUpperCase()}` : ''}
                    </span>
                  </div>
                </div>

                <div className="t-rule-double" />

                {/* 2. Metadata */}
                <div className="kot-meta-block">
                  <div className="t-flex">
                    <span className="kot-meta-k">KOT REF / BILL:</span>
                    <strong className="kot-meta-v kot-bold-num">{billNumber}</strong>
                  </div>
                  <div className="t-flex">
                    <span className="kot-meta-k">DATE &amp; TIME:</span>
                    <span className="kot-meta-v">
                      {displayDate} {displayTime}
                    </span>
                  </div>
                  <div className="t-flex">
                    <span className="kot-meta-k">SERVER:</span>
                    <span className="kot-meta-v">{displayCashier}</span>
                  </div>
                  {customerName && (
                    <div className="t-flex">
                      <span className="kot-meta-k">TABLE / GUEST:</span>
                      <strong className="kot-meta-v kot-guest-highlight">{customerName.toUpperCase()}</strong>
                    </div>
                  )}
                </div>

                <div className="t-rule-double" />

                {/* 3. Kitchen Items List (Large and Bold for Chef) */}
                <div className="kot-items-section">
                  <div className="kot-items-header">
                    <span className="kot-th-qty">QTY</span>
                    <span className="kot-th-name">ITEM DESCRIPTION</span>
                  </div>
                  <div className="t-rule-dash" />

                  <div className="kot-items-list">
                    {items.map((item, idx) => (
                      <div key={item.id || idx} className="kot-item-row">
                        <span className="kot-item-qty">
                          <strong>{item.quantity}</strong>x
                        </span>
                        <div className="kot-item-info">
                          <span className="kot-item-name">{item.name.toUpperCase()}</span>
                          {item.code && <span className="kot-item-code">({item.code})</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="t-rule-double" />

                {/* 4. Kitchen Item Count */}
                <div className="kot-summary">
                  <div className="t-flex">
                    <span>TOTAL ITEMS:</span>
                    <strong>{items.length} dishes</strong>
                  </div>
                  <div className="t-flex">
                    <span>TOTAL QUANTITY:</span>
                    <strong>{totalQuantity} portions</strong>
                  </div>
                </div>

                <div className="t-rule-dash" />

                {/* 5. Kitchen Instructions & Footer */}
                <div className="t-center kot-footer">
                  <div className="kot-instruction-box">
                    *** PLEASE PREPARE FRESH &amp; HOT ***
                  </div>
                  <span className="kot-sent-note">Order Sent to Kitchen</span>
                  <span className="t-paper-cut">[ - - - - - - - KITCHEN COPY - - - - - - - ]</span>

                  {/* Software Credit */}
                  <div className="pro-software-credit">
                    {displayCredit}
                  </div>
                </div>
              </div>
            ) : (
              /* ========================================================
                 OFFICIAL CUSTOMER GUEST BILL (58mm Thermal Optimized)
                 ======================================================== */
              <div className="customer-ticket-content">
                {/* 1. Official Logo & Restaurant Header */}
                <div className="t-center t-header pro-brand-header">
                  <div className="pro-receipt-logo-wrap">
                    <img
                      src={logoImg}
                      alt="Catamaran Beach Restaurant Logo"
                      className="pro-receipt-logo"
                    />
                  </div>
                  <h1 className="pro-restaurant-name">{displayRestaurantName}</h1>
                  <span className="pro-restaurant-tagline">{displayTagline}</span>
                  <span className="t-branch">{displayAddress}</span>
                  <span className="t-hotline">{displayHotline}</span>
                </div>

                <div className="t-rule-double" />

                {/* Reprint or Official Banner */}
                <div className="t-center pro-receipt-banner">
                  {isReprint ? (
                    <span className="reprint-banner-text">*** DUPLICATE / REPRINT RECEIPT ***</span>
                  ) : (
                    <span className="official-receipt-title">*** OFFICIAL DINING BILL ***</span>
                  )}
                </div>

                <div className="t-rule-dash" />

                {/* 2. Metadata Block */}
                <div className="t-meta-block">
                  <div className="t-flex">
                    <span className="t-meta-k">BILL NO:</span>
                    <strong className="t-meta-v t-bill-no">{billNumber}</strong>
                  </div>
                  <div className="t-flex">
                    <span className="t-meta-k">DATE &amp; TIME:</span>
                    <span className="t-meta-v">
                      {displayDate} {displayTime}
                    </span>
                  </div>
                  <div className="t-flex">
                    <span className="t-meta-k">SERVER / CASHIER:</span>
                    <span className="t-meta-v">{displayCashier}</span>
                  </div>
                  <div className="t-flex">
                    <span className="t-meta-k">ORDER TYPE:</span>
                    <strong className="t-meta-v t-badge-pill">{orderType.toUpperCase()}</strong>
                  </div>
                  {customerName && (
                    <div className="t-flex">
                      <span className="t-meta-k">TABLE / GUEST:</span>
                      <strong className="t-meta-v">{customerName.toUpperCase()}</strong>
                    </div>
                  )}
                </div>

                <div className="t-rule-dash" />

                {/* 3. Items Table */}
                <table className="t-table pro-items-table">
                  <thead>
                    <tr>
                      <th className="t-th-item">ITEM</th>
                      <th className="t-th-qty">QTY</th>
                      <th className="t-th-rate">PRICE</th>
                      <th className="t-th-amt">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td className="t-td-item">
                          <div className="t-item-name">{item.name}</div>
                          {item.code && <div className="t-item-code">{item.code}</div>}
                        </td>
                        <td className="t-td-qty">{item.quantity}</td>
                        <td className="t-td-rate">{item.unitPrice.toLocaleString('en-LK')}</td>
                        <td className="t-td-amt">{item.total.toLocaleString('en-LK')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="t-rule-dash" />

                {/* 4. Financial Breakdown */}
                <div className="t-summary-block">
                  <div className="t-flex">
                    <span>SUBTOTAL:</span>
                    <span>{formatLKR(subtotal)}</span>
                  </div>

                  {discount > 0 && (
                    <div className="t-flex t-discount-line">
                      <span>DISCOUNT:</span>
                      <span>-{formatLKR(discount)}</span>
                    </div>
                  )}

                  {serviceCharge > 0 && (
                    <div className="t-flex">
                      <span>SERVICE CHARGE:</span>
                      <span>{formatLKR(serviceCharge)}</span>
                    </div>
                  )}

                  <div className="t-rule-double" />

                  {/* Grand Total */}
                  <div className="t-flex t-total-line pro-grand-total">
                    <strong>GRAND TOTAL:</strong>
                    <strong>{formatLKR(safeTotal)}</strong>
                  </div>

                  <div className="t-rule-double" />

                  {/* 5. Payment & Customer Tendered / Change Section (Clean Unified Monochrome) */}
                  <div className="pro-payment-tender-box">
                    <div className="t-flex t-tender-row">
                      <span className="t-tender-lbl">PAYMENT METHOD:</span>
                      <strong className="t-tender-val">{paymentMethod.toUpperCase()}</strong>
                    </div>

                    {isSplit ? (
                      <>
                        <div className="t-flex t-tender-row" style={{ marginTop: '2px' }}>
                          <span className="t-tender-lbl">💵 CASH PORTION:</span>
                          <strong className="t-tender-val">{formatLKR(resolvedSplitCash ?? 0)}</strong>
                        </div>
                        <div className="t-flex t-tender-row">
                          <span className="t-tender-lbl">💳 CARD CHARGED:</span>
                          <strong className="t-tender-val">{formatLKR(resolvedSplitCard ?? 0)}</strong>
                        </div>
                        {safeChange > 0 && (
                          <div className="t-flex t-tender-row t-highlight-change" style={{ marginTop: '3px' }}>
                            <span className="t-tender-lbl">CHANGE RETURNED (ඉතිරි මුදල):</span>
                            <strong className="t-tender-val t-change-val">{formatLKR(safeChange)}</strong>
                          </div>
                        )}
                        <div className="t-flex t-tender-row">
                          <span className="t-tender-lbl">TRANSACTION STATUS:</span>
                          <span className="t-tender-val">APPROVED (SPLIT COMPLETE)</span>
                        </div>
                      </>
                    ) : isCash ? (
                      <>
                        <div className="t-flex t-tender-row t-highlight-tendered">
                          <span className="t-tender-lbl">CUSTOMER TENDERED (දෙන මුදල):</span>
                          <strong className="t-tender-val">{formatLKR(safeTendered)}</strong>
                        </div>
                        <div className="t-flex t-tender-row t-highlight-change">
                          <span className="t-tender-lbl">CHANGE RETURNED (ඉතිරි මුදල):</span>
                          <strong className="t-tender-val t-change-val">{formatLKR(safeChange)}</strong>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="t-flex t-tender-row">
                          <span className="t-tender-lbl">AMOUNT CHARGED:</span>
                          <strong className="t-tender-val">{formatLKR(safeTotal)}</strong>
                        </div>
                        <div className="t-flex t-tender-row">
                          <span className="t-tender-lbl">CHANGE DUE:</span>
                          <span className="t-tender-val">Rs. 0.00</span>
                        </div>
                        <div className="t-flex t-tender-row">
                          <span className="t-tender-lbl">TRANSACTION STATUS:</span>
                          <span className="t-tender-val">APPROVED (AUTH: OK)</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="t-rule-dash" />

                {/* 6. Restaurant Footer (No Barcode, Clean Professional Monochrome) */}
                <div className="t-center t-footer pro-receipt-footer">
                  <div className="pro-item-count">
                    Total Items: {items.length} &middot; Total Units: {totalQuantity}
                  </div>

                  <div className="t-rule-dash" />

                  <span className="pro-thankyou-msg">THANK YOU FOR DINING WITH US!</span>
                  <span className="pro-vibe">FRESH SEAFOOD &middot; COCKTAILS &middot; GOOD VIBES</span>
                  <span className="pro-ig">Follow Us on Instagram: @catamaranbeachrestaurant</span>
                  <span className="pro-visit-again">Please Visit Us Again</span>

                  <span className="t-paper-cut">[ - - - - - - - THANK YOU  - - - - - - - ]</span>

                  {/* Software Credit */}
                  <div className="pro-software-credit">
                    {displayCredit}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Controls (Clean, Spacious 2-Tier Layout) */}
        <div className="thermal-modal-actions pro-receipt-actions">
          {/* Row 1: Big Prominent 58mm Print Button */}
          <button
            type="button"
            className="pro-receipt-primary-print"
            onClick={handlePrint}
            title="Open 58mm printer dialog (Ctrl+P)"
          >
            <IconPrinter size={18} />
            <span>Print {receiptView === 'customer' ? 'Customer Bill' : 'Kitchen KOT'} (58mm)</span>
          </button>

          {/* Row 2: Secondary Action Bar */}
          <div className="pro-receipt-subrow">
            {receiptView === 'customer' ? (
              <button
                type="button"
                className="pro-receipt-quick-switch"
                onClick={handlePrintKitchen}
                title="Switch view to Kitchen Order Ticket"
              >
                <span>🍳 View KOT</span>
              </button>
            ) : (
              <button
                type="button"
                className="pro-receipt-quick-switch"
                onClick={handlePrintCustomer}
                title="Switch view to Customer Bill"
              >
                <span>🧾 View Bill</span>
              </button>
            )}

            <button
              type="button"
              className="pro-receipt-download-btn"
              onClick={handleDownloadPdf}
              title="Download official PDF invoice"
            >
              <IconDownload size={14} />
              <span>Download PDF</span>
            </button>

            {onNewSale && (
              <button
                type="button"
                className="pro-receipt-new-btn"
                onClick={onNewSale}
                title="Complete transaction & start new sale"
              >
                <span>New Bill</span>
                <IconChevronRight size={14} />
              </button>
            )}

            <button
              type="button"
              className="pro-receipt-close-btn"
              onClick={onClose}
              title="Close receipt preview"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
