const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../utils/auth');

// All report endpoints require supervisor / owner role
router.use(requireRole('supervisor'));

/**
 * Helper to fetch complete shift/day reporting data:
 * - Sales and discount metrics
 * - Payment mode breakdown
 * - Top selling products
 * - Hourly breakdown for peak hour chart
 * - Chronological itemized sales timeline ("when what was sold")
 */
function getShiftReportData(dateStr) {
  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_transactions,
      COALESCE(SUM(grand_total), 0) as total_sales,
      COALESCE(SUM(total_discount), 0) as total_discounts
    FROM transactions
    WHERE status = 'completed'
      AND (date(completed_at) = ? OR date(completed_at, '+5 hours', '+30 minutes') = ?)
  `).get(dateStr, dateStr);

  const byMethod = db.prepare(`
    SELECT p.method, COUNT(*) as count, COALESCE(SUM(p.amount), 0) as total
    FROM payments p
    JOIN transactions t ON p.txn_id = t.id
    WHERE t.status = 'completed'
      AND (date(t.completed_at) = ? OR date(t.completed_at, '+5 hours', '+30 minutes') = ?)
    GROUP BY p.method
  `).all(dateStr, dateStr);

  const topProducts = db.prepare(`
    SELECT p.name, p.sku, p.variant_size, p.variant_color, p.category,
      SUM(ti.quantity) as qty_sold,
      SUM(ti.line_total) as revenue
    FROM transaction_items ti
    JOIN products p ON ti.product_id = p.id
    JOIN transactions t ON ti.txn_id = t.id
    WHERE t.status = 'completed'
      AND (date(t.completed_at) = ? OR date(t.completed_at, '+5 hours', '+30 minutes') = ?)
      AND ti.is_return = 0
    GROUP BY ti.product_id
    ORDER BY revenue DESC
    LIMIT 10
  `).all(dateStr, dateStr);

  // Hourly sales distribution (IST hours 0-23)
  const hourly = db.prepare(`
    SELECT
      CAST(strftime('%H', t.completed_at, '+5 hours', '+30 minutes') AS INTEGER) as hour,
      COUNT(*) as count,
      COALESCE(SUM(t.grand_total), 0) as total_sales,
      COALESCE(SUM((
        SELECT SUM(quantity) FROM transaction_items WHERE txn_id = t.id AND is_return = 0
      )), 0) as items_sold
    FROM transactions t
    WHERE t.status = 'completed'
      AND (date(t.completed_at) = ? OR date(t.completed_at, '+5 hours', '+30 minutes') = ?)
    GROUP BY hour
    ORDER BY hour ASC
  `).all(dateStr, dateStr);

  // Chronological itemized sales timeline ("when what was sold")
  const txns = db.prepare(`
    SELECT
      t.id,
      t.bill_number,
      t.completed_at,
      strftime('%Y-%m-%d %H:%M:%S', t.completed_at, '+5 hours', '+30 minutes') as ist_completed_at,
      t.grand_total,
      t.total_discount,
      t.status,
      t.transaction_type,
      t.exchange_for_bill,
      t.discount_reason,
      c.name as cashier_name,
      c.employee_code as cashier_code,
      cust.name as customer_name,
      cust.phone as customer_phone
    FROM transactions t
    LEFT JOIN cashiers c ON t.cashier_id = c.id
    LEFT JOIN customers cust ON t.customer_id = cust.id
    WHERE t.status = 'completed'
      AND (date(t.completed_at) = ? OR date(t.completed_at, '+5 hours', '+30 minutes') = ?)
    ORDER BY t.completed_at DESC, t.id DESC
  `).all(dateStr, dateStr);

  const getItems = db.prepare(`
    SELECT
      ti.id,
      ti.quantity,
      ti.unit_price,
      ti.line_total,
      ti.is_return,
      p.name,
      p.sku,
      p.barcode,
      p.category,
      p.variant_size,
      p.variant_color
    FROM transaction_items ti
    LEFT JOIN products p ON ti.product_id = p.id
    WHERE ti.txn_id = ?
  `);

  const getPayments = db.prepare(`
    SELECT method, amount, tendered, change_amount FROM payments WHERE txn_id = ?
  `);

  const salesTimeline = txns.map(t => ({
    ...t,
    items: getItems.all(t.id),
    payments: getPayments.all(t.id)
  }));

  const refundTotal = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(refund_amount), 0) as total
    FROM refunds
    WHERE date(created_at) = ? OR date(created_at, '+5 hours', '+30 minutes') = ?
  `).get(dateStr, dateStr);

  return {
    summary,
    byMethod,
    topProducts,
    hourly,
    salesTimeline,
    refundTotal
  };
}

// ── GET /api/reports/x-report — Current shift summary ──
router.get('/x-report', (req, res) => {
  // Support today in IST (UTC+5:30) and UTC
  const now = new Date();
  const istDateStr = new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const utcDateStr = now.toISOString().slice(0, 10);

  let shift = getShiftReportData(istDateStr);
  let effectiveDate = istDateStr;

  // Fallback to UTC date if no transactions found under IST date yet
  if (shift.summary.total_transactions === 0 && istDateStr !== utcDateStr) {
    const utcShift = getShiftReportData(utcDateStr);
    if (utcShift.summary.total_transactions > 0) {
      shift = utcShift;
      effectiveDate = utcDateStr;
    }
  }

  res.json({
    report_type: 'X Report',
    date: effectiveDate,
    generated_at: new Date().toISOString(),
    ...shift.summary,
    payment_breakdown: shift.byMethod,
    top_products: shift.topProducts,
    hourly_sales: shift.hourly,
    sales_timeline: shift.salesTimeline,
    refunds: shift.refundTotal
  });
});

// ── GET /api/reports/z-report?date= — End-of-day summary ──
router.get('/z-report', (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const shift = getShiftReportData(date);

  const byCashier = db.prepare(`
    SELECT c.name, c.employee_code, COUNT(*) as transactions,
      COALESCE(SUM(t.grand_total), 0) as total_sales
    FROM transactions t
    JOIN cashiers c ON t.cashier_id = c.id
    WHERE t.status = 'completed'
      AND (date(t.completed_at) = ? OR date(t.completed_at, '+5 hours', '+30 minutes') = ?)
    GROUP BY t.cashier_id
    ORDER BY total_sales DESC
  `).all(date, date);

  const voidedCount = db.prepare(`
    SELECT COUNT(*) as count FROM transactions
    WHERE status = 'voided'
      AND (date(created_at) = ? OR date(created_at, '+5 hours', '+30 minutes') = ?)
  `).get(date, date);

  res.json({
    report_type: 'Z Report',
    date,
    generated_at: new Date().toISOString(),
    ...shift.summary,
    net_sales: Math.round((shift.summary.total_sales - (shift.refundTotal?.total || 0)) * 100) / 100,
    payment_breakdown: shift.byMethod,
    cashier_breakdown: byCashier,
    top_products: shift.topProducts,
    hourly_sales: shift.hourly,
    sales_timeline: shift.salesTimeline,
    refunds: shift.refundTotal,
    voided_transactions: voidedCount?.count || 0
  });
});

// ── GET /api/reports/daily-sales?from=&to= — Daily sales over date range ──
router.get('/daily-sales', (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);

  const sales = db.prepare(`
    SELECT
      COALESCE(date(completed_at, '+5 hours', '+30 minutes'), date(completed_at)) as date,
      COUNT(*) as transactions,
      COALESCE(SUM(grand_total), 0) as total_sales
    FROM transactions
    WHERE status = 'completed'
      AND (
        date(completed_at, '+5 hours', '+30 minutes') BETWEEN ? AND ?
        OR date(completed_at) BETWEEN ? AND ?
      )
    GROUP BY date
    ORDER BY date ASC
  `).all(from, to, from, to);

  res.json({ from, to, days: sales });
});

// ── GET /api/reports/day-transactions?date= — Detailed sales for a single day ──
router.get('/day-transactions', (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const shift = getShiftReportData(date);
  res.json({
    date,
    ...shift.summary,
    sales_timeline: shift.salesTimeline
  });
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
