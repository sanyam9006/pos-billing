const express = require('express');
const router = express.Router();
const db = require('../db');
const { getSetting } = require('../utils/settings');
const { logAudit } = require('../utils/audit');

// ── Helper: sanitize transaction object (strip tax columns) ──
function sanitizeTxn(txn) {
  if (!txn) return txn;
  const copy = { ...txn };
  delete copy.tax_amount;
  delete copy.is_interstate;
  return copy;
}

// ── Helper: process store credit redemption ──
function redeemStoreCredit(noteNumber, amount) {
  if (!noteNumber) return;
  const note = db.prepare('SELECT * FROM credit_notes WHERE note_number = ?').get(noteNumber);
  if (!note) return;

  const newBalance = Math.max(0, Math.round((note.balance_remaining - amount) * 100) / 100);
  const newStatus = newBalance <= 0 ? 'redeemed' : 'active';

  db.prepare('UPDATE credit_notes SET balance_remaining = ?, status = ? WHERE id = ?')
    .run(newBalance, newStatus, note.id);
}

// ── POST /api/payments — Process single payment ──
router.post('/', (req, res) => {
  const { txn_id, method, amount, tendered, reference_number } = req.body;

  const txn = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'active'").get(txn_id);
  if (!txn) return res.status(404).json({ error: 'Active transaction not found' });

  // Calculate total already paid
  const paidSoFar = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE txn_id = ?').get(txn_id).total;
  const remaining = Math.round((txn.grand_total - paidSoFar) * 100) / 100;

  const payAmount = Number(amount);
  if (payAmount > remaining + 0.05) {
    return res.status(400).json({ error: `Amount exceeds remaining balance of ₹${remaining}` });
  }

  let changeAmount = 0;
  if (method === 'cash' && tendered) {
    changeAmount = Math.max(0, Math.round((tendered - payAmount) * 100) / 100);
  }

  const payTxn = db.transaction(() => {
    db.prepare(`
      INSERT INTO payments (txn_id, method, amount, tendered, change_amount, reference_number)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(txn_id, method, payAmount, tendered || payAmount, changeAmount, reference_number || null);

    // If paying via store credit note, deduct the balance
    if (method === 'store_credit' && reference_number) {
      redeemStoreCredit(reference_number, payAmount);
    }

    // Check if fully paid
    const newPaidTotal = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE txn_id = ?').get(txn_id).total;

    if (newPaidTotal >= txn.grand_total - 0.05) {
      db.prepare("UPDATE transactions SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(txn_id);

      // Loyalty points (1 point per ₹100)
      if (txn.customer_id) {
        const pointsEarned = Math.floor(txn.grand_total / 100);
        db.prepare('UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?')
          .run(pointsEarned, txn.customer_id);
      }
    }
  });

  payTxn();

  const updatedTxn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn_id);
  const payments = db.prepare('SELECT * FROM payments WHERE txn_id = ?').all(txn_id);

  if (updatedTxn.status === 'completed') {
    logAudit({
      cashier_id: req.cashier?.id,
      cashier_name: req.cashier?.name,
      action: 'payment_completed',
      entity_type: 'transaction',
      entity_id: txn_id,
      details: { grand_total: updatedTxn.grand_total, method, payments }
    });
  }

  res.json({
    ...sanitizeTxn(updatedTxn),
    payments,
    change: changeAmount,
    fully_paid: updatedTxn.status === 'completed'
  });
});

// ── POST /api/payments/split — Process split payment ──
router.post('/split', (req, res) => {
  const { txn_id, payments: paymentsList } = req.body;

  const txn = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'active'").get(txn_id);
  if (!txn) return res.status(404).json({ error: 'Active transaction not found' });

  const totalPaymentAmount = paymentsList.reduce((sum, p) => sum + Number(p.amount), 0);
  if (Math.abs(totalPaymentAmount - txn.grand_total) > 0.5) {
    return res.status(400).json({ error: 'Split payment total must equal bill amount' });
  }

  const insertPayment = db.prepare(
    'INSERT INTO payments (txn_id, method, amount, tendered, change_amount, reference_number) VALUES (?, ?, ?, ?, ?, ?)'
  );

  let totalChange = 0;
  const splitTxn = db.transaction(() => {
    for (const p of paymentsList) {
      const pAmt = Number(p.amount);
      let changeAmount = 0;
      if (p.method === 'cash' && p.tendered) {
        changeAmount = Math.max(0, Math.round((Number(p.tendered) - pAmt) * 100) / 100);
        totalChange += changeAmount;
      }
      insertPayment.run(
        txn_id, p.method, pAmt,
        p.tendered || pAmt, changeAmount,
        p.reference_number || null
      );

      if (p.method === 'store_credit' && p.reference_number) {
        redeemStoreCredit(p.reference_number, pAmt);
      }
    }

    db.prepare("UPDATE transactions SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(txn_id);

    if (txn.customer_id) {
      const pointsEarned = Math.floor(txn.grand_total / 100);
      db.prepare('UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?')
        .run(pointsEarned, txn.customer_id);
    }
  });

  splitTxn();

  const updatedTxn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn_id);
  const allPayments = db.prepare('SELECT * FROM payments WHERE txn_id = ?').all(txn_id);

  logAudit({
    cashier_id: req.cashier?.id,
    cashier_name: req.cashier?.name,
    action: 'split_payment_completed',
    entity_type: 'transaction',
    entity_id: txn_id,
    details: { grand_total: updatedTxn.grand_total, payments: allPayments }
  });

  res.json({ ...sanitizeTxn(updatedTxn), payments: allPayments, change: totalChange, fully_paid: true });
});

// ── GET /api/payments/receipt/:txnId — Get receipt data ──
router.get('/receipt/:txnId', (req, res) => {
  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.txnId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  const items = db.prepare(`
    SELECT ti.id, ti.txn_id, ti.product_id, ti.quantity, ti.unit_price, ti.discount,
           ti.line_total, ti.is_return, ti.discount_reason, ti.created_at,
           p.name as product_name, p.barcode, p.sku, p.category,
           p.variant_size, p.variant_color, p.mrp
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    WHERE ti.txn_id = ?
    ORDER BY ti.created_at
  `).all(req.params.txnId);

  const payments = db.prepare('SELECT * FROM payments WHERE txn_id = ?').all(req.params.txnId);
  const cashier = db.prepare('SELECT name, employee_code FROM cashiers WHERE id = ?').get(txn.cashier_id);
  const customer = txn.customer_id
    ? db.prepare('SELECT name, phone, loyalty_points FROM customers WHERE id = ?').get(txn.customer_id)
    : null;
  const coupon = txn.coupon_id
    ? db.prepare('SELECT code, type, value FROM coupons WHERE id = ?').get(txn.coupon_id)
    : null;

  let defaultLogo = '';
  try {
    const { STORE_LOGO_BASE64 } = require('../utils/logo');
    defaultLogo = STORE_LOGO_BASE64;
  } catch (_) {}

  const storeInfo = {
    name: getSetting('STORE_NAME', 'House of Sadaya'),
    address: getSetting('STORE_ADDRESS', '4/8 Housing board Tonk Rajasthan'),
    phone: getSetting('STORE_PHONE', '7568458575'),
    logo: getSetting('STORE_LOGO', defaultLogo),
    footer_text: getSetting('FOOTER_TEXT', 'Thank you for shopping at House of Sadaya! Exchange within 7 days with tag intact.'),
    thermal_width: getSetting('THERMAL_WIDTH', '80mm')
  };

  res.json({
    bill_title: 'Bill',
    store: storeInfo,
    bill_number: txn.bill_number,
    transaction_type: txn.transaction_type || 'sale',
    exchange_for_bill: txn.exchange_for_bill || null,
    date: txn.completed_at || txn.created_at,
    counter: txn.counter_number,
    cashier,
    customer,
    items,
    subtotal: txn.subtotal,
    discount: txn.total_discount,
    discount_reason: txn.discount_reason,
    coupon,
    grand_total: txn.grand_total,
    payments,
    loyalty_earned: customer ? Math.floor(txn.grand_total / 100) : 0
  });
});

module.exports = router;
