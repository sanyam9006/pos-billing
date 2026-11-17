const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../utils/auth');

// All report endpoints require supervisor / owner role
router.use(requireRole('supervisor'));

// ── GET /api/reports/x-report — Current shift summary ──
router.get('/x-report', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_transactions,
      COALESCE(SUM(grand_total), 0) as total_sales,
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
    SELECT p.name, p.variant_size, p.variant_color, SUM(ti.quantity) as qty_sold, SUM(ti.line_total) as revenue
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    JOIN transactions t ON ti.txn_id = t.id
    WHERE t.status = 'completed' AND date(t.completed_at) = ? AND ti.is_return = 0
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

// ── GET /api/reports/z-report?date= — End-of-day summary ──
router.get('/z-report', (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_transactions,
      COALESCE(SUM(grand_total), 0) as total_sales,
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
    SELECT p.name, p.sku, p.variant_size, p.variant_color, SUM(ti.quantity) as qty_sold, SUM(ti.line_total) as revenue
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    JOIN transactions t ON ti.txn_id = t.id
    WHERE t.status = 'completed' AND date(t.completed_at) = ? AND ti.is_return = 0
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
      COALESCE(SUM(grand_total), 0) as total_sales
    FROM transactions
    WHERE status = 'completed' AND date(completed_at) BETWEEN ? AND ?
    GROUP BY date(completed_at)
    ORDER BY date ASC
  `).all(from, to);

  res.json({ from, to, days: sales });
});

// ── GET /api/reports/top-products?limit=10&from=&to= ──
router.get('/top-products', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);

  const products = db.prepare(`
    SELECT p.name, p.sku, p.category, p.variant_size, p.variant_color,
      SUM(ti.quantity) as qty_sold,
      SUM(ti.line_total) as revenue,
      COUNT(DISTINCT ti.txn_id) as order_count
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    JOIN transactions t ON ti.txn_id = t.id
    WHERE t.status = 'completed' AND date(t.completed_at) BETWEEN ? AND ? AND ti.is_return = 0
    GROUP BY ti.product_id
    ORDER BY revenue DESC
    LIMIT ?
  `).all(from, to, limit);

  res.json({ from, to, products });
});

// ── GET /api/reports/slow-movers?threshold=3&days=30 ──
router.get('/slow-movers', (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;
  const maxSold = parseInt(req.query.max_sold, 10) || 2;
  const fromDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const slowMovers = db.prepare(`
    SELECT p.id, p.name, p.sku, p.barcode, p.category, p.variant_size, p.variant_color,
           p.stock_qty, p.selling_price, p.cost_price,
           COALESCE(sales.qty_sold, 0) as qty_sold
    FROM products p
    LEFT JOIN (
      SELECT ti.product_id, SUM(ti.quantity) as qty_sold
      FROM transaction_items ti
      JOIN transactions t ON ti.txn_id = t.id
      WHERE t.status = 'completed' AND date(t.completed_at) >= ? AND ti.is_return = 0
      GROUP BY ti.product_id
    ) sales ON sales.product_id = p.id
    WHERE p.is_active = 1 AND COALESCE(sales.qty_sold, 0) <= ?
    ORDER BY qty_sold ASC, p.stock_qty DESC
    LIMIT 30
  `).all(fromDate, maxSold);

  res.json({ days, max_sold: maxSold, count: slowMovers.length, products: slowMovers });
});

// ── GET /api/reports/profit?from=&to= — Gross Profit & Margin Report ──
router.get('/profit', (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);

  const items = db.prepare(`
    SELECT p.id, p.name, p.sku, p.category, p.variant_size, p.variant_color,
           COALESCE(p.cost_price, 0) as cost_price,
           SUM(ti.quantity) as units_sold,
           SUM(ti.line_total) as total_revenue
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    JOIN transactions t ON ti.txn_id = t.id
    WHERE t.status = 'completed' AND date(t.completed_at) BETWEEN ? AND ? AND ti.is_return = 0
    GROUP BY ti.product_id
  `).all(from, to);

  let totalRevenue = 0;
  let totalCost = 0;

  const itemDetails = items.map(item => {
    const rev = Number(item.total_revenue) || 0;
    const cost = (Number(item.cost_price) || 0) * (Number(item.units_sold) || 0);
    const profit = Math.round((rev - cost) * 100) / 100;
    const margin = rev > 0 ? Math.round((profit / rev) * 1000) / 10 : 0;

    totalRevenue += rev;
    totalCost += cost;

    return {
      ...item,
      total_cost: Math.round(cost * 100) / 100,
      profit,
      margin_pct: margin
    };
  });

  const totalGrossProfit = Math.round((totalRevenue - totalCost) * 100) / 100;
  const overallMargin = totalRevenue > 0 ? Math.round((totalGrossProfit / totalRevenue) * 1000) / 10 : 0;

  res.json({
    from,
    to,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_cost: Math.round(totalCost * 100) / 100,
    gross_profit: totalGrossProfit,
    overall_margin_pct: overallMargin,
    items: itemDetails
  });
});

// ── GET /api/reports/customer-history/:phone — Customer purchase history ──
router.get('/customer-history/:phone', (req, res) => {
  const phone = req.params.phone.trim();
  const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const bills = db.prepare(`
    SELECT t.id, t.bill_number, t.completed_at, t.grand_total, t.total_discount, t.status
    FROM transactions t
    WHERE t.customer_id = ? AND t.status = 'completed'
    ORDER BY t.completed_at DESC
  `).all(customer.id);

  const totalSpend = bills.reduce((sum, b) => sum + Number(b.grand_total || 0), 0);

  res.json({
    customer,
    total_spend: Math.round(totalSpend * 100) / 100,
    total_visits: bills.length,
    bills
  });
});

// ── GET /api/reports/low-stock?threshold=10 — Low stock by variant ──
router.get('/low-stock', (req, res) => {
  const threshold = parseInt(req.query.threshold, 10) || 10;

  const products = db.prepare(`
    SELECT id, name, sku, barcode, category, variant_size, variant_color, stock_qty, unit, selling_price
    FROM products
    WHERE is_active = 1 AND stock_qty <= ?
    ORDER BY stock_qty ASC
  `).all(threshold);

  res.json({ threshold, count: products.length, products });
});

// ── GET /api/reports/audit-logs — Supervisor audit trail ──
router.get('/audit-logs', (req, res) => {
  const logs = db.prepare(`
    SELECT * FROM audit_logs
    ORDER BY id DESC
    LIMIT 100
  `).all();

  res.json(logs);
});

module.exports = router;
