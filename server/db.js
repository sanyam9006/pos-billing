const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'pos.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS cashiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    employee_code TEXT UNIQUE NOT NULL,
    pin TEXT NOT NULL,
    role TEXT DEFAULT 'cashier',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    mrp REAL NOT NULL,
    selling_price REAL NOT NULL,
    hsn_code TEXT,
    tax_rate REAL DEFAULT 5.0,
    stock_qty INTEGER DEFAULT 100,
    unit TEXT DEFAULT 'pcs',
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    email TEXT,
    loyalty_points INTEGER DEFAULT 0,
    membership_tier TEXT DEFAULT 'Silver',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('percent', 'flat')),
    value REAL NOT NULL,
    min_bill REAL DEFAULT 0,
    max_discount REAL,
    valid_from DATETIME,
    valid_to DATETIME,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_number TEXT UNIQUE NOT NULL,
    cashier_id INTEGER NOT NULL,
    customer_id INTEGER,
    subtotal REAL DEFAULT 0,
    total_discount REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    grand_total REAL DEFAULT 0,
    coupon_id INTEGER,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'held', 'completed', 'voided')),
    counter_number INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (cashier_id) REFERENCES cashiers(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (coupon_id) REFERENCES coupons(id)
  );

  CREATE TABLE IF NOT EXISTS transaction_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    txn_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price REAL NOT NULL,
    discount REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    line_total REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (txn_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    txn_id INTEGER NOT NULL,
    method TEXT NOT NULL CHECK(method IN ('cash', 'card', 'upi', 'store_credit')),
    amount REAL NOT NULL,
    tendered REAL,
    change_amount REAL DEFAULT 0,
    reference_number TEXT,
    status TEXT DEFAULT 'completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (txn_id) REFERENCES transactions(id)
  );

  CREATE TABLE IF NOT EXISTS bill_sequence (
    date TEXT PRIMARY KEY,
    seq INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS refunds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_txn_id INTEGER NOT NULL,
    cashier_id INTEGER NOT NULL,
    reason TEXT,
    refund_amount REAL NOT NULL,
    refund_method TEXT NOT NULL CHECK(refund_method IN ('cash', 'card', 'upi', 'store_credit')),
    items_json TEXT,
    status TEXT DEFAULT 'completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (original_txn_id) REFERENCES transactions(id),
    FOREIGN KEY (cashier_id) REFERENCES cashiers(id)
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    gstin TEXT,
    address TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL,
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'ordered', 'received', 'cancelled')),
    total_cost REAL DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    received_at DATETIME,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  );

  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER DEFAULT 0,
    cost_price REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS custom_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    service_type TEXT NOT NULL,
    status TEXT DEFAULT 'booked' CHECK(status IN ('booked', 'in_progress', 'trial_ready', 'completed', 'delivered')),
    trial_date DATE,
    delivery_date DATE,
    total_amount REAL NOT NULL,
    advance_paid REAL DEFAULT 0,
    balance_due REAL NOT NULL,
    measurements_json TEXT,
    design_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivered_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS credit_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_number TEXT UNIQUE NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    original_bill_number TEXT,
    amount REAL NOT NULL,
    balance_remaining REAL NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'redeemed', 'expired')),
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cashier_id INTEGER,
    cashier_name TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rental_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Bridal & Occasion Rental',
    size TEXT,
    color TEXT,
    deposit_amount REAL DEFAULT 0,
    pricing_mode_default TEXT DEFAULT 'PER_EVENT' CHECK(pricing_mode_default IN ('PER_DAY', 'PER_EVENT')),
    rent_per_day REAL DEFAULT 0,
    event_rent REAL DEFAULT 0,
    event_days INTEGER DEFAULT 3,
    late_fee_per_day REAL DEFAULT 0,
    status TEXT DEFAULT 'available' CHECK(status IN ('available', 'rented', 'maintenance', 'retired')),
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rental_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    rental_item_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_id INTEGER,
    rent_date DATE NOT NULL,
    due_date DATE NOT NULL,
    pricing_mode TEXT NOT NULL CHECK(pricing_mode IN ('PER_DAY', 'PER_EVENT')),
    applied_rate REAL NOT NULL,
    billed_days INTEGER NOT NULL,
    calculated_rent REAL NOT NULL,
    final_rent REAL NOT NULL,
    rent_override_reason TEXT,
    rent_override_approved_by INTEGER,
    deposit_amount REAL DEFAULT 0,
    advance_paid REAL DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK(status IN ('booked', 'active', 'returned', 'cancelled')),
    actual_return_date DATE,
    extra_days INTEGER DEFAULT 0,
    late_fee REAL DEFAULT 0,
    early_refund REAL DEFAULT 0,
    deposit_refunded REAL DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    returned_at DATETIME,
    FOREIGN KEY (rental_item_id) REFERENCES rental_items(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
  CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
  CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
  CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
  CREATE INDEX IF NOT EXISTS idx_transactions_bill ON transactions(bill_number);
  CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
  CREATE INDEX IF NOT EXISTS idx_po_items ON purchase_order_items(po_id);
  CREATE INDEX IF NOT EXISTS idx_rental_items_barcode ON rental_items(barcode);
  CREATE INDEX IF NOT EXISTS idx_rental_items_sku ON rental_items(sku);
  CREATE INDEX IF NOT EXISTS idx_rental_orders_status ON rental_orders(status);
`);

// Safe migrations for optional columns
const migrations = [
  "ALTER TABLE products ADD COLUMN variant_size TEXT",
  "ALTER TABLE products ADD COLUMN variant_color TEXT",
  "ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0",
  "ALTER TABLE transactions ADD COLUMN transaction_type TEXT DEFAULT 'sale'",
  "ALTER TABLE transactions ADD COLUMN exchange_for_bill TEXT",
  "ALTER TABLE transactions ADD COLUMN discount_reason TEXT",
  "ALTER TABLE transactions ADD COLUMN discount_approved_by INTEGER",
  "ALTER TABLE transactions ADD COLUMN is_interstate INTEGER DEFAULT 0",
  "ALTER TABLE transaction_items ADD COLUMN is_return INTEGER DEFAULT 0",
  "ALTER TABLE transaction_items ADD COLUMN tax_included REAL DEFAULT 0",
  "ALTER TABLE transaction_items ADD COLUMN tax_rate REAL DEFAULT 5.0",
  "ALTER TABLE transaction_items ADD COLUMN hsn_code TEXT",
  "ALTER TABLE transaction_items ADD COLUMN discount_reason TEXT",
  "ALTER TABLE custom_orders ADD COLUMN fabric TEXT",
  "ALTER TABLE credit_notes ADD COLUMN expires_at DATETIME",
];

migrations.forEach(sql => {
  try {
    db.exec(sql);
  } catch (_) {}
});

// Seed default boutique settings if missing
let defaultLogo = '';
try {
  const { STORE_LOGO_BASE64 } = require('./utils/logo');
  defaultLogo = STORE_LOGO_BASE64;
} catch (_) {}

const defaultSettings = [
  ['STORE_NAME', 'House of Sadaya', 'Boutique trade name printed on receipts'],
  ['STORE_ADDRESS', '4/8 Housing board Tonk Rajasthan', 'Store physical address'],
  ['STORE_PHONE', '7568458575', 'Store contact phone number'],
  ['BILL_PREFIX', 'HOS-', 'Prefix for generated invoice/bill numbers (e.g. HOS-20261117-0001)'],
  ['STORE_LOGO', defaultLogo, 'Store logo image (base64 data URL)'],
  ['DISCOUNT_PIN_THRESHOLD', '500', 'Discounts exceeding this amount in Rupees require Supervisor/Owner PIN approval'],
  ['FOOTER_TEXT', 'Thank you for shopping at House of Sadaya! Exchange within 7 days with tag intact. No refund.', 'Receipt footer text'],
  ['THERMAL_WIDTH', '80mm', 'Receipt print width format: 80mm, 58mm, or A4'],
  ['RENTAL_COUNT_PICKUP_DAY', '1', 'Rental day calculation: 1 to count pickup day (e.g. Fri to Sun = 3 days), 0 for day difference only (2 days)'],
  ['RENTAL_EARLY_RETURN_REFUND', '0', 'Early rental return: 1 for pro-rated refund (PER_DAY mode only), 0 for no automatic early refund'],
  ['RENT_OVERRIDE_PIN_THRESHOLD', '500', 'Discounts or adjustments on rental price exceeding this amount require Supervisor PIN']
];

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)');
defaultSettings.forEach(([key, val, desc]) => {
  insertSetting.run(key, val, desc);
});

// Run migration to ensure any leftover tax settings/values are zeroed out
const runMigration = require('./migrate-remove-gst');
runMigration(db);

// Safe migration for unique barcode indexes and sequential counter
const migrateBarcodeIndexes = require('./migrate-barcode-indexes');
migrateBarcodeIndexes(db);

module.exports = db;
