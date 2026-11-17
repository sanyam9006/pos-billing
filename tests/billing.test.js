const request = require('supertest');
const app = require('../server/index');
const db = require('../server/db');

// ── Test Setup ──
let supervisorToken, cashierToken, supervisorId, cashierId;
let testProd1, testProd2, testProdCoupon;

beforeAll(async () => {
  // Reseed / clean database for clean test state
  db.exec('DELETE FROM payments');
  db.exec('DELETE FROM refunds');
  db.exec('DELETE FROM transaction_items');
  db.exec('DELETE FROM transactions');
  db.exec('DELETE FROM bill_sequence');

  // Ensure test products exist (delete referencing items first)
  try {
    db.prepare("DELETE FROM transaction_items WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'TEST-BILL-%')").run();
    db.prepare("DELETE FROM products WHERE sku LIKE 'TEST-BILL-%'").run();
  } catch (_) {}
  testProd1 = db.prepare(`
    INSERT INTO products (sku, barcode, name, category, mrp, selling_price, stock_qty)
    VALUES ('TEST-BILL-01', '8909999001', 'Test Printed Kurti', 'Kurtis', 1200, 1200, 100)
  `).run().lastInsertRowid;

  testProd2 = db.prepare(`
    INSERT INTO products (sku, barcode, name, category, mrp, selling_price, stock_qty)
    VALUES ('TEST-BILL-02', '8909999002', 'Test Daily Kurti', 'Kurtis', 800, 800, 80)
  `).run().lastInsertRowid;

  testProdCoupon = db.prepare(`
    INSERT INTO products (sku, barcode, name, category, mrp, selling_price, stock_qty)
    VALUES ('TEST-BILL-03', '8909999003', 'Test Silk Saree', 'Sarees', 3000, 3000, 50)
  `).run().lastInsertRowid;

  // Login as supervisor (OWNER01 / 9999 or EMP003 / 9999)
  let supRes = await request(app)
    .post('/api/auth/login')
    .send({ employee_code: 'OWNER01', pin: '9999' });

  if (!supRes.body.token) {
    supRes = await request(app)
      .post('/api/auth/login')
      .send({ employee_code: 'EMP003', pin: '9999' });
  }

  supervisorToken = supRes.body.token;
  supervisorId = supRes.body.cashier.id;

  // Login as cashier
  const cashRes = await request(app)
    .post('/api/auth/login')
    .send({ employee_code: 'EMP001', pin: '1234' });
  cashierToken = cashRes.body.token;
  cashierId = cashRes.body.cashier.id;
});

afterAll(() => {
  try {
    db.prepare("DELETE FROM transaction_items WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'TEST-BILL-%')").run();
    db.prepare("DELETE FROM products WHERE sku LIKE 'TEST-BILL-%'").run();
  } catch (_) {}
});

// Helper
const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

// ═══════════════════════════
// AUTH TESTS
// ═══════════════════════════
describe('Authentication', () => {
  test('login with correct PIN returns 200 + JWT', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ employee_code: 'EMP001', pin: '1234' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.cashier.name).toBeDefined();
  });

  test('login with wrong PIN returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ employee_code: 'EMP001', pin: '0000' });
    expect(res.status).toBe(401);
  });

  test('protected route without token returns 401', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
  });

  test('protected route with valid token returns 200', async () => {
    const res = await request(app)
      .get('/api/products')
      .set(authHeader(cashierToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ═══════════════════════════
// TRANSACTION & TOTALS TESTS (TAX-INCLUSIVE)
// ═══════════════════════════
describe('Transactions & recalcTotals (Tax-Inclusive)', () => {
  let txnId, itemId;

  test('create transaction returns bill number', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader(cashierToken))
      .send({ cashier_id: cashierId });
    expect(res.status).toBe(200);
    expect(res.body.bill_number).toMatch(/^(AB|SM)-\d{8}-\d{4}$/);
    txnId = res.body.id;
  });

  test('add item calculates totals tax-inclusively (no tax added on top)', async () => {
    // Test product: selling_price = 1200, tax_rate = 5%
    const res = await request(app)
      .post(`/api/transactions/${txnId}/items`)
      .set(authHeader(cashierToken))
      .send({ product_id: testProd1, quantity: 2 });

    expect(res.status).toBe(200);
    const item = res.body.items.find(i => i.product_id === testProd1);
    itemId = item.id;

    // Unit price * qty = 1200 * 2 = 2400
    // Customer pays strictly 2400 (grand total = subtotal)
    expect(res.body.subtotal).toBe(2400);
    expect(res.body.grand_total).toBe(2400);
    expect(res.body.tax_amount).toBeUndefined();
  });

  test('update quantity recalculates totals tax-inclusively', async () => {
    const res = await request(app)
      .put(`/api/transactions/${txnId}/items/${itemId}`)
      .set(authHeader(cashierToken))
      .send({ quantity: 3 });

    expect(res.status).toBe(200);
    // 1200 * 3 = 3600
    expect(res.body.subtotal).toBe(3600);
    expect(res.body.grand_total).toBe(3600);
  });

  test('void item removes from totals', async () => {
    const res = await request(app)
      .delete(`/api/transactions/${txnId}/items/${itemId}`)
      .set(authHeader(cashierToken));

    expect(res.status).toBe(200);
    expect(res.body.subtotal).toBe(0);
    expect(res.body.grand_total).toBe(0);
    expect(res.body.items.length).toBe(0);
  });
});

// ═══════════════════════════
// COUPON TESTS
// ═══════════════════════════
describe('Coupon Math', () => {
  let txnId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader(cashierToken))
      .send({ cashier_id: cashierId });
    txnId = res.body.id;

    // Ensure WELCOME10 coupon is active
    db.prepare(`
      INSERT OR REPLACE INTO coupons (id, code, type, value, min_bill, max_discount, valid_from, valid_to, is_active)
      VALUES (999, 'WELCOME10', 'percent', 10, 1000, 300, '2026-01-01', '2026-12-31', 1)
    `).run();

    // Add item (selling_price = 3000)
    await request(app)
      .post(`/api/transactions/${txnId}/items`)
      .set(authHeader(cashierToken))
      .send({ product_id: testProdCoupon, quantity: 1 });
  });

  test('apply percentage coupon with max_discount cap', async () => {
    // WELCOME10: 10% off min_bill=1000, max_discount=300
    // subtotal = 3000, 10% = 300 (hits 300 cap)
    const res = await request(app)
      .post(`/api/transactions/${txnId}/coupon`)
      .set(authHeader(cashierToken))
      .send({ code: 'WELCOME10' });

    expect(res.status).toBe(200);
    expect(res.body.total_discount).toBe(300);
    expect(res.body.grand_total).toBe(2700); // 3000 - 300 = 2700
  });

  test('remove coupon resets discount', async () => {
    await request(app)
      .delete(`/api/transactions/${txnId}/coupon`)
      .set(authHeader(cashierToken));

    const res = await request(app)
      .get(`/api/transactions/${txnId}`)
      .set(authHeader(cashierToken));

    expect(res.body.total_discount).toBe(0);
    expect(res.body.grand_total).toBe(3000);
  });
});

// ═══════════════════════════
// STOCK DEDUCTION TESTS
// ═══════════════════════════
describe('Stock Management', () => {
  let txnId, itemId;
  let initialStock;

  beforeAll(async () => {
    const prod = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(testProd2);
    initialStock = prod.stock_qty;

    const txnRes = await request(app)
      .post('/api/transactions')
      .set(authHeader(cashierToken))
      .send({ cashier_id: cashierId });
    txnId = txnRes.body.id;
  });

  test('adding to cart decrements stock', async () => {
    const res = await request(app)
      .post(`/api/transactions/${txnId}/items`)
      .set(authHeader(cashierToken))
      .send({ product_id: testProd2, quantity: 3 });

    expect(res.status).toBe(200);
    itemId = res.body.items[0].id;

    const prod = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(testProd2);
    expect(prod.stock_qty).toBe(initialStock - 3);
  });

  test('voiding item restores stock', async () => {
    await request(app)
      .delete(`/api/transactions/${txnId}/items/${itemId}`)
      .set(authHeader(cashierToken));

    const prod = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(testProd2);
    expect(prod.stock_qty).toBe(initialStock);
  });

  test('out-of-stock returns 400', async () => {
    const res = await request(app)
      .post(`/api/transactions/${txnId}/items`)
      .set(authHeader(cashierToken))
      .send({ product_id: testProd2, quantity: 99999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Insufficient stock');
  });
});

// ═══════════════════════════
// PAYMENT TESTS
// ═══════════════════════════
describe('Payment Completion', () => {
  let txnId;

  beforeAll(async () => {
    const txnRes = await request(app)
      .post('/api/transactions')
      .set(authHeader(cashierToken))
      .send({ cashier_id: cashierId });
    txnId = txnRes.body.id;

    await request(app)
      .post(`/api/transactions/${txnId}/items`)
      .set(authHeader(cashierToken))
      .send({ product_id: testProd1, quantity: 1 });
  });

  test('full payment completes transaction', async () => {
    const txn = await request(app)
      .get(`/api/transactions/${txnId}`)
      .set(authHeader(cashierToken));

    const res = await request(app)
      .post('/api/payments')
      .set(authHeader(cashierToken))
      .send({
        txn_id: txnId,
        method: 'cash',
        amount: txn.body.grand_total,
        tendered: 2000
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.change).toBeGreaterThanOrEqual(0);
  });

  test('receipt endpoint returns correct boutique bill data', async () => {
    const res = await request(app)
      .get(`/api/payments/receipt/${txnId}`)
      .set(authHeader(cashierToken));

    expect(res.status).toBe(200);
    expect(res.body.store).toBeDefined();
    expect(res.body.bill_title).toBe('Bill');
    expect(res.body.bill_number).toMatch(/^(AB|SM)-/);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.payments.length).toBeGreaterThan(0);
    const receiptStr = JSON.stringify(res.body);
    expect(receiptStr).not.toMatch(/\b(tax|gst|gstin|hsn|cgst|sgst|igst)\b/i);
  });
});

// ═══════════════════════════
// ROLE ENFORCEMENT & CUSTOMERS
// ═══════════════════════════
describe('Role Enforcement & Customer Management', () => {
  test('cashier cannot access reports', async () => {
    const res = await request(app)
      .get('/api/reports/x-report')
      .set(authHeader(cashierToken));
    expect(res.status).toBe(403);
  });

  test('supervisor can access reports', async () => {
    const res = await request(app)
      .get('/api/reports/x-report')
      .set(authHeader(supervisorToken));
    expect(res.status).toBe(200);
  });

  test('create customer and handle duplicates', async () => {
    db.prepare("DELETE FROM customers WHERE phone = '5555555555'").run();

    const res = await request(app)
      .post('/api/customers')
      .set(authHeader(cashierToken))
      .send({ name: 'Jest Test User', phone: '5555555555' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Jest Test User');

    const dupRes = await request(app)
      .post('/api/customers')
      .set(authHeader(cashierToken))
      .send({ name: 'Duplicate User', phone: '5555555555' });
    expect(dupRes.status).toBe(409);
  });
});
