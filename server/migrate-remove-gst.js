const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function runMigration(dbInstance) {
  let db = dbInstance;
  let shouldClose = false;

  if (!db) {
    const dbPath = path.join(__dirname, '..', 'pos.db');
    // Ensure pos.db exists before migrating
    if (!fs.existsSync(dbPath)) {
      console.log('No pos.db found to migrate.');
      return;
    }
    db = new Database(dbPath);
    shouldClose = true;
  }

  const gstSettings = [
    'GST_MODE',
    'GARMENT_TAX_THRESHOLD',
    'DEFAULT_GST_RATE_LOW',
    'DEFAULT_GST_RATE_HIGH',
    'SLAB_BASED_ON',
    'STORE_GSTIN',
    'STATE_CODE'
  ];

  const placeholders = gstSettings.map(() => '?').join(',');

  const migrate = db.transaction(() => {
    // 1. Remove GST settings
    db.prepare(`DELETE FROM settings WHERE key IN (${placeholders})`).run(...gstSettings);

    // 2. Zero out tax columns safely in transactions if column exists
    try {
      db.prepare('UPDATE transactions SET tax_amount = 0 WHERE tax_amount != 0').run();
    } catch (_) {}

    // 3. Zero out tax and hsn columns in transaction_items if columns exist
    try {
      db.prepare(`
        UPDATE transaction_items
        SET tax = 0,
            tax_included = 0,
            tax_rate = 0,
            hsn_code = NULL
        WHERE tax != 0 OR tax_included != 0 OR tax_rate != 0 OR hsn_code IS NOT NULL
      `).run();
    } catch (_) {}

    // 4. Zero out tax_rate and hsn_code in products if columns exist
    try {
      db.prepare(`
        UPDATE products
        SET tax_rate = 0,
            hsn_code = NULL
        WHERE tax_rate != 0 OR hsn_code IS NOT NULL
      `).run();
    } catch (_) {}
  });

  migrate();

  if (shouldClose) {
    const pCount = db.prepare('SELECT count(*) as count FROM products').get().count;
    const tCount = db.prepare('SELECT count(*) as count FROM transactions').get().count;
    const cCount = db.prepare('SELECT count(*) as count FROM customers').get().count;
    console.log(`Migration complete. Preserved ${pCount} products, ${tCount} transactions, and ${cCount} customers.`);
    db.close();
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = runMigration;
