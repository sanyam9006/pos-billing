const request = require('supertest');
const app = require('../server/index');
const db = require('../server/db');

// ── Test Setup ──
let supervisorToken, cashierToken, supervisorId, cashierId;

beforeAll(async () => {
  // Reseed database for clean test state
  db.exec('DELETE FROM payments');
  db.exec('DELETE FROM refunds');
  db.exec('DELETE FROM transaction_items');
  db.exec('DELETE FROM transactions');
  db.exec('DELETE FROM bill_sequence');

  // Login as supervisor
  const supRes = await request(app)
    .post('/api/auth/login')
    .send({ employee_code: 'EMP003', pin: '9999' });
  supervisorToken = supRes.body.token;
  supervisorId = supRes.body.cashier.id;

  // Login as cashier
  const cashRes = await request(app)
    .post('/api/auth/login')
    .send({ employee_code: 'EMP001', pin: '1234' });
  cashierToken = cashRes.body.token;
  cashierId = cashRes.body.cashier.id;
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
    expect(res.body.cashier.name).toBe('Rahul Sharma');
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
// TRANSACTION & TOTALS TESTS
// ═══════════════════════════
describe('Transactions & recalcTotals', () => {
  let txnId, itemId;

  test('create transaction returns bill number', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader(cashierToken))
      .send({ cashier_id: cashierId });
    expect(res.status).toBe(200);
    expect(res.body.bill_number).toMatch(/^SM-\d{8}-\d{4}$/);
    txnId = res.body.id;
  });

  test('add item calculates totals correctly', async () => {
    // Tata Salt 1kg: selling_price = 28, tax_rate = 5%
    const res = await request(app)
      .post(`/api/transactions/${txnId}/items`)
      .set(authHeader(cashierToken))
      .send({ product_id: 1, quantity: 2 });

    expect(res.status).toBe(200);
    const item = res.body.items.find(i => i.product_id === 1);
    itemId = item.id;

    // unit_price * qty = 28 * 2 = 56
    expect(res.body.subtotal).toBe(56);
    // tax = 56 * 5% = 2.8
    expect(res.body.tax_amount).toBe(2.8);
    // grand = 56 + 2.8 = 58.8
    expect(res.body.grand_total).toBe(58.8);
  });

  test('update quantity recalculates totals', async () => {
    const res = await request(app)
      .put(`/api/transactions/${txnId}/items/${itemId}`)
      .set(authHeader(cashierToken))
      .send({ quantity: 5 });

    expect(res.status).toBe(200);
    // 28 * 5 = 140
    expect(res.body.subtotal).toBe(140);
    // 140 * 5% = 7
    expect(res.body.tax_amount).toBe(7);
    // 140 + 7 = 147
    expect(res.body.grand_total).toBe(147);
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

    // Add Saffola Gold Oil 1L (id=7) — selling_price = 189, tax_rate = 5%, qty = 4
    // subtotal = 189 * 4 = 756 (exceeds SAVE10 min_bill=500 and FLAT50 min_bill=300)
    await request(app)
      .post(`/api/transactions/${txnId}/items`)
      .set(authHeader(cashierToken))
      .send({ product_id: 7, quantity: 4 });
  });

  test('apply percentage coupon with max_discount cap', async () => {
    // SAVE10: 10% off, min_bill=500, max_discount=200
    // subtotal = 189 * 4 = 756, 10% = 75.6 (under 200 cap)
    const res = await request(app)
      .post(`/api/transactions/${txnId}/coupon`)
      .set(authHeader(cashierToken))
      .send({ code: 'SAVE10' });

    expect(res.status).toBe(200);
    expect(res.body.total_discount).toBe(75.6);
    expect(res.body.coupon_applied.code).toBe('SAVE10');
  });

  test('remove coupon resets discount', async () => {
    await request(app)
      .delete(`/api/transactions/${txnId}/coupon`)
      .set(authHeader(cashierToken));

    const res = await request(app)
      .get(`/api/transactions/${txnId}`)
      .set(authHeader(cashierToken));

    expect(res.body.total_discount).toBe(0);
  });

  test('flat coupon deducts fixed amount', async () => {
    // FLAT50: ₹50 off, min_bill=300
    const res = await request(app)
      .post(`/api/transactions/${txnId}/coupon`)
      .set(authHeader(cashierToken))
      .send({ code: 'FLAT50' });

    expect(res.status).toBe(200);
    expect(res.body.total_discount).toBe(50);
  });
});

// ═══════════════════════════
// STOCK DEDUCTION TESTS
// ═══════════════════════════
describe('Stock Management', () => {
  let txnId, itemId;
  let initialStock;

  beforeAll(async () => {
    // Get initial stock for product 2 (Fortune Sunflower Oil)
    const prodRes = await request(app)
      .get('/api/products/scan/8901030793400')
      .set(authHeader(cashierToken));
    initialStock = prodRes.body.stock_qty;

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
      .send({ product_id: 2, quantity: 3 });

    expect(res.status).toBe(200);
    itemId = res.body.items[0].id;

    // Verify stock decreased
    const prodRes = await request(app)
      .get('/api/products/scan/8901030793400')
      .set(authHeader(cashierToken));
    expect(prodRes.body.stock_qty).toBe(initialStock - 3);
  });

  test('voiding item restores stock', async () => {
    await request(app)
      .delete(`/api/transactions/${txnId}/items/${itemId}`)
      .set(authHeader(cashierToken));

    const prodRes = await request(app)
      .get('/api/products/scan/8901030793400')
      .set(authHeader(cashierToken));
    expect(prodRes.body.stock_qty).toBe(initialStock);
  });

  test('out-of-stock returns 400', async () => {
    const res = await request(app)
      .post(`/api/transactions/${txnId}/items`)
      .set(authHeader(cashierToken))
      .send({ product_id: 2, quantity: 99999 });
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
      .send({ product_id: 3, quantity: 1 });
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
        tendered: 500
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.change).toBeGreaterThanOrEqual(0);
  });

  test('receipt endpoint returns correct data', async () => {
    const res = await request(app)
      .get(`/api/payments/receipt/${txnId}`)
      .set(authHeader(cashierToken));

    expect(res.status).toBe(200);
    expect(res.body.store).toBeDefined();
    expect(res.body.bill_number).toMatch(/^SM-/);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.payments.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════
// BILL NUMBER UNIQUENESS
// ═══════════════════════════
describe('Bill Number Uniqueness', () => {
  test('concurrent bill creation produces unique numbers', async () => {
    const promises = Array.from({ length: 5 }, () =>
      request(app)
        .post('/api/transactions')
        .set(authHeader(cashierToken))
        .send({ cashier_id: cashierId })
    );
    const results = await Promise.all(promises);
    const billNumbers = results.map(r => r.body.bill_number);
    const unique = new Set(billNumbers);

    expect(unique.size).toBe(5);
  });
});

// ═══════════════════════════
// ROLE ENFORCEMENT
// ═══════════════════════════
describe('Role Enforcement', () => {
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

  test('cashier cannot create product', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(authHeader(cashierToken))
      .send({ sku: 'T1', barcode: '999', name: 'X', category: 'X', mrp: 1, selling_price: 1 });
    expect(res.status).toBe(403);
  });

  test('cashier cannot process refund', async () => {
    const res = await request(app)
      .post('/api/refunds')
      .set(authHeader(cashierToken))
      .send({ txn_id: 1, items: [{ item_id: 1 }] });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════
// CUSTOMER CREATION
// ═══════════════════════════
describe('Customer Management', () => {
  test('create new customer', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set(authHeader(cashierToken))
      .send({ name: 'Jest Test User', phone: '5555555555' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Jest Test User');
    expect(res.body.membership_tier).toBe('Silver');
  });

  test('duplicate phone returns 409', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set(authHeader(cashierToken))
      .send({ name: 'Another', phone: '5555555555' });
    expect(res.status).toBe(409);
  });

  test('invalid phone returns 400', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set(authHeader(cashierToken))
      .send({ name: 'Bad', phone: '123' });
    expect(res.status).toBe(400);
  });
});
