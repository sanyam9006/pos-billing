const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/customers/search?phone=
router.get('/search', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  const customer = db.prepare('SELECT * FROM customers WHERE phone LIKE ?').get(`%${phone}%`);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  res.json(customer);
});

// POST /api/customers/:id/redeem — Redeem loyalty points
router.post('/:id/redeem', (req, res) => {
  const { points, txn_id } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);

  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  if (points > customer.loyalty_points) {
    return res.status(400).json({ error: `Only ${customer.loyalty_points} points available` });
  }
  if (points <= 0) return res.status(400).json({ error: 'Points must be greater than 0' });

  // 1 point = ₹1 discount
  const discount = points;

  // Deduct points
  db.prepare('UPDATE customers SET loyalty_points = loyalty_points - ? WHERE id = ?')
    .run(points, req.params.id);

  // Apply discount to transaction
  if (txn_id) {
    const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn_id);
    const newDiscount = (txn.total_discount || 0) + discount;
    const grandTotal = Math.max(0, Math.round((txn.subtotal - newDiscount + txn.tax_amount) * 100) / 100);

    db.prepare('UPDATE transactions SET total_discount = ?, grand_total = ? WHERE id = ?')
      .run(newDiscount, grandTotal, txn_id);
  }

  const updatedCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  res.json({ success: true, points_redeemed: points, discount_applied: discount, customer: updatedCustomer });
});

// GET /api/customers — list all
router.get('/', (req, res) => {
  const customers = db.prepare('SELECT * FROM customers ORDER BY name').all();
  res.json(customers);
});

module.exports = router;
