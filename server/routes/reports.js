const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../utils/auth');

// All report endpoints require supervisor role
router.use(requireRole('supervisor'));

// ── GET /api/reports/x-report — Current shift summary (X Report) ──
router.get('/x-report', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_transactions,
      COALESCE(SUM(grand_total), 0) as total_sales,
      COALESCE(SUM(tax_amount), 0) as total_tax,
      COALESCE(SUM(total_discount), 0) as total_discounts
    FROM transactions
    WHERE status = 'completed' AND date(completed_at) = ?
  `).get(today);

  const byMethod = db.prepare(`
    SELECT p.method, COUNT(*) as count, COALESCE(SUM(p.amount), 0) as total
    FROM payments p
    JOIN transactions t ON p.txn_id = t.id
    WHERE t.status = 'completed' AND date(t.completed_at) = ?
    GROUP BY p.method
  `).all(today);

  const topProducts = db.prepare(`
    SELECT p.name, SUM(ti.quantity) as qty_sold, SUM(ti.line_total) as revenue
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    JOIN transactions t ON ti.txn_id = t.id
    WHERE t.status = 'completed' AND date(t.completed_at) = ?
    GROUP BY ti.product_id
    ORDER BY qty_sold DESC
    LIMIT 5
  `).all(today);

  const refundTotal = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(refund_amount), 0) as total
    FROM refunds WHERE date(created_at) = ?
  `).get(today);

  res.json({
    report_type: 'X Report',
    date: today,
    generated_at: new Date().toISOString(),
    ...summary,
    payment_breakdown: byMethod,
    top_products: topProducts,
    refunds: refundTotal
  });
});

// ── GET /api/reports/z-report?date= — End-of-day summary (Z Report) ──
router.get('/z-report', (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_transactions,
      COALESCE(SUM(grand_total), 0) as total_sales,
      COALESCE(SUM(tax_amount), 0) as total_tax,
      COALESCE(SUM(total_discount), 0) as total_discounts
    FROM transactions
    WHERE status = 'completed' AND date(completed_at) = ?
  `).get(date);

  const byMethod = db.prepare(`
    SELECT p.method, COUNT(*) as count, COALESCE(SUM(p.amount), 0) as total
    FROM payments p
    JOIN transactions t ON p.txn_id = t.id
    WHERE t.status = 'completed' AND date(t.completed_at) = ?
    GROUP BY p.method
  `).all(date);

  const byCashier = db.prepare(`
    SELECT c.name, c.employee_code, COUNT(*) as transactions,
      COALESCE(SUM(t.grand_total), 0) as total_sales
    FROM transactions t
    JOIN cashiers c ON t.cashier_id = c.id
    WHERE t.status = 'completed' AND date(t.completed_at) = ?
    GROUP BY t.cashier_id
    ORDER BY total_sales DESC
  `).all(date);

  const topProducts = db.prepare(`
    SELECT p.name, p.sku, SUM(ti.quantity) as qty_sold, SUM(ti.line_total) as revenue
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    JOIN transactions t ON ti.txn_id = t.id
    WHERE t.status = 'completed' AND date(t.completed_at) = ?
    GROUP BY ti.product_id
    ORDER BY revenue DESC
    LIMIT 10
  `).all(date);

  const refundTotal = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(refund_amount), 0) as total
    FROM refunds WHERE date(created_at) = ?
  `).get(date);

  const voidedCount = db.prepare(`
    SELECT COUNT(*) as count FROM transactions
    WHERE status = 'voided' AND date(created_at) = ?
  `).get(date);

  res.json({
    report_type: 'Z Report',
    date,
    generated_at: new Date().toISOString(),
    ...summary,
    net_sales: Math.round((summary.total_sales - (refundTotal?.total || 0)) * 100) / 100,
    payment_breakdown: byMethod,
    cashier_breakdown: byCashier,
    top_products: topProducts,
    refunds: refundTotal,
    voided_transactions: voidedCount.count
  });
});

// ── GET /api/reports/daily-sales?from=&to= — Daily sales over date range ──
router.get('/daily-sales', (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);

  const sales = db.prepare(`
    SELECT date(completed_at) as date,
      COUNT(*) as transactions,
      COALESCE(SUM(grand_total), 0) as total_sales,
      COALESCE(SUM(tax_amount), 0) as total_tax
    FROM transactions
    WHERE status = 'completed' AND date(completed_at) BETWEEN ? AND ?
    GROUP BY date(completed_at)
    ORDER BY date ASC
  `).all(from, to);

  res.json({ from, to, days: sales });
});

// ── GET /api/reports/top-products?limit=10&from=&to= ──
router.get('/top-products', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);

  const products = db.prepare(`
    SELECT p.name, p.sku, p.category,
      SUM(ti.quantity) as qty_sold,
      SUM(ti.line_total) as revenue,
      COUNT(DISTINCT ti.txn_id) as order_count
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    JOIN transactions t ON ti.txn_id = t.id
    WHERE t.status = 'completed' AND date(t.completed_at) BETWEEN ? AND ?
    GROUP BY ti.product_id
    ORDER BY revenue DESC
    LIMIT ?
  `).all(from, to, limit);

  res.json({ from, to, products });
});

// ── GET /api/reports/cashier-sales?from=&to= ──
router.get('/cashier-sales', (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);

  const cashiers = db.prepare(`
    SELECT c.name, c.employee_code,
      COUNT(*) as transactions,
      COALESCE(SUM(t.grand_total), 0) as total_sales,
      COALESCE(AVG(t.grand_total), 0) as avg_bill
    FROM transactions t
    JOIN cashiers c ON t.cashier_id = c.id
    WHERE t.status = 'completed' AND date(t.completed_at) BETWEEN ? AND ?
    GROUP BY t.cashier_id
    ORDER BY total_sales DESC
  `).all(from, to);

  res.json({ from, to, cashiers });
});

// ── GET /api/reports/low-stock?threshold=10 ──
router.get('/low-stock', (req, res) => {
  const threshold = parseInt(req.query.threshold) || 10;

  const products = db.prepare(`
    SELECT id, name, sku, barcode, category, stock_qty, unit
    FROM products
    WHERE is_active = 1 AND stock_qty <= ?
    ORDER BY stock_qty ASC
  `).all(threshold);

  res.json({ threshold, count: products.length, products });
});

module.exports = router;
