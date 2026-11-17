const request = require('supertest');
const app = require('../server/index');
const db = require('../server/db');
const { performBackup } = require('../server/utils/backup');
const fs = require('fs');

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('Boutique Specific Features: Strictly Tag Price (No Tax/GST), Exchanges & Tailoring', () => {
  let cashierToken;
  let supervisorToken;
  let testCustomerPhone = '9899887766';

  beforeAll(async () => {
    // Clean up test records
    db.prepare('DELETE FROM customers WHERE phone = ?').run(testCustomerPhone);
    db.prepare('DELETE FROM custom_orders WHERE customer_phone = ?').run(testCustomerPhone);
    db.prepare('DELETE FROM credit_notes WHERE customer_phone = ?').run(testCustomerPhone);

    // Get supervisor token (OWNER01 / 9999 or EMP003 / 9999)
    let supRes = await request(app)
      .post('/api/auth/login')
      .send({ employee_code: 'OWNER01', pin: '9999' });

    if (!supRes.body.token) {
      supRes = await request(app)
        .post('/api/auth/login')
        .send({ employee_code: 'EMP003', pin: '9999' });
    }
    supervisorToken = supRes.body.token;

    // Get cashier token (EMP001 / 1234)
    const res = await request(app)
      .post('/api/auth/login')
      .send({ employee_code: 'EMP001', pin: '1234' });
    cashierToken = res.body.token;
  });

  // ── 1. Bills of Rs 2,499 / 2,500 / 2,501 strictly equal selling price (No Tax added or slab logic) ──
  test('bills of Rs 2,499 / 2,500 / 2,501 total payable equals strictly selling price', async () => {
    // Insert products with exact prices 2499, 2500, 2501
    const p2499 = db.prepare(`
      INSERT INTO products (sku, barcode, name, category, mrp, selling_price, stock_qty)
      VALUES ('TEST-P-2499', 'BC2499', 'Kurti 2499', 'Kurtis', 2499, 2499, 20)
    `).run().lastInsertRowid;

    const p2500 = db.prepare(`
      INSERT INTO products (sku, barcode, name, category, mrp, selling_price, stock_qty)
      VALUES ('TEST-P-2500', 'BC2500', 'Kurti 2500', 'Kurtis', 2500, 2500, 20)
    `).run().lastInsertRowid;

    const p2501 = db.prepare(`
      INSERT INTO products (sku, barcode, name, category, mrp, selling_price, stock_qty)
      VALUES ('TEST-P-2501', 'BC2501', 'Kurti 2501', 'Kurtis', 2501, 2501, 20)
    `).run().lastInsertRowid;

    // Test Bill 1: Rs 2,499
    const b1 = await request(app).post('/api/transactions').set(authHeader(cashierToken)).send({});
    const add1 = await request(app).post(`/api/transactions/${b1.body.id}/items`).set(authHeader(cashierToken))
      .send({ product_id: p2499, quantity: 1 });
    expect(add1.status).toBe(200);
    expect(add1.body.subtotal).toBe(2499);
    expect(add1.body.grand_total).toBe(2499);

    // Test Bill 2: Rs 2,500
    const b2 = await request(app).post('/api/transactions').set(authHeader(cashierToken)).send({});
    const add2 = await request(app).post(`/api/transactions/${b2.body.id}/items`).set(authHeader(cashierToken))
      .send({ product_id: p2500, quantity: 1 });
    expect(add2.status).toBe(200);
    expect(add2.body.subtotal).toBe(2500);
    expect(add2.body.grand_total).toBe(2500);

    // Test Bill 3: Rs 2,501
    const b3 = await request(app).post('/api/transactions').set(authHeader(cashierToken)).send({});
    const add3 = await request(app).post(`/api/transactions/${b3.body.id}/items`).set(authHeader(cashierToken))
      .send({ product_id: p2501, quantity: 1 });
    expect(add3.status).toBe(200);
    expect(add3.body.subtotal).toBe(2501);
    expect(add3.body.grand_total).toBe(2501);

    // Clean up
    [b1.body.id, b2.body.id, b3.body.id].forEach(id => {
      db.prepare('DELETE FROM transaction_items WHERE txn_id = ?').run(id);
      db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    });
    db.prepare('DELETE FROM products WHERE id IN (?, ?, ?)').run(p2499, p2500, p2501);
  });

  // ── 2. Mixed items with discounts: total equals sum of selling prices minus discounts ──
  test('mixed items with discounts: total payable equals sum of selling prices minus discounts', async () => {
    const p1 = db.prepare(`
      INSERT INTO products (sku, barcode, name, category, mrp, selling_price, stock_qty)
      VALUES ('TEST-MIX-1', 'BCMIX1', 'Mix Kurti 1', 'Kurtis', 1299, 1299, 20)
    `).run().lastInsertRowid;

    const p2 = db.prepare(`
      INSERT INTO products (sku, barcode, name, category, mrp, selling_price, stock_qty)
      VALUES ('TEST-MIX-2', 'BCMIX2', 'Mix Kurti 2', 'Kurtis', 2499, 2499, 20)
    `).run().lastInsertRowid;

    const p3 = db.prepare(`
      INSERT INTO products (sku, barcode, name, category, mrp, selling_price, stock_qty)
      VALUES ('TEST-MIX-3', 'BCMIX3', 'Mix Set 3', 'Co-ords', 3499, 3499, 20)
    `).run().lastInsertRowid;

    const bill = await request(app).post('/api/transactions').set(authHeader(cashierToken)).send({});
    const txnId = bill.body.id;

    // Add p1 (qty 2 = 2598) with item discount 100 -> line total = 2498
    await request(app).post(`/api/transactions/${txnId}/items`).set(authHeader(cashierToken))
      .send({ product_id: p1, quantity: 2, discount: 100 });

    // Add p2 (qty 1 = 2499) -> line total = 2499
    await request(app).post(`/api/transactions/${txnId}/items`).set(authHeader(cashierToken))
      .send({ product_id: p2, quantity: 1 });

    // Add p3 (qty 1 = 3499) -> line total = 3499
    const add3 = await request(app).post(`/api/transactions/${txnId}/items`).set(authHeader(cashierToken))
      .send({ product_id: p3, quantity: 1 });

    // Subtotal = 2498 + 2499 + 3499 = 8496
    expect(add3.body.subtotal).toBe(8496);
    expect(add3.body.grand_total).toBe(8496);

    // Apply bill-level discount of 400
    const discRes = await request(app).post(`/api/transactions/${txnId}/discount`).set(authHeader(cashierToken))
      .send({ amount: 400, reason: 'Special Promotion' });

    expect(discRes.status).toBe(200);
    // grand_total = 8496 - 400 = 8096
    expect(discRes.body.subtotal).toBe(8496);
    expect(discRes.body.total_discount).toBe(400);
    expect(discRes.body.grand_total).toBe(8096);

    // Pay full bill
    const payRes = await request(app).post('/api/payments').set(authHeader(cashierToken))
      .send({ txn_id: txnId, method: 'cash', amount: 8096, tendered: 9000 });

    expect(payRes.status).toBe(200);
    expect(payRes.body.grand_total).toBe(8096);
    expect(payRes.body.change).toBe(904);

    // Check receipt
    const receiptRes = await request(app).get(`/api/payments/receipt/${txnId}`).set(authHeader(cashierToken));
    expect(receiptRes.status).toBe(200);
    expect(receiptRes.body.bill_title).toBe('Bill');
    expect(receiptRes.body.subtotal).toBe(8496);
    expect(receiptRes.body.discount).toBe(400);
    expect(receiptRes.body.grand_total).toBe(8096);

    // Clean up
    db.prepare('DELETE FROM payments WHERE txn_id = ?').run(txnId);
    db.prepare('DELETE FROM transaction_items WHERE txn_id = ?').run(txnId);
    db.prepare('DELETE FROM transactions WHERE id = ?').run(txnId);
    db.prepare('DELETE FROM products WHERE id IN (?, ?, ?)').run(p1, p2, p3);
  });

  // ── 3. Assert no response or receipt contains tax, GST, GSTIN, HSN, CGST, SGST, IGST ──
  test('no response or receipt contains the words tax, GST, GSTIN, HSN, CGST, SGST or IGST', async () => {
    // Create and complete a transaction
    const prodId = db.prepare(`
      INSERT INTO products (sku, barcode, name, category, mrp, selling_price, stock_qty)
      VALUES ('TEST-CLEAN-01', 'BCCLEAN1', 'Silk Kurti Piece', 'Kurtis', 2500, 2500, 10)
    `).run().lastInsertRowid;

    const b = await request(app).post('/api/transactions').set(authHeader(cashierToken)).send({});
    const txnId = b.body.id;

    const addRes = await request(app).post(`/api/transactions/${txnId}/items`).set(authHeader(cashierToken))
      .send({ product_id: prodId, quantity: 1 });

    const payRes = await request(app).post('/api/payments').set(authHeader(cashierToken))
      .send({ txn_id: txnId, method: 'cash', amount: 2500, tendered: 2500 });

    const receiptRes = await request(app).get(`/api/payments/receipt/${txnId}`).set(authHeader(cashierToken));
    const configRes = await request(app).get('/api/config');
    const settingsRes = await request(app).get('/api/settings').set(authHeader(supervisorToken));
    const xReportRes = await request(app).get('/api/reports/x-report').set(authHeader(supervisorToken));
    const zReportRes = await request(app).get('/api/reports/z-report').set(authHeader(supervisorToken));
    const prodRes = await request(app).get(`/api/products/${prodId}`).set(authHeader(cashierToken));

    const responsesToCheck = [
      addRes.body,
      payRes.body,
      receiptRes.body,
      configRes.body,
      settingsRes.body,
      xReportRes.body,
      zReportRes.body,
      prodRes.body
    ];

    const forbiddenWordsRegex = /\b(tax|gst|gstin|hsn|cgst|sgst|igst)\b/i;

    responsesToCheck.forEach((body) => {
      const jsonStr = JSON.stringify(body);
      expect(jsonStr).not.toMatch(forbiddenWordsRegex);
    });

    // Clean up
    db.prepare('DELETE FROM payments WHERE txn_id = ?').run(txnId);
    db.prepare('DELETE FROM transaction_items WHERE txn_id = ?').run(txnId);
    db.prepare('DELETE FROM transactions WHERE id = ?').run(txnId);
    db.prepare('DELETE FROM products WHERE id = ?').run(prodId);
  });

  // ── 4. Garment Exchange Flow (Return one, take another, settle difference) ──
  test('exchange garments in one atomic transaction', async () => {
    // Create two test products
    const pOld = db.prepare(`
      INSERT INTO products (sku, barcode, name, category, mrp, selling_price, stock_qty)
      VALUES ('EX-OLD-S', 'EXBC001', 'Old Size S Kurti', 'Kurtis', 1500, 1500, 10)
    `).run().lastInsertRowid;

    const pNew = db.prepare(`
      INSERT INTO products (sku, barcode, name, category, mrp, selling_price, stock_qty)
      VALUES ('EX-NEW-M', 'EXBC002', 'Replacement Size M Kurti', 'Kurtis', 1800, 1800, 10)
    `).run().lastInsertRowid;

    const exRes = await request(app)
      .post('/api/transactions/exchange')
      .set(authHeader(cashierToken))
      .send({
        original_bill_number: 'AB-20261110-0099',
        reason: 'Size exchange from S to M',
        return_items: [{ product_id: pOld, quantity: 1, price: 1500 }],
        new_items: [{ product_id: pNew, quantity: 1 }]
      });

    expect(exRes.status).toBe(201);
    expect(exRes.body.transaction_type).toBe('exchange');
    // Net difference to pay: 1800 - 1500 = 300
    expect(exRes.body.grand_total).toBe(300);

    // Verify stock movement: old product returned (+1 -> 11), new product taken (-1 -> 9)
    const oldStock = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(pOld).stock_qty;
    const newStock = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(pNew).stock_qty;
    expect(oldStock).toBe(11);
    expect(newStock).toBe(9);

    // Cleanup
    db.prepare('DELETE FROM transaction_items WHERE txn_id = ?').run(exRes.body.id);
    db.prepare('DELETE FROM transactions WHERE id = ?').run(exRes.body.id);
    db.prepare('DELETE FROM products WHERE id IN (?, ?)').run(pOld, pNew);
  });

  // ── 5. Tailoring / Custom Orders with Partial Payment ──
  test('book tailoring order and record partial payments', async () => {
    const bookRes = await request(app)
      .post('/api/custom-orders')
      .set(authHeader(cashierToken))
      .send({
        customer_name: 'Pooja Deshmukh',
        customer_phone: testCustomerPhone,
        service_type: 'Custom Stitching',
        fabric: 'Pure Chanderi Silk',
        delivery_date: '2026-11-25',
        total_amount: 3500,
        advance_paid: 1500,
        measurements: { bust: 36, waist: 30, hip: 38 },
        design_notes: 'Princess cut blouse with gold latkans'
      });

    expect(bookRes.status).toBe(201);
    expect(bookRes.body.total_amount).toBe(3500);
    expect(bookRes.body.advance_paid).toBe(1500);
    expect(bookRes.body.balance_due).toBe(2000);
    expect(bookRes.body.fabric).toBe('Pure Chanderi Silk');

    const orderId = bookRes.body.id;

    // Record partial payment of ₹1,000
    const payRes = await request(app)
      .post(`/api/custom-orders/${orderId}/partial-payment`)
      .set(authHeader(cashierToken))
      .send({ amount: 1000, payment_method: 'upi' });

    expect(payRes.status).toBe(200);
    expect(payRes.body.order.advance_paid).toBe(2500);
    expect(payRes.body.order.balance_due).toBe(1000);

    // Get order slip data
    const slipRes = await request(app)
      .get(`/api/custom-orders/${orderId}/slip`)
      .set(authHeader(cashierToken));

    expect(slipRes.status).toBe(200);
    expect(slipRes.body.order.measurements.bust).toBe(36);
    expect(slipRes.body.store.name).toBeDefined();

    // Verify slip doesn't contain tax/gst
    expect(JSON.stringify(slipRes.body)).not.toMatch(/\b(tax|gst|gstin|hsn|cgst|sgst|igst)\b/i);
  });

  // ── 6. Credit Note Expiry & Redemption ──
  test('issue credit note with expiry and redeem against sale', async () => {
    const cnRes = await request(app)
      .post('/api/credit-notes')
      .set(authHeader(cashierToken))
      .send({
        customer_phone: testCustomerPhone,
        customer_name: 'Simran Kaur',
        original_bill_number: 'AB-20261117-0001',
        amount: 1500,
        validity_days: 90
      });

    expect(cnRes.status).toBe(201);
    expect(cnRes.body.balance_remaining).toBe(1500);
    expect(cnRes.body.expires_at).toBeDefined();

    const noteNum = cnRes.body.note_number;

    // Redeem ₹500
    const redRes = await request(app)
      .post('/api/credit-notes/redeem')
      .set(authHeader(cashierToken))
      .send({ note_number: noteNum, amount_to_use: 500 });

    expect(redRes.status).toBe(200);
    expect(redRes.body.remaining).toBe(1000);
  });

  // ── 7. Database Backup & Restore ──
  test('manual database backup generates a valid .db.bak file', async () => {
    const backupFile = performBackup();
    expect(backupFile).toBeDefined();
    expect(fs.existsSync(backupFile)).toBe(true);
    expect(fs.statSync(backupFile).size).toBeGreaterThan(0);
  });
});
