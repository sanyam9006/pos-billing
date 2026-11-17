const express = require('express');
const router = express.Router();
const db = require('../db');
const { getSetting } = require('../utils/settings');
const { verifyPin } = require('../utils/auth');
const { logAudit } = require('../utils/audit');

// ── Helper: generate bill number (atomic sequence table + configurable prefix) ──
const generateBillNumber = db.transaction(() => {
  const today = new Date().toISOString().slice(0, 10);
  const dateStr = today.replace(/-/g, '');
  const prefix = getSetting('BILL_PREFIX', 'AB-');

  db.prepare(
    "INSERT INTO bill_sequence (date, seq) VALUES (?, 0) ON CONFLICT(date) DO NOTHING"
  ).run(today);

  db.prepare(
    "UPDATE bill_sequence SET seq = seq + 1 WHERE date = ?"
  ).run(today);

  const row = db.prepare("SELECT seq FROM bill_sequence WHERE date = ?").get(today);
  return `${prefix}${dateStr}-${String(row.seq).padStart(4, '0')}`;
});

// ── Helper: sanitize transaction object to ensure zero tax fields in API responses ──
function sanitizeTxn(txn) {
  if (!txn) return txn;
  const copy = { ...txn };
  delete copy.tax_amount;
  delete copy.is_interstate;
  return copy;
}

// ── Helper: recalculate transaction totals strictly at MRP / selling price ──
// Customer pays ONLY selling_price * qty - discounts.
function recalcTotals(txnId) {
  const items = db.prepare('SELECT line_total FROM transaction_items WHERE txn_id = ?').all(txnId);
  let subtotal = 0;

  for (const item of items) {
    subtotal += Number(item.line_total || 0);
  }

  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
  let totalDiscount = Number(txn.total_discount || 0);

  // If there's an active coupon, recalculate coupon discount
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

  const subtotalRounded = Math.round(subtotal * 100) / 100;
  const discountRounded = Math.round(totalDiscount * 100) / 100;
  const grandTotal = Math.max(0, Math.round((subtotalRounded - discountRounded) * 100) / 100);

  db.prepare(`
    UPDATE transactions
    SET subtotal = ?, total_discount = ?, tax_amount = 0, grand_total = ?
    WHERE id = ?
  `).run(subtotalRounded, discountRounded, grandTotal, txnId);

  return sanitizeTxn(db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId));
}

// ── Helper: fetch transaction items with product info (no tax/HSN fields) ──
function getItemsWithProducts(txnId) {
  return db.prepare(`
    SELECT ti.id, ti.txn_id, ti.product_id, ti.quantity, ti.unit_price, ti.discount,
           ti.line_total, ti.is_return, ti.discount_reason, ti.created_at,
           p.name as product_name, p.barcode, p.sku, p.category,
           p.variant_size, p.variant_color, p.stock_qty
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    WHERE ti.txn_id = ?
    ORDER BY ti.created_at
  `).all(txnId);
}

// ── Helper: verify supervisor PIN for large discounts ──
function checkDiscountApproval(amount, supervisorPin, cashier) {
  const threshold = Number(getSetting('DISCOUNT_PIN_THRESHOLD', 500));
  if (amount <= threshold) return { approved: true };

  if (cashier && cashier.role === 'supervisor') {
    return { approved: true, approved_by: cashier.id };
  }

  if (!supervisorPin) {
    return {
      approved: false,
      error: `Discounts exceeding ₹${threshold} require Supervisor / Owner PIN approval.`
    };
  }

  const supervisors = db.prepare("SELECT id, pin FROM cashiers WHERE role = 'supervisor' AND is_active = 1").all();
  const validSup = supervisors.find(s => verifyPin(supervisorPin, s.pin));
  if (!validSup) {
    return { approved: false, error: 'Invalid Supervisor PIN. Discount not approved.' };
  }

  return { approved: true, approved_by: validSup.id };
}

// ── POST /api/transactions — Create new bill ──
router.post('/', (req, res) => {
  const { cashier_id, counter_number = 1 } = req.body;
  const activeCashierId = cashier_id || req.cashier?.id;
  if (!activeCashierId) return res.status(400).json({ error: 'Cashier ID required' });

  const billNumber = generateBillNumber();
  const result = db.prepare(
    'INSERT INTO transactions (bill_number, cashier_id, counter_number) VALUES (?, ?, ?)'
  ).run(billNumber, activeCashierId, counter_number);

  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
  res.json(sanitizeTxn(txn));
});

// ── GET /api/transactions/active/:cashierId — Restore active transaction after refresh ──
router.get('/active/:cashierId', (req, res) => {
  const txn = db.prepare(
    "SELECT * FROM transactions WHERE cashier_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
  ).get(req.params.cashierId);

  if (!txn) return res.json(null);

  const items = getItemsWithProducts(txn.id);
  const customer = txn.customer_id
    ? db.prepare('SELECT id, name, phone, email, loyalty_points, membership_tier FROM customers WHERE id = ?').get(txn.customer_id)
    : null;
  const coupon = txn.coupon_id
    ? db.prepare('SELECT * FROM coupons WHERE id = ?').get(txn.coupon_id)
    : null;

  res.json({ ...sanitizeTxn(txn), items, customer, coupon });
});

// ── GET /api/transactions/bill/:billNumber — Lookup by bill number ──
router.get('/bill/:billNumber', (req, res) => {
  const txn = db.prepare('SELECT * FROM transactions WHERE bill_number = ?').get(req.params.billNumber);
  if (!txn) return res.status(404).json({ error: 'Bill not found' });

  const items = getItemsWithProducts(txn.id);
  const customer = txn.customer_id
    ? db.prepare('SELECT id, name, phone, email, loyalty_points, membership_tier FROM customers WHERE id = ?').get(txn.customer_id)
    : null;

  res.json({ ...sanitizeTxn(txn), items, customer });
});

// ── GET /api/transactions/:id — Get transaction with items ──
router.get('/:id', (req, res) => {
  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  const items = getItemsWithProducts(req.params.id);
  const customer = txn.customer_id
    ? db.prepare('SELECT id, name, phone, email, loyalty_points, membership_tier FROM customers WHERE id = ?').get(txn.customer_id)
    : null;

  res.json({ ...sanitizeTxn(txn), items, customer });
});

// ── POST /api/transactions/:id/items — Add item to bill ──
router.post('/:id/items', (req, res) => {
  const txnId = req.params.id;
  const { product_id, quantity = 1, discount = 0, discount_reason, supervisor_pin } = req.body;

  const txn = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'active'").get(txnId);
  if (!txn) return res.status(404).json({ error: 'Active transaction not found' });

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const requestedQty = Math.max(1, parseInt(quantity, 10) || 1);
  const itemDiscount = Math.max(0, Number(discount) || 0);

  // Validate discount approval if large discount given
  if (itemDiscount > 0) {
    const approval = checkDiscountApproval(itemDiscount, supervisor_pin, req.cashier);
    if (!approval.approved) {
      return res.status(403).json({ error: approval.error });
    }
  }

  // Stock check
  const existingItem = db.prepare(
    'SELECT * FROM transaction_items WHERE txn_id = ? AND product_id = ? AND is_return = 0'
  ).get(txnId, product_id);

  if (product.stock_qty < requestedQty) {
    return res.status(400).json({
      error: `Insufficient stock for ${product.name}. Available: ${product.stock_qty}`
    });
  }

  const addItemTxn = db.transaction(() => {
    if (existingItem) {
      const newQty = existingItem.quantity + requestedQty;
      const totalDisc = (Number(existingItem.discount) || 0) + itemDiscount;
      const lineTotalPaise = Math.max(0, Math.round((product.selling_price * newQty - totalDisc) * 100));
      const newLineTotal = lineTotalPaise / 100;

      db.prepare(`
        UPDATE transaction_items
        SET quantity = ?, discount = ?, tax = 0, tax_included = 0, tax_rate = 0, line_total = ?
        WHERE id = ?
      `).run(newQty, totalDisc, newLineTotal, existingItem.id);
    } else {
      const lineTotalPaise = Math.max(0, Math.round((product.selling_price * requestedQty - itemDiscount) * 100));
      const lineTotal = lineTotalPaise / 100;

      db.prepare(`
        INSERT INTO transaction_items (
          txn_id, product_id, quantity, unit_price, discount,
          tax, tax_included, tax_rate, hsn_code, line_total, is_return, discount_reason
        ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, NULL, ?, 0, ?)
      `).run(
        txnId, product_id, requestedQty, product.selling_price, itemDiscount,
        lineTotal, discount_reason || null
      );
    }

    // Deduct stock
    db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?').run(requestedQty, product_id);
  });

  addItemTxn();

  const updatedTxn = recalcTotals(txnId);
  const items = getItemsWithProducts(txnId);

  const updatedProduct = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(product_id);
  const warnings = [];
  if (updatedProduct.stock_qty <= 0) {
    warnings.push(`⚠️ ${product.name} is now OUT OF STOCK`);
  } else if (updatedProduct.stock_qty <= 5) {
    warnings.push(`⚠️ ${product.name} — low stock (${updatedProduct.stock_qty} remaining)`);
  }

  res.json({ ...updatedTxn, items, warnings });
});

// ── PUT /api/transactions/:id/items/:itemId — Update item quantity / discount ──
router.put('/:id/items/:itemId', (req, res) => {
  const { id: txnId, itemId } = req.params;
  const { quantity, discount = 0, discount_reason, supervisor_pin } = req.body;

  const txn = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'active'").get(txnId);
  if (!txn) return res.status(404).json({ error: 'Active transaction not found' });

  const item = db.prepare('SELECT * FROM transaction_items WHERE id = ? AND txn_id = ?').get(itemId, txnId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const newQty = parseInt(quantity, 10);
  const newDiscount = Math.max(0, Number(discount) || 0);

  if (newDiscount > 0) {
    const approval = checkDiscountApproval(newDiscount, supervisor_pin, req.cashier);
    if (!approval.approved) {
      return res.status(403).json({ error: approval.error });
    }
  }

  const oldQty = item.quantity;
  const stockDelta = oldQty - (newQty > 0 ? newQty : 0);

  // If increasing qty, verify stock
  if (stockDelta < 0) {
    const product = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(item.product_id);
    if (product.stock_qty < Math.abs(stockDelta)) {
      return res.status(400).json({ error: `Insufficient stock. Available: ${product.stock_qty}` });
    }
  }

  const updateItemTxn = db.transaction(() => {
    if (newQty <= 0) {
      // Remove item — restore stock
      db.prepare('DELETE FROM transaction_items WHERE id = ?').run(itemId);
      if (!item.is_return) {
        db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(oldQty, item.product_id);
      }
    } else {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
      const lineTotalPaise = Math.max(0, Math.round((product.selling_price * newQty - newDiscount) * 100));
      const newLineTotal = lineTotalPaise / 100;

      db.prepare(`
        UPDATE transaction_items
        SET quantity = ?, discount = ?, tax = 0, tax_included = 0, tax_rate = 0, line_total = ?, discount_reason = ?
        WHERE id = ?
      `).run(newQty, newDiscount, newLineTotal, discount_reason || item.discount_reason, itemId);

      if (!item.is_return) {
        db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(stockDelta, item.product_id);
      }
    }
  });

  updateItemTxn();

  const updatedTxn = recalcTotals(txnId);
  const items = getItemsWithProducts(txnId);
  res.json({ ...updatedTxn, items });
});

// ── DELETE /api/transactions/:id/items/:itemId — Void item (restore stock) ──
router.delete('/:id/items/:itemId', (req, res) => {
  const { id: txnId, itemId } = req.params;

  const item = db.prepare('SELECT * FROM transaction_items WHERE id = ? AND txn_id = ?').get(itemId, txnId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const deleteTxn = db.transaction(() => {
    if (!item.is_return) {
      db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(item.quantity, item.product_id);
    }
    db.prepare('DELETE FROM transaction_items WHERE id = ?').run(itemId);
  });

  deleteTxn();

  logAudit({
    cashier_id: req.cashier?.id,
    cashier_name: req.cashier?.name,
    action: 'void_item',
    entity_type: 'transaction_item',
    entity_id: itemId,
    details: { txn_id: txnId, product_id: item.product_id, qty: item.quantity }
  });

  const updatedTxn = recalcTotals(txnId);
  const items = getItemsWithProducts(txnId);
  res.json({ ...updatedTxn, items });
});

// ── POST /api/transactions/:id/discount — Apply bill-level discount ──
router.post('/:id/discount', (req, res) => {
  const txnId = req.params.id;
  const { amount, reason, supervisor_pin } = req.body;

  const txn = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'active'").get(txnId);
  if (!txn) return res.status(404).json({ error: 'Active transaction not found' });

  const discountAmount = Math.max(0, Number(amount) || 0);
  const approval = checkDiscountApproval(discountAmount, supervisor_pin, req.cashier);
  if (!approval.approved) {
    return res.status(403).json({ error: approval.error });
  }

  db.prepare(`
    UPDATE transactions
    SET total_discount = ?, discount_reason = ?, discount_approved_by = ?
    WHERE id = ?
  `).run(discountAmount, reason || 'Bill Discount', approval.approved_by || null, txnId);

  logAudit({
    cashier_id: req.cashier?.id,
    cashier_name: req.cashier?.name,
    action: 'discount_bill',
    entity_type: 'transaction',
    entity_id: txnId,
    details: { amount: discountAmount, reason }
  });

  const updated = recalcTotals(txnId);
  const items = getItemsWithProducts(txnId);
  res.json({ ...updated, items });
});

// ── POST /api/transactions/exchange — Exchange garments in one atomic transaction ──
router.post('/exchange', (req, res) => {
  const { cashier_id, counter_number = 1, return_items = [], new_items = [], original_bill_number, reason } = req.body;
  const activeCashierId = cashier_id || req.cashier?.id;

  if (!activeCashierId) return res.status(400).json({ error: 'Cashier ID required' });
  if (!Array.isArray(return_items) || return_items.length === 0) {
    return res.status(400).json({ error: 'Exchange requires at least one return item' });
  }

  const billNumber = generateBillNumber();
  let createdTxnId;

  const exchangeTxn = db.transaction(() => {
    // 1. Create transaction with type 'exchange'
    const result = db.prepare(`
      INSERT INTO transactions (bill_number, cashier_id, counter_number, transaction_type, exchange_for_bill)
      VALUES (?, ?, ?, 'exchange', ?)
    `).run(billNumber, activeCashierId, counter_number, original_bill_number || null);

    createdTxnId = result.lastInsertRowid;

    // 2. Process return items (is_return = 1, line_total is negative credit)
    for (const ret of return_items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(ret.product_id);
      if (!product) throw new Error(`Return product ID ${ret.product_id} not found`);

      const qty = Math.max(1, parseInt(ret.quantity, 10) || 1);
      const unitPrice = Number(ret.price || product.selling_price);
      const returnCredit = Math.round(unitPrice * qty * 100) / 100;

      db.prepare(`
        INSERT INTO transaction_items (
          txn_id, product_id, quantity, unit_price, discount,
          tax, tax_included, tax_rate, hsn_code, line_total, is_return, discount_reason
        ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, NULL, ?, 1, ?)
      `).run(
        createdTxnId, ret.product_id, qty, unitPrice,
        -returnCredit, reason || 'Customer Exchange'
      );

      // Return garment to shelf stock
      db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(qty, ret.product_id);
    }

    // 3. Process new replacement items
    for (const nItem of new_items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(nItem.product_id);
      if (!product) throw new Error(`Replacement product ID ${nItem.product_id} not found`);

      const qty = Math.max(1, parseInt(nItem.quantity, 10) || 1);
      if (product.stock_qty < qty) {
        throw new Error(`Insufficient stock for replacement ${product.name}`);
      }

      const unitPrice = Number(product.selling_price);
      const lineTotal = Math.round(unitPrice * qty * 100) / 100;

      db.prepare(`
        INSERT INTO transaction_items (
          txn_id, product_id, quantity, unit_price, discount,
          tax, tax_included, tax_rate, hsn_code, line_total, is_return
        ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, NULL, ?, 0)
      `).run(
        createdTxnId, nItem.product_id, qty, unitPrice,
        lineTotal
      );

      // Deduct stock for replacement
      db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?').run(qty, nItem.product_id);
    }
  });

  try {
    exchangeTxn();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  logAudit({
    cashier_id: req.cashier?.id,
    cashier_name: req.cashier?.name,
    action: 'exchange_order',
    entity_type: 'transaction',
    entity_id: createdTxnId,
    details: { original_bill: original_bill_number, return_items, new_items }
  });

  const updatedTxn = recalcTotals(createdTxnId);
  const items = getItemsWithProducts(createdTxnId);
  res.status(201).json({ ...updatedTxn, items });
});

// ── POST /api/transactions/:id/hold — Hold bill ──
router.put('/:id/hold', (req, res) => {
  db.prepare("UPDATE transactions SET status = 'held' WHERE id = ? AND status = 'active'").run(req.params.id);
  res.json({ success: true });
});

// ── GET /api/transactions/status/held — List held bills ──
router.get('/status/held', (req, res) => {
  const held = db.prepare(`
    SELECT t.id, t.bill_number, t.cashier_id, t.customer_id, t.subtotal, t.total_discount,
           t.grand_total, t.status, t.counter_number, t.created_at,
           c.name as cashier_name,
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
  res.json({ ...sanitizeTxn(txn), items });
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
  const customer = db.prepare('SELECT id, name, phone, email, loyalty_points, membership_tier FROM customers WHERE id = ?').get(customer_id);
  res.json({ ...sanitizeTxn(txn), customer });
});

// ── DELETE /api/transactions/:id — Clear/void entire bill (restore all stock) ──
router.delete('/:id', (req, res) => {
  const txnId = req.params.id;

  const voidTxn = db.transaction(() => {
    const items = db.prepare('SELECT product_id, quantity, is_return FROM transaction_items WHERE txn_id = ?').all(txnId);
    const restoreStock = db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?');
    for (const item of items) {
      if (!item.is_return) {
        restoreStock.run(item.quantity, item.product_id);
      }
    }

    db.prepare('DELETE FROM transaction_items WHERE txn_id = ?').run(txnId);
    db.prepare("UPDATE transactions SET status = 'voided', subtotal = 0, total_discount = 0, tax_amount = 0, grand_total = 0 WHERE id = ?").run(txnId);
  });

  voidTxn();

  logAudit({
    cashier_id: req.cashier?.id,
    cashier_name: req.cashier?.name,
    action: 'void_bill',
    entity_type: 'transaction',
    entity_id: txnId,
    details: { txn_id: txnId }
  });

  res.json({ success: true });
});

module.exports = router;
