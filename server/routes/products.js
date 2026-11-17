const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../utils/auth');
const { logAudit } = require('../utils/audit');

function sanitizeProduct(p) {
  if (!p) return p;
  const { tax_rate, hsn_code, ...rest } = p;
  return rest;
}

// GET /api/products/scan/:barcode
router.get('/scan/:barcode', (req, res) => {
  const product = db.prepare(
    'SELECT * FROM products WHERE barcode = ? AND is_active = 1'
  ).get(req.params.barcode);

  if (!product) {
    return res.status(404).json({ error: 'Item not found — try manual entry' });
  }

  const clean = sanitizeProduct(product);
  if (product.stock_qty <= 0) {
    return res.json({ ...clean, warning: 'Item is out of stock' });
  }

  res.json(clean);
});

// GET /api/products/search?q=
router.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1) {
    return res.status(400).json({ error: 'Search query required' });
  }

  const products = db.prepare(`
    SELECT * FROM products
    WHERE is_active = 1 AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR variant_size LIKE ? OR variant_color LIKE ?)
    LIMIT 30
  `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);

  res.json(products.map(sanitizeProduct));
});

// GET /api/products — list all
router.get('/', (req, res) => {
  const products = db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY category, name, variant_size').all();
  res.json(products.map(sanitizeProduct));
});

// ── POST /api/products/batch — Bulk create products / matrix variants (supervisor only) ──
router.post('/batch', requireRole('supervisor'), (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Expected an array of products' });
  }

  const checkSku = db.prepare('SELECT id FROM products WHERE sku = ?');
  const checkBarcode = db.prepare('SELECT id FROM products WHERE barcode = ?');

  const seenSkus = new Set();
  const seenBarcodes = new Set();

  for (const p of products) {
    if (!p.sku || !p.barcode || !p.name || !p.category || p.mrp === undefined || p.mrp === null || p.selling_price === undefined || p.selling_price === null) {
      return res.status(400).json({ error: `Missing required fields in item: ${p.sku || 'unnamed'}` });
    }
    if (seenSkus.has(p.sku) || checkSku.get(p.sku)) {
      return res.status(409).json({ error: `Duplicate SKU: ${p.sku}` });
    }
    if (seenBarcodes.has(p.barcode) || checkBarcode.get(p.barcode)) {
      return res.status(409).json({ error: `Duplicate Barcode: ${p.barcode}` });
    }
    seenSkus.add(p.sku);
    seenBarcodes.add(p.barcode);
  }

  const insertProduct = db.prepare(`
    INSERT INTO products (sku, barcode, name, category, mrp, selling_price, hsn_code, tax_rate, stock_qty, unit, variant_size, variant_color, cost_price)
    VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?)
  `);

  const createdIds = [];
  const insertAll = db.transaction((items) => {
    for (const p of items) {
      const result = insertProduct.run(
        p.sku,
        p.barcode,
        p.name,
        p.category,
        p.mrp,
        p.selling_price,
        p.stock_qty ?? 0,
        p.unit || 'pcs',
        p.variant_size || null,
        p.variant_color || null,
        p.cost_price || 0
      );
      createdIds.push(result.lastInsertRowid);
    }
  });

  insertAll(products);

  logAudit({
    cashier_id: req.cashier.id,
    cashier_name: req.cashier.name,
    action: 'batch_create_variants',
    entity_type: 'product_batch',
    details: { count: createdIds.length }
  });

  res.status(201).json({
    success: true,
    count: createdIds.length,
    message: `Successfully created ${createdIds.length} variants`
  });
});

// ── POST /api/products — Create product (supervisor only) ──
router.post('/', requireRole('supervisor'), (req, res) => {
  const {
    sku, barcode, name, category, mrp, selling_price,
    stock_qty = 0, unit = 'pcs', variant_size, variant_color, cost_price = 0
  } = req.body;

  if (!sku || !barcode || !name || !category || mrp === undefined || mrp === null || selling_price === undefined || selling_price === null) {
    return res.status(400).json({ error: 'Required fields: sku, barcode, name, category, mrp, selling_price' });
  }

  const existingSku = db.prepare('SELECT id FROM products WHERE sku = ?').get(sku);
  if (existingSku) return res.status(409).json({ error: `SKU "${sku}" already exists` });

  const existingBarcode = db.prepare('SELECT id FROM products WHERE barcode = ?').get(barcode);
  if (existingBarcode) return res.status(409).json({ error: `Barcode "${barcode}" already exists` });

  const result = db.prepare(`
    INSERT INTO products (
      sku, barcode, name, category, mrp, selling_price, hsn_code,
      tax_rate, stock_qty, unit, variant_size, variant_color, cost_price
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?)
  `).run(
    sku, barcode, name, category, mrp, selling_price,
    stock_qty, unit,
    variant_size || null, variant_color || null, Number(cost_price) || 0
  );

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);

  logAudit({
    cashier_id: req.cashier.id,
    cashier_name: req.cashier.name,
    action: 'create_product',
    entity_type: 'product',
    entity_id: product.id,
    details: { sku, name, selling_price, mrp }
  });

  res.status(201).json(sanitizeProduct(product));
});

// ── PUT /api/products/:id — Update product (supervisor only) ──
router.put('/:id', requireRole('supervisor'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const { name, category, mrp, selling_price, unit, variant_size, variant_color, cost_price } = req.body;

  db.prepare(`
    UPDATE products SET
      name = COALESCE(?, name),
      category = COALESCE(?, category),
      mrp = COALESCE(?, mrp),
      selling_price = COALESCE(?, selling_price),
      hsn_code = NULL,
      tax_rate = 0,
      unit = COALESCE(?, unit),
      variant_size = COALESCE(?, variant_size),
      variant_color = COALESCE(?, variant_color),
      cost_price = COALESCE(?, cost_price)
    WHERE id = ?
  `).run(
    name || null, category || null, mrp ?? null, selling_price ?? null,
    unit || null,
    variant_size ?? null, variant_color ?? null, cost_price ?? null,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);

  logAudit({
    cashier_id: req.cashier.id,
    cashier_name: req.cashier.name,
    action: 'update_product',
    entity_type: 'product',
    entity_id: product.id,
    details: { old: product, updated }
  });

  res.json(sanitizeProduct(updated));
});

// ── DELETE /api/products/:id — Soft-delete product (supervisor only) ──
router.delete('/:id', requireRole('supervisor'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(req.params.id);

  logAudit({
    cashier_id: req.cashier.id,
    cashier_name: req.cashier.name,
    action: 'deactivate_product',
    entity_type: 'product',
    entity_id: product.id,
    details: { name: product.name }
  });

  res.json({ success: true, message: `Product "${product.name}" deactivated` });
});

// ── PUT /api/products/:id/stock — Adjust stock (supervisor only) ──
router.put('/:id/stock', requireRole('supervisor'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const { adjustment, set: setQty, reason } = req.body;

  let newQty;
  if (setQty !== undefined && setQty !== null) {
    if (setQty < 0) return res.status(400).json({ error: 'Stock cannot be negative' });
    newQty = Number(setQty);
  } else if (adjustment !== undefined && adjustment !== null) {
    newQty = product.stock_qty + Number(adjustment);
    if (newQty < 0) return res.status(400).json({ error: `Adjustment would result in negative stock (current: ${product.stock_qty})` });
  } else {
    return res.status(400).json({ error: 'Provide "adjustment" (relative) or "set" (absolute) value' });
  }

  db.prepare('UPDATE products SET stock_qty = ? WHERE id = ?').run(newQty, req.params.id);
  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);

  logAudit({
    cashier_id: req.cashier.id,
    cashier_name: req.cashier.name,
    action: 'adjust_stock',
    entity_type: 'product',
    entity_id: product.id,
    details: { old_qty: product.stock_qty, new_qty: newQty, reason }
  });

  res.json(sanitizeProduct(updated));
});

module.exports = router;
