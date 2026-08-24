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

  CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
  CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
  CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
  CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
  CREATE INDEX IF NOT EXISTS idx_transactions_bill ON transactions(bill_number);
  CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
`);

module.exports = db;
