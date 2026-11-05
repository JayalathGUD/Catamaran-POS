import { jsPDF } from 'jspdf'
import { formatLKR } from '../data/demoData'
import { HistoryBill } from '../types'
import { downloadReceiptAsPDF } from './printReceiptHelper'
import { getLocalSettings } from './settingsStore'

export interface BillPdfPayload {
  billNumber: string
  date?: string
  time?: string
  orderType?: string
  customerName?: string
  cashier?: string
  paymentMethod?: string
  items: Array<{
    name: string
    quantity: number
    unitPrice: number
    total: number
    code?: string
  }>
  subtotal: number
  discount?: number
  serviceCharge?: number
  total: number
  amountTendered?: number
  changeDue?: number
  splitCashAmount?: number
  splitCardAmount?: number
  status?: string
}

/**
 * Downloads a 58mm thermal receipt PDF matching the printed paper receipt.
 * If the preview is already mounted on the screen, captures #thermal-print-target via canvas.
 * Otherwise, generates an authentic 58mm monospace thermal roll document.
 */
export async function downloadBillPDF(bill: BillPdfPayload | HistoryBill): Promise<void> {
  // If preview DOM element is currently present, capture it directly for 100% pixel-perfect replica
  if (typeof document !== 'undefined') {
    const printEl = document.getElementById('thermal-print-target')
    if (printEl) {
      const captured = await downloadReceiptAsPDF(
        'thermal-print-target',
        `Catamaran_Receipt_${bill.billNumber}`
      )
      if (captured) return
    }
  }

  // Pure 58mm thermal roll fallback
  const settings = getLocalSettings()
  const restaurantName = settings.restaurantName || 'CATAMARAN BEACH RESTAURANT'
  const tagline = settings.restaurantTagline || 'BEACHFRONT DINING · BAR · SURF'
  const address = settings.restaurantAddress || 'Dewata Beach, Galle, Sri Lanka'
  const phone = settings.restaurantPhone || 'TEL: +94 91 224 8890 | +94 77 123 4567'
  const credit = settings.softwareCredit || 'Software by Nexion Solution'

  const items = bill.items || []
  const estimatedHeight = Math.max(120, 100 + items.length * 6.5)

  // 58mm paper width in mm
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [58, estimatedHeight]
  })

  const pageWidth = 58
  const marginLeft = 3
  const marginRight = 55
  let y = 7

  // 1. Restaurant Header
  doc.setFont('courier', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  doc.text(restaurantName, pageWidth / 2, y, { align: 'center' })
  y += 4

  doc.setFont('courier', 'normal')
  doc.setFontSize(6)
  doc.text(tagline, pageWidth / 2, y, { align: 'center' })
  y += 3
  doc.text(address, pageWidth / 2, y, { align: 'center' })
  y += 3
  doc.text(phone, pageWidth / 2, y, { align: 'center' })
  y += 4

  // Dashed divider
  doc.text('------------------------------------------', pageWidth / 2, y, { align: 'center' })
  y += 3.5

  // 2. Receipt Title & Metadata
  doc.setFont('courier', 'bold')
  doc.setFontSize(7.5)
  doc.text('OFFICIAL GUEST RECEIPT', pageWidth / 2, y, { align: 'center' })
  y += 4

  doc.setFont('courier', 'normal')
  doc.setFontSize(6)
  doc.text(`BILL NO: ${bill.billNumber}`, marginLeft, y)
  y += 3
  doc.text(`DATE: ${bill.date || ''}  TIME: ${bill.time || ''}`, marginLeft, y)
  y += 3
  const orderType = (bill.orderType || (bill as any).saleType || 'Dine-in').toUpperCase()
  doc.text(`ORDER TYPE: ${orderType}`, marginLeft, y)
  if (bill.customerName) {
    y += 3
    doc.text(`GUEST: ${bill.customerName.toUpperCase()}`, marginLeft, y)
  }
  y += 3
  doc.text(`CASHIER: ${bill.cashier || 'Cashier'}`, marginLeft, y)
  y += 3.5

  // 3. Table Header
  doc.text('------------------------------------------', pageWidth / 2, y, { align: 'center' })
  y += 3
  doc.setFont('courier', 'bold')
  doc.text('QTY  DESCRIPTION', marginLeft, y)
  doc.text('TOTAL', marginRight, y, { align: 'right' })
  y += 2
  doc.setFont('courier', 'normal')
  doc.text('------------------------------------------', pageWidth / 2, y, { align: 'center' })
  y += 3.5

  // 4. Line Items
  for (const item of items) {
    const qtyText = `${item.quantity}x `
    const nameText = item.name.length > 20 ? item.name.substring(0, 19) + '..' : item.name
    doc.text(`${qtyText}${nameText}`, marginLeft, y)
    doc.text(formatLKR(item.total).replace('Rs. ', ''), marginRight, y, { align: 'right' })
    y += 3.5
  }

  // 5. Divider & Totals
  doc.text('------------------------------------------', pageWidth / 2, y, { align: 'center' })
  y += 3.5

  doc.text('Subtotal:', marginLeft, y)
  doc.text(formatLKR(bill.subtotal || bill.total), marginRight, y, { align: 'right' })
  y += 3

  if (bill.discount && bill.discount > 0) {
    doc.text('Discount:', marginLeft, y)
    doc.text(`-${formatLKR(bill.discount)}`, marginRight, y, { align: 'right' })
    y += 3
  }

  if (bill.serviceCharge && bill.serviceCharge > 0) {
    doc.text('Service Charge (10%):', marginLeft, y)
    doc.text(formatLKR(bill.serviceCharge), marginRight, y, { align: 'right' })
    y += 3
  }

  doc.text('------------------------------------------', pageWidth / 2, y, { align: 'center' })
  y += 3.5

  // Grand Total
  doc.setFont('courier', 'bold')
  doc.setFontSize(8)
  doc.text('TOTAL AMOUNT:', marginLeft, y)
  doc.text(formatLKR(bill.total), marginRight, y, { align: 'right' })
  y += 4

  // Payment
  doc.setFont('courier', 'normal')
  doc.setFontSize(6)
  doc.text(`PAYMENT: ${bill.paymentMethod || 'Cash'}`, marginLeft, y)
  y += 3

  const isSplitBill =
    (bill.paymentMethod || '').toLowerCase().includes('split') ||
    ((bill.splitCashAmount ?? 0) > 0 && (bill.splitCardAmount ?? 0) > 0)

  if (isSplitBill) {
    if (bill.splitCashAmount !== undefined) {
      doc.text('CASH PORTION:', marginLeft, y)
      doc.text(formatLKR(bill.splitCashAmount), marginRight, y, { align: 'right' })
      y += 3
    }
    if (bill.splitCardAmount !== undefined) {
      doc.text('CARD CHARGED:', marginLeft, y)
      doc.text(formatLKR(bill.splitCardAmount), marginRight, y, { align: 'right' })
      y += 3
    }
    if (bill.changeDue && bill.changeDue > 0) {
      doc.text('CHANGE RETURNED:', marginLeft, y)
      doc.text(formatLKR(bill.changeDue), marginRight, y, { align: 'right' })
      y += 3
    }
  } else if (bill.amountTendered && bill.amountTendered > 0) {
    doc.text('CASH TENDERED:', marginLeft, y)
    doc.text(formatLKR(bill.amountTendered), marginRight, y, { align: 'right' })
    y += 3
    doc.text('CHANGE DUE:', marginLeft, y)
    doc.text(formatLKR(bill.changeDue || 0), marginRight, y, { align: 'right' })
    y += 3
  }

  // 6. Footer
  doc.text('------------------------------------------', pageWidth / 2, y, { align: 'center' })
  y += 3.5
  doc.setFontSize(5.5)
  doc.text('THANK YOU FOR DINING WITH US!', pageWidth / 2, y, { align: 'center' })
  y += 2.8
  doc.text('FRESH SEAFOOD · COCKTAILS · GOOD VIBES', pageWidth / 2, y, { align: 'center' })
  y += 3
  doc.text('[ - - - - - - THANK YOU - - - - - - ]', pageWidth / 2, y, { align: 'center' })
  y += 3.5
  doc.text(credit, pageWidth / 2, y, { align: 'center' })

  doc.save(`Catamaran_Receipt_${bill.billNumber}.pdf`)
}
