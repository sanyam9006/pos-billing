const express = require('express');
const router = express.Router();
const db = require('../db');
const { calculateItemTaxAndTotal } = require('../utils/tax');

// ── Helper: generate bill number (race-condition safe) ──
// Uses a dedicated sequence table inside a SQLite transaction
const generateBillNumber = db.transaction(() => {
  const today = new Date().toISOString().slice(0, 10);
  const dateStr = today.replace(/-/g, '');

  // Upsert: insert if not exists, then increment
  db.prepare(
    "INSERT INTO bill_sequence (date, seq) VALUES (?, 0) ON CONFLICT(date) DO NOTHING"
  ).run(today);

  db.prepare(
    "UPDATE bill_sequence SET seq = seq + 1 WHERE date = ?"
  ).run(today);

  const row = db.prepare("SELECT seq FROM bill_sequence WHERE date = ?").get(today);
  return `SM-${dateStr}-${String(row.seq).padStart(4, '0')}`;
});

// ── Helper: recalculate transaction totals ──
function recalcTotals(txnId) {
  const isInclusive = process.env.TAX_MODE === 'inclusive';
  const items = db.prepare('SELECT * FROM transaction_items WHERE txn_id = ?').all(txnId);
  let subtotal = 0;
  let totalTax = 0;
  items.forEach(item => {
    if (isInclusive) {
      subtotal += item.line_total;
    } else {
      subtotal += item.unit_price * item.quantity;
    }
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

  const grandTotal = isInclusive
    ? Math.max(0, Math.round((subtotal - totalDiscount) * 100) / 100)
    : Math.max(0, Math.round((subtotal - totalDiscount + totalTax) * 100) / 100);

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

// ── Helper: fetch transaction items with product info ──
function getItemsWithProducts(txnId) {
  return db.prepare(`
    SELECT ti.*, p.name as product_name, p.barcode, p.sku, p.category, p.hsn_code, p.tax_rate, p.stock_qty
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    WHERE ti.txn_id = ?
    ORDER BY ti.created_at
  `).all(txnId);
}

// ── POST /api/transactions — Create new bill ──
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

// ── GET /api/transactions/active/:cashierId — Restore active transaction after refresh ──
router.get('/active/:cashierId', (req, res) => {
  const txn = db.prepare(
    "SELECT * FROM transactions WHERE cashier_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
  ).get(req.params.cashierId);

  if (!txn) return res.json(null);

  const items = getItemsWithProducts(txn.id);
  const customer = txn.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(txn.customer_id)
    : null;
  const coupon = txn.coupon_id
    ? db.prepare('SELECT * FROM coupons WHERE id = ?').get(txn.coupon_id)
    : null;

  res.json({ ...txn, items, customer, coupon });
});

// ── GET /api/transactions/bill/:billNumber — Lookup by bill number (for refunds) ──
router.get('/bill/:billNumber', (req, res) => {
  const txn = db.prepare('SELECT * FROM transactions WHERE bill_number = ?').get(req.params.billNumber);
  if (!txn) return res.status(404).json({ error: 'Bill not found' });

  const items = getItemsWithProducts(txn.id);
  const customer = txn.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(txn.customer_id)
    : null;

  res.json({ ...txn, items, customer });
});

// ── GET /api/transactions/:id — Get transaction with items ──
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

// ── POST /api/transactions/:id/items — Add item to bill (with stock deduction) ──
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

  const qtyToDeduct = quantity; // how much stock to remove

  // Check stock availability
  if (product.stock_qty < qtyToDeduct) {
    return res.status(400).json({
      error: `Insufficient stock for ${product.name}. Available: ${product.stock_qty}`
    });
  }

  if (existingItem) {
    const newQty = existingItem.quantity + quantity;
    const calc = calculateItemTaxAndTotal(product, newQty);

    db.prepare(
      'UPDATE transaction_items SET quantity = ?, tax = ?, line_total = ? WHERE id = ?'
    ).run(newQty, calc.tax, calc.lineTotal, existingItem.id);
  } else {
    const calc = calculateItemTaxAndTotal(product, quantity);

    db.prepare(
      'INSERT INTO transaction_items (txn_id, product_id, quantity, unit_price, tax, line_total) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(txnId, product_id, quantity, product.selling_price, calc.tax, calc.lineTotal);
  }

  // Deduct stock
  db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?').run(qtyToDeduct, product_id);

  const updatedTxn = recalcTotals(txnId);
  const items = getItemsWithProducts(txnId);

  // Low-stock warning
  const updatedProduct = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(product_id);
  const warnings = [];
  if (updatedProduct.stock_qty <= 0) {
    warnings.push(`⚠️ ${product.name} is now OUT OF STOCK`);
  } else if (updatedProduct.stock_qty <= 10) {
    warnings.push(`⚠️ ${product.name} — low stock (${updatedProduct.stock_qty} remaining)`);
  }

  res.json({ ...updatedTxn, items, warnings });
});

// ── PUT /api/transactions/:id/items/:itemId — Update item quantity (with stock adjustment) ──
router.put('/:id/items/:itemId', (req, res) => {
  const { id: txnId, itemId } = req.params;
  const { quantity } = req.body;

  const item = db.prepare('SELECT * FROM transaction_items WHERE id = ? AND txn_id = ?').get(itemId, txnId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const oldQty = item.quantity;
  const stockDelta = oldQty - (quantity > 0 ? quantity : 0); // positive = restore stock, negative = deduct more

  // If increasing qty, check stock
  if (stockDelta < 0) {
    const product = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(item.product_id);
    if (product.stock_qty < Math.abs(stockDelta)) {
      return res.status(400).json({
        error: `Insufficient stock. Available: ${product.stock_qty}`
      });
    }
  }

  if (quantity <= 0) {
    // Remove item entirely — restore all stock
    db.prepare('DELETE FROM transaction_items WHERE id = ?').run(itemId);
    db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(oldQty, item.product_id);
  } else {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
    const calc = calculateItemTaxAndTotal(product, quantity);

    db.prepare(
      'UPDATE transaction_items SET quantity = ?, tax = ?, line_total = ? WHERE id = ?'
    ).run(quantity, calc.tax, calc.lineTotal, itemId);

    // Adjust stock by delta
    db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(stockDelta, item.product_id);
  }

  const updatedTxn = recalcTotals(txnId);
  const items = getItemsWithProducts(txnId);
  res.json({ ...updatedTxn, items });
});

// ── DELETE /api/transactions/:id/items/:itemId — Void item (restore stock) ──
router.delete('/:id/items/:itemId', (req, res) => {
  const { id: txnId, itemId } = req.params;

  const item = db.prepare('SELECT * FROM transaction_items WHERE id = ? AND txn_id = ?').get(itemId, txnId);
  if (item) {
    // Restore stock before deleting
    db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(item.quantity, item.product_id);
  }

  db.prepare('DELETE FROM transaction_items WHERE id = ? AND txn_id = ?').run(itemId, txnId);
  const updatedTxn = recalcTotals(txnId);
  const items = getItemsWithProducts(txnId);
  res.json({ ...updatedTxn, items });
});

// ── PUT /api/transactions/:id/hold — Hold bill ──
router.put('/:id/hold', (req, res) => {
  db.prepare("UPDATE transactions SET status = 'held' WHERE id = ? AND status = 'active'").run(req.params.id);
  res.json({ success: true });
});

// ── GET /api/transactions/status/held — List held bills ──
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

// ── PUT /api/transactions/:id/recall — Recall held bill ──
router.put('/:id/recall', (req, res) => {
  db.prepare("UPDATE transactions SET status = 'active' WHERE id = ? AND status = 'held'").run(req.params.id);
  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  const items = getItemsWithProducts(req.params.id);
  res.json({ ...txn, items });
});

// ── POST /api/transactions/:id/coupon — Apply coupon ──
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
  const items = getItemsWithProducts(txnId);
  res.json({ ...updatedTxn, items, coupon_applied: coupon });
});

// ── DELETE /api/transactions/:id/coupon — Remove coupon ──
router.delete('/:id/coupon', (req, res) => {
  db.prepare('UPDATE transactions SET coupon_id = NULL, total_discount = 0 WHERE id = ?').run(req.params.id);
  const updatedTxn = recalcTotals(req.params.id);
  res.json(updatedTxn);
});

// ── POST /api/transactions/:id/customer — Link customer ──
router.post('/:id/customer', (req, res) => {
  const { customer_id } = req.body;
  db.prepare('UPDATE transactions SET customer_id = ? WHERE id = ?').run(customer_id, req.params.id);
  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
  res.json({ ...txn, customer });
});

// ── DELETE /api/transactions/:id — Clear/void entire bill (restore all stock) ──
router.delete('/:id', (req, res) => {
  const txnId = req.params.id;

  // Restore stock for all items in this transaction
  const items = db.prepare('SELECT product_id, quantity FROM transaction_items WHERE txn_id = ?').all(txnId);
  const restoreStock = db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?');
  for (const item of items) {
    restoreStock.run(item.quantity, item.product_id);
  }

  db.prepare('DELETE FROM transaction_items WHERE txn_id = ?').run(txnId);
  db.prepare("UPDATE transactions SET status = 'voided', subtotal = 0, total_discount = 0, tax_amount = 0, grand_total = 0 WHERE id = ?").run(txnId);
  res.json({ success: true });
});

module.exports = router;
