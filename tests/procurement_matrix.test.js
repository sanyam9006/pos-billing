const request = require('supertest');
const app = require('../server/index');
const db = require('../server/db');

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('Procurement & Batch Matrix Variants', () => {
  let supervisorToken;
  let cashierToken;
  let supplierId;
  let testProductId;

  beforeAll(async () => {
    // Get supervisor token
    const supRes = await request(app)
      .post('/api/auth/login')
      .send({ employee_code: 'EMP003', pin: '9999' });
    supervisorToken = supRes.body.token;

    // Get cashier token
    const cashRes = await request(app)
      .post('/api/auth/login')
      .send({ employee_code: 'EMP001', pin: '1234' });
    cashierToken = cashRes.body.token;

    // Clean up test data
    db.prepare("DELETE FROM purchase_order_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE notes LIKE 'Test%')").run();
    db.prepare("DELETE FROM purchase_orders WHERE notes LIKE 'Test%'").run();
    db.prepare("DELETE FROM products WHERE sku LIKE 'TEST-VAR-%'").run();
    db.prepare("DELETE FROM suppliers WHERE name LIKE 'Test Supplier%'").run();
  });

  // ── Matrix Variant Batch Creation ──
  test('supervisor can batch create product matrix variants', async () => {
    const variants = [
      {
        sku: 'TEST-VAR-BLK-S',
        barcode: '999001001',
        name: 'Test Dress (Black - S)',
        category: 'Apparel',
        mrp: 1999,
        selling_price: 1499,
        stock_qty: 15,
        unit: 'pcs',
        variant_size: 'S',
        variant_color: 'Black'
      },
      {
        sku: 'TEST-VAR-BLK-M',
        barcode: '999001002',
        name: 'Test Dress (Black - M)',
        category: 'Apparel',
        mrp: 1999,
        selling_price: 1499,
        stock_qty: 20,
        unit: 'pcs',
        variant_size: 'M',
        variant_color: 'Black'
      }
    ];

    const res = await request(app)
      .post('/api/products/batch')
      .set(authHeader(supervisorToken))
      .send({ products: variants });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);

    // Verify in db
    const p1 = db.prepare("SELECT * FROM products WHERE sku = 'TEST-VAR-BLK-S'").get();
    expect(p1).toBeDefined();
    expect(p1.stock_qty).toBe(15);
    expect(p1.variant_size).toBe('S');
    testProductId = p1.id;
  });

  test('cashier cannot batch create variants (role enforcement)', async () => {
    const res = await request(app)
      .post('/api/products/batch')
      .set(authHeader(cashierToken))
      .send({ products: [{ sku: 'X', barcode: 'Y', name: 'Z', category: 'C', mrp: 10, selling_price: 10 }] });

    expect(res.status).toBe(403);
  });

  // ── Supplier Management ──
  test('supervisor can create a supplier', async () => {
    const res = await request(app)
      .post('/api/suppliers')
      .set(authHeader(supervisorToken))
      .send({
        name: 'Test Supplier Textiles',
        contact_person: 'Anil Gupta',
        phone: '9811223344',
        email: 'anil@testsupplier.com',
        address: 'Bhiwandi, Maharashtra'
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Supplier Textiles');
    supplierId = res.body.id;
  });

  test('list suppliers returns active suppliers', async () => {
    const res = await request(app)
      .get('/api/suppliers')
      .set(authHeader(cashierToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some(s => s.id === supplierId)).toBe(true);
  });

  // ── Purchase Order & Restocking Workflow ──
  test('create purchase order and receive stock', async () => {
    // Check initial stock
    const beforeStock = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(testProductId).stock_qty;

    // 1. Create PO
    const poRes = await request(app)
      .post('/api/purchase-orders')
      .set(authHeader(supervisorToken))
      .send({
        supplier_id: supplierId,
        notes: 'Test consignment restock',
        status: 'ordered',
        items: [
          {
            product_id: testProductId,
            quantity_ordered: 50,
            cost_price: 600
          }
        ]
      });

    expect(poRes.status).toBe(201);
    expect(poRes.body.po_number).toMatch(/^PO-/);
    const poId = poRes.body.id;

    // 2. Receive stock from PO
    const receiveRes = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set(authHeader(supervisorToken))
      .send({});

    expect(receiveRes.status).toBe(200);
    expect(receiveRes.body.success).toBe(true);
    expect(receiveRes.body.po.status).toBe('received');

    // 3. Verify that product stock automatically increased by 50!
    const afterStock = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(testProductId).stock_qty;
    expect(afterStock).toBe(beforeStock + 50);
  });

  test('cannot receive an already received purchase order', async () => {
    const po = db.prepare("SELECT id FROM purchase_orders WHERE status = 'received' LIMIT 1").get();
    const res = await request(app)
      .post(`/api/purchase-orders/${po.id}/receive`)
      .set(authHeader(supervisorToken))
      .send({});

    expect(res.status).toBe(400);
  });
});
