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

  CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
  CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
  CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
  CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
  CREATE INDEX IF NOT EXISTS idx_transactions_bill ON transactions(bill_number);
  CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
  CREATE INDEX IF NOT EXISTS idx_po_items ON purchase_order_items(po_id);
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
const defaultSettings = [
  ['GST_MODE', 'registered', 'GST mode: registered (Tax Invoice with GSTIN/HSN/CGST/SGST) or unregistered (Bill of Supply)'],
  ['STORE_NAME', 'Aura Fashion Boutique', 'Boutique trade name printed on receipts'],
  ['STORE_ADDRESS', 'Shop 12, Fashion Street, M.I. Road, Jaipur, Rajasthan 302001', 'Store physical address'],
  ['STORE_PHONE', '+91 98765 43210', 'Store contact phone number'],
  ['STORE_GSTIN', '08AAAAA0000A1Z5', 'Goods and Services Tax Identification Number (Rajasthan 08)'],
  ['STATE_CODE', '08', 'State code for GST (08 = Rajasthan)'],
  ['BILL_PREFIX', 'AB-', 'Prefix for generated invoice/bill numbers (e.g. AB-20261117-0001)'],
  ['GARMENT_TAX_THRESHOLD', '2500', 'Apparel GST slab threshold per piece (Rs 2,500 under HSN 61/62/63)'],
  ['DEFAULT_GST_RATE_LOW', '5.0', 'GST rate for garment per-piece value <= threshold (5%)'],
  ['DEFAULT_GST_RATE_HIGH', '18.0', 'GST rate for garment per-piece value > threshold (18%)'],
  ['SLAB_BASED_ON', 'TAG_PRICE', 'Slab decision rule: TAG_PRICE (retail price) or TAXABLE_VALUE. Note: Confirm with CA for Rs 2625-2950 range.'],
  ['DISCOUNT_PIN_THRESHOLD', '500', 'Discounts exceeding this amount in Rupees require Supervisor/Owner PIN approval'],
  ['FOOTER_TEXT', 'Thank you for shopping at Aura Fashion Boutique! Exchange within 7 days with tag intact. No refund.', 'Receipt footer text'],
  ['THERMAL_WIDTH', '80mm', 'Receipt print width format: 80mm, 58mm, or A4']
];

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)');
defaultSettings.forEach(([key, val, desc]) => {
  insertSetting.run(key, val, desc);
});

module.exports = db;
