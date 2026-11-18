const JsBarcode = require('jsbarcode');
const { DOMImplementation, XMLSerializer } = require('@xmldom/xmldom');
const { PNG } = require('pngjs');
const ZXing = require('@zxing/library');

/**
 * Calculate EAN-13 check digit for the first 12 digits.
 * EAN-13 Algorithm:
 * - Positions 1, 3, 5, 7, 9, 11 (odd): weight 1
 * - Positions 2, 4, 6, 8, 10, 12 (even): weight 3
 * - Check digit = (10 - (sum % 10)) % 10
 */
function calculateEan13CheckDigit(first12Digits) {
  const str = String(first12Digits).trim();
  if (str.length !== 12 || !/^\d{12}$/.test(str)) {
    throw new Error('Must provide exactly 12 digits to calculate EAN-13 check digit');
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(str[i], 10);
    sum += (i % 2 === 0) ? digit * 1 : digit * 3;
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Verify if a 13-digit string has a valid EAN-13 check digit.
 */
function isValidEan13(code) {
  const str = String(code || '').trim();
  if (str.length !== 13 || !/^\d{13}$/.test(str)) {
    return false;
  }
  const first12 = str.slice(0, 12);
  const checkDigit = parseInt(str[12], 10);
  return calculateEan13CheckDigit(first12) === checkDigit;
}

/**
 * Format a sequence number into a 13-digit in-store EAN-13 barcode:
 * "2" (in-store range) + 11-digit zero-padded sequence + 1 check digit.
 */
function formatEan13FromSequence(seq) {
  const seqNum = parseInt(seq, 10);
  if (isNaN(seqNum) || seqNum < 1) {
    throw new Error('Sequence number must be a positive integer');
  }
  const seqPadded = String(seqNum).padStart(11, '0');
  const first12 = `2${seqPadded}`;
  const checkDigit = calculateEan13CheckDigit(first12);
  return `${first12}${checkDigit}`;
}

/**
 * Allocate the next unique EAN-13 barcode(s) inside a SQLite transaction (BEGIN IMMEDIATE).
 * Checks against both products and rental_items to ensure uniqueness.
 * Skips any barcode that already exists in the database.
 */
function generateNextBarcodes(db, count = 1) {
  const qty = Math.max(1, parseInt(count, 10) || 1);

  const allocate = db.transaction((neededCount) => {
    // 1. Read current sequence counter
    const counterRow = db.prepare("SELECT value FROM settings WHERE key = 'BARCODE_COUNTER'").get();
    let currentSeq = counterRow ? parseInt(counterRow.value, 10) : 1;
    if (isNaN(currentSeq) || currentSeq < 1) currentSeq = 1;

    const checkProduct = db.prepare("SELECT id FROM products WHERE barcode = ?");
    const checkRental = db.prepare("SELECT id FROM rental_items WHERE barcode = ?");

    const allocated = [];
    while (allocated.length < neededCount) {
      const candidate = formatEan13FromSequence(currentSeq);
      currentSeq++;

      // Skip if this barcode exists in products or rental items
      const inProd = checkProduct.get(candidate);
      const inRent = checkRental.get(candidate);
      if (!inProd && !inRent) {
        allocated.push(candidate);
      }
    }

    // 2. Persist updated counter back to settings
    db.prepare(`
      INSERT INTO settings (key, value, description, updated_at)
      VALUES ('BARCODE_COUNTER', ?, 'Sequential counter for in-store EAN-13 barcodes starting with 2', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(String(currentSeq));

    return allocated;
  });

  const results = allocate.immediate(qty);
  return qty === 1 ? results[0] : results;
}

/**
 * Validate a barcode for uniqueness and check-digit validity.
 * Checks against products and rental_items, naming the conflicting item if found.
 */
function validateBarcode(db, barcode, options = {}) {
  const { excludeProductId = null, excludeRentalId = null } = options;

  if (!barcode || !String(barcode).trim()) {
    return {
      valid: false,
      error: 'Barcode cannot be empty or whitespace only.'
    };
  }

  const clean = String(barcode).trim();

  // Check uniqueness in products
  let prodQuery = 'SELECT id, name, sku FROM products WHERE barcode = ?';
  const prodParams = [clean];
  if (excludeProductId) {
    prodQuery += ' AND id != ?';
    prodParams.push(excludeProductId);
  }
  const existingProd = db.prepare(prodQuery).get(...prodParams);
  if (existingProd) {
    return {
      valid: false,
      isDuplicate: true,
      existingItem: existingProd,
      error: `Barcode "${clean}" is already assigned to product "${existingProd.name}" (SKU: ${existingProd.sku}).`
    };
  }

  // Check uniqueness in rental_items
  let rentQuery = 'SELECT id, name, sku FROM rental_items WHERE barcode = ?';
  const rentParams = [clean];
  if (excludeRentalId) {
    rentQuery += ' AND id != ?';
    rentParams.push(excludeRentalId);
  }
  const existingRental = db.prepare(rentQuery).get(...rentParams);
  if (existingRental) {
    return {
      valid: false,
      isDuplicate: true,
      existingItem: existingRental,
      error: `Barcode "${clean}" is already assigned to rental garment "${existingRental.name}" (SKU: ${existingRental.sku}).`
    };
  }

  // EAN-13 check digit validation (warning, not blocking)
  let checkDigitValid = null;
  let warning = null;
  if (clean.length === 13 && /^\d{13}$/.test(clean)) {
    checkDigitValid = isValidEan13(clean);
    if (!checkDigitValid) {
      warning = 'Barcode has an invalid EAN-13 check digit. Standard scanners might have difficulty reading this code.';
    }
  }

  return {
    valid: true,
    barcode: clean,
    checkDigitValid,
    check_digit_valid: checkDigitValid,
    warning
  };
}

/**
 * Generate a standalone SVG string for any barcode.
 * Uses real EAN-13 for 13-digit codes, or Code128 fallback for legacy codes.
 * Includes proper quiet zones and human-readable text below.
 */
function generateBarcodeSvg(barcode, options = {}) {
  if (!barcode || !String(barcode).trim()) {
    throw new Error('Barcode cannot be empty');
  }

  const cleanBarcode = String(barcode).trim();
  const xmlDoc = new DOMImplementation().createDocument('http://www.w3.org/2000/svg', 'svg', null);
  const svgNode = xmlDoc.documentElement;

  // Choose format: EAN13 if 13 digits and valid EAN13, otherwise CODE128
  const isEan13 = cleanBarcode.length === 13 && /^\d{13}$/.test(cleanBarcode) && isValidEan13(cleanBarcode);
  const format = options.format || (isEan13 ? 'EAN13' : 'CODE128');

  JsBarcode(svgNode, cleanBarcode, {
    xmlDocument: xmlDoc,
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
  });

  const serializer = new XMLSerializer();
  return serializer.serializeToString(svgNode);
}

/**
 * Decode barcode from SVG string by rasterizing onto PNG buffer and reading via ZXing.
 * Proves that generated barcode tags can be read by a real barcode scanner.
 */
function decodeBarcodeFromSvg(svgString) {
  const { DOMParser } = require('@xmldom/xmldom');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgNode = xmlDoc.documentElement;

  const width = Math.ceil(parseFloat(svgNode.getAttribute('width')) || 200);
  const height = Math.ceil(parseFloat(svgNode.getAttribute('height')) || 80);

  const png = new PNG({ width, height });
  // Fill white
  for (let i = 0; i < width * height; i++) {
    const idx = i << 2;
    png.data[idx] = 255;
    png.data[idx + 1] = 255;
    png.data[idx + 2] = 255;
    png.data[idx + 3] = 255;
  }

  // Draw black rects from transformed groups
  const groups = svgNode.getElementsByTagName('g');
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const transform = g.getAttribute('transform') || '';
    let tx = 0, ty = 0;
    const match = transform.match(/translate\(\s*([\d.-]+)[\s,]+([\d.-]+)\s*\)/);
    if (match) {
      tx = parseFloat(match[1]);
      ty = parseFloat(match[2]);
    }
    const rects = g.getElementsByTagName('rect');
    for (let j = 0; j < rects.length; j++) {
      const r = rects[j];
      const rx = tx + parseFloat(r.getAttribute('x') || 0);
      const ry = ty + parseFloat(r.getAttribute('y') || 0);
      const rw = parseFloat(r.getAttribute('width'));
      const rh = parseFloat(r.getAttribute('height'));

      for (let py = Math.floor(ry); py < Math.ceil(ry + rh); py++) {
        for (let px = Math.floor(rx); px < Math.ceil(rx + rw); px++) {
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (width * py + px) << 2;
            png.data[idx] = 0;
            png.data[idx + 1] = 0;
            png.data[idx + 2] = 0;
          }
        }
      }
    }
  }

  // Decode with ZXing
  const luminances = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    luminances[i] = png.data[i * 4];
  }

  const luminanceSource = new ZXing.RGBLuminanceSource(luminances, width, height);
  const binaryBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminanceSource));
  const reader = new ZXing.MultiFormatReader();
  const result = reader.decode(binaryBitmap);

  return {
    text: result.getText(),
    format: result.getBarcodeFormat()
  };
}

module.exports = {
  calculateEan13CheckDigit,
  isValidEan13,
  formatEan13FromSequence,
  generateNextBarcodes,
  validateBarcode,
  generateBarcodeSvg,
  decodeBarcodeFromSvg
};
