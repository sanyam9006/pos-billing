const request = require('supertest');
const app = require('../server/index');
const db = require('../server/db');
const { getGarmentTaxRate, calculateInclusiveTax, calculateItemTaxAndTotal } = require('../server/utils/tax');
const { performBackup } = require('../server/utils/backup');
const fs = require('fs');

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('Boutique Specific Features: GST Slabs, Exchanges, Tailoring & Robustness', () => {
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

  // ── 1. Garment Dynamic GST Slab Boundaries (2499, 2500, 2501) ──
  test('garment tax slab boundaries: 2,499 is 5%, 2,500 is 5%, 2,501 is 18%', () => {
    const kurti = { category: 'Kurtis', hsn_code: '6204' };

    expect(getGarmentTaxRate(kurti, 2499)).toBe(5.0);
    expect(getGarmentTaxRate(kurti, 2500)).toBe(5.0);
    expect(getGarmentTaxRate(kurti, 2501)).toBe(18.0);
  });

  // ── 2. Discount Moving an Item Across the Slab (18% -> 5%) ──
  test('discount per piece moves an item from 18% slab to 5% slab', () => {
    const coord = { category: 'Co-ords', hsn_code: '6204' };
    const sellingPrice = 2650; // Above 2500 -> 18% slab without discount

    expect(getGarmentTaxRate(coord, sellingPrice)).toBe(18.0);

    // Apply ₹200 discount -> effective piece price becomes ₹2,450 (<= 2500 -> 5% slab!)
    const calcWithDiscount = calculateInclusiveTax(sellingPrice, 1, 200, coord);
    expect(calcWithDiscount.effectivePiecePrice).toBe(2450);
    expect(calcWithDiscount.taxRate).toBe(5.0);
    expect(calcWithDiscount.lineTotal).toBe(2450);
  });

  // ── 3. Strict Tax-Inclusive Math (Customer pays ONLY the tag price) ──
  test('tax-inclusive math extracts embedded GST without increasing payable total', () => {
    const saree = { category: 'Sarees', hsn_code: '5208' };
    // ₹1,050 item at 5% GST:
    // taxable = 1050 / 1.05 = 1000
    // embedded tax = 50 (CGST 25 + SGST 25)
    // customer pays strictly 1050
    const calc = calculateInclusiveTax(1050, 1, 0, saree);
    expect(calc.lineTotal).toBe(1050);
    expect(calc.taxableValue).toBe(1000);
    expect(calc.taxIncluded).toBe(50);
    expect(calc.cgst).toBe(25);
    expect(calc.sgst).toBe(25);
    expect(calc.igst).toBe(0);

    // Also test alias
    const aliasCalc = calculateItemTaxAndTotal({ selling_price: 1050, ...saree }, 1);
    expect(aliasCalc.lineTotal).toBe(1050);
    expect(aliasCalc.taxableValue).toBe(1000);
  });

  // ── 4. Mixed Bill (Some 5%, Some 18%) ──
  test('mixed bill with 5% and 18% items calculates totals correctly', async () => {
    // Create bill
    const billRes = await request(app)
      .post('/api/transactions')
      .set(authHeader(cashierToken))
      .send({ counter_number: 1 });

    expect(billRes.status).toBe(200);
    const txnId = billRes.body.id;

    // Insert two test garments: one <= 2500 (5%), one > 2500 (18%)
    const p5 = db.prepare(`
      INSERT INTO products (sku, barcode, name, category, mrp, selling_price, hsn_code, tax_rate, stock_qty)
      VALUES ('TEST-KRT-5', 'TESTBC005', 'Test Kurti Low', 'Kurtis', 1200, 1200, '6204', 5, 20)
    `).run();

    const p18 = db.prepare(`
      INSERT INTO products (sku, barcode, name, category, mrp, selling_price, hsn_code, tax_rate, stock_qty)
      VALUES ('TEST-SET-18', 'TESTBC018', 'Test Silk Set High', 'Co-ords', 3500, 3500, '6204', 18, 20)
    `).run();

    // Add item 1 (1200)
    await request(app)
      .post(`/api/transactions/${txnId}/items`)
      .set(authHeader(cashierToken))
      .send({ product_id: p5.lastInsertRowid, quantity: 1 });

    // Add item 2 (3500)
    const add2Res = await request(app)
      .post(`/api/transactions/${txnId}/items`)
      .set(authHeader(cashierToken))
      .send({ product_id: p18.lastInsertRowid, quantity: 1 });

    expect(add2Res.status).toBe(200);
    // grand_total must be EXACTLY 1200 + 3500 = 4700 (tax is NOT added on top!)
    expect(add2Res.body.subtotal).toBe(4700);
    expect(add2Res.body.grand_total).toBe(4700);

    // Verify tax_amount is the extracted embedded tax
    // p5 tax: 1200 - 1200/1.05 = 57.14
    // p18 tax: 3500 - 3500/1.18 = 533.90
    // total tax ~ 591.04
    expect(add2Res.body.tax_amount).toBeGreaterThan(590);
    expect(add2Res.body.tax_amount).toBeLessThan(592);

    // Cleanup test products
    db.prepare('DELETE FROM transaction_items WHERE txn_id = ?').run(txnId);
    db.prepare('DELETE FROM transactions WHERE id = ?').run(txnId);
    db.prepare('DELETE FROM products WHERE id IN (?, ?)').run(p5.lastInsertRowid, p18.lastInsertRowid);
  });

  // ── 5. Garment Exchange Flow (Return one, take another, settle difference) ──
  test('exchange garments in one atomic transaction', async () => {
    // Create two test products
    const pOld = db.prepare(`
      INSERT INTO products (sku, barcode, name, category, mrp, selling_price, stock_qty)
      VALUES ('EX-OLD-S', 'EXBC001', 'Old Size S Kurti', 'Kurtis', 1500, 1500, 10)
    `).run();

    const pNew = db.prepare(`
      INSERT INTO products (sku, barcode, name, category, mrp, selling_price, stock_qty)
      VALUES ('EX-NEW-M', 'EXBC002', 'Replacement Size M Kurti', 'Kurtis', 1800, 1800, 10)
    `).run();

    const exRes = await request(app)
      .post('/api/transactions/exchange')
      .set(authHeader(cashierToken))
      .send({
        original_bill_number: 'AB-20261110-0099',
        reason: 'Size exchange from S to M',
        return_items: [{ product_id: pOld.lastInsertRowid, quantity: 1, price: 1500 }],
        new_items: [{ product_id: pNew.lastInsertRowid, quantity: 1 }]
      });

    expect(exRes.status).toBe(201);
    expect(exRes.body.transaction_type).toBe('exchange');
    // Net difference to pay: 1800 - 1500 = 300
    expect(exRes.body.grand_total).toBe(300);

    // Verify stock movement: old product returned (+1 -> 11), new product taken (-1 -> 9)
    const oldStock = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(pOld.lastInsertRowid).stock_qty;
    const newStock = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(pNew.lastInsertRowid).stock_qty;
    expect(oldStock).toBe(11);
    expect(newStock).toBe(9);

    // Cleanup
    db.prepare('DELETE FROM transaction_items WHERE txn_id = ?').run(exRes.body.id);
    db.prepare('DELETE FROM transactions WHERE id = ?').run(exRes.body.id);
    db.prepare('DELETE FROM products WHERE id IN (?, ?)').run(pOld.lastInsertRowid, pNew.lastInsertRowid);
  });

  // ── 6. Tailoring / Custom Orders with Partial Payment ──
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
  });

  // ── 7. Credit Note Expiry & Redemption ──
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

  // ── 8. Database Backup & Restore ──
  test('manual database backup generates a valid .db.bak file', async () => {
    const backupFile = performBackup();
    expect(backupFile).toBeDefined();
    expect(fs.existsSync(backupFile)).toBe(true);
    expect(fs.statSync(backupFile).size).toBeGreaterThan(0);
  });
});
