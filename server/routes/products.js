const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../utils/auth');

// GET /api/products/scan/:barcode
router.get('/scan/:barcode', (req, res) => {
  const product = db.prepare(
    'SELECT * FROM products WHERE barcode = ? AND is_active = 1'
  ).get(req.params.barcode);

  if (!product) {
    return res.status(404).json({ error: 'Item not found — try manual entry' });
  }

  if (product.stock_qty <= 0) {
    return res.json({ ...product, warning: 'Item is out of stock' });
  }

  res.json(product);
});

// GET /api/products/search?q=
router.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1) {
    return res.status(400).json({ error: 'Search query required' });
  }

  const products = db.prepare(
    'SELECT * FROM products WHERE is_active = 1 AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?) LIMIT 20'
  ).all(`%${q}%`, `%${q}%`, `%${q}%`);

  res.json(products);
});

// GET /api/products — list all
router.get('/', (req, res) => {
  const products = db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY category, name').all();
  res.json(products);
});

// ── POST /api/products — Create product (supervisor only) ──
router.post('/', requireRole('supervisor'), (req, res) => {
  const { sku, barcode, name, category, mrp, selling_price, hsn_code, tax_rate = 5, stock_qty = 0, unit = 'pcs' } = req.body;

  if (!sku || !barcode || !name || !category || mrp === undefined || mrp === null || selling_price === undefined || selling_price === null) {
    return res.status(400).json({ error: 'Required fields: sku, barcode, name, category, mrp, selling_price' });
  }

  // Check uniqueness
  const existingSku = db.prepare('SELECT id FROM products WHERE sku = ?').get(sku);
  if (existingSku) return res.status(409).json({ error: `SKU "${sku}" already exists` });

  const existingBarcode = db.prepare('SELECT id FROM products WHERE barcode = ?').get(barcode);
  if (existingBarcode) return res.status(409).json({ error: `Barcode "${barcode}" already exists` });

  const result = db.prepare(
    'INSERT INTO products (sku, barcode, name, category, mrp, selling_price, hsn_code, tax_rate, stock_qty, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(sku, barcode, name, category, mrp, selling_price, hsn_code || null, tax_rate, stock_qty, unit);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(product);
});

// ── PUT /api/products/:id — Update product (supervisor only) ──
router.put('/:id', requireRole('supervisor'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const { name, category, mrp, selling_price, hsn_code, tax_rate, unit } = req.body;

  db.prepare(`
    UPDATE products SET
      name = COALESCE(?, name),
      category = COALESCE(?, category),
      mrp = COALESCE(?, mrp),
      selling_price = COALESCE(?, selling_price),
      hsn_code = COALESCE(?, hsn_code),
      tax_rate = COALESCE(?, tax_rate),
      unit = COALESCE(?, unit)
    WHERE id = ?
  `).run(name || null, category || null, mrp ?? null, selling_price ?? null, hsn_code || null, tax_rate ?? null, unit || null, req.params.id);

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ── DELETE /api/products/:id — Soft-delete product (supervisor only) ──
router.delete('/:id', requireRole('supervisor'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: `Product "${product.name}" deactivated` });
});

// ── PUT /api/products/:id/stock — Adjust stock (supervisor only) ──
router.put('/:id/stock', requireRole('supervisor'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const { adjustment, set: setQty } = req.body;

  if (setQty !== undefined && setQty !== null) {
    // Absolute set
    if (setQty < 0) return res.status(400).json({ error: 'Stock cannot be negative' });
    db.prepare('UPDATE products SET stock_qty = ? WHERE id = ?').run(setQty, req.params.id);
  } else if (adjustment !== undefined && adjustment !== null) {
    // Relative adjustment
    const newQty = product.stock_qty + adjustment;
    if (newQty < 0) return res.status(400).json({ error: `Adjustment would result in negative stock (current: ${product.stock_qty})` });
    db.prepare('UPDATE products SET stock_qty = ? WHERE id = ?').run(newQty, req.params.id);
  } else {
    return res.status(400).json({ error: 'Provide "adjustment" (relative) or "set" (absolute) value' });
  }

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(updated);
});

module.exports = router;
