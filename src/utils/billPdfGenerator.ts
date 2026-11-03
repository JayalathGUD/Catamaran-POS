import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatLKR } from '../data/demoData'
import { HistoryBill } from '../types'
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
  status?: string
}

export function downloadBillPDF(bill: BillPdfPayload | HistoryBill): void {
  const settings = getLocalSettings()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
  const pageWidth = doc.internal.pageSize.width
  const margin = 12

  const restaurantName = settings.restaurantName || 'CATAMARAN BEACH RESTAURANT'
  const tagline = settings.restaurantTagline || 'BEACHFRONT DINING · BAR · SURF'
  const address = settings.restaurantAddress || 'Yaddehimulla Road, Unawatuna, Galle'
  const phone = settings.restaurantPhone || '+94 91 224 8890 | +94 77 123 4567'
  const credit = settings.softwareCredit || 'Software by Nexion Solution'

  // Header Banner
  doc.setFillColor(15, 118, 110) // #0f766e
  doc.rect(0, 0, pageWidth, 24, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(restaurantName, pageWidth / 2, 9, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(tagline, pageWidth / 2, 14, { align: 'center' })
  doc.text(`${address} · TEL: ${phone}`, pageWidth / 2, 19, { align: 'center' })

  let currentY = 30

  // Invoice Title
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('OFFICIAL INVOICE & GUEST BILL', margin, currentY)

  // Status Badge on right
  const billStatus = (bill.status || 'Settled').toUpperCase()
  doc.setFontSize(9)
  if (billStatus === 'SETTLED' || billStatus === 'PAID') {
    doc.setTextColor(22, 101, 52)
  } else if (billStatus === 'OPEN') {
    doc.setTextColor(180, 83, 9)
  } else {
    doc.setTextColor(185, 28, 28)
  }
  doc.text(`[ STATUS: ${billStatus} ]`, pageWidth - margin, currentY, { align: 'right' })

  currentY += 6

  // Meta Information Box
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 20, 2, 2, 'FD')

  doc.setTextColor(71, 85, 105)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)

  const col1 = margin + 4
  const col2 = margin + 48
  const col3 = margin + 88

  // Row 1
  doc.text(`Bill Number:`, col1, currentY + 5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(`${bill.billNumber}`, col1 + 18, currentY + 5)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(`Order Type:`, col2, currentY + 5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(`${bill.orderType || 'Dine-in'}`, col2 + 16, currentY + 5)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(`Date:`, col3, currentY + 5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(`${bill.date || new Date().toLocaleDateString('en-GB')}`, col3 + 9, currentY + 5)

  // Row 2
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(`Server:`, col1, currentY + 11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(`${bill.cashier || settings.cashierName || 'Kasun P.'}`, col1 + 18, currentY + 11)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(`Table/Guest:`, col2, currentY + 11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(`${bill.customerName || 'Standard Guest'}`, col2 + 16, currentY + 11)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(`Time:`, col3, currentY + 11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(`${bill.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`, col3 + 9, currentY + 11)

  // Row 3
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(`Payment:`, col1, currentY + 16.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(`${bill.paymentMethod || 'Cash'}`, col1 + 18, currentY + 16.5)

  currentY += 24

  // Items Table
  const tableData = bill.items.map((it, idx) => [
    idx + 1,
    it.code ? `${it.name} (${it.code})` : it.name,
    formatLKR(it.unitPrice),
    it.quantity,
    formatLKR(it.total)
  ])

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['#', 'Item Description', 'Unit Price', 'Qty', 'Total (LKR)']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59]
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 26, halign: 'right' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 26, halign: 'right' }
    }
  })

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4

  // Financial Breakdown Box on right
  const summaryWidth = 65
  const summaryX = pageWidth - margin - summaryWidth

  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(255, 255, 255)

  let sumY = finalY
  doc.setFontSize(8)

  // Subtotal
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text('Subtotal:', summaryX, sumY)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(formatLKR(bill.subtotal), pageWidth - margin, sumY, { align: 'right' })
  sumY += 4.5

  // Discount (if any)
  if (bill.discount && bill.discount > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(220, 38, 38)
    doc.text('Discount:', summaryX, sumY)
    doc.setFont('helvetica', 'bold')
    doc.text(`-${formatLKR(bill.discount)}`, pageWidth - margin, sumY, { align: 'right' })
    sumY += 4.5
  }

  // Service Charge (if any)
  if (bill.serviceCharge && bill.serviceCharge > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text('Service Charge:', summaryX, sumY)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(`+${formatLKR(bill.serviceCharge)}`, pageWidth - margin, sumY, { align: 'right' })
    sumY += 4.5
  }

  // Divider
  doc.setDrawColor(15, 118, 110)
  doc.setLineWidth(0.4)
  doc.line(summaryX, sumY, pageWidth - margin, sumY)
  sumY += 5

  // Grand Total
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(15, 118, 110)
  doc.text('GRAND TOTAL:', summaryX, sumY)
  doc.text(formatLKR(bill.total), pageWidth - margin, sumY, { align: 'right' })
  sumY += 5.5

  // Cash / Tender Details
  if (bill.paymentMethod?.toLowerCase().includes('cash')) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(71, 85, 105)
    doc.text('Cash Received:', summaryX, sumY)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(formatLKR(bill.amountTendered || bill.total), pageWidth - margin, sumY, { align: 'right' })
    sumY += 4

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text('Change Returned:', summaryX, sumY)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(formatLKR(bill.changeDue || 0), pageWidth - margin, sumY, { align: 'right' })
    sumY += 4
  }

  // Footer text
  const footerY = Math.max(sumY + 8, doc.internal.pageSize.height - 14)
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.2)
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.setTextColor(100, 116, 139)
  doc.text('Thank you for dining at Catamaran Beach Restaurant!', pageWidth / 2, footerY, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(71, 85, 105)
  doc.text(credit, pageWidth / 2, footerY + 4, { align: 'center' })

  const sanitizedBillNum = (bill.billNumber || 'Bill').replace(/[^a-zA-Z0-9_-]/g, '_')
  doc.save(`Catamaran_Bill_${sanitizedBillNum}.pdf`)
}
