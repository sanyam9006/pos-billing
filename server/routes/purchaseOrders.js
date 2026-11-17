const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../utils/auth');
const { logAudit } = require('../utils/audit');

// Generate unique PO number: PO-YYYYMM-XXXX
function generatePoNumber() {
  const now = new Date();
  const ym = now.toISOString().slice(0, 7).replace('-', '');
  const countRow = db.prepare("SELECT COUNT(*) as count FROM purchase_orders WHERE po_number LIKE ?").get(`PO-${ym}-%`);
  const seq = String((countRow ? countRow.count : 0) + 1).padStart(4, '0');
  return `PO-${ym}-${seq}`;
}

// ── GET /api/purchase-orders — List all purchase orders (supervisor only) ──
router.get('/', requireRole('supervisor'), (req, res) => {
  const pos = db.prepare(`
    SELECT po.*, s.name as supplier_name, s.phone as supplier_phone,
      (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) as item_count,
      (SELECT SUM(quantity_ordered) FROM purchase_order_items WHERE po_id = po.id) as total_units_ordered,
      (SELECT SUM(quantity_received) FROM purchase_order_items WHERE po_id = po.id) as total_units_received
    FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id = s.id
    ORDER BY po.id DESC
  `).all();
  res.json(pos);
});

// ── GET /api/purchase-orders/:id — Get single PO with items (supervisor only) ──
router.get('/:id', requireRole('supervisor'), (req, res) => {
  const po = db.prepare(`
    SELECT po.*, s.name as supplier_name, s.contact_person, s.phone as supplier_phone, s.email as supplier_email, s.gstin as supplier_gstin
    FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id = s.id
    WHERE po.id = ?
  `).get(req.params.id);

  if (!po) return res.status(404).json({ error: 'Purchase order not found' });

  const items = db.prepare(`
    SELECT poi.*, p.name as product_name, p.sku, p.barcode, p.stock_qty as current_stock,
           p.variant_size, p.variant_color, p.unit
    FROM purchase_order_items poi
    JOIN products p ON poi.product_id = p.id
    WHERE poi.po_id = ?
  `).all(po.id);

  res.json({ ...po, items });
});

// ── POST /api/purchase-orders — Create new purchase order (supervisor only) ──
router.post('/', requireRole('supervisor'), (req, res) => {
  const { supplier_id, items, notes, status = 'ordered' } = req.body;

  if (!supplier_id) return res.status(400).json({ error: 'Supplier is required' });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Purchase order must have at least one item' });
  }

  const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(supplier_id);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  const poNumber = generatePoNumber();
  let totalCost = 0;

  for (const item of items) {
    if (!item.product_id || !item.quantity_ordered || item.cost_price === undefined) {
      return res.status(400).json({ error: 'Each item requires product_id, quantity_ordered, and cost_price' });
    }
    totalCost += Number(item.quantity_ordered) * Number(item.cost_price);
  }

  const insertPo = db.prepare(`
    INSERT INTO purchase_orders (po_number, supplier_id, status, total_cost, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO purchase_order_items (po_id, product_id, quantity_ordered, quantity_received, cost_price)
    VALUES (?, ?, ?, ?, ?)
  `);

  let poId;
  const createTxn = db.transaction(() => {
    const result = insertPo.run(poNumber, supplier_id, status, totalCost, notes || null);
    poId = result.lastInsertRowid;

    for (const item of items) {
      insertItem.run(
        poId,
        item.product_id,
        item.quantity_ordered,
        0,
        item.cost_price
      );
    }
  });

  createTxn();

  logAudit({
    cashier_id: req.cashier.id,
    cashier_name: req.cashier.name,
    action: 'create_purchase_order',
    entity_type: 'purchase_order',
    entity_id: poId,
    details: { po_number: poNumber, totalCost, supplier_id }
  });

  const createdPo = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId);
  res.status(201).json(createdPo);
});

// ── POST /api/purchase-orders/:id/receive — Receive stock from PO (idempotent & partial support) ──
router.post('/:id/receive', requireRole('supervisor'), (req, res) => {
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Purchase order not found' });
  if (po.status === 'received') {
    return res.status(400).json({ error: 'Purchase order has already been fully received' });
  }

  const { items } = req.body; // array of: { id (poi.id), received_now (or quantity_received total) }
  const poItems = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(po.id);

  let anyNewStockReceived = false;
  let allFullyReceived = true;

  const receiveTxn = db.transaction(() => {
    for (const poi of poItems) {
      let deltaToAdd = 0;
      let newTotalReceived = poi.quantity_received;

      if (Array.isArray(items)) {
        const found = items.find(i => i.id === poi.id);
        if (found) {
          if (found.received_now !== undefined) {
            deltaToAdd = Math.max(0, Number(found.received_now));
            newTotalReceived = poi.quantity_received + deltaToAdd;
          } else if (found.quantity_received !== undefined) {
            newTotalReceived = Math.max(0, Number(found.quantity_received));
            deltaToAdd = Math.max(0, newTotalReceived - poi.quantity_received);
          }
        }
      } else {
        // Full receipt of whatever is remaining
        deltaToAdd = Math.max(0, poi.quantity_ordered - poi.quantity_received);
        newTotalReceived = poi.quantity_ordered;
      }

      if (deltaToAdd > 0) {
        anyNewStockReceived = true;
        // Update purchase order item
        db.prepare('UPDATE purchase_order_items SET quantity_received = ? WHERE id = ?').run(newTotalReceived, poi.id);
        // Increment stock and update cost price on product
        db.prepare('UPDATE products SET stock_qty = stock_qty + ?, cost_price = ? WHERE id = ?')
          .run(deltaToAdd, poi.cost_price, poi.product_id);
      }

      if (newTotalReceived < poi.quantity_ordered) {
        allFullyReceived = false;
      }
    }

    const newStatus = allFullyReceived ? 'received' : 'partially_received';
    db.prepare("UPDATE purchase_orders SET status = ?, received_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(newStatus, po.id);
  });

  receiveTxn();

  logAudit({
    cashier_id: req.cashier.id,
    cashier_name: req.cashier.name,
    action: 'receive_purchase_order',
    entity_type: 'purchase_order',
    entity_id: po.id,
    details: { po_number: po.po_number, anyNewStockReceived, allFullyReceived }
  });

  const updatedPo = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(po.id);
  const updatedItems = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(po.id);

  res.json({
    success: true,
    message: allFullyReceived
      ? `Purchase Order ${updatedPo.po_number} fully received. Stock updated.`
      : `Purchase Order ${updatedPo.po_number} partially received. Stock updated.`,
    po: updatedPo,
    items: updatedItems
  });
});

// ── DELETE /api/purchase-orders/:id — Delete draft or cancelled PO (supervisor only) ──
router.delete('/:id', requireRole('supervisor'), (req, res) => {
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Purchase order not found' });
  if (po.status === 'received' || po.status === 'partially_received') {
    return res.status(400).json({ error: 'Cannot delete a received or partially received purchase order' });
  }

  db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(po.id);
  res.json({ success: true, message: `Purchase order ${po.po_number} deleted` });
});

module.exports = router;
