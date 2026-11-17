const express = require('express');
const router = express.Router();
const db = require('../db');
const { getSetting } = require('../utils/tax');
const { logAudit } = require('../utils/audit');

function generateOrderNumber() {
  const now = new Date();
  const ym = now.toISOString().slice(0, 7).replace('-', '');
  const countRow = db.prepare("SELECT COUNT(*) as count FROM custom_orders WHERE order_number LIKE ?").get(`ORD-${ym}-%`);
  const seq = String((countRow ? countRow.count : 0) + 1).padStart(4, '0');
  return `ORD-${ym}-${seq}`;
}

// ── GET /api/custom-orders — List custom orders ──
router.get('/', (req, res) => {
  const { status, search } = req.query;
  let sql = 'SELECT * FROM custom_orders WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR order_number LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY id DESC';
  const orders = db.prepare(sql).all(...params);
  res.json(orders);
});

// ── GET /api/custom-orders/pending-balances — List orders with pending balance ──
router.get('/pending-balances', (req, res) => {
  const pending = db.prepare(`
    SELECT * FROM custom_orders
    WHERE balance_due > 0 AND status != 'delivered'
    ORDER BY delivery_date ASC, id DESC
  `).all();

  const totalPending = pending.reduce((sum, o) => sum + Number(o.balance_due || 0), 0);
  res.json({ count: pending.length, total_pending_balance: Math.round(totalPending * 100) / 100, orders: pending });
});

// ── GET /api/custom-orders/:id — Get single order ──
router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM custom_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// ── GET /api/custom-orders/:id/slip — Printable order slip data ──
router.get('/:id/slip', (req, res) => {
  const order = db.prepare('SELECT * FROM custom_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const store = {
    name: getSetting('STORE_NAME', 'Aura Fashion Boutique'),
    phone: getSetting('STORE_PHONE', '+91 98765 43210'),
    address: getSetting('STORE_ADDRESS', 'Shop 12, Fashion Street, M.I. Road, Jaipur, Rajasthan 302001'),
    gstin: getSetting('STORE_GSTIN', '08AAAAA0000A1Z5')
  };

  let measurements = {};
  try {
    measurements = order.measurements_json ? JSON.parse(order.measurements_json) : {};
  } catch (_) {}

  res.json({
    store,
    order: {
      ...order,
      measurements
    }
  });
});

// ── POST /api/custom-orders — Book new tailoring / alteration order ──
router.post('/', (req, res) => {
  const {
    customer_name,
    customer_phone,
    service_type = 'Custom Stitching',
    fabric,
    trial_date,
    delivery_date,
    total_amount,
    advance_paid = 0,
    measurements = {},
    design_notes
  } = req.body;

  if (!customer_name || !customer_phone || total_amount === undefined) {
    return res.status(400).json({ error: 'Customer name, phone, and total amount are required' });
  }

  const orderNum = generateOrderNumber();
  const total = Number(total_amount);
  const advance = Number(advance_paid);
  const balance = Math.max(0, Math.round((total - advance) * 100) / 100);

  const result = db.prepare(`
    INSERT INTO custom_orders (
      order_number, customer_name, customer_phone, service_type,
      status, fabric, trial_date, delivery_date, total_amount, advance_paid,
      balance_due, measurements_json, design_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderNum,
    customer_name.trim(),
    customer_phone.trim(),
    service_type,
    'booked',
    fabric || null,
    trial_date || null,
    delivery_date || null,
    total,
    advance,
    balance,
    JSON.stringify(measurements),
    design_notes || null
  );

  const order = db.prepare('SELECT * FROM custom_orders WHERE id = ?').get(result.lastInsertRowid);

  logAudit({
    cashier_id: req.cashier?.id,
    cashier_name: req.cashier?.name,
    action: 'book_custom_order',
    entity_type: 'custom_order',
    entity_id: order.id,
    details: { order_number: orderNum, customer_name, total, advance }
  });

  res.status(201).json(order);
});

// ── POST /api/custom-orders/:id/partial-payment — Add partial payment ──
router.post('/:id/partial-payment', (req, res) => {
  const order = db.prepare('SELECT * FROM custom_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { amount, payment_method = 'cash' } = req.body;
  const payAmt = Number(amount);
  if (!payAmt || payAmt <= 0) {
    return res.status(400).json({ error: 'Valid payment amount required' });
  }
  if (payAmt > order.balance_due + 0.05) {
    return res.status(400).json({ error: `Amount ₹${payAmt} exceeds remaining balance of ₹${order.balance_due}` });
  }

  const newAdvance = Math.round((order.advance_paid + payAmt) * 100) / 100;
  const newBalance = Math.max(0, Math.round((order.total_amount - newAdvance) * 100) / 100);

  db.prepare(`
    UPDATE custom_orders
    SET advance_paid = ?, balance_due = ?
    WHERE id = ?
  `).run(newAdvance, newBalance, order.id);

  const updated = db.prepare('SELECT * FROM custom_orders WHERE id = ?').get(order.id);

  logAudit({
    cashier_id: req.cashier?.id,
    cashier_name: req.cashier?.name,
    action: 'custom_order_payment',
    entity_type: 'custom_order',
    entity_id: order.id,
    details: { amount: payAmt, payment_method, new_balance: newBalance }
  });

  res.json({
    success: true,
    message: `Payment of ₹${payAmt} recorded. Remaining balance: ₹${newBalance}`,
    order: updated
  });
});

// ── PUT /api/custom-orders/:id/status — Update order status ──
router.put('/:id/status', (req, res) => {
  const order = db.prepare('SELECT * FROM custom_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { status } = req.body;
  const valid = ['booked', 'in_progress', 'in_stitching', 'trial_ready', 'completed', 'delivered'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Choose from: ${valid.join(', ')}` });
  }

  const deliveredAt = status === 'delivered' ? new Date().toISOString() : order.delivered_at;

  db.prepare(`
    UPDATE custom_orders SET status = ?, delivered_at = ? WHERE id = ?
  `).run(status, deliveredAt, req.params.id);

  const updated = db.prepare('SELECT * FROM custom_orders WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ── POST /api/custom-orders/:id/deliver — Deliver order and clear balance ──
router.post('/:id/deliver', (req, res) => {
  const order = db.prepare('SELECT * FROM custom_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  db.prepare(`
    UPDATE custom_orders SET
      status = 'delivered',
      advance_paid = total_amount,
      balance_due = 0,
      delivered_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(req.params.id);

  const updated = db.prepare('SELECT * FROM custom_orders WHERE id = ?').get(req.params.id);
  res.json({
    success: true,
    message: `Order ${updated.order_number} marked as delivered and fully settled.`,
    order: updated
  });
});

module.exports = router;
