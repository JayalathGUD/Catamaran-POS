import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { formatLKR } from '../data/demoData'
import { CompletedRental, InventoryItem, StockMovement } from '../types'
import { ExpenseRecord } from '../services/api'

export type ExportReportType = 'sales' | 'profit' | 'expenses' | 'inventory' | 'rentals'

export interface SalesReportExportData {
  totalRestaurantSales: number
  totalSettledCount: number
  averageBillValue: number
  cashSales: number
  cashCount: number
  cardSales: number
  cardCount: number
  dineInSales: number
  dineInCount: number
  takeawaySales: number
  takeawayCount: number
  refundedAmount: number
  cancelledCount: number
  bestSellers: Array<{ name: string; code: string; quantity: number; revenue: number }>
  dailySummary: Array<{
    date: string
    billCount: number
    dineInSales: number
    takeawaySales: number
    cashSales: number
    cardSales: number
    totalSales: number
  }>
}

export interface ProfitReportExportData {
  restaurantRevenue: number
  rentalRevenue: number
  totalCombinedRevenue: number
  knownCOGS: number
  costCoveragePercent: number
  totalItemsQuantitySold: number
  itemsWithCostQuantity: number
  grossProfit: number
  grossMarginPercent: number
  totalOperatingExpenses: number
  netOperatingResult: number
  netMarginPercent: number
  categories: Array<{ category: string; amount: number; count: number }>
}

export interface ExpenseReportExportData {
  totalActiveAmount: number
  activeCount: number
  totalCancelledAmount: number
  cancelledCount: number
  categories: Array<{ category: string; amount: number; count: number }>
  paymentMethods: Array<{ method: string; amount: number; count: number }>
  records: ExpenseRecord[]
}

export interface InventoryReportExportData {
  totalTrackedItems: number
  lowStockItems: InventoryItem[]
  totalValuationAtCost: number
  totalValuationAtRetail: number
  movementsCount: number
  purchaseCost: number
  purchaseUnits: number
  wastageCost: number
  wastageUnits: number
  allItems: InventoryItem[]
  movements: StockMovement[]
}

export interface RentalReportExportData {
  totalRentalRevenue: number
  totalCompletedCount: number
  activeRentalsCount: number
  avgDurationMins: number
  totalFleetCount: number
  boardRankings: Array<{
    boardName: string
    category: string
    rentalCount: number
    totalMinutes: number
    totalRevenue: number
  }>
  completedRentals: CompletedRental[]
}

export interface ExportReportPayload {
  reportType: ExportReportType
  startDate: string
  endDate: string
  sales?: SalesReportExportData
  profit?: ProfitReportExportData
  expenses?: ExpenseReportExportData
  inventory?: InventoryReportExportData
  rentals?: RentalReportExportData
}

// Helpers
function formatPeriodString(startDate: string, endDate: string, isInventory = false): string {
  if (isInventory) {
    const today = new Date().toISOString().split('T')[0]
    return `Live Warehouse Snapshot as of ${today} (Movements: ${startDate || 'Start'} to ${endDate || 'Present'})`
  }
  if (!startDate && !endDate) return 'All Recorded Time'
  if (startDate && endDate && startDate === endDate) return `Single Day: ${startDate}`
  return `${startDate || 'Beginning'} to ${endDate || 'Present'}`
}

function getSanitizedFileName(prefix: string, startDate: string, endDate: string, ext: 'pdf' | 'xlsx'): string {
  const rangePart = !startDate && !endDate ? 'All_Time' : `${startDate || 'Start'}_to_${endDate || 'Present'}`
  return `Catamaran_${prefix}_${rangePart}.${ext}`
}

function getFormattedNow(): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(new Date())
}

// ============================================================================
// PDF EXPORT ENGINE
// ============================================================================
export function exportReportToPDF(payload: ExportReportPayload): void {
  const { reportType, startDate, endDate } = payload
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const margin = 14

  // Draw Header Banner
  doc.setFillColor(15, 118, 110) // Dark Teal #0f766e
  doc.rect(0, 0, pageWidth, 24, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('CATAMARAN SURF CLUB POS', margin, 11)

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text('Beach Hub · Dewata Beach, Galle, Sri Lanka · Terminal 01', margin, 18)

  // Generation timestamp on right of banner
  doc.setFontSize(8)
  doc.text(`Generated: ${getFormattedNow()}`, pageWidth - margin, 18, { align: 'right' })

  let currentY = 32

  // Report Specific Title & Period
  const reportTitles: Record<ExportReportType, string> = {
    sales: 'SALES & DEPARTMENTAL REVENUE REPORT',
    profit: 'OPERATING PROFIT & LOSS STATEMENT',
    expenses: 'OPERATING EXPENSES AUDIT REPORT',
    inventory: 'WAREHOUSE INVENTORY SNAPSHOT & LOGS',
    rentals: 'SURFBOARD FLEET RENTALS & UTILIZATION REPORT'
  }

  doc.setTextColor(15, 23, 42)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(reportTitles[reportType], margin, currentY)
  currentY += 6

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  const isInv = reportType === 'inventory'
  doc.text(`Reporting Period: ${formatPeriodString(startDate, endDate, isInv)}`, margin, currentY)
  currentY += 8

  // Helper for KPI boxes in PDF
  const drawKpiRow = (boxes: Array<{ label: string; value: string; subtext?: string }>) => {
    const boxWidth = (pageWidth - margin * 2 - (boxes.length - 1) * 4) / boxes.length
    const boxHeight = 16

    boxes.forEach((b, i) => {
      const bx = margin + i * (boxWidth + 4)
      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(226, 232, 240)
      doc.roundedRect(bx, currentY, boxWidth, boxHeight, 1.5, 1.5, 'FD')

      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(100, 116, 139)
      doc.text(b.label.toUpperCase(), bx + 3, currentY + 5)

      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(15, 23, 42)
      doc.text(b.value, bx + 3, currentY + 11)

      if (b.subtext) {
        doc.setFontSize(6.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(148, 163, 184)
        doc.text(b.subtext, bx + 3, currentY + 14.5)
      }
    })

    currentY += boxHeight + 8
  }

  // -------------------------------------------------------------
  // TAB A: SALES PDF
  // -------------------------------------------------------------
  if (reportType === 'sales' && payload.sales) {
    const s = payload.sales
    drawKpiRow([
      { label: 'Restaurant Net Sales', value: formatLKR(s.totalRestaurantSales), subtext: `${s.totalSettledCount} settled orders` },
      { label: 'Avg Order Value', value: formatLKR(s.averageBillValue), subtext: 'Per settled bill' },
      { label: 'Cash vs Card', value: `${formatLKR(s.cashSales)} / ${formatLKR(s.cardSales)}`, subtext: `${s.cashCount} cash · ${s.cardCount} card` },
      { label: 'Dine-In vs Takeaway', value: `${formatLKR(s.dineInSales)} / ${formatLKR(s.takeawaySales)}`, subtext: `${s.dineInCount} dine · ${s.takeawayCount} take` }
    ])

    if (s.cancelledCount > 0) {
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(146, 64, 14)
      doc.text(
        `* Audit Note: ${s.cancelledCount} bills (${formatLKR(s.refundedAmount)}) marked as Refunded/Cancelled in this period are excluded from net sales.`,
        margin,
        currentY
      )
      currentY += 6
    }

    // Best Sellers Table
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('Top Selling Products', margin, currentY)
    currentY += 3

    const bestSellersBody = s.bestSellers.map((item, idx) => [
      String(idx + 1),
      item.name,
      item.code,
      String(item.quantity),
      formatLKR(item.revenue)
    ])

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Product Name', 'Item Code', 'Qty Sold', 'Total Revenue']],
      body: bestSellersBody.length > 0 ? bestSellersBody : [['-', 'No product sales recorded in period', '-', '-', '-']],
      theme: 'grid',
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7.5, textColor: [15, 23, 42] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    })

    currentY = (doc as any).lastAutoTable.finalY + 8

    // Daily Summary Table
    if (currentY > pageHeight - 40) {
      doc.addPage()
      currentY = 20
    }

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('Daily Sales Breakdown', margin, currentY)
    currentY += 3

    const dailyBody = s.dailySummary.map((d) => [
      d.date,
      String(d.billCount),
      formatLKR(d.dineInSales),
      formatLKR(d.takeawaySales),
      formatLKR(d.cashSales),
      formatLKR(d.cardSales),
      formatLKR(d.totalSales)
    ])

    autoTable(doc, {
      startY: currentY,
      head: [['Date', 'Bills', 'Dine-In', 'Takeaway', 'Cash Sales', 'Card Sales', 'Total Sales']],
      body: dailyBody.length > 0 ? dailyBody : [['-', 'No daily records', '-', '-', '-', '-', '-']],
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7.5, textColor: [15, 23, 42] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    })
  }

  // -------------------------------------------------------------
  // TAB B: PROFIT & LOSS PDF
  // -------------------------------------------------------------
  if (reportType === 'profit' && payload.profit) {
    const p = payload.profit

    drawKpiRow([
      { label: 'Total Revenue', value: formatLKR(p.totalCombinedRevenue), subtext: 'Restaurant + Rentals' },
      { label: 'Catalog COGS (Est.)', value: formatLKR(p.knownCOGS), subtext: `${p.costCoveragePercent}% cost coverage` },
      { label: 'Gross Operating Profit', value: formatLKR(p.grossProfit), subtext: `${p.grossMarginPercent.toFixed(1)}% gross margin` },
      { label: 'Net Operating Result', value: formatLKR(p.netOperatingResult), subtext: `${p.netMarginPercent.toFixed(1)}% net margin` }
    ])

    // Disclosure Notice Box
    doc.setFillColor(241, 245, 249)
    doc.setDrawColor(186, 230, 253)
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, 12, 1, 1, 'FD')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(3, 105, 161)
    doc.text('COST ACCOUNTING & COVERAGE DISCLOSURE', margin + 3, currentY + 4)
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text(
      `Cost of Goods Sold (COGS) is estimated from active catalog cost prices. Historical purchase price variations are not logged on bill items. ${p.itemsWithCostQuantity} of ${p.totalItemsQuantitySold} units (${p.costCoveragePercent}%) had configured costs. Unconfigured items calculate at Rs. 0.00 cost.`,
      margin + 3,
      currentY + 8.5
    )
    currentY += 16

    // Statement Table
    const statementRows: Array<[string, string]> = [
      ['1. REVENUE STREAMS', ''],
      ['   Restaurant & Cafe Sales (Settled Bills)', formatLKR(p.restaurantRevenue)],
      ['   Surfboard Rentals (Completed & Paid)', formatLKR(p.rentalRevenue)],
      ['TOTAL COMBINED OPERATING REVENUE', formatLKR(p.totalCombinedRevenue)],
      ['2. DIRECT COST OF GOODS SOLD', ''],
      ['   Estimated Catalog COGS (Configured Line Items)', `(${formatLKR(p.knownCOGS)})`],
      ['GROSS OPERATING PROFIT', formatLKR(p.grossProfit)],
      ['3. OPERATING EXPENSES', '']
    ]

    if (p.categories.length === 0) {
      statementRows.push(['   No recorded expenses in period', 'Rs. 0.00'])
    } else {
      p.categories.forEach((c) => {
        statementRows.push([`   ${c.category}`, `(${formatLKR(c.amount)})`])
      })
    }

    statementRows.push(['TOTAL RECORDED OPERATING EXPENSES', `(${formatLKR(p.totalOperatingExpenses)})`])
    statementRows.push(['NET OPERATING RESULT (Gross Profit minus Expenses)', formatLKR(p.netOperatingResult)])

    autoTable(doc, {
      startY: currentY,
      head: [['Line Item Description', 'Amount (LKR)']],
      body: statementRows,
      theme: 'grid',
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [15, 23, 42] },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { halign: 'right', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        const text = String(data.cell.raw)
        if (text.startsWith('1.') || text.startsWith('2.') || text.startsWith('3.')) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = [241, 245, 249]
          data.cell.styles.textColor = [15, 118, 110]
        }
        if (text.includes('TOTAL') || text.includes('GROSS OPERATING PROFIT') || text.includes('NET OPERATING RESULT')) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = [248, 250, 252]
        }
      },
      margin: { left: margin, right: margin }
    })
  }

  // -------------------------------------------------------------
  // TAB C: EXPENSES PDF
  // -------------------------------------------------------------
  if (reportType === 'expenses' && payload.expenses) {
    const e = payload.expenses

    drawKpiRow([
      { label: 'Active Expenses', value: formatLKR(e.totalActiveAmount), subtext: `${e.activeCount} recorded items` },
      { label: 'Active Categories', value: String(e.categories.length), subtext: 'Expenditure departments' },
      { label: 'Payment Channels', value: String(e.paymentMethods.length), subtext: 'Disbursement methods' },
      { label: 'Cancelled (Audited)', value: formatLKR(e.totalCancelledAmount), subtext: `${e.cancelledCount} cancelled records` }
    ])

    // Category Breakdown Table
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('Expenses by Category', margin, currentY)
    currentY += 3

    const catBody = e.categories.map((c) => {
      const pct = e.totalActiveAmount > 0 ? (c.amount / e.totalActiveAmount) * 100 : 0
      return [c.category, String(c.count), formatLKR(c.amount), `${pct.toFixed(1)}%`]
    })

    autoTable(doc, {
      startY: currentY,
      head: [['Expense Category', 'Transactions', 'Total Amount', '% of Total']],
      body: catBody.length > 0 ? catBody : [['No expenses recorded in period', '-', '-', '-']],
      theme: 'grid',
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7.5, textColor: [15, 23, 42] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right', fontStyle: 'bold' },
        3: { halign: 'right' }
      },
      margin: { left: margin, right: margin }
    })

    currentY = (doc as any).lastAutoTable.finalY + 8

    // Detailed Log
    if (currentY > pageHeight - 40) {
      doc.addPage()
      currentY = 20
    }

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('Expense Transaction Audit Log', margin, currentY)
    currentY += 3

    const logBody = e.records.map((rec) => [
      rec.date,
      rec.description,
      rec.category,
      rec.paymentMethod,
      rec.recordedBy,
      formatLKR(rec.amount)
    ])

    autoTable(doc, {
      startY: currentY,
      head: [['Date', 'Description', 'Category', 'Payment Method', 'Recorded By', 'Amount']],
      body: logBody.length > 0 ? logBody : [['No transactions in date range', '-', '-', '-', '-', '-']],
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7.5, textColor: [15, 23, 42] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        5: { halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    })
  }

  // -------------------------------------------------------------
  // TAB D: INVENTORY PDF
  // -------------------------------------------------------------
  if (reportType === 'inventory' && payload.inventory) {
    const inv = payload.inventory

    drawKpiRow([
      { label: 'Current Cost Value', value: formatLKR(inv.totalValuationAtCost), subtext: `${inv.totalTrackedItems} tracked items` },
      { label: 'Retail Value', value: formatLKR(inv.totalValuationAtRetail), subtext: 'Potential revenue' },
      { label: 'Low Stock Warnings', value: `${inv.lowStockItems.length} items`, subtext: 'Below threshold' },
      { label: 'Period Purchases', value: formatLKR(inv.purchaseCost), subtext: `${inv.purchaseUnits} units received` }
    ])

    // Low stock table
    if (inv.lowStockItems.length > 0) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(225, 29, 72)
      doc.text('Items Requiring Reorder (Low Stock)', margin, currentY)
      currentY += 3

      const lowBody = inv.lowStockItems.map((item) => [
        item.productName,
        item.code,
        item.category,
        `${item.currentQuantity} ${item.unit}`,
        `${item.reorderThreshold} ${item.unit}`,
        formatLKR(item.unitCost),
        item.supplier || 'Primary Supplier'
      ])

      autoTable(doc, {
        startY: currentY,
        head: [['Product Name', 'Code', 'Category', 'Current Qty', 'Reorder Level', 'Unit Cost', 'Supplier']],
        body: lowBody,
        theme: 'grid',
        headStyles: { fillColor: [225, 29, 72], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: [15, 23, 42] },
        columnStyles: {
          3: { halign: 'right', fontStyle: 'bold' },
          4: { halign: 'right' },
          5: { halign: 'right' }
        },
        margin: { left: margin, right: margin }
      })

      currentY = (doc as any).lastAutoTable.finalY + 8
    }

    // Movements Table
    if (currentY > pageHeight - 40) {
      doc.addPage()
      currentY = 20
    }

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('Period Stock Movements Log', margin, currentY)
    currentY += 3

    const moveBody = inv.movements.map((m) => [
      (m.timestamp || '').slice(0, 16).replace('T', ' '),
      m.productName,
      m.type,
      m.quantityChange > 0 ? `+${m.quantityChange}` : String(m.quantityChange),
      String(m.balanceAfter),
      m.reason
    ])

    autoTable(doc, {
      startY: currentY,
      head: [['Timestamp', 'Product Name', 'Type', 'Qty Change', 'Balance After', 'Reason']],
      body: moveBody.length > 0 ? moveBody : [['No movements recorded in period', '-', '-', '-', '-', '-']],
      theme: 'grid',
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7.5, textColor: [15, 23, 42] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        3: { halign: 'right', fontStyle: 'bold' },
        4: { halign: 'right' }
      },
      margin: { left: margin, right: margin }
    })
  }

  // -------------------------------------------------------------
  // TAB E: SURFBOARD RENTALS PDF
  // -------------------------------------------------------------
  if (reportType === 'rentals' && payload.rentals) {
    const r = payload.rentals

    drawKpiRow([
      { label: 'Rental Revenue', value: formatLKR(r.totalRentalRevenue), subtext: `${r.totalCompletedCount} completed sessions` },
      { label: 'Avg Duration', value: `${r.avgDurationMins} mins`, subtext: 'Average on water' },
      { label: 'Active Rentals Now', value: `${r.activeRentalsCount} on water`, subtext: 'Running sessions' },
      { label: 'Total Board Fleet', value: `${r.totalFleetCount} boards`, subtext: 'Total club inventory' }
    ])

    // Board Utilization Ranking
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('Board Fleet Utilization & Revenue Ranking', margin, currentY)
    currentY += 3

    const boardBody = r.boardRankings.map((b) => [
      b.boardName,
      b.category,
      String(b.rentalCount),
      `${b.totalMinutes}m`,
      formatLKR(b.totalRevenue)
    ])

    autoTable(doc, {
      startY: currentY,
      head: [['Board Name', 'Category', 'Rental Count', 'Total Minutes', 'Total Revenue']],
      body: boardBody.length > 0 ? boardBody : [['No rentals completed in period', '-', '-', '-', '-']],
      theme: 'grid',
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7.5, textColor: [15, 23, 42] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    })

    currentY = (doc as any).lastAutoTable.finalY + 8

    // Completed Sessions Log
    if (currentY > pageHeight - 40) {
      doc.addPage()
      currentY = 20
    }

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('Completed Rentals History', margin, currentY)
    currentY += 3

    const rentBody = r.completedRentals.map((item) => [
      item.receiptNumber,
      `${item.returnDate || ''} ${item.returnTime || ''}`,
      item.customerName,
      item.boardName,
      item.durationDisplay || `${item.durationMinutes}m`,
      item.paymentMethod,
      formatLKR(item.totalCharged)
    ])

    autoTable(doc, {
      startY: currentY,
      head: [['Receipt #', 'Return Date & Time', 'Customer', 'Board', 'Duration', 'Payment', 'Total Charged']],
      body: rentBody.length > 0 ? rentBody : [['No rental sessions found', '-', '-', '-', '-', '-', '-']],
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7.5, textColor: [15, 23, 42] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        6: { halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    })
  }

  // Draw Page Numbers and Footers across all pages
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(148, 163, 184)
    doc.text(
      'Catamaran Surf Club POS · Dewata Beach, Galle · Official Management Report · Confidential',
      margin,
      pageHeight - 8
    )
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
  }

  // Trigger browser/Electron save
  const fileName = getSanitizedFileName(reportType.toUpperCase(), startDate, endDate, 'pdf')
  doc.save(fileName)
}

// ============================================================================
// EXCEL EXPORT ENGINE
// ============================================================================
export function exportReportToExcel(payload: ExportReportPayload): void {
  const { reportType, startDate, endDate } = payload
  const wb = XLSX.utils.book_new()
  const periodText = formatPeriodString(startDate, endDate, reportType === 'inventory')
  const generatedAt = getFormattedNow()

  // Standard Sheet Header Rows
  const createMetadataBlock = (title: string): any[][] => [
    ['CATAMARAN SURF CLUB POS - ' + title.toUpperCase()],
    ['Location:', 'Dewata Beach, Galle, Sri Lanka (Terminal 01)'],
    ['Reporting Period:', periodText],
    ['Export Timestamp:', generatedAt],
    ['Currency:', 'Sri Lankan Rupee (LKR)'],
    []
  ]

  // -------------------------------------------------------------
  // TAB A: SALES EXCEL
  // -------------------------------------------------------------
  if (reportType === 'sales' && payload.sales) {
    const s = payload.sales

    // Sheet 1: Sales Summary & Daily
    const summaryRows = [
      ...createMetadataBlock('Sales & Departmental Revenue Report'),
      ['KEY METRIC', 'VALUE'],
      ['Restaurant Net Sales (LKR)', s.totalRestaurantSales],
      ['Settled Invoices Count', s.totalSettledCount],
      ['Average Bill Value (LKR)', s.averageBillValue],
      ['Cash Sales Total (LKR)', s.cashSales],
      ['Cash Transactions Count', s.cashCount],
      ['Card Sales Total (LKR)', s.cardSales],
      ['Card Transactions Count', s.cardCount],
      ['Dine-in Sales Total (LKR)', s.dineInSales],
      ['Dine-in Invoices Count', s.dineInCount],
      ['Takeaway Sales Total (LKR)', s.takeawaySales],
      ['Takeaway Invoices Count', s.takeawayCount],
      ['Refunded Bills Count', s.cancelledCount],
      ['Refunded Amount Excluded (LKR)', s.refundedAmount],
      [],
      ['DAILY SALES BREAKDOWN'],
      ['Date', 'Bills Count', 'Dine-In Sales (LKR)', 'Takeaway Sales (LKR)', 'Cash Sales (LKR)', 'Card Sales (LKR)', 'Total Sales (LKR)'],
      ...s.dailySummary.map((d) => [
        d.date,
        d.billCount,
        d.dineInSales,
        d.takeawaySales,
        d.cashSales,
        d.cardSales,
        d.totalSales
      ])
    ]

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Sales Overview')

    // Sheet 2: Best Sellers
    const bestSellerRows = [
      ...createMetadataBlock('Product Best Sellers Ranking'),
      ['Rank', 'Product Name', 'Item Code', 'Quantity Sold', 'Total Revenue Generated (LKR)'],
      ...s.bestSellers.map((item, idx) => [
        idx + 1,
        item.name,
        item.code,
        item.quantity,
        item.revenue
      ])
    ]

    const wsBest = XLSX.utils.aoa_to_sheet(bestSellerRows)
    wsBest['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 15 }, { wch: 16 }, { wch: 28 }]
    XLSX.utils.book_append_sheet(wb, wsBest, 'Best Selling Products')
  }

  // -------------------------------------------------------------
  // TAB B: PROFIT & LOSS EXCEL
  // -------------------------------------------------------------
  if (reportType === 'profit' && payload.profit) {
    const p = payload.profit

    const plRows = [
      ...createMetadataBlock('Operating Profit & Loss Statement'),
      ['FINANCIAL HIGHLIGHTS', 'AMOUNT (LKR)'],
      ['Total Combined Revenue', p.totalCombinedRevenue],
      ['Catalog Cost of Goods Sold (Est.)', p.knownCOGS],
      ['Gross Operating Profit', p.grossProfit],
      ['Gross Operating Margin (%)', `${p.grossMarginPercent.toFixed(1)}%`],
      ['Total Operating Expenses', p.totalOperatingExpenses],
      ['Net Operating Result', p.netOperatingResult],
      ['Net Operating Margin (%)', `${p.netMarginPercent.toFixed(1)}%`],
      ['Catalog Cost Coverage (%)', `${p.costCoveragePercent}%`],
      [],
      ['DETAILED INCOME STATEMENT', 'AMOUNT (LKR)'],
      ['1. REVENUE STREAMS', ''],
      ['   Restaurant Sales Revenue', p.restaurantRevenue],
      ['   Surfboard Rentals Revenue', p.rentalRevenue],
      ['TOTAL OPERATING REVENUE', p.totalCombinedRevenue],
      [],
      ['2. DIRECT COST OF GOODS SOLD', ''],
      ['   Estimated Catalog COGS (Matched Line Items)', -p.knownCOGS],
      ['GROSS OPERATING PROFIT', p.grossProfit],
      [],
      ['3. OPERATING EXPENSES', ''],
      ...p.categories.map((c) => [`   ${c.category}`, -c.amount]),
      ['TOTAL OPERATING EXPENSES', -p.totalOperatingExpenses],
      [],
      ['NET OPERATING RESULT', p.netOperatingResult],
      [],
      ['DISCLOSURE NOTE:'],
      [
        'Cost of Goods Sold is calculated from current active catalog cost prices. Historical purchase price variations are not logged on bill items. Unconfigured items calculate at Rs. 0.00 cost.'
      ]
    ]

    const wsPL = XLSX.utils.aoa_to_sheet(plRows)
    wsPL['!cols'] = [{ wch: 45 }, { wch: 22 }]
    XLSX.utils.book_append_sheet(wb, wsPL, 'Profit and Loss Statement')
  }

  // -------------------------------------------------------------
  // TAB C: EXPENSES EXCEL
  // -------------------------------------------------------------
  if (reportType === 'expenses' && payload.expenses) {
    const e = payload.expenses

    // Sheet 1: Categories & Payment Methods
    const summaryRows = [
      ...createMetadataBlock('Operating Expenses Summary'),
      ['EXPENSE KPI', 'VALUE'],
      ['Total Active Expenses (LKR)', e.totalActiveAmount],
      ['Active Expense Records Count', e.activeCount],
      ['Cancelled Expenses (Audited)', e.totalCancelledAmount],
      ['Cancelled Records Count', e.cancelledCount],
      [],
      ['EXPENSES GROUPED BY CATEGORY'],
      ['Category Name', 'Transaction Count', 'Total Amount (LKR)', '% of Total Spending'],
      ...e.categories.map((c) => [
        c.category,
        c.count,
        c.amount,
        e.totalActiveAmount > 0 ? `${((c.amount / e.totalActiveAmount) * 100).toFixed(1)}%` : '0%'
      ]),
      [],
      ['PAYMENT METHOD DISBURSEMENT'],
      ['Payment Method', 'Transactions', 'Total Amount (LKR)'],
      ...e.paymentMethods.map((p) => [p.method, p.count, p.amount])
    ]

    const wsExpSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsExpSummary['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 22 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, wsExpSummary, 'Expenses Summary')

    // Sheet 2: Transactions Log
    const logRows = [
      ...createMetadataBlock('Expense Transactions Log'),
      ['Date', 'Description', 'Category', 'Payment Method', 'Recorded By', 'Status', 'Amount (LKR)'],
      ...e.records.map((rec) => [
        rec.date,
        rec.description,
        rec.category,
        rec.paymentMethod,
        rec.recordedBy,
        rec.status,
        rec.amount
      ])
    ]

    const wsLog = XLSX.utils.aoa_to_sheet(logRows)
    wsLog['!cols'] = [{ wch: 14 }, { wch: 35 }, { wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, wsLog, 'Transactions Log')
  }

  // -------------------------------------------------------------
  // TAB D: INVENTORY EXCEL
  // -------------------------------------------------------------
  if (reportType === 'inventory' && payload.inventory) {
    const inv = payload.inventory

    // Sheet 1: Stock Snapshot
    const snapRows = [
      ...createMetadataBlock('Warehouse Inventory Current Snapshot'),
      ['INVENTORY KPI', 'VALUE'],
      ['Total Tracked Products', inv.totalTrackedItems],
      ['Valuation at Cost (LKR)', inv.totalValuationAtCost],
      ['Valuation at Retail (LKR)', inv.totalValuationAtRetail],
      ['Low Stock Alert Items Count', inv.lowStockItems.length],
      ['Period Purchases Total (LKR)', inv.purchaseCost],
      ['Period Wastage Total (LKR)', inv.wastageCost],
      [],
      ['WAREHOUSE STOCK SNAPSHOT (LIVE BALANCES)'],
      ['Product Name', 'Code', 'Category', 'Current Qty', 'Unit', 'Reorder Level', 'Unit Cost (LKR)', 'Selling Price (LKR)', 'Stock Value @ Cost (LKR)', 'Supplier'],
      ...inv.allItems.map((item) => [
        item.productName,
        item.code,
        item.category,
        item.currentQuantity,
        item.unit,
        item.reorderThreshold,
        item.unitCost,
        item.sellingPrice,
        item.currentQuantity * item.unitCost,
        item.supplier || ''
      ])
    ]

    const wsSnap = XLSX.utils.aoa_to_sheet(snapRows)
    wsSnap['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 24 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, wsSnap, 'Current Stock Snapshot')

    // Sheet 2: Movements Log
    const moveRows = [
      ...createMetadataBlock('Period Stock Movements Audit Log'),
      ['Timestamp', 'Product Name', 'Code', 'Movement Type', 'Qty Change', 'Balance After', 'Unit Cost (LKR)', 'Total Cost (LKR)', 'Performed By', 'Reason'],
      ...inv.movements.map((m) => [
        (m.timestamp || '').slice(0, 19).replace('T', ' '),
        m.productName,
        m.productCode,
        m.type,
        m.quantityChange,
        m.balanceAfter,
        m.unitCost || 0,
        m.totalCost || 0,
        m.performedBy || '',
        m.reason || ''
      ])
    ]

    const wsMove = XLSX.utils.aoa_to_sheet(moveRows)
    wsMove['!cols'] = [{ wch: 20 }, { wch: 26 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, wsMove, 'Stock Movements')
  }

  // -------------------------------------------------------------
  // TAB E: SURFBOARD RENTALS EXCEL
  // -------------------------------------------------------------
  if (reportType === 'rentals' && payload.rentals) {
    const r = payload.rentals

    // Sheet 1: Fleet Utilization
    const fleetRows = [
      ...createMetadataBlock('Surfboard Fleet Performance & Utilization'),
      ['FLEET METRIC', 'VALUE'],
      ['Total Rental Revenue (Paid LKR)', r.totalRentalRevenue],
      ['Completed Rental Sessions', r.totalCompletedCount],
      ['Average Session Duration (Mins)', r.avgDurationMins],
      ['Active Rentals on Water Now', r.activeRentalsCount],
      ['Total Boards in Fleet', r.totalFleetCount],
      [],
      ['BOARD UTILIZATION & REVENUE RANKING'],
      ['Board Name', 'Category', 'Times Rented', 'Total Minutes on Water', 'Total Revenue (LKR)'],
      ...r.boardRankings.map((b) => [
        b.boardName,
        b.category,
        b.rentalCount,
        b.totalMinutes,
        b.totalRevenue
      ])
    ]

    const wsFleet = XLSX.utils.aoa_to_sheet(fleetRows)
    wsFleet['!cols'] = [{ wch: 25 }, { wch: 24 }, { wch: 15 }, { wch: 24 }, { wch: 22 }]
    XLSX.utils.book_append_sheet(wb, wsFleet, 'Fleet Utilization')

    // Sheet 2: Completed Sessions Log
    const sessionRows = [
      ...createMetadataBlock('Completed Rentals History'),
      ['Receipt #', 'Return Date', 'Return Time', 'Customer Name', 'Contact', 'Board Name', 'Category', 'Duration (Mins)', 'Duration Display', 'Payment Method', 'Payment Status', 'Rental Charge (LKR)', 'Damage Fee (LKR)', 'Total Charged (LKR)'],
      ...r.completedRentals.map((item) => [
        item.receiptNumber,
        item.returnDate || '',
        item.returnTime || '',
        item.customerName,
        item.customerContact || '',
        item.boardName,
        item.boardCategory || '',
        item.durationMinutes,
        item.durationDisplay || '',
        item.paymentMethod,
        item.paymentStatus,
        item.actualRentalCharge,
        item.damageFee,
        item.totalCharged
      ])
    ]

    const wsSessions = XLSX.utils.aoa_to_sheet(sessionRows)
    wsSessions['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, wsSessions, 'Rentals History')
  }

  // Trigger browser/Electron save
  const fileName = getSanitizedFileName(reportType.toUpperCase(), startDate, endDate, 'xlsx')
  XLSX.writeFile(wb, fileName)
}
