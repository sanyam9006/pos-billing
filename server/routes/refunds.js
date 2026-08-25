const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../utils/auth');

// ── POST /api/refunds — Process a refund (supervisor only) ──
router.post('/', requireRole('supervisor'), (req, res) => {
  const { txn_id, items, reason, method = 'cash' } = req.body;

  if (!txn_id) return res.status(400).json({ error: 'Transaction ID required' });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item required for refund' });
  }

  const txn = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'completed'").get(txn_id);
  if (!txn) return res.status(404).json({ error: 'Completed transaction not found' });

  const txnItems = db.prepare('SELECT * FROM transaction_items WHERE txn_id = ?').all(txn_id);

  let totalRefund = 0;
  const refundedItems = [];

  for (const refundReq of items) {
    const txnItem = txnItems.find(ti => ti.id === refundReq.item_id);
    if (!txnItem) {
      return res.status(400).json({ error: `Transaction item ${refundReq.item_id} not found` });
    }

    const refundQty = refundReq.quantity || txnItem.quantity;
    if (refundQty > txnItem.quantity) {
      return res.status(400).json({ error: `Cannot refund ${refundQty} — only ${txnItem.quantity} purchased` });
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(txnItem.product_id);
    const itemRefundAmount = Math.round((txnItem.unit_price * refundQty + txnItem.tax * refundQty / txnItem.quantity) * 100) / 100;

    totalRefund += itemRefundAmount;
    refundedItems.push({
      item_id: txnItem.id,
      product_id: txnItem.product_id,
      product_name: product?.name,
      quantity: refundQty,
      amount: itemRefundAmount
    });

    // Restore stock
    db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(refundQty, txnItem.product_id);
  }

  // Create refund record
  const result = db.prepare(
    'INSERT INTO refunds (original_txn_id, cashier_id, reason, refund_amount, refund_method, items_json) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(txn_id, req.cashier.id, reason || null, totalRefund, method, JSON.stringify(refundedItems));

  const refund = db.prepare('SELECT * FROM refunds WHERE id = ?').get(result.lastInsertRowid);

  res.status(201).json({
    ...refund,
    items: refundedItems,
    original_bill: txn.bill_number
  });
});

// ── GET /api/refunds — List all refunds ──
router.get('/', (req, res) => {
  const refunds = db.prepare(`
    SELECT r.*, t.bill_number, c.name as cashier_name
    FROM refunds r
    JOIN transactions t ON r.original_txn_id = t.id
    JOIN cashiers c ON r.cashier_id = c.id
    ORDER BY r.created_at DESC
  `).all();

  // Parse items_json
  const result = refunds.map(r => ({
    ...r,
    items: r.items_json ? JSON.parse(r.items_json) : []
  }));

  res.json(result);
});

// ── GET /api/refunds/:id — Get single refund ──
router.get('/:id', (req, res) => {
  const refund = db.prepare(`
    SELECT r.*, t.bill_number, c.name as cashier_name
    FROM refunds r
    JOIN transactions t ON r.original_txn_id = t.id
    JOIN cashiers c ON r.cashier_id = c.id
    WHERE r.id = ?
  `).get(req.params.id);

  if (!refund) return res.status(404).json({ error: 'Refund not found' });

  res.json({
    ...refund,
    items: refund.items_json ? JSON.parse(refund.items_json) : []
  });
});

module.exports = router;
