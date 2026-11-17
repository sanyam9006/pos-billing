const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../utils/auth');
const { logAudit } = require('../utils/audit');

// ── POST /api/refunds — Process a refund (supervisor only) ──
router.post('/', requireRole('supervisor'), (req, res) => {
  const { txn_id, items, reason, method = 'cash', customer_phone, customer_name } = req.body;

  if (!txn_id) return res.status(400).json({ error: 'Transaction ID required' });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item required for refund' });
  }

  const txn = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'completed'").get(txn_id);
  if (!txn) return res.status(404).json({ error: 'Completed transaction not found' });

  const txnItems = db.prepare('SELECT * FROM transaction_items WHERE txn_id = ?').all(txn_id);

  let totalRefund = 0;
  let totalTaxReversed = 0;
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

    // In tax-inclusive pricing, the line_total already includes tax and accounts for discounts
    const unitInclusive = (txnItem.line_total) / (txnItem.quantity || 1);
    const itemRefundAmount = Math.round(unitInclusive * refundQty * 100) / 100;
    const rate = Number(txnItem.tax_rate) || 5.0;
    const taxableReversed = Math.round((itemRefundAmount / (1 + rate / 100)) * 100) / 100;
    const taxReversed = Math.round((itemRefundAmount - taxableReversed) * 100) / 100;

    totalRefund += itemRefundAmount;
    totalTaxReversed += taxReversed;

    refundedItems.push({
      item_id: txnItem.id,
      product_id: txnItem.product_id,
      product_name: product?.name,
      quantity: refundQty,
      rate,
      amount: itemRefundAmount,
      taxable_reversed: taxableReversed,
      tax_reversed: taxReversed
    });
  }

  let creditNoteCreated = null;
  const refundTransaction = db.transaction(() => {
    // 1. Restore stock
    for (const item of refundedItems) {
      db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(item.quantity, item.product_id);
    }

    // 2. Insert refund record
    const result = db.prepare(`
      INSERT INTO refunds (original_txn_id, cashier_id, reason, refund_amount, refund_method, items_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(txn_id, req.cashier.id, reason || null, totalRefund, method, JSON.stringify(refundedItems));

    // 3. If refund method is store credit, issue a credit note automatically
    if (method === 'store_credit') {
      const ym = new Date().toISOString().slice(0, 7).replace('-', '');
      const countRow = db.prepare("SELECT COUNT(*) as count FROM credit_notes WHERE note_number LIKE ?").get(`CN-${ym}-%`);
      const seq = String((countRow ? countRow.count : 0) + 1).padStart(4, '0');
      const noteNum = `CN-${ym}-${seq}`;

      // 90-day expiry
      const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();

      const phone = customer_phone || (txn.customer_id ? db.prepare('SELECT phone FROM customers WHERE id = ?').get(txn.customer_id)?.phone : 'Walk-in');
      const name = customer_name || (txn.customer_id ? db.prepare('SELECT name FROM customers WHERE id = ?').get(txn.customer_id)?.name : 'Customer');

      const cnResult = db.prepare(`
        INSERT INTO credit_notes (
          note_number, customer_phone, customer_name, original_bill_number,
          amount, balance_remaining, reason, status, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `).run(noteNum, phone, name, txn.bill_number, totalRefund, totalRefund, reason || 'Garment Refund Credit', expiresAt);

      creditNoteCreated = db.prepare('SELECT * FROM credit_notes WHERE id = ?').get(cnResult.lastInsertRowid);
    }

    return result.lastInsertRowid;
  });

  const refundId = refundTransaction();
  const refund = db.prepare('SELECT * FROM refunds WHERE id = ?').get(refundId);

  logAudit({
    cashier_id: req.cashier.id,
    cashier_name: req.cashier.name,
    action: 'process_refund',
    entity_type: 'refund',
    entity_id: refundId,
    details: { totalRefund, totalTaxReversed, method, original_bill: txn.bill_number }
  });

  res.status(201).json({
    ...refund,
    items: refundedItems,
    original_bill: txn.bill_number,
    total_tax_reversed: totalTaxReversed,
    credit_note: creditNoteCreated
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
