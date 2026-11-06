import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/**
 * Print 80mm Thermal Receipt using an isolated iframe.
 *
 * Why an iframe?
 * 1. Bypasses all complex web app layout/overflow/modal constraints.
 * 2. Guaranteed NEVER to produce a blank white page in Chrome print preview.
 * 3. Enforces strictly 80mm thermal roll width (72mm printable content) and auto-height.
 * 4. Works seamlessly with Chrome `--kiosk-printing` for zero-popup instant thermal printing.
 */
export function printThermalReceipt(elementId: string = 'thermal-print-target'): void {
  const element = document.getElementById(elementId)
  if (!element) {
    window.print()
    return
  }

  // Remove any previously created print frames
  const oldFrame = document.getElementById('pos-silent-print-frame')
  if (oldFrame) {
    oldFrame.remove()
  }

  // Create clean isolated iframe
  const iframe = document.createElement('iframe')
  iframe.id = 'pos-silent-print-frame'
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.visibility = 'hidden'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    window.print()
    return
  }

  // Grab active stylesheets so thermal receipt styles are carried over
  const styleElements = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((el) => el.outerHTML)
    .join('\n')

  doc.open()
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt - 80mm Thermal</title>
        ${styleElements}
        <style>
          @page {
            size: 80mm auto;
            margin: 0mm;
          }
          * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: 'Courier New', Courier, monospace !important;
            overflow: visible !important;
          }
          #thermal-print-target,
          .thermal-print-wrapper,
          .thermal-paper-80mm,
          .pro-receipt-paper {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 100% !important;
            margin: 0 !important;
            padding: 2mm 3mm 12mm 3mm !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            color: #000000 !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          .thermal-print-wrapper * {
            visibility: visible !important;
            color: #000000 !important;
          }
          img, .pro-receipt-logo {
            max-width: 58mm !important;
            max-height: 35mm !important;
            width: auto !important;
            height: auto !important;
            display: block !important;
            margin: 0 auto 2mm auto !important;
            filter: grayscale(100%) contrast(150%) brightness(95%) !important;
            -webkit-filter: grayscale(100%) contrast(150%) brightness(95%) !important;
            image-rendering: -webkit-optimize-contrast !important;
            image-rendering: crisp-edges !important;
          }
          .pro-restaurant-name {
            font-size: 13.5pt !important;
            font-weight: 900 !important;
            color: #000000 !important;
            text-align: center !important;
            letter-spacing: 0.02em !important;
            line-height: 1.2 !important;
            margin: 1.5mm 0 0.5mm 0 !important;
          }
          .pro-restaurant-tagline, .t-branch, .t-hotline {
            font-size: 8.5pt !important;
            font-weight: 700 !important;
            color: #000000 !important;
            text-align: center !important;
            line-height: 1.25 !important;
            display: block !important;
          }
          .official-receipt-title, .reprint-banner-text, .kot-badge-title {
            font-size: 9.5pt !important;
            font-weight: 900 !important;
            color: #000000 !important;
            letter-spacing: 0.04em !important;
            display: block !important;
            text-align: center !important;
            margin: 1mm 0 !important;
          }
          .t-rule-double {
            border-top: 2px double #000000 !important;
            margin: 2mm 0 !important;
            width: 100% !important;
            height: 0 !important;
            border-bottom: none !important;
          }
          .t-rule-dash {
            border-top: 1.5px dashed #000000 !important;
            margin: 2mm 0 !important;
            width: 100% !important;
            height: 0 !important;
            border-bottom: none !important;
          }
          .t-meta-block {
            font-size: 8.5pt !important;
            line-height: 1.35 !important;
            width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 1mm !important;
          }
          .t-flex {
            display: flex !important;
            justify-content: space-between !important;
            align-items: baseline !important;
            width: 100% !important;
            color: #000000 !important;
          }
          .t-meta-k {
            font-size: 8.5pt !important;
            font-weight: 700 !important;
            color: #000000 !important;
          }
          .t-meta-v {
            font-size: 8.5pt !important;
            color: #000000 !important;
          }
          .t-bill-no {
            font-size: 9.5pt !important;
            font-weight: 900 !important;
          }
          .t-badge-pill {
            font-size: 8pt !important;
            font-weight: 800 !important;
            border: 1px solid #000000 !important;
            padding: 0 4px !important;
            border-radius: 3px !important;
          }
          .pro-items-table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin: 2mm 0 !important;
            table-layout: fixed !important;
          }
          .pro-items-table th {
            font-size: 8.5pt !important;
            font-weight: 800 !important;
            border-bottom: 1.5px dashed #000000 !important;
            padding: 1.5mm 0 !important;
            color: #000000 !important;
            line-height: 1.2 !important;
          }
          .pro-items-table td {
            font-size: 8.5pt !important;
            padding: 1.5mm 0 !important;
            vertical-align: top !important;
            color: #000000 !important;
            line-height: 1.25 !important;
          }
          .t-th-item, .t-td-item {
            width: 48% !important;
            word-break: break-word !important;
            text-align: left !important;
          }
          .t-th-qty, .t-td-qty {
            width: 14% !important;
            text-align: center !important;
            font-weight: 700 !important;
          }
          .t-th-rate, .t-td-rate {
            width: 19% !important;
            text-align: right !important;
          }
          .t-th-amt, .t-td-amt {
            width: 19% !important;
            text-align: right !important;
            font-weight: 800 !important;
          }
          .t-item-name {
            font-weight: 800 !important;
            color: #000000 !important;
            word-break: break-word !important;
            line-height: 1.2 !important;
          }
          .t-item-code {
            font-size: 7pt !important;
            color: #000000 !important;
          }
          .t-summary-block {
            font-size: 8.5pt !important;
            line-height: 1.35 !important;
            width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 1mm !important;
          }
          .pro-grand-total {
            font-size: 13.5pt !important;
            font-weight: 900 !important;
            padding: 2mm 0 !important;
            display: flex !important;
            justify-content: space-between !important;
            width: 100% !important;
            color: #000000 !important;
          }
          .pro-grand-total strong {
            font-size: 13.5pt !important;
            font-weight: 900 !important;
          }
          .pro-payment-tender-box {
            margin: 2mm 0 !important;
            padding: 2mm 2.5mm !important;
            border: 1.5px solid #000000 !important;
            width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 1.2mm !important;
            background: transparent !important;
          }
          .t-tender-row {
            display: flex !important;
            justify-content: space-between !important;
            align-items: baseline !important;
            font-size: 8.5pt !important;
            color: #000000 !important;
          }
          .t-tender-lbl {
            font-size: 8pt !important;
            font-weight: 700 !important;
          }
          .t-tender-val {
            font-size: 9pt !important;
            font-weight: 800 !important;
          }
          .t-change-val {
            font-size: 11pt !important;
            font-weight: 900 !important;
          }
          .pro-receipt-footer {
            font-size: 8pt !important;
            line-height: 1.35 !important;
            color: #000000 !important;
            text-align: center !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 1.5mm !important;
            margin-top: 2.5mm !important;
            width: 100% !important;
          }
          .pro-software-credit {
            font-size: 7.5pt !important;
            letter-spacing: 0.05em !important;
            color: #000000 !important;
            text-align: center !important;
            font-weight: 700 !important;
            margin-top: 2mm !important;
          }
        </style>
      </head>
      <body>
        <div class="thermal-print-wrapper" id="thermal-print-target">
          ${element.innerHTML}
        </div>
      </body>
    </html>
  `)
  doc.close()

  // Wait for images (logo) to decode inside iframe before firing print
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch (err) {
      console.warn('Iframe print failed, falling back to window.print():', err)
      window.print()
    } finally {
      setTimeout(() => {
        iframe.remove()
      }, 3000)
    }
  }, 260)
}

export async function downloadReceiptAsPDF(
  elementId: string = 'thermal-print-target',
  filename: string = 'Catamaran_Receipt'
): Promise<boolean> {
  const element = document.getElementById(elementId)
  if (!element) {
    console.warn(`Element #${elementId} not found for PDF download`)
    return false
  }

  try {
    // High-resolution canvas capture (scale: 3 for crisp thermal text & logo)
    const canvas = await html2canvas(element, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight
    })

    const imgData = canvas.toDataURL('image/png')

    // 80mm paper width in millimeters
    const pdfWidth = 80
    // Calculate proportional height in millimeters
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pdfWidth, Math.max(100, pdfHeight + 6)]
    })

    pdf.addImage(imgData, 'PNG', 0, 3, pdfWidth, pdfHeight)

    const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
    pdf.save(cleanFilename)
    return true
  } catch (err) {
    console.error('Failed to capture thermal receipt to PDF:', err)
    return false
  }
}

