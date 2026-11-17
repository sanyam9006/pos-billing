const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/payments — Process payment
router.post('/', (req, res) => {
  const { txn_id, method, amount, tendered, reference_number } = req.body;

  const txn = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'active'").get(txn_id);
  if (!txn) return res.status(404).json({ error: 'Active transaction not found' });

  // Calculate total already paid
  const paidSoFar = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE txn_id = ?').get(txn_id).total;
  const remaining = Math.round((txn.grand_total - paidSoFar) * 100) / 100;

  if (amount > remaining + 0.01) {
    return res.status(400).json({ error: `Amount exceeds remaining balance of ₹${remaining}` });
  }

  let changeAmount = 0;
  if (method === 'cash' && tendered) {
    changeAmount = Math.round((tendered - amount) * 100) / 100;
  }

  db.prepare(
    'INSERT INTO payments (txn_id, method, amount, tendered, change_amount, reference_number) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(txn_id, method, amount, tendered || amount, changeAmount, reference_number || null);

  // Check if fully paid
  const newPaidTotal = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE txn_id = ?').get(txn_id).total;

  if (newPaidTotal >= txn.grand_total - 0.01) {
    // Mark complete
    db.prepare(
      "UPDATE transactions SET status = 'completed', completed_at = datetime('now') WHERE id = ?"
    ).run(txn_id);

    // Accrue loyalty points (1 point per ₹100)
    if (txn.customer_id) {
      const pointsEarned = Math.floor(txn.grand_total / 100);
      db.prepare('UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?')
        .run(pointsEarned, txn.customer_id);
    }
  }

  const updatedTxn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn_id);
  const payments = db.prepare('SELECT * FROM payments WHERE txn_id = ?').all(txn_id);

  res.json({
    ...updatedTxn,
    payments,
    change: changeAmount,
    fully_paid: updatedTxn.status === 'completed'
  });
});

// POST /api/payments/split — Process split payment
router.post('/split', (req, res) => {
  const { txn_id, payments: paymentsList } = req.body;

  const txn = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'active'").get(txn_id);
  if (!txn) return res.status(404).json({ error: 'Active transaction not found' });

  const totalPaymentAmount = paymentsList.reduce((sum, p) => sum + p.amount, 0);
  if (Math.abs(totalPaymentAmount - txn.grand_total) > 0.5) {
    return res.status(400).json({ error: 'Split payment total must equal bill amount' });
  }

  const insertPayment = db.prepare(
    'INSERT INTO payments (txn_id, method, amount, tendered, change_amount, reference_number) VALUES (?, ?, ?, ?, ?, ?)'
  );

  let totalChange = 0;
  for (const payment of paymentsList) {
    let changeAmount = 0;
    if (payment.method === 'cash' && payment.tendered) {
      changeAmount = Math.round((payment.tendered - payment.amount) * 100) / 100;
      totalChange += changeAmount;
    }
    insertPayment.run(
      txn_id, payment.method, payment.amount,
      payment.tendered || payment.amount, changeAmount,
      payment.reference_number || null
    );
  }

  // Mark complete
  db.prepare("UPDATE transactions SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(txn_id);

  // Accrue loyalty points
  if (txn.customer_id) {
    const pointsEarned = Math.floor(txn.grand_total / 100);
    db.prepare('UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?')
      .run(pointsEarned, txn.customer_id);
  }

  const updatedTxn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn_id);
  const allPayments = db.prepare('SELECT * FROM payments WHERE txn_id = ?').all(txn_id);

  res.json({ ...updatedTxn, payments: allPayments, change: totalChange, fully_paid: true });
});

// GET /api/payments/receipt/:txnId — Get receipt data
router.get('/receipt/:txnId', (req, res) => {
  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.txnId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  const items = db.prepare(`
    SELECT ti.*, p.name as product_name, p.barcode, p.sku, p.hsn_code, p.tax_rate
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

  const cgst = Math.round((txn.tax_amount / 2) * 100) / 100;
  const sgst = Math.round((txn.tax_amount - cgst) * 100) / 100;

  // Build GST tax summary by HSN & rate
  const taxSummaryMap = {};
  for (const item of items) {
    const key = `${item.hsn_code || 'GEN'}_${item.tax_rate}`;
    if (!taxSummaryMap[key]) {
      taxSummaryMap[key] = {
        hsn: item.hsn_code || '—',
        tax_rate: item.tax_rate,
        taxable_value: 0,
        cgst_rate: item.tax_rate / 2,
        cgst_amount: 0,
        sgst_rate: item.tax_rate / 2,
        sgst_amount: 0,
        total_tax: 0
      };
    }
    const taxable = Math.round((item.line_total - item.tax) * 100) / 100;
    const cgstItem = Math.round((item.tax / 2) * 100) / 100;
    const sgstItem = Math.round((item.tax - cgstItem) * 100) / 100;
    taxSummaryMap[key].taxable_value += taxable;
    taxSummaryMap[key].cgst_amount += cgstItem;
    taxSummaryMap[key].sgst_amount += sgstItem;
    taxSummaryMap[key].total_tax += item.tax;
  }
  const tax_summary = Object.values(taxSummaryMap).map(ts => ({
    ...ts,
    taxable_value: Math.round(ts.taxable_value * 100) / 100,
    cgst_amount: Math.round(ts.cgst_amount * 100) / 100,
    sgst_amount: Math.round(ts.sgst_amount * 100) / 100,
    total_tax: Math.round(ts.total_tax * 100) / 100
  }));

  res.json({
    store: {
      name: process.env.STORE_NAME || 'SUPERMART RETAIL PVT LTD',
      address: process.env.STORE_ADDRESS || '123, MG Road, Bengaluru - 560001',
      gstin: process.env.STORE_GSTIN || '29AABCS1234A1Z5',
      phone: process.env.STORE_PHONE || '080-12345678'
    },
    bill_number: txn.bill_number,
    date: txn.completed_at || txn.created_at,
    counter: txn.counter_number,
    cashier,
    customer,
    items,
    subtotal: txn.subtotal,
    discount: txn.total_discount,
    coupon,
    tax: txn.tax_amount,
    cgst,
    sgst,
    tax_summary,
    grand_total: txn.grand_total,
    payments,
    loyalty_earned: customer ? Math.floor(txn.grand_total / 100) : 0
  });
});

module.exports = router;
