const request = require('supertest');
const app = require('../server/index');
const db = require('../server/db');
const { getGarmentTaxRate, calculateItemTaxAndTotal } = require('../server/utils/tax');

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('Boutique Specific Features: GST Slabs, Custom Orders & Credit Notes', () => {
  let cashierToken;
  let supervisorToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ employee_code: 'EMP001', pin: '1234' });
    cashierToken = res.body.token;

    const supRes = await request(app)
      .post('/api/auth/login')
      .send({ employee_code: 'EMP003', pin: '9999' });
    supervisorToken = supRes.body.token;
  });

  // ── Garment Dynamic GST Slab Test ──
  test('garment tax slab: <= 1000 is 5%, > 1000 is 12%', () => {
    const kurti = { category: 'Women Apparel', hsn_code: '6204', tax_rate: 5 };
    expect(getGarmentTaxRate(kurti, 850)).toBe(5.0);
    expect(getGarmentTaxRate(kurti, 2400)).toBe(12.0);
  });

  test('inclusive tax calculation: customer pays exact tag price', () => {
    // When selling price is 840 (<= 1000 slab, tax is 5%):
    // taxable = 840 / 1.05 = 800, tax = 40, lineTotal = 840
    const kurti = { selling_price: 840, category: 'Apparel', tax_rate: 5 };
    const calc = calculateItemTaxAndTotal(kurti, 1, 'inclusive');
    expect(calc.lineTotal).toBe(840);
    expect(calc.taxableValue).toBe(800);
    expect(calc.tax).toBe(40);
    expect(calc.cgst).toBe(20);
    expect(calc.sgst).toBe(20);
  });

  // ── Custom Orders / Tailoring & Alterations ──
  test('book a tailoring order with measurements and advance', async () => {
    const res = await request(app)
      .post('/api/custom-orders')
      .set(authHeader(cashierToken))
      .send({
        customer_name: 'Pooja Deshmukh',
        customer_phone: '9822334455',
        service_type: 'Custom Stitching',
        delivery_date: '2026-11-25',
        total_amount: 3500,
        advance_paid: 1500,
        measurements: { bust: 36, waist: 30, hip: 38 },
        design_notes: 'Princess cut blouse with gold lace'
      });

    expect(res.status).toBe(201);
    expect(res.body.order_number).toMatch(/^ORD-/);
    expect(res.body.total_amount).toBe(3500);
    expect(res.body.advance_paid).toBe(1500);
    expect(res.body.balance_due).toBe(2000);
    expect(res.body.status).toBe('booked');

    const orderId = res.body.id;

    // Update status to trial_ready
    const statusRes = await request(app)
      .put(`/api/custom-orders/${orderId}/status`)
      .set(authHeader(cashierToken))
      .send({ status: 'trial_ready' });

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('trial_ready');

    // Deliver and settle balance
    const deliverRes = await request(app)
      .post(`/api/custom-orders/${orderId}/deliver`)
      .set(authHeader(cashierToken))
      .send({});

    expect(deliverRes.status).toBe(200);
    expect(deliverRes.body.order.status).toBe('delivered');
    expect(deliverRes.body.order.balance_due).toBe(0);
  });

  // ── Store Credit Notes & Exchange Flow ──
  test('issue credit note and redeem against billing', async () => {
    // 1. Issue Credit Note
    const cnRes = await request(app)
      .post('/api/credit-notes')
      .set(authHeader(cashierToken))
      .send({
        customer_phone: '9899887766',
        customer_name: 'Simran Kaur',
        original_bill_number: 'SM-20261117-0001',
        amount: 1500,
        reason: 'Size exchange credit'
      });

    expect(cnRes.status).toBe(201);
    expect(cnRes.body.note_number).toMatch(/^CN-/);
    expect(cnRes.body.balance_remaining).toBe(1500);
    const noteNumber = cnRes.body.note_number;

    // 2. Lookup credit notes by phone
    const lookupRes = await request(app)
      .get('/api/credit-notes/lookup?phone=9899887766')
      .set(authHeader(cashierToken));

    expect(lookupRes.status).toBe(200);
    expect(lookupRes.body.total_available).toBeGreaterThanOrEqual(1500);

    // 3. Redeem partial credit note
    const redeemRes = await request(app)
      .post('/api/credit-notes/redeem')
      .set(authHeader(cashierToken))
      .send({
        note_number: noteNumber,
        amount_to_use: 1000
      });

    expect(redeemRes.status).toBe(200);
    expect(redeemRes.body.redeemed).toBe(1000);
    expect(redeemRes.body.remaining).toBe(500);
    expect(redeemRes.body.note.status).toBe('active');
  });
});
