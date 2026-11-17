const express = require('express');
const router = express.Router();
const db = require('../db');
const { getSetting } = require('../utils/tax');
const { logAudit } = require('../utils/audit');

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
    ...updatedTxn,
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

  res.json({ ...updatedTxn, payments: allPayments, change: totalChange, fully_paid: true });
});

// ── GET /api/payments/receipt/:txnId — Get receipt data ──
router.get('/receipt/:txnId', (req, res) => {
  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.txnId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  const items = db.prepare(`
    SELECT ti.*, p.name as product_name, p.barcode, p.sku, p.category,
           p.hsn_code as product_hsn, p.variant_size, p.variant_color
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

  const gstMode = getSetting('GST_MODE', 'registered');
  const isRegistered = gstMode === 'registered';
  const isInterstate = Boolean(txn.is_interstate);

  const storeInfo = {
    name: getSetting('STORE_NAME', 'Aura Fashion Boutique'),
    address: getSetting('STORE_ADDRESS', 'Shop 12, Fashion Street, M.I. Road, Jaipur, Rajasthan 302001'),
    phone: getSetting('STORE_PHONE', '+91 98765 43210'),
    gstin: isRegistered ? getSetting('STORE_GSTIN', '08AAAAA0000A1Z5') : null,
    state_code: isRegistered ? getSetting('STATE_CODE', '08') : null,
    footer_text: getSetting('FOOTER_TEXT', 'Thank you for shopping at Aura Fashion Boutique! Exchange within 7 days with tag intact.'),
    thermal_width: getSetting('THERMAL_WIDTH', '80mm')
  };

  // Build GST tax summary by HSN & rate (only if registered)
  const taxSummaryMap = {};
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  for (const item of items) {
    const rate = Number(item.tax_rate) || 5.0;
    const hsn = item.hsn_code || item.product_hsn || '6204';
    const key = `${hsn}_${rate}`;

    const lineTotal = Number(item.line_total);
    const taxInc = Number(item.tax_included || item.tax || 0);
    const taxableVal = Math.round((lineTotal - taxInc) * 100) / 100;

    let itemCGST = 0;
    let itemSGST = 0;
    let itemIGST = 0;

    if (isInterstate) {
      itemIGST = taxInc;
      totalIGST += itemIGST;
    } else {
      itemCGST = Math.round((taxInc / 2) * 100) / 100;
      itemSGST = Math.round((taxInc - itemCGST) * 100) / 100;
      totalCGST += itemCGST;
      totalSGST += itemSGST;
    }

    if (!taxSummaryMap[key]) {
      taxSummaryMap[key] = {
        hsn,
        tax_rate: rate,
        taxable_value: 0,
        cgst_rate: isInterstate ? 0 : rate / 2,
        cgst_amount: 0,
        sgst_rate: isInterstate ? 0 : rate / 2,
        sgst_amount: 0,
        igst_rate: isInterstate ? rate : 0,
        igst_amount: 0,
        total_tax: 0
      };
    }

    taxSummaryMap[key].taxable_value += taxableVal;
    taxSummaryMap[key].cgst_amount += itemCGST;
    taxSummaryMap[key].sgst_amount += itemSGST;
    taxSummaryMap[key].igst_amount += itemIGST;
    taxSummaryMap[key].total_tax += taxInc;
  }

  const tax_summary = Object.values(taxSummaryMap).map(ts => ({
    ...ts,
    taxable_value: Math.round(ts.taxable_value * 100) / 100,
    cgst_amount: Math.round(ts.cgst_amount * 100) / 100,
    sgst_amount: Math.round(ts.sgst_amount * 100) / 100,
    igst_amount: Math.round(ts.igst_amount * 100) / 100,
    total_tax: Math.round(ts.total_tax * 100) / 100
  }));

  res.json({
    invoice_title: isRegistered ? 'TAX INVOICE' : 'BILL OF SUPPLY',
    gst_mode: gstMode,
    is_registered: isRegistered,
    is_interstate: isInterstate,
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
    tax_amount: isRegistered ? txn.tax_amount : 0,
    cgst: isRegistered && !isInterstate ? Math.round(totalCGST * 100) / 100 : 0,
    sgst: isRegistered && !isInterstate ? Math.round(totalSGST * 100) / 100 : 0,
    igst: isRegistered && isInterstate ? Math.round(totalIGST * 100) / 100 : 0,
    tax_summary: isRegistered ? tax_summary : [],
    grand_total: txn.grand_total,
    payments,
    loyalty_earned: customer ? Math.floor(txn.grand_total / 100) : 0
  });
});

module.exports = router;
