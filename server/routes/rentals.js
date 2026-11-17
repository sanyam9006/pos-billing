const express = require('express');
const router = express.Router();
const db = require('../db');
const { getSetting } = require('../utils/settings');
const { verifyPin, requireRole } = require('../utils/auth');
const { logAudit } = require('../utils/audit');

// ── Helper: generate unique rental order number (RNT-YYYYMM-XXXX) ──
function generateRentalOrderNumber() {
  const now = new Date();
  const ym = now.toISOString().slice(0, 7).replace('-', '');
  const countRow = db.prepare("SELECT COUNT(*) as count FROM rental_orders WHERE order_number LIKE ?").get(`RNT-${ym}-%`);
  const seq = String((countRow ? countRow.count : 0) + 1).padStart(4, '0');
  return `RNT-${ym}-${seq}`;
}

// ── Helper: calculate days between two dates with configurable pickup day rule ──
function calculateRentalDays(rentDateStr, dueDateStr, countPickupDay = true) {
  const d1 = new Date(rentDateStr);
  const d2 = new Date(dueDateStr);
  const diffTime = d2.getTime() - d1.getTime();
  const diffDays = Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)));

  if (diffDays === 0) return 1;
  return countPickupDay ? diffDays + 1 : diffDays;
}

// ── Helper: verify supervisor/owner PIN ──
function checkSupervisorApproval(pin, cashier) {
  if (cashier && cashier.role === 'supervisor') {
    return { approved: true, approved_by: cashier.id };
  }
  if (!pin) {
    return { approved: false, error: 'Supervisor PIN is required for this price adjustment.' };
  }
  const supervisors = db.prepare("SELECT id, pin FROM cashiers WHERE role = 'supervisor' AND is_active = 1").all();
  const validSup = supervisors.find(s => verifyPin(pin, s.pin));
  if (!validSup) {
    return { approved: false, error: 'Invalid Supervisor PIN.' };
  }
  return { approved: true, approved_by: validSup.id };
}

// ══════════════════════════════════════════════════════════════════════════
// RENTAL INVENTORY ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/rentals/items — List rental garments ──
router.get('/items', (req, res) => {
  const { status, search } = req.query;
  let sql = 'SELECT * FROM rental_items WHERE is_active = 1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR category LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY id DESC';
  const items = db.prepare(sql).all(...params);
  res.json(items);
});

// ── GET /api/rentals/items/:id — Get single rental item ──
router.get('/items/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM rental_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Rental item not found' });
  res.json(item);
});

// ── POST /api/rentals/items — Add new rental item (supervisor only) ──
router.post('/items', requireRole('supervisor'), (req, res) => {
  const {
    sku,
    barcode,
    name,
    category = 'Bridal & Occasion Wear',
    size,
    color,
    deposit_amount = 0,
    pricing_mode_default = 'PER_EVENT',
    rent_per_day = 0,
    event_rent = 0,
    event_days = 3,
    late_fee_per_day = 0,
    notes
  } = req.body;

  if (!sku || !sku.trim() || !barcode || !barcode.trim() || !name || !name.trim()) {
    return res.status(400).json({ error: 'SKU, barcode, and name are required' });
  }

  const cleanSku = sku.trim().toUpperCase();
  const cleanBarcode = barcode.trim();

  // Check unique SKU and barcode in rental_items
  const existingSku = db.prepare('SELECT id FROM rental_items WHERE sku = ?').get(cleanSku);
  if (existingSku) return res.status(409).json({ error: `SKU "${cleanSku}" already exists in rental inventory` });

  const existingBarcode = db.prepare('SELECT id FROM rental_items WHERE barcode = ?').get(cleanBarcode);
  if (existingBarcode) return res.status(409).json({ error: `Barcode "${cleanBarcode}" already assigned to another rental item` });

  const result = db.prepare(`
    INSERT INTO rental_items (
      sku, barcode, name, category, size, color, deposit_amount,
      pricing_mode_default, rent_per_day, event_rent, event_days,
      late_fee_per_day, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?)
  `).run(
    cleanSku, cleanBarcode, name.trim(), category.trim(), size || null, color || null,
    Number(deposit_amount) || 0,
    pricing_mode_default === 'PER_DAY' ? 'PER_DAY' : 'PER_EVENT',
    Number(rent_per_day) || 0,
    Number(event_rent) || 0,
    parseInt(event_days, 10) || 3,
    Number(late_fee_per_day) || 0,
    notes || null
  );

  const created = db.prepare('SELECT * FROM rental_items WHERE id = ?').get(result.lastInsertRowid);

  logAudit({
    cashier_id: req.cashier.id,
    cashier_name: req.cashier.name,
    action: 'create_rental_item',
    entity_type: 'rental_item',
    entity_id: created.id,
    details: { sku: cleanSku, barcode: cleanBarcode, name: created.name }
  });

  res.status(201).json(created);
});

// ── PUT /api/rentals/items/:id — Update rental item (supervisor only, allows barcode edit) ──
router.put('/items/:id', requireRole('supervisor'), (req, res) => {
  const item = db.prepare('SELECT * FROM rental_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Rental item not found' });

  const {
    barcode,
    name,
    category,
    size,
    color,
    deposit_amount,
    pricing_mode_default,
    rent_per_day,
    event_rent,
    event_days,
    late_fee_per_day,
    status,
    notes
  } = req.body;

  let barcodeChanged = false;
  let newBarcode = item.barcode;

  if (barcode && barcode.trim() && barcode.trim() !== item.barcode) {
    const cleanBarcode = barcode.trim();
    const existing = db.prepare('SELECT id FROM rental_items WHERE barcode = ? AND id != ?').get(cleanBarcode, req.params.id);
    if (existing) {
      return res.status(409).json({ error: `Barcode "${cleanBarcode}" already assigned to another rental item` });
    }
    newBarcode = cleanBarcode;
    barcodeChanged = true;
  }

  db.prepare(`
    UPDATE rental_items SET
      barcode = ?,
      name = COALESCE(?, name),
      category = COALESCE(?, category),
      size = COALESCE(?, size),
      color = COALESCE(?, color),
      deposit_amount = COALESCE(?, deposit_amount),
      pricing_mode_default = COALESCE(?, pricing_mode_default),
      rent_per_day = COALESCE(?, rent_per_day),
      event_rent = COALESCE(?, event_rent),
      event_days = COALESCE(?, event_days),
      late_fee_per_day = COALESCE(?, late_fee_per_day),
      status = COALESCE(?, status),
      notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(
    newBarcode,
    name ? name.trim() : null,
    category ? category.trim() : null,
    size ?? null,
    color ?? null,
    deposit_amount !== undefined ? Number(deposit_amount) : null,
    pricing_mode_default ?? null,
    rent_per_day !== undefined ? Number(rent_per_day) : null,
    event_rent !== undefined ? Number(event_rent) : null,
    event_days !== undefined ? parseInt(event_days, 10) : null,
    late_fee_per_day !== undefined ? Number(late_fee_per_day) : null,
    status ?? null,
    notes ?? null,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM rental_items WHERE id = ?').get(req.params.id);

  if (barcodeChanged) {
    logAudit({
      cashier_id: req.cashier.id,
      cashier_name: req.cashier.name,
      action: 'edit_rental_barcode',
      entity_type: 'rental_item',
      entity_id: item.id,
      details: { old_barcode: item.barcode, new_barcode: newBarcode }
    });
  }

  logAudit({
    cashier_id: req.cashier.id,
    cashier_name: req.cashier.name,
    action: 'update_rental_item',
    entity_type: 'rental_item',
    entity_id: item.id,
    details: { old: item, updated }
  });

  res.json(updated);
});

// ══════════════════════════════════════════════════════════════════════════
// RENTAL ORDERS & BOOKING ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/rentals/calculate — Live pricing calculation endpoint ──
router.get('/calculate', (req, res) => {
  const { item_id, rent_date, due_date, pricing_mode } = req.query;
  if (!item_id || !rent_date || !due_date) {
    return res.status(400).json({ error: 'item_id, rent_date, and due_date are required' });
  }

  const item = db.prepare('SELECT * FROM rental_items WHERE id = ?').get(item_id);
  if (!item) return res.status(404).json({ error: 'Rental item not found' });

  const countPickupDay = String(getSetting('RENTAL_COUNT_PICKUP_DAY', '1')) === '1';
  const billedDays = calculateRentalDays(rent_date, due_date, countPickupDay);
  const mode = pricing_mode || item.pricing_mode_default || 'PER_EVENT';

  let appliedRate = 0;
  let calculatedRent = 0;

  if (mode === 'PER_DAY') {
    appliedRate = Number(item.rent_per_day) || 0;
    calculatedRent = Math.round(appliedRate * billedDays * 100) / 100;
  } else {
    appliedRate = Number(item.event_rent) || 0;
    calculatedRent = appliedRate;
  }

  res.json({
    item_id: item.id,
    item_name: item.name,
    rent_date,
    due_date,
    pricing_mode: mode,
    billed_days: billedDays,
    applied_rate: appliedRate,
    calculated_rent: calculatedRent,
    deposit_amount: item.deposit_amount,
    count_pickup_day: countPickupDay
  });
});

// ── GET /api/rentals/orders — List rental orders ──
router.get('/orders', (req, res) => {
  const { status, search } = req.query;
  let sql = `
    SELECT ro.*, ri.name as item_name, ri.sku as item_sku, ri.barcode as item_barcode,
           ri.size as item_size, ri.color as item_color
    FROM rental_orders ro
    JOIN rental_items ri ON ro.rental_item_id = ri.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += ' AND ro.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (ro.customer_name LIKE ? OR ro.customer_phone LIKE ? OR ro.order_number LIKE ? OR ri.name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY ro.id DESC';
  const orders = db.prepare(sql).all(...params);
  res.json(orders);
});

// ── GET /api/rentals/orders/:id — Single rental order details ──
router.get('/orders/:id', (req, res) => {
  const order = db.prepare(`
    SELECT ro.*, ri.name as item_name, ri.sku as item_sku, ri.barcode as item_barcode,
           ri.size as item_size, ri.color as item_color, ri.event_days as item_event_days,
           ri.late_fee_per_day as item_late_fee_per_day, ri.rent_per_day as item_rent_per_day
    FROM rental_orders ro
    JOIN rental_items ri ON ro.rental_item_id = ri.id
    WHERE ro.id = ?
  `).get(req.params.id);

  if (!order) return res.status(404).json({ error: 'Rental order not found' });
  res.json(order);
});

// ── GET /api/rentals/orders/:id/slip — Printable rental order slip data ──
router.get('/orders/:id/slip', (req, res) => {
  const order = db.prepare(`
    SELECT ro.*, ri.name as item_name, ri.sku as item_sku, ri.barcode as item_barcode,
           ri.size as item_size, ri.color as item_color, ri.category as item_category
    FROM rental_orders ro
    JOIN rental_items ri ON ro.rental_item_id = ri.id
    WHERE ro.id = ?
  `).get(req.params.id);

  if (!order) return res.status(404).json({ error: 'Rental order not found' });

  const store = {
    name: getSetting('STORE_NAME', 'Aura Fashion Boutique'),
    address: getSetting('STORE_ADDRESS', 'Shop 12, Fashion Street, M.I. Road, Jaipur, Rajasthan 302001'),
    phone: getSetting('STORE_PHONE', '+91 98765 43210'),
    footer_text: getSetting('FOOTER_TEXT', 'Thank you for choosing our boutique!')
  };

  res.json({
    bill_title: 'Rental Agreement & Receipt',
    store,
    order
  });
});

// ── POST /api/rentals/orders — Book a new rental order ──
router.post('/orders', (req, res) => {
  const {
    rental_item_id,
    customer_name,
    customer_phone,
    customer_id,
    rent_date,
    due_date,
    pricing_mode,
    final_rent,
    rent_override_reason,
    supervisor_pin,
    advance_paid = 0,
    notes
  } = req.body;

  if (!rental_item_id || !customer_name || !customer_phone || !rent_date || !due_date) {
    return res.status(400).json({ error: 'Required: rental_item_id, customer_name, customer_phone, rent_date, due_date' });
  }

  const item = db.prepare('SELECT * FROM rental_items WHERE id = ?').get(rental_item_id);
  if (!item) return res.status(404).json({ error: 'Rental item not found' });
  if (item.status === 'rented') {
    return res.status(400).json({ error: `Item "${item.name}" is currently on rent and unavailable` });
  }

  const mode = pricing_mode || item.pricing_mode_default || 'PER_EVENT';
  if (!['PER_DAY', 'PER_EVENT'].includes(mode)) {
    return res.status(400).json({ error: 'Pricing mode must be PER_DAY or PER_EVENT' });
  }

  const countPickupDay = String(getSetting('RENTAL_COUNT_PICKUP_DAY', '1')) === '1';
  const billedDays = calculateRentalDays(rent_date, due_date, countPickupDay);

  let appliedRate = 0;
  let calculatedRent = 0;

  if (mode === 'PER_DAY') {
    appliedRate = Number(item.rent_per_day) || 0;
    calculatedRent = Math.round(appliedRate * billedDays * 100) / 100;
  } else {
    appliedRate = Number(item.event_rent) || 0;
    calculatedRent = appliedRate;
  }

  const targetFinalRent = final_rent !== undefined && final_rent !== null ? Number(final_rent) : calculatedRent;
  let approvedBy = null;

  // Validate rent override if staff altered the rent
  if (Math.abs(targetFinalRent - calculatedRent) > 0.01) {
    if (!rent_override_reason || !rent_override_reason.trim()) {
      return res.status(400).json({
        error: `Price change detected from ₹${calculatedRent} to ₹${targetFinalRent}. A reason is required.`
      });
    }

    const pinThreshold = Number(getSetting('RENT_OVERRIDE_PIN_THRESHOLD', 500));
    if (Math.abs(targetFinalRent - calculatedRent) > pinThreshold) {
      const approval = checkSupervisorApproval(supervisor_pin, req.cashier);
      if (!approval.approved) {
        return res.status(403).json({ error: approval.error });
      }
      approvedBy = approval.approved_by;
    }
  }

  const orderNumber = generateRentalOrderNumber();
  const deposit = Number(item.deposit_amount) || 0;

  const bookTxn = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO rental_orders (
        order_number, rental_item_id, customer_name, customer_phone, customer_id,
        rent_date, due_date, pricing_mode, applied_rate, billed_days,
        calculated_rent, final_rent, rent_override_reason, rent_override_approved_by,
        deposit_amount, advance_paid, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      orderNumber, item.id, customer_name.trim(), customer_phone.trim(), customer_id || null,
      rent_date, due_date, mode, appliedRate, billedDays,
      calculatedRent, targetFinalRent, rent_override_reason || null, approvedBy,
      deposit, Number(advance_paid) || 0, notes || null
    );

    // Update item status to rented
    db.prepare("UPDATE rental_items SET status = 'rented' WHERE id = ?").run(item.id);

    return result.lastInsertRowid;
  });

  const orderId = bookTxn();
  const createdOrder = db.prepare(`
    SELECT ro.*, ri.name as item_name, ri.sku as item_sku, ri.barcode as item_barcode
    FROM rental_orders ro
    JOIN rental_items ri ON ro.rental_item_id = ri.id
    WHERE ro.id = ?
  `).get(orderId);

  logAudit({
    cashier_id: req.cashier?.id,
    cashier_name: req.cashier?.name,
    action: 'book_rental_order',
    entity_type: 'rental_order',
    entity_id: orderId,
    details: { orderNumber, customer_name, final_rent: targetFinalRent, mode, billedDays }
  });

  res.status(201).json(createdOrder);
});

// ── POST /api/rentals/orders/:id/return — Process garment return, calculate late fee & deposit refund ──
router.post('/orders/:id/return', (req, res) => {
  const order = db.prepare('SELECT * FROM rental_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Rental order not found' });
  if (order.status === 'returned') {
    return res.status(400).json({ error: 'Rental order has already been returned' });
  }

  const item = db.prepare('SELECT * FROM rental_items WHERE id = ?').get(order.rental_item_id);
  if (!item) return res.status(404).json({ error: 'Rental item not found' });

  const todayStr = new Date().toISOString().slice(0, 10);
  const returnDate = req.body.actual_return_date || todayStr;

  const dueDate = new Date(order.due_date);
  const actualDate = new Date(returnDate);

  let extraDays = 0;
  let lateFee = 0;
  let earlyRefund = 0;

  // 1. Late fee check if returned past due date
  if (actualDate > dueDate) {
    const diffTime = actualDate.getTime() - dueDate.getTime();
    extraDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    if (order.pricing_mode === 'PER_DAY') {
      const lateRate = Number(item.late_fee_per_day) > 0 ? Number(item.late_fee_per_day) : order.applied_rate;
      lateFee = Math.round(extraDays * lateRate * 100) / 100;
    } else {
      // PER_EVENT late fee
      const eventDays = Number(item.event_days) || 3;
      const lateRate = Number(item.late_fee_per_day) > 0 ? Number(item.late_fee_per_day) : Math.round((order.applied_rate / eventDays) * 100) / 100;
      lateFee = Math.round(extraDays * lateRate * 100) / 100;
    }
  }

  // 2. Early return check (pro-rated refund for PER_DAY only, if owner turned setting ON)
  const allowEarlyRefund = String(getSetting('RENTAL_EARLY_RETURN_REFUND', '0')) === '1';
  if (actualDate < dueDate && allowEarlyRefund && order.pricing_mode === 'PER_DAY') {
    const countPickupDay = String(getSetting('RENTAL_COUNT_PICKUP_DAY', '1')) === '1';
    const usedDays = calculateRentalDays(order.rent_date, returnDate, countPickupDay);
    const expectedCost = Math.round(usedDays * order.applied_rate * 100) / 100;
    earlyRefund = Math.max(0, Math.round((order.final_rent - expectedCost) * 100) / 100);
  }

  // 3. Deposit Refund = Deposit - Late Fee + Early Refund
  const depositRefunded = Math.max(0, Math.round((order.deposit_amount - lateFee + earlyRefund) * 100) / 100);

  const returnTxn = db.transaction(() => {
    db.prepare(`
      UPDATE rental_orders SET
        status = 'returned',
        actual_return_date = ?,
        extra_days = ?,
        late_fee = ?,
        early_refund = ?,
        deposit_refunded = ?,
        returned_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(returnDate, extraDays, lateFee, earlyRefund, depositRefunded, order.id);

    // Free up garment back to available
    db.prepare("UPDATE rental_items SET status = 'available' WHERE id = ?").run(item.id);
  });

  returnTxn();

  const updatedOrder = db.prepare(`
    SELECT ro.*, ri.name as item_name, ri.sku as item_sku
    FROM rental_orders ro
    JOIN rental_items ri ON ro.rental_item_id = ri.id
    WHERE ro.id = ?
  `).get(order.id);

  logAudit({
    cashier_id: req.cashier?.id,
    cashier_name: req.cashier?.name,
    action: 'return_rental_order',
    entity_type: 'rental_order',
    entity_id: order.id,
    details: { extraDays, lateFee, earlyRefund, depositRefunded }
  });

  res.json({
    success: true,
    message: `Rental order ${order.order_number} returned successfully.`,
    order: updatedOrder
  });
});

// ══════════════════════════════════════════════════════════════════════════
// RENTAL INCOME REPORT ENDPOINT
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/rentals/reports/income — Income report split by PER_DAY vs PER_EVENT ──
router.get('/reports/income', requireRole('supervisor'), (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);

  const orders = db.prepare(`
    SELECT ro.*, ri.name as item_name, ri.category as item_category
    FROM rental_orders ro
    JOIN rental_items ri ON ro.rental_item_id = ri.id
    WHERE date(ro.created_at) BETWEEN ? AND ?
    ORDER BY ro.id DESC
  `).all(from, to);

  let perDayCount = 0;
  let perDayRevenue = 0;
  let perEventCount = 0;
  let perEventRevenue = 0;
  let totalLateFees = 0;
  let totalEarlyRefunds = 0;
  let totalDepositsHeld = 0;
  let totalDepositsRefunded = 0;

  for (const o of orders) {
    const rent = Number(o.final_rent) || 0;
    const late = Number(o.late_fee) || 0;
    const early = Number(o.early_refund) || 0;
    const dep = Number(o.deposit_amount) || 0;
    const depRef = Number(o.deposit_refunded) || 0;

    totalLateFees += late;
    totalEarlyRefunds += early;
    totalDepositsHeld += dep;
    totalDepositsRefunded += depRef;

    if (o.pricing_mode === 'PER_DAY') {
      perDayCount++;
      perDayRevenue += rent;
    } else {
      perEventCount++;
      perEventRevenue += rent;
    }
  }

  const totalRentalRevenue = Math.round((perDayRevenue + perEventRevenue + totalLateFees - totalEarlyRefunds) * 100) / 100;

  res.json({
    from,
    to,
    summary: {
      per_day_orders: perDayCount,
      per_day_revenue: Math.round(perDayRevenue * 100) / 100,
      per_event_orders: perEventCount,
      per_event_revenue: Math.round(perEventRevenue * 100) / 100,
      total_late_fees: Math.round(totalLateFees * 100) / 100,
      total_early_refunds: Math.round(totalEarlyRefunds * 100) / 100,
      net_rental_income: totalRentalRevenue,
      total_deposits_held: Math.round(totalDepositsHeld * 100) / 100,
      total_deposits_refunded: Math.round(totalDepositsRefunded * 100) / 100,
      total_orders: orders.length
    },
    orders
  });
});

module.exports = router;
