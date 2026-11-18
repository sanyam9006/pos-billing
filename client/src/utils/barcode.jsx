import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

/**
 * Calculate EAN-13 check digit for the first 12 digits.
 * Positions 1, 3, 5, 7, 9, 11 (odd): weight 1
 * Positions 2, 4, 6, 8, 10, 12 (even): weight 3
 */
export function calculateEan13CheckDigit(first12Digits) {
  const str = String(first12Digits).trim()
  if (str.length !== 12 || !/^\d{12}$/.test(str)) {
    return null
  }
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(str[i], 10)
    sum += (i % 2 === 0) ? digit * 1 : digit * 3
  }
  const remainder = sum % 10
  return remainder === 0 ? 0 : 10 - remainder
}

/**
 * Check if a 13-digit code is a valid EAN-13 barcode with correct check digit.
 */
export function isValidEan13(code) {
  const str = String(code || '').trim()
  if (str.length !== 13 || !/^\d{13}$/.test(str)) {
    return false
  }
  const first12 = str.slice(0, 12)
  const checkDigit = parseInt(str[12], 10)
  return calculateEan13CheckDigit(first12) === checkDigit
}

/**
 * Generate a standalone SVG string for any barcode.
 * Uses real EAN-13 for valid 13-digit codes, or Code128 fallback for legacy codes.
 * Includes quiet zones and human-readable text below.
 */
export function generateBarcodeSvgString(barcode, options = {}) {
  if (!barcode || !String(barcode).trim()) return ''
  const cleanBarcode = String(barcode).trim()

  const isEan13 = cleanBarcode.length === 13 && /^\d{13}$/.test(cleanBarcode) && isValidEan13(cleanBarcode)
  const format = options.format || (isEan13 ? 'EAN13' : 'CODE128')

  const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  try {
    JsBarcode(svgNode, cleanBarcode, {
      format,
      displayValue: options.displayValue !== undefined ? options.displayValue : true,
      font: 'monospace',
      fontSize: options.fontSize || 12,
      textMargin: options.textMargin || 2,
      margin: options.margin !== undefined ? options.margin : 10, // quiet zone
      width: options.width || 1.6,
      height: options.height || 36,
      lineColor: options.lineColor || '#000000',
      background: options.background || '#ffffff',
      ...options
    })
    return svgNode.outerHTML
  } catch (err) {
    console.error('Failed to generate barcode SVG:', err)
    return ''
  }
}

/**
 * React Component for rendering inline SVG barcode (EAN-13 or Code128)
 */
export function BarcodeSvg({
  barcode,
  width = 1.6,
  height = 36,
  fontSize = 12,
  margin = 8,
  displayValue = true,
  className = '',
  style = {}
}) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (svgRef.current && barcode) {
      try {
        const clean = String(barcode).trim()
        const isEan13 = clean.length === 13 && /^\d{13}$/.test(clean) && isValidEan13(clean)
        const format = isEan13 ? 'EAN13' : 'CODE128'

        JsBarcode(svgRef.current, clean, {
          format,
          displayValue,
          font: 'monospace',
          fontSize,
          textMargin: 2,
          margin, // quiet zone
          width,
          height,
          lineColor: '#000000',
          background: '#ffffff'
        })
      } catch (err) {
        console.error('JsBarcode rendering error:', err)
      }
    }
  }, [barcode, width, height, fontSize, margin, displayValue])

  if (!barcode) return null

  return (
    <div className={`barcode-container ${className}`} style={{ display: 'inline-block', ...style }}>
      <svg ref={svgRef} style={{ display: 'block', maxWidth: '100%', height: 'auto' }} />
    </div>
  )
}

export const LABEL_SIZES = [
  { id: '50x25', name: '50 × 25 mm (Standard Thermal Tag Roll)', widthMm: 50, heightMm: 25 },
  { id: '38x25', name: '38 × 25 mm (Compact Jewellery / Garment Roll)', widthMm: 38, heightMm: 25 },
  { id: 'a4', name: 'A4 Sheet (Grid Labels 3×8)', widthMm: 210, heightMm: 297 }
]

/**
 * Generate full printable HTML for thermal barcode tags or A4 sheet
 */
export function generateTagPrintHtml(items, store, labelSize = '50x25') {
  const storeName = store?.store_name || 'HOUSE OF SADAYA'
  const isA4 = labelSize === 'a4'
  const isCompact = labelSize === '38x25'

  // Pre-generate SVG strings for all items to guarantee zero external dependencies in the print window
  const renderedTags = []
  for (const item of items) {
    const qty = Math.max(1, parseInt(item.print_qty || 1, 10))
    const svgHtml = generateBarcodeSvgString(item.barcode, {
      width: isCompact ? 1.2 : 1.5,
      height: isCompact ? 24 : 30,
      fontSize: isCompact ? 10 : 11,
      margin: isCompact ? 6 : 8,
      displayValue: true
    })

    for (let i = 0; i < qty; i++) {
      renderedTags.push({
        ...item,
        svgHtml
      })
    }
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Print Barcode Tags</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #fff;
          color: #000;
        }

        ${
          isA4
            ? `
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          .a4-container {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 4mm;
            padding: 2mm;
          }
          .tag-card {
            border: 1px dashed #bbb;
            border-radius: 4px;
            padding: 2mm 3mm;
            height: 32mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            text-align: center;
            overflow: hidden;
            page-break-inside: avoid;
          }
        `
            : isCompact
              ? `
          @page {
            size: 38mm 25mm;
            margin: 0;
          }
          .tag-card {
            width: 38mm;
            height: 25mm;
            padding: 1mm 1.5mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            text-align: center;
            overflow: hidden;
            page-break-after: always;
          }
        `
              : `
          @page {
            size: 50mm 25mm;
            margin: 0;
          }
          .tag-card {
            width: 50mm;
            height: 25mm;
            padding: 1.5mm 2mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            text-align: center;
            overflow: hidden;
            page-break-after: always;
          }
        `
        }

        .store-title {
          font-size: ${isCompact ? '6.5pt' : '7.5pt'};
          font-weight: 800;
          letter-spacing: 0.5px;
          line-height: 1;
          text-transform: uppercase;
        }

        .item-name {
          font-size: ${isCompact ? '6.5pt' : '7.5pt'};
          font-weight: 700;
          line-height: 1.1;
          max-height: 2.2em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: ${isCompact ? '35mm' : '46mm'};
        }

        .barcode-box {
          line-height: 0;
          margin: 0.5mm 0;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .barcode-box svg {
          max-width: ${isCompact ? '34mm' : '44mm'};
          height: auto;
          max-height: ${isCompact ? '12mm' : '13mm'};
        }

        .meta-row {
          display: flex;
          justify-content: space-between;
          width: 100%;
          font-size: ${isCompact ? '5.5pt' : '6.5pt'};
          color: #333;
          padding: 0 1mm;
          line-height: 1;
        }

        .price-row {
          display: flex;
          justify-content: center;
          align-items: baseline;
          gap: 2.5mm;
          line-height: 1;
          margin-top: 0.5mm;
        }

        .mrp-strike {
          font-size: ${isCompact ? '6pt' : '7pt'};
          text-decoration: line-through;
          color: #666;
        }

        .sell-price {
          font-size: ${isCompact ? '7.5pt' : '8.5pt'};
          font-weight: 800;
          color: #000;
        }

        @media screen {
          body {
            background: #f0f2f5;
            padding: 20px;
          }
          .tag-card {
            background: #fff;
            margin: 10px auto;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          }
          .a4-container {
            background: #fff;
            max-width: 210mm;
            margin: 0 auto;
            box-shadow: 0 2px 10px rgba(0,0,0,0.15);
          }
        }
      </style>
    </head>
    <body>
      ${isA4 ? '<div class="a4-container">' : ''}
      ${renderedTags
        .map(
          t => `
        <div class="tag-card">
          <div class="store-title">${storeName}</div>
          <div class="item-name">${t.name || ''}</div>
          <div class="barcode-box">
            ${t.svgHtml}
          </div>
          <div class="meta-row">
            <span>SKU: <strong>${t.sku || ''}</strong></span>
            ${(t.variant_size || t.size) ? `<span>Size: <strong>${t.variant_size || t.size}</strong></span>` : ''}
            ${(t.variant_color || t.color) ? `<span>Color: <strong>${t.variant_color || t.color}</strong></span>` : ''}
          </div>
          <div class="price-row">
            ${t.mrp ? `<span class="mrp-strike">MRP ₹${Number(t.mrp).toFixed(2)}</span>` : ''}
            <span class="sell-price">₹${Number(t.selling_price || 0).toFixed(2)}</span>
          </div>
        </div>
      `
        )
        .join('')}
      ${isA4 ? '</div>' : ''}
      <script>
        window.onload = function() {
          window.focus();
          window.print();
        };
      </script>
    </body>
    </html>
  `
}
