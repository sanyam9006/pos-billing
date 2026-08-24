const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper: generate bill number
function generateBillNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const count = db.prepare("SELECT COUNT(*) as c FROM transactions WHERE date(created_at) = date('now')").get().c + 1;
  return `SM-${date}-${String(count).padStart(4, '0')}`;
}

// Helper: recalculate transaction totals
function recalcTotals(txnId) {
  const items = db.prepare('SELECT * FROM transaction_items WHERE txn_id = ?').all(txnId);
  let subtotal = 0;
  let totalTax = 0;
  items.forEach(item => {
    subtotal += item.unit_price * item.quantity;
    totalTax += item.tax;
  });

  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
  let totalDiscount = txn.total_discount || 0;

  // If there's a coupon, recalculate discount
  if (txn.coupon_id) {
    const coupon = db.prepare('SELECT * FROM coupons WHERE id = ?').get(txn.coupon_id);
    if (coupon) {
      if (coupon.type === 'percent') {
        totalDiscount = Math.min(subtotal * coupon.value / 100, coupon.max_discount || Infinity);
      } else {
        totalDiscount = coupon.value;
      }
    }
  }

  const grandTotal = Math.max(0, Math.round((subtotal - totalDiscount + totalTax) * 100) / 100);

  db.prepare(
    'UPDATE transactions SET subtotal = ?, total_discount = ?, tax_amount = ?, grand_total = ? WHERE id = ?'
  ).run(
    Math.round(subtotal * 100) / 100,
    Math.round(totalDiscount * 100) / 100,
    Math.round(totalTax * 100) / 100,
    grandTotal,
    txnId
  );

  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
}

// POST /api/transactions — Create new bill
router.post('/', (req, res) => {
  const { cashier_id, counter_number = 1 } = req.body;
  if (!cashier_id) return res.status(400).json({ error: 'Cashier ID required' });

  const billNumber = generateBillNumber();
  const result = db.prepare(
    'INSERT INTO transactions (bill_number, cashier_id, counter_number) VALUES (?, ?, ?)'
  ).run(billNumber, cashier_id, counter_number);

  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
  res.json(txn);
});

// GET /api/transactions/:id — Get transaction with items
router.get('/:id', (req, res) => {
  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  const items = db.prepare(`
    SELECT ti.*, p.name as product_name, p.barcode, p.sku, p.category, p.hsn_code
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    WHERE ti.txn_id = ?
    ORDER BY ti.created_at
  `).all(req.params.id);

  const customer = txn.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(txn.customer_id)
    : null;

  res.json({ ...txn, items, customer });
});

// POST /api/transactions/:id/items — Add item to bill
router.post('/:id/items', (req, res) => {
  const txnId = req.params.id;
  const { product_id, quantity = 1 } = req.body;

  const txn = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'active'").get(txnId);
  if (!txn) return res.status(404).json({ error: 'Active transaction not found' });

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  // Check if item already in cart — if so, increase qty
  const existingItem = db.prepare(
    'SELECT * FROM transaction_items WHERE txn_id = ? AND product_id = ?'
  ).get(txnId, product_id);

  if (existingItem) {
    const newQty = existingItem.quantity + quantity;
    const tax = Math.round(product.selling_price * newQty * product.tax_rate / 100 * 100) / 100;
    const lineTotal = Math.round((product.selling_price * newQty + tax) * 100) / 100;

    db.prepare(
      'UPDATE transaction_items SET quantity = ?, tax = ?, line_total = ? WHERE id = ?'
    ).run(newQty, tax, lineTotal, existingItem.id);
  } else {
    const tax = Math.round(product.selling_price * quantity * product.tax_rate / 100 * 100) / 100;
    const lineTotal = Math.round((product.selling_price * quantity + tax) * 100) / 100;

    db.prepare(
      'INSERT INTO transaction_items (txn_id, product_id, quantity, unit_price, tax, line_total) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(txnId, product_id, quantity, product.selling_price, tax, lineTotal);
  }

  const updatedTxn = recalcTotals(txnId);
  const items = db.prepare(`
    SELECT ti.*, p.name as product_name, p.barcode, p.sku, p.category, p.hsn_code, p.tax_rate
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    WHERE ti.txn_id = ?
    ORDER BY ti.created_at
  `).all(txnId);

  res.json({ ...updatedTxn, items });
});

// PUT /api/transactions/:id/items/:itemId — Update item quantity
router.put('/:id/items/:itemId', (req, res) => {
  const { id: txnId, itemId } = req.params;
  const { quantity } = req.body;

  const item = db.prepare('SELECT * FROM transaction_items WHERE id = ? AND txn_id = ?').get(itemId, txnId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  if (quantity <= 0) {
    db.prepare('DELETE FROM transaction_items WHERE id = ?').run(itemId);
  } else {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
    const tax = Math.round(product.selling_price * quantity * product.tax_rate / 100 * 100) / 100;
    const lineTotal = Math.round((product.selling_price * quantity + tax) * 100) / 100;

    db.prepare(
      'UPDATE transaction_items SET quantity = ?, tax = ?, line_total = ? WHERE id = ?'
    ).run(quantity, tax, lineTotal, itemId);
  }

  const updatedTxn = recalcTotals(txnId);
  const items = db.prepare(`
    SELECT ti.*, p.name as product_name, p.barcode, p.sku, p.category, p.hsn_code, p.tax_rate
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    WHERE ti.txn_id = ?
    ORDER BY ti.created_at
  `).all(txnId);

  res.json({ ...updatedTxn, items });
});

// DELETE /api/transactions/:id/items/:itemId — Void item
router.delete('/:id/items/:itemId', (req, res) => {
  const { id: txnId, itemId } = req.params;

  db.prepare('DELETE FROM transaction_items WHERE id = ? AND txn_id = ?').run(itemId, txnId);
  const updatedTxn = recalcTotals(txnId);
  const items = db.prepare(`
    SELECT ti.*, p.name as product_name, p.barcode, p.sku, p.category, p.hsn_code, p.tax_rate
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    WHERE ti.txn_id = ?
    ORDER BY ti.created_at
  `).all(txnId);

  res.json({ ...updatedTxn, items });
});

// PUT /api/transactions/:id/hold — Hold bill
router.put('/:id/hold', (req, res) => {
  db.prepare("UPDATE transactions SET status = 'held' WHERE id = ? AND status = 'active'").run(req.params.id);
  res.json({ success: true });
});

// GET /api/transactions/held — List held bills
router.get('/status/held', (req, res) => {
  const held = db.prepare(`
    SELECT t.*, c.name as cashier_name,
      (SELECT COUNT(*) FROM transaction_items WHERE txn_id = t.id) as item_count
    FROM transactions t
    JOIN cashiers c ON t.cashier_id = c.id
    WHERE t.status = 'held'
    ORDER BY t.created_at DESC
  `).all();
  res.json(held);
});

// PUT /api/transactions/:id/recall — Recall held bill
router.put('/:id/recall', (req, res) => {
  db.prepare("UPDATE transactions SET status = 'active' WHERE id = ? AND status = 'held'").run(req.params.id);
  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  const items = db.prepare(`
    SELECT ti.*, p.name as product_name, p.barcode, p.sku, p.category, p.hsn_code, p.tax_rate
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    WHERE ti.txn_id = ?
    ORDER BY ti.created_at
  `).all(req.params.id);

  res.json({ ...txn, items });
});

// POST /api/transactions/:id/coupon — Apply coupon
router.post('/:id/coupon', (req, res) => {
  const { code } = req.body;
  const txnId = req.params.id;

  const coupon = db.prepare(
    "SELECT * FROM coupons WHERE code = ? AND is_active = 1 AND valid_from <= date('now') AND valid_to >= date('now')"
  ).get(code);

  if (!coupon) return res.status(400).json({ error: 'Invalid or expired coupon code' });

  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
  if (txn.subtotal < coupon.min_bill) {
    return res.status(400).json({ error: `Minimum bill amount ₹${coupon.min_bill} required for this coupon` });
  }

  let discount = 0;
  if (coupon.type === 'percent') {
    discount = Math.min(txn.subtotal * coupon.value / 100, coupon.max_discount || Infinity);
  } else {
    discount = coupon.value;
  }

  db.prepare('UPDATE transactions SET coupon_id = ?, total_discount = ? WHERE id = ?')
    .run(coupon.id, Math.round(discount * 100) / 100, txnId);

  const updatedTxn = recalcTotals(txnId);
  const items = db.prepare(`
    SELECT ti.*, p.name as product_name, p.barcode, p.sku, p.category, p.hsn_code, p.tax_rate
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    WHERE ti.txn_id = ?
    ORDER BY ti.created_at
  `).all(txnId);

  res.json({ ...updatedTxn, items, coupon_applied: coupon });
});

// DELETE /api/transactions/:id/coupon — Remove coupon
router.delete('/:id/coupon', (req, res) => {
  db.prepare('UPDATE transactions SET coupon_id = NULL, total_discount = 0 WHERE id = ?').run(req.params.id);
  const updatedTxn = recalcTotals(req.params.id);
  res.json(updatedTxn);
});

// POST /api/transactions/:id/customer — Link customer
router.post('/:id/customer', (req, res) => {
  const { customer_id } = req.body;
  db.prepare('UPDATE transactions SET customer_id = ? WHERE id = ?').run(customer_id, req.params.id);
  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
  res.json({ ...txn, customer });
});

// DELETE /api/transactions/:id — Clear/void entire bill
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM transaction_items WHERE txn_id = ?').run(req.params.id);
  db.prepare("UPDATE transactions SET status = 'voided', subtotal = 0, total_discount = 0, tax_amount = 0, grand_total = 0 WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
