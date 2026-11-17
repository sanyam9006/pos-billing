const express = require('express');
const router = express.Router();
const db = require('../db');

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

// ── GET /api/custom-orders/:id — Get single order ──
router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM custom_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// ── POST /api/custom-orders — Book new tailoring / alteration order ──
router.post('/', (req, res) => {
  const {
    customer_name,
    customer_phone,
    service_type = 'Custom Stitching',
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
  const balance = Math.max(0, total - advance);

  const result = db.prepare(`
    INSERT INTO custom_orders (
      order_number, customer_name, customer_phone, service_type,
      status, trial_date, delivery_date, total_amount, advance_paid,
      balance_due, measurements_json, design_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderNum,
    customer_name.trim(),
    customer_phone.trim(),
    service_type,
    'booked',
    trial_date || null,
    delivery_date || null,
    total,
    advance,
    balance,
    JSON.stringify(measurements),
    design_notes || null
  );

  const order = db.prepare('SELECT * FROM custom_orders WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(order);
});

// ── PUT /api/custom-orders/:id/status — Update order status ──
router.put('/:id/status', (req, res) => {
  const order = db.prepare('SELECT * FROM custom_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { status } = req.body;
  const valid = ['booked', 'in_progress', 'trial_ready', 'completed', 'delivered'];
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
