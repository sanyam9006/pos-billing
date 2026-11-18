/**
 * Safe migration to add UNIQUE indexes on barcode column for products and rental_items.
 * Detects existing duplicates first and reports them instead of failing.
 * Initializes BARCODE_COUNTER setting for sequential in-store EAN-13 barcodes.
 */

function migrateBarcodeIndexes(db) {
  // 1. Detect duplicates in products table
  const productDups = db.prepare(`
    SELECT barcode, COUNT(*) as count, GROUP_CONCAT(name || ' [' || sku || ']') as items
    FROM products
    WHERE barcode IS NOT NULL AND TRIM(barcode) != ''
    GROUP BY barcode
    HAVING count > 1
  `).all();

  if (productDups.length > 0) {
    console.warn('⚠️ [Migration] Duplicate barcodes detected in products table. Skipping UNIQUE index creation to prevent failure:', productDups);
  } else {
    try {
      db.exec('DROP INDEX IF EXISTS idx_products_barcode');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)');
    } catch (err) {
      console.warn('⚠️ [Migration] Note on products unique barcode index:', err.message);
    }
  }

  // 2. Detect duplicates in rental_items table
  const rentalDups = db.prepare(`
    SELECT barcode, COUNT(*) as count, GROUP_CONCAT(name || ' [' || sku || ']') as items
    FROM rental_items
    WHERE barcode IS NOT NULL AND TRIM(barcode) != ''
    GROUP BY barcode
    HAVING count > 1
  `).all();

  if (rentalDups.length > 0) {
    console.warn('⚠️ [Migration] Duplicate barcodes detected in rental_items table. Skipping UNIQUE index creation to prevent failure:', rentalDups);
  } else {
    try {
      db.exec('DROP INDEX IF EXISTS idx_rental_items_barcode');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_items_barcode ON rental_items(barcode)');
    } catch (err) {
      console.warn('⚠️ [Migration] Note on rental_items unique barcode index:', err.message);
    }
  }

  // 3. Initialize BARCODE_COUNTER setting if missing
  try {
    const existingCounter = db.prepare("SELECT value FROM settings WHERE key = 'BARCODE_COUNTER'").get();
    if (!existingCounter) {
      let maxSeq = 0;
      const prodCodes = db.prepare("SELECT barcode FROM products WHERE barcode LIKE '2%' AND length(barcode) = 13").all();
      const rentalCodes = db.prepare("SELECT barcode FROM rental_items WHERE barcode LIKE '2%' AND length(barcode) = 13").all();
      
      [...prodCodes, ...rentalCodes].forEach(r => {
        const seqStr = (r.barcode || '').slice(1, 12);
        if (/^\d{11}$/.test(seqStr)) {
          const seqVal = parseInt(seqStr, 10);
          if (seqVal > maxSeq) maxSeq = seqVal;
        }
      });

      const initialSeq = String(maxSeq + 1);
      db.prepare("INSERT OR IGNORE INTO settings (key, value, description) VALUES ('BARCODE_COUNTER', ?, 'Sequential counter for in-store EAN-13 barcodes starting with 2')").run(initialSeq);
    }
  } catch (err) {
    console.warn('⚠️ [Migration] Note on BARCODE_COUNTER setting:', err.message);
  }
}

module.exports = migrateBarcodeIndexes;
