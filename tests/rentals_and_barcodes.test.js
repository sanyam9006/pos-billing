const request = require('supertest');
const app = require('../server/index');
const db = require('../server/db');
const { generateBarcodeSvg } = require('../server/utils/barcode');

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('Rentals (PER_DAY vs PER_EVENT) & Real Code128 Barcodes', () => {
  let cashierToken;
  let supervisorToken;
  let testItemId;
  let testItem2Id;
  let testProductId;

  beforeAll(async () => {
    // 1. Get supervisor token (OWNER01 / 9999 or EMP003 / 9999)
    let supRes = await request(app)
      .post('/api/auth/login')
      .send({ employee_code: 'OWNER01', pin: '9999' });

    if (!supRes.body.token) {
      supRes = await request(app)
        .post('/api/auth/login')
        .send({ employee_code: 'EMP003', pin: '9999' });
    }
    supervisorToken = supRes.body.token;

    // 2. Get cashier token (EMP001 / 1234)
    const cashRes = await request(app)
      .post('/api/auth/login')
      .send({ employee_code: 'EMP001', pin: '1234' });
    cashierToken = cashRes.body.token;

    // Clean up test data
    db.prepare("DELETE FROM rental_orders WHERE customer_phone LIKE '9999999%'").run();
    db.prepare("DELETE FROM rental_items WHERE sku LIKE 'TEST-RNT-%'").run();
    db.prepare("DELETE FROM products WHERE sku LIKE 'TEST-BC-%'").run();

    // Insert test rental item 1
    const res1 = db.prepare(`
      INSERT INTO rental_items (
        sku, barcode, name, category, size, color, deposit_amount,
        pricing_mode_default, rent_per_day, event_rent, event_days,
        late_fee_per_day, status
      ) VALUES ('TEST-RNT-001', '8909990001', 'Test Velvet Lehenga', 'Bridal', 'M', 'Maroon', 4000, 'PER_EVENT', 1200, 3000, 3, 500, 'available')
    `).run();
    testItemId = res1.lastInsertRowid;

    // Insert test rental item 2 (default PER_DAY)
    const res2 = db.prepare(`
      INSERT INTO rental_items (
        sku, barcode, name, category, size, color, deposit_amount,
        pricing_mode_default, rent_per_day, event_rent, event_days,
        late_fee_per_day, status
      ) VALUES ('TEST-RNT-002', '8909990002', 'Test Silk Sherwani', 'Occasion', 'L', 'Gold', 3000, 'PER_DAY', 800, 2000, 3, 400, 'available')
    `).run();
    testItem2Id = res2.lastInsertRowid;

    // Insert test retail product for barcode editing test
    const resProd = db.prepare(`
      INSERT INTO products (
        sku, barcode, name, category, mrp, selling_price, stock_qty
      ) VALUES ('TEST-BC-001', 'BARCODE-OLD-01', 'Test Garment Barcode', 'Kurtis', 1999, 1499, 10)
    `).run();
    testProductId = resProd.lastInsertRowid;
  });

  afterAll(() => {
    db.prepare("DELETE FROM rental_orders WHERE customer_phone LIKE '9999999%'").run();
    db.prepare("DELETE FROM rental_items WHERE sku LIKE 'TEST-RNT-%'").run();
    db.prepare("DELETE FROM products WHERE sku LIKE 'TEST-BC-%'").run();
  });

  // ── 1. RENTAL PRICING ENGINE (PER_DAY vs PER_EVENT) ──
  describe('Rental Pricing Engine (PER_DAY & PER_EVENT)', () => {
    test('PER_DAY calculation counts pickup day when RENTAL_COUNT_PICKUP_DAY is 1', async () => {
      // 2026-11-20 to 2026-11-22 = 3 days (pickup day counted)
      const res = await request(app)
        .get(`/api/rentals/calculate?item_id=${testItemId}&rent_date=2026-11-20&due_date=2026-11-22&pricing_mode=PER_DAY`)
        .set(authHeader(cashierToken));

      expect(res.status).toBe(200);
      expect(res.body.pricing_mode).toBe('PER_DAY');
      expect(res.body.billed_days).toBe(3);
      expect(res.body.applied_rate).toBe(1200);
      expect(res.body.calculated_rent).toBe(3600); // 1200 * 3
      expect(res.body.deposit_amount).toBe(4000);
    });

    test('PER_EVENT calculation gives fixed event rent for standard included period', async () => {
      // Even if dates span 3 days, PER_EVENT charges fixed event_rent
      const res = await request(app)
        .get(`/api/rentals/calculate?item_id=${testItemId}&rent_date=2026-11-20&due_date=2026-11-22&pricing_mode=PER_EVENT`)
        .set(authHeader(cashierToken));

      expect(res.status).toBe(200);
      expect(res.body.pricing_mode).toBe('PER_EVENT');
      expect(res.body.calculated_rent).toBe(3000); // fixed event rent
      expect(res.body.applied_rate).toBe(3000);
    });

    test('PER_DAY single same-day rental counts as 1 day', async () => {
      const res = await request(app)
        .get(`/api/rentals/calculate?item_id=${testItemId}&rent_date=2026-11-20&due_date=2026-11-20&pricing_mode=PER_DAY`)
        .set(authHeader(cashierToken));

      expect(res.status).toBe(200);
      expect(res.body.billed_days).toBe(1);
      expect(res.body.calculated_rent).toBe(1200);
    });
  });

  // ── 2. BOOKING ORDERS & OVERRIDE CONTROLS ──
  describe('Rental Booking Orders & Rent Overrides', () => {
    test('Cashier can book standard PER_DAY order without override', async () => {
      const res = await request(app)
        .post('/api/rentals/orders')
        .set(authHeader(cashierToken))
        .send({
          rental_item_id: testItemId,
          customer_name: 'Pooja Verma',
          customer_phone: '9999999001',
          rent_date: '2026-11-20',
          due_date: '2026-11-22',
          pricing_mode: 'PER_DAY',
          final_rent: 3600,
          advance_paid: 1000
        });

      expect(res.status).toBe(201);
      expect(res.body.order_number).toMatch(/^RNT-\d{6}-\d{4}$/);
      expect(res.body.pricing_mode).toBe('PER_DAY');
      expect(res.body.applied_rate).toBe(1200);
      expect(res.body.billed_days).toBe(3);
      expect(res.body.calculated_rent).toBe(3600);
      expect(res.body.final_rent).toBe(3600);
      expect(res.body.deposit_amount).toBe(4000);
      expect(res.body.status).toBe('active');

      // Check item status is now rented
      const itemRow = db.prepare('SELECT status FROM rental_items WHERE id = ?').get(testItemId);
      expect(itemRow.status).toBe('rented');
    });

    test('Cannot book an item that is currently rented', async () => {
      const res = await request(app)
        .post('/api/rentals/orders')
        .set(authHeader(cashierToken))
        .send({
          rental_item_id: testItemId,
          customer_name: 'Sneha Patel',
          customer_phone: '9999999002',
          rent_date: '2026-11-20',
          due_date: '2026-11-22'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/currently on rent/);
    });

    test('Staff modifying rent without a reason is rejected', async () => {
      const res = await request(app)
        .post('/api/rentals/orders')
        .set(authHeader(cashierToken))
        .send({
          rental_item_id: testItem2Id,
          customer_name: 'Rohit Mehra',
          customer_phone: '9999999003',
          rent_date: '2026-11-20',
          due_date: '2026-11-22',
          pricing_mode: 'PER_EVENT',
          final_rent: 1500 // Calculated is 2000, discount given
          // missing rent_override_reason
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/reason is required/i);
    });

    test('Staff modifying rent exceeding threshold without PIN is rejected', async () => {
      // Threshold is 500. Attempting override of diff 800 (from 2000 to 1200)
      const res = await request(app)
        .post('/api/rentals/orders')
        .set(authHeader(cashierToken))
        .send({
          rental_item_id: testItem2Id,
          customer_name: 'Rohit Mehra',
          customer_phone: '9999999003',
          rent_date: '2026-11-20',
          due_date: '2026-11-22',
          pricing_mode: 'PER_EVENT',
          final_rent: 1200,
          rent_override_reason: 'VIP repeat customer'
          // missing supervisor_pin
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/supervisor pin is required/i);
    });

    test('Staff modifying rent exceeding threshold with valid PIN is approved', async () => {
      const res = await request(app)
        .post('/api/rentals/orders')
        .set(authHeader(cashierToken))
        .send({
          rental_item_id: testItem2Id,
          customer_name: 'Rohit Mehra',
          customer_phone: '9999999003',
          rent_date: '2026-11-20',
          due_date: '2026-11-22',
          pricing_mode: 'PER_EVENT',
          final_rent: 1200,
          rent_override_reason: 'Wedding package deal',
          supervisor_pin: '9999'
        });

      expect(res.status).toBe(201);
      expect(res.body.final_rent).toBe(1200);
      expect(res.body.calculated_rent).toBe(2000);
      expect(res.body.rent_override_reason).toBe('Wedding package deal');
      expect(res.body.rent_override_approved_by).toBeDefined();
    });

    test('Price immutability: updating item rent_per_day later does not alter past orders', async () => {
      // Find the booked order for testItem2Id
      const order = db.prepare('SELECT * FROM rental_orders WHERE rental_item_id = ?').get(testItem2Id);
      expect(order.final_rent).toBe(1200);
      expect(order.calculated_rent).toBe(2000);

      // Now supervisor changes the item rates drastically
      await request(app)
        .put(`/api/rentals/items/${testItem2Id}`)
        .set(authHeader(supervisorToken))
        .send({
          event_rent: 4500,
          rent_per_day: 2000,
          deposit_amount: 8000
        });

      // Verify the existing order in DB is unchanged
      const freshOrder = db.prepare('SELECT * FROM rental_orders WHERE id = ?').get(order.id);
      expect(freshOrder.final_rent).toBe(1200);
      expect(freshOrder.calculated_rent).toBe(2000);
      expect(freshOrder.deposit_amount).toBe(3000); // old deposit preserved
    });
  });

  // ── 3. RETURN WORKFLOW, LATE FEES & DEPOSIT REFUND ──
  describe('Garment Return, Late Fees & Security Deposit Refund', () => {
    test('On-time return: full security deposit refunded, garment freed to available', async () => {
      const order = db.prepare("SELECT * FROM rental_orders WHERE customer_phone = '9999999001'").get();

      const res = await request(app)
        .post(`/api/rentals/orders/${order.id}/return`)
        .set(authHeader(cashierToken))
        .send({ actual_return_date: '2026-11-22' }); // exact due date

      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe('returned');
      expect(res.body.order.extra_days).toBe(0);
      expect(res.body.order.late_fee).toBe(0);
      expect(res.body.order.deposit_refunded).toBe(4000); // 100% deposit refunded

      // Item freed back to available
      const item = db.prepare('SELECT status FROM rental_items WHERE id = ?').get(order.rental_item_id);
      expect(item.status).toBe('available');
    });

    test('Late return in PER_EVENT mode: charges late fee per extra day, deducted from deposit', async () => {
      const order = db.prepare("SELECT * FROM rental_orders WHERE customer_phone = '9999999003'").get();
      // Due date was 2026-11-22. Return on 2026-11-24 = 2 extra days
      // Item 2 has late_fee_per_day = 400. 2 days * 400 = 800 late fee
      const res = await request(app)
        .post(`/api/rentals/orders/${order.id}/return`)
        .set(authHeader(cashierToken))
        .send({ actual_return_date: '2026-11-24' });

      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe('returned');
      expect(res.body.order.extra_days).toBe(2);
      expect(res.body.order.late_fee).toBe(800);
      // Net deposit refunded = deposit_amount (3000) - late_fee (800) = 2200
      expect(res.body.order.deposit_refunded).toBe(2200);
    });

    test('Early return with RENTAL_EARLY_RETURN_REFUND turned on gives pro-rated refund for PER_DAY', async () => {
      // 1. Enable setting RENTAL_EARLY_RETURN_REFUND = '1'
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('RENTAL_EARLY_RETURN_REFUND', '1')").run();

      // 2. Book a 5-day PER_DAY order (rent: 2026-12-01 to 2026-12-05 = 5 days @ 1200 = 6000)
      const bookRes = await request(app)
        .post('/api/rentals/orders')
        .set(authHeader(cashierToken))
        .send({
          rental_item_id: testItemId,
          customer_name: 'Ananya Roy',
          customer_phone: '9999999004',
          rent_date: '2026-12-01',
          due_date: '2026-12-05',
          pricing_mode: 'PER_DAY',
          final_rent: 6000
        });

      const orderId = bookRes.body.id;

      // 3. Return 2 days early on 2026-12-03 (used 3 days: 1st, 2nd, 3rd = 3600. Unused = 2400)
      const returnRes = await request(app)
        .post(`/api/rentals/orders/${orderId}/return`)
        .set(authHeader(cashierToken))
        .send({ actual_return_date: '2026-12-03' });

      expect(returnRes.status).toBe(200);
      expect(returnRes.body.order.early_refund).toBe(2400);
      // Deposit refund = deposit (4000) + early_refund (2400) = 6400
      expect(returnRes.body.order.deposit_refunded).toBe(6400);

      // Reset setting to 0
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('RENTAL_EARLY_RETURN_REFUND', '0')").run();
    });
  });

  // ── 4. RENTAL INCOME REPORT ──
  describe('Rental Income Report (PER_DAY vs PER_EVENT Split)', () => {
    test('Splits revenue between PER_DAY and PER_EVENT and tracks late fees and deposits', async () => {
      const res = await request(app)
        .get('/api/rentals/reports/income?from=2026-01-01&to=2026-12-31')
        .set(authHeader(supervisorToken));

      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.per_day_orders).toBeGreaterThanOrEqual(1);
      expect(res.body.summary.per_day_revenue).toBeGreaterThanOrEqual(3600);
      expect(res.body.summary.per_event_orders).toBeGreaterThanOrEqual(1);
      expect(res.body.summary.per_event_revenue).toBeGreaterThanOrEqual(1200);
      expect(res.body.summary.total_late_fees).toBeGreaterThanOrEqual(800);
      expect(res.body.summary.net_rental_income).toBeGreaterThanOrEqual(4800);
    });

    test('Cashier is forbidden from viewing income report', async () => {
      const res = await request(app)
        .get('/api/rentals/reports/income')
        .set(authHeader(cashierToken));

      expect(res.status).toBe(403);
    });
  });

  // ── 5. REAL CODE128 BARCODE GENERATION & EDITING ──
  describe('Real Code128 Barcode Generation & Product Editing', () => {
    test('generateBarcodeSvg produces valid Code128 SVG with quiet zone and human text', () => {
      const svg = generateBarcodeSvg('AUR-KRT-101', {
        width: 1.5,
        height: 35,
        margin: 10,
        displayValue: true
      });

      expect(typeof svg).toBe('string');
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('<rect'); // Barcode bars
      expect(svg).toContain('AUR-KRT-101'); // Human readable text below
      expect(svg).not.toContain('||||'); // No fake bars!
    });

    test('generateBarcodeSvg throws error on empty barcode', () => {
      expect(() => generateBarcodeSvg('')).toThrow('Barcode cannot be empty');
      expect(() => generateBarcodeSvg('   ')).toThrow('Barcode cannot be empty');
    });

    test('Supervisor can edit product barcode with uniqueness check and audit log', async () => {
      const newBarcode = '890123999999';

      const res = await request(app)
        .put(`/api/products/${testProductId}`)
        .set(authHeader(supervisorToken))
        .send({ barcode: newBarcode });

      expect(res.status).toBe(200);
      expect(res.body.barcode).toBe(newBarcode);

      // Check DB
      const prodInDb = db.prepare('SELECT barcode FROM products WHERE id = ?').get(testProductId);
      expect(prodInDb.barcode).toBe(newBarcode);

      // Check audit log
      const audit = db.prepare("SELECT * FROM audit_logs WHERE action = 'edit_barcode' AND entity_id = ?").get(String(testProductId));
      expect(audit).toBeDefined();
      expect(audit.details_json).toContain('BARCODE-OLD-01');
      expect(audit.details_json).toContain(newBarcode);
    });

    test('Editing barcode to an existing barcode returns 409 conflict', async () => {
      // Insert another product
      const resDup = db.prepare(`
        INSERT INTO products (sku, barcode, name, category, mrp, selling_price)
        VALUES ('TEST-BC-DUP', 'BARCODE-DUP-01', 'Dup', 'Kurtis', 100, 100)
      `).run();

      const res = await request(app)
        .put(`/api/products/${testProductId}`)
        .set(authHeader(supervisorToken))
        .send({ barcode: 'BARCODE-DUP-01' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already assigned/i);

      db.prepare('DELETE FROM products WHERE id = ?').run(resDup.lastInsertRowid);
    });

    test('Cashier is forbidden from editing product barcode', async () => {
      const res = await request(app)
        .put(`/api/products/${testProductId}`)
        .set(authHeader(cashierToken))
        .send({ barcode: 'CASHIER-HACK' });

      expect(res.status).toBe(403);
    });
  });

  // ── 6. STRICT ZERO TAX / ZERO GST VERIFICATION ──
  describe('Zero Tax / GST Verification Across Rentals & Barcodes', () => {
    test('Rental calculate, orders, slip and income responses contain zero tax words', async () => {
      const forbidden = /\b(tax|gst|gstin|hsn|cgst|sgst|igst)\b/i;

      // Calculate endpoint
      const calcRes = await request(app)
        .get(`/api/rentals/calculate?item_id=${testItemId}&rent_date=2026-11-20&due_date=2026-11-22`)
        .set(authHeader(cashierToken));
      expect(JSON.stringify(calcRes.body)).not.toMatch(forbidden);

      // Orders endpoint
      const ordersRes = await request(app)
        .get('/api/rentals/orders')
        .set(authHeader(cashierToken));
      expect(JSON.stringify(ordersRes.body)).not.toMatch(forbidden);

      // Slip endpoint
      const slipRes = await request(app)
        .get(`/api/rentals/orders/${ordersRes.body[0].id}/slip`)
        .set(authHeader(cashierToken));
      expect(JSON.stringify(slipRes.body)).not.toMatch(forbidden);

      // Income report endpoint
      const reportRes = await request(app)
        .get('/api/rentals/reports/income')
        .set(authHeader(supervisorToken));
      expect(JSON.stringify(reportRes.body)).not.toMatch(forbidden);
    });
  });

  // ── 7. HOUSE OF SADAYA BRANDING & LOGO ON BILLS ──
  describe('House of Sadaya Branding & Logo on Bills', () => {
    test('Store config endpoint returns House of Sadaya details and logo', async () => {
      const res = await request(app).get('/api/config');
      expect(res.status).toBe(200);
      expect(res.body.store_name).toBe('House of Sadaya');
      expect(res.body.store_address).toBe('4/8 Housing board Tonk Rajasthan');
      expect(res.body.store_phone).toBe('7568458575');
      expect(res.body.store_logo).toMatch(/^data:image\/png;base64,/);
    });

    test('Rental slip includes House of Sadaya branding and logo', async () => {
      const ordersRes = await request(app)
        .get('/api/rentals/orders')
        .set(authHeader(cashierToken));
      const slipRes = await request(app)
        .get(`/api/rentals/orders/${ordersRes.body[0].id}/slip`)
        .set(authHeader(cashierToken));

      expect(slipRes.status).toBe(200);
      expect(slipRes.body.store.name).toBe('House of Sadaya');
      expect(slipRes.body.store.address).toBe('4/8 Housing board Tonk Rajasthan');
      expect(slipRes.body.store.phone).toBe('7568458575');
      expect(slipRes.body.store.logo).toMatch(/^data:image\/png;base64,/);
    });
  });
});
