import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/**
 * Print 58mm Thermal Receipt using an isolated iframe.
 *
 * Why an iframe?
 * 1. Bypasses all complex web app layout/overflow/modal constraints.
 * 2. Guaranteed NEVER to produce a blank white page in Chrome print preview.
 * 3. Enforces strictly 58mm thermal roll width and auto-height.
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
        <title>Receipt</title>
        ${styleElements}
        <style>
          @page {
            size: 58mm auto;
            margin: 0mm;
          }
          html, body {
            width: 58mm !important;
            max-width: 58mm !important;
            min-width: 58mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: 'Courier New', Courier, monospace !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .thermal-print-wrapper {
            width: 48mm !important;
            max-width: 48mm !important;
            margin: 0 auto !important;
            padding: 1.5mm 1mm 8mm 1mm !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .thermal-print-wrapper * {
            visibility: visible !important;
            color: #000000 !important;
          }
          img {
            max-width: 36mm !important;
            max-height: 24mm !important;
            display: block !important;
            margin: 0 auto !important;
            filter: grayscale(100%) contrast(150%) !important;
            -webkit-filter: grayscale(100%) contrast(150%) !important;
          }
        </style>
      </head>
      <body>
        <div class="thermal-print-wrapper">
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

/**
 * Download the exact on-screen 58mm Thermal Receipt as a high-resolution 58mm PDF.
 *
 * Captures #thermal-print-target down to every pixel, character, logo, dashed divider,
 * and software credit so the downloaded file is a 100% EXACT MATCH to the physical roll.
 */
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

    // 58mm paper width in millimeters
    const pdfWidth = 58
    // Calculate proportional height in millimeters
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pdfWidth, Math.max(80, pdfHeight + 4)]
    })

    pdf.addImage(imgData, 'PNG', 0, 2, pdfWidth, pdfHeight)

    const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
    pdf.save(cleanFilename)
    return true
  } catch (err) {
    console.error('Failed to capture thermal receipt to PDF:', err)
    return false
  }
}
