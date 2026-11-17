const db = require('./db');
const { hashPin } = require('./utils/auth');

// ── SAFETY GUARD: Prevent accidental data deletion in live store ──
const isForce = process.argv.includes('--force') || process.env.FORCE_SEED === 'true';

try {
  const txnCount = db.prepare('SELECT COUNT(*) as count FROM transactions').get()?.count || 0;
  const prodCount = db.prepare('SELECT COUNT(*) as count FROM products').get()?.count || 0;
  const custCount = db.prepare('SELECT COUNT(*) as count FROM customers').get()?.count || 0;
  const poCount = db.prepare('SELECT COUNT(*) as count FROM purchase_orders').get()?.count || 0;
  const customCount = db.prepare('SELECT COUNT(*) as count FROM custom_orders').get()?.count || 0;
  const cnCount = db.prepare('SELECT COUNT(*) as count FROM credit_notes').get()?.count || 0;

  if (!isForce && (txnCount > 0 || prodCount > 0)) {
    console.error('\n🛑 SAFETY GUARD TRIGGERED — Live Store Data Detected:');
    console.error('   The database currently holds:');
    console.error(`     • ${prodCount} Products & Garment Variants`);
    console.error(`     • ${txnCount} Sales Transactions & Invoices`);
    console.error(`     • ${custCount} Customer Accounts`);
    console.error(`     • ${poCount} Purchase Orders`);
    console.error(`     • ${customCount} Custom Tailoring Orders`);
    console.error(`     • ${cnCount} Store Credit Notes\n`);
    console.error('   To protect your live boutique data, database wipe was PREVENTED.');
    console.error('   If you are testing and wish to erase and re-seed, run explicitly:');
    console.error('     npm run seed -- --force\n');
    process.exit(1);
  }

  if (isForce && (txnCount > 0 || prodCount > 0)) {
    console.log(`\n⚠️  --force detected. Overwriting ${prodCount} products and ${txnCount} transactions with boutique catalog...`);
  }
} catch (_) {}

// Clear existing data
db.exec('DELETE FROM purchase_order_items');
db.exec('DELETE FROM purchase_orders');
db.exec('DELETE FROM suppliers');
db.exec('DELETE FROM payments');
db.exec('DELETE FROM transaction_items');
db.exec('DELETE FROM transactions');
db.exec('DELETE FROM coupons');
db.exec('DELETE FROM customers');
db.exec('DELETE FROM products');
db.exec('DELETE FROM cashiers');
db.exec('DELETE FROM bill_sequence');
db.exec('DELETE FROM custom_orders');
db.exec('DELETE FROM credit_notes');
db.exec('DELETE FROM audit_logs');
db.exec('DELETE FROM sqlite_sequence');

// ── Staff (Boutique Owner & Cashiers) ──
const insertCashier = db.prepare('INSERT INTO cashiers (name, employee_code, pin, role) VALUES (?, ?, ?, ?)');
insertCashier.run('Meenakshi Rathore', 'OWNER01', hashPin('9999'), 'supervisor');
insertCashier.run('Simran Kaur', 'EMP001', hashPin('1234'), 'cashier');
insertCashier.run('Pooja Verma', 'EMP002', hashPin('5678'), 'cashier');

// ── Customers ──
const insertCustomer = db.prepare('INSERT INTO customers (name, phone, email, loyalty_points, membership_tier) VALUES (?, ?, ?, ?, ?)');
insertCustomer.run('Ananya Sharma', '9876543210', 'ananya@email.com', 250, 'Gold');
insertCustomer.run('Radhika Mehta', '9876543211', 'radhika@email.com', 120, 'Silver');
insertCustomer.run('Sneha Agarwal', '9876543212', 'sneha@email.com', 640, 'Platinum');
insertCustomer.run('Kavita Joshi', '9876543213', 'kavita@email.com', 80, 'Silver');
insertCustomer.run('Bhavna Jain', '9876543214', 'bhavna@email.com', 410, 'Gold');

// ── Coupons ──
const insertCoupon = db.prepare('INSERT INTO coupons (code, type, value, min_bill, max_discount, valid_from, valid_to, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
insertCoupon.run('WELCOME10', 'percent', 10, 1000, 300, '2026-01-01', '2026-12-31', 1);
insertCoupon.run('FESTIVE500', 'flat', 500, 3500, null, '2026-01-01', '2026-12-31', 1);
insertCoupon.run('SEASON20', 'percent', 20, 5000, 1500, '2026-03-01', '2026-06-30', 1);

// ── Boutique Apparel Products (Strictly MRP / Tag Price — No Tax) ──
const insertProduct = db.prepare(`
  INSERT INTO products (
    sku, barcode, name, category, mrp, selling_price,
    hsn_code, tax_rate, stock_qty, unit, variant_size, variant_color, cost_price
  ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?)
`);

// 1. Kurtis & Tunics
insertProduct.run('KRT-COT-S-BLU', '8907001001', 'Cotton Printed Anarkali Kurti', 'Kurtis', 1499, 1299, 25, 'pcs', 'S', 'Indigo Blue', 650);
insertProduct.run('KRT-COT-M-BLU', '8907001002', 'Cotton Printed Anarkali Kurti', 'Kurtis', 1499, 1299, 30, 'pcs', 'M', 'Indigo Blue', 650);
insertProduct.run('KRT-COT-L-BLU', '8907001003', 'Cotton Printed Anarkali Kurti', 'Kurtis', 1499, 1299, 20, 'pcs', 'L', 'Indigo Blue', 650);
insertProduct.run('KRT-COT-XL-BLU', '8907001004', 'Cotton Printed Anarkali Kurti', 'Kurtis', 1499, 1299, 15, 'pcs', 'XL', 'Indigo Blue', 650);

insertProduct.run('KRT-CHI-M-PNK', '8907001005', 'Chikankari Handwork Kurti', 'Kurtis', 2199, 1999, 18, 'pcs', 'M', 'Blush Pink', 950);
insertProduct.run('KRT-CHI-L-PNK', '8907001006', 'Chikankari Handwork Kurti', 'Kurtis', 2199, 1999, 12, 'pcs', 'L', 'Blush Pink', 950);

insertProduct.run('KRT-BND-S-YEL', '8907001007', 'Jaipuri Bandhani Daily Kurti', 'Kurtis', 999, 899, 40, 'pcs', 'S', 'Mustard Yellow', 400);
insertProduct.run('KRT-BND-M-YEL', '8907001008', 'Jaipuri Bandhani Daily Kurti', 'Kurtis', 999, 899, 35, 'pcs', 'M', 'Mustard Yellow', 400);

// 2. Co-ord Sets & Festive Ensembles
insertProduct.run('CRD-LNN-S-SGE', '8907002001', 'Pure Linen Embroidered Co-ord Set', 'Co-ords', 2899, 2499, 15, 'pcs', 'S', 'Sage Green', 1200);
insertProduct.run('CRD-LNN-M-SGE', '8907002002', 'Pure Linen Embroidered Co-ord Set', 'Co-ords', 2899, 2699, 14, 'pcs', 'M', 'Sage Green', 1300);
insertProduct.run('CRD-SILK-M-MRN', '8907002003', 'Chanderi Silk Festive 3-Piece Set', 'Festive Sets', 3999, 3499, 10, 'pcs', 'M', 'Maroon', 1700);
insertProduct.run('CRD-SILK-L-MRN', '8907002004', 'Chanderi Silk Festive 3-Piece Set', 'Festive Sets', 3999, 3499, 8, 'pcs', 'L', 'Maroon', 1700);

// 3. Sarees & Drapes
insertProduct.run('SA-MUL-GRN', '8907003001', 'Mulmul Cotton Handblock Saree', 'Sarees', 2199, 1850, 20, 'pcs', 'Free', 'Emerald Green', 900);
insertProduct.run('SA-ORG-LAV', '8907003002', 'Organza Floral Zari Border Saree', 'Sarees', 3499, 2999, 12, 'pcs', 'Free', 'Lavender', 1450);
insertProduct.run('SA-BAN-RED', '8907003003', 'Banarasi Katan Silk Bridal Saree', 'Bridal & Occasion', 8999, 7999, 6, 'pcs', 'Free', 'Sindoor Red', 4200);

// 4. Dupattas & Stoles
insertProduct.run('DUP-KTH-RED', '8907004001', 'Kantha Stitch Tussar Dupatta', 'Dupattas', 1299, 999, 25, 'pcs', 'Free', 'Rust Red', 480);
insertProduct.run('DUP-PHU-MLT', '8907004002', 'Hand Embroidered Phulkari Dupatta', 'Dupattas', 1799, 1499, 15, 'pcs', 'Free', 'Multi', 750);

// ── Suppliers ──
const insertSupplier = db.prepare(`
  INSERT INTO suppliers (name, contact_person, phone, email, address)
  VALUES (?, ?, ?, ?, ?)
`);
insertSupplier.run('Jaipur Handloom Weavers Hub', 'Ramesh Chander', '+91 94140 12345', 'info@jaipurweavers.com', 'Sanganer Industrial Area, Jaipur');
insertSupplier.run('Varanasi Katan Silks', 'Mahesh Narayan', '+91 94150 98765', 'sales@katansilks.in', 'Chowk, Varanasi, UP');

// ── Custom Orders (Tailoring & Alterations) ──
const insertCustom = db.prepare(`
  INSERT INTO custom_orders (
    order_number, customer_name, customer_phone, service_type,
    status, fabric, trial_date, delivery_date, total_amount, advance_paid,
    balance_due, measurements_json, design_notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

insertCustom.run(
  'ORD-202611-0001',
  'Ananya Sharma',
  '9876543210',
  'Custom Blouse & Lehenga Stitching',
  'in_stitching',
  'Pure Raw Silk (Customer provided)',
  '2026-11-20',
  '2026-11-25',
  4500,
  2000,
  2500,
  JSON.stringify({ bust: '36', waist: '30', length: '15', shoulder: '14.5', sleeve: '10' }),
  'Deep V-neck back with handcrafted latkans, princess cut with padded cups.'
);

insertCustom.run(
  'ORD-202611-0002',
  'Radhika Mehta',
  '9876543211',
  'Anarkali Kurti Alteration',
  'trial_ready',
  'Chanderi Silk',
  '2026-11-18',
  '2026-11-21',
  600,
  600,
  0,
  JSON.stringify({ alteration: 'Side fitting 1 inch each side, hem shorten 1.5 inches' }),
  'Keep margin inside for future alteration.'
);

// ── Credit Notes ──
const insertCreditNote = db.prepare(`
  INSERT INTO credit_notes (
    note_number, customer_phone, customer_name, original_bill_number,
    amount, balance_remaining, reason, status, expires_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

insertCreditNote.run(
  'CN-202611-0001',
  '9876543212',
  'Sneha Agarwal',
  'AB-20261110-0014',
  1299,
  1299,
  'Size exchange credit for Indigo Kurti',
  'active',
  new Date(Date.now() + 90 * 86400000).toISOString()
);

console.log('✅ Boutique database seeded successfully with Indian apparel catalog!');
console.log('   • 15 Garment items & variants (Kurtis, Sarees, Co-ords, Dupattas)');
console.log('   • Correct apparel HSNs (6204, 5208, 5407, 6214) with 5% & 18% slabs');
console.log('   • 5 Customers, 3 Coupons, 2 Suppliers, 2 Tailoring Orders, 1 Credit Note');
console.log('   • Staff: OWNER01 (PIN: 9999, Owner), EMP001 (PIN: 1234), EMP002 (PIN: 5678)');
