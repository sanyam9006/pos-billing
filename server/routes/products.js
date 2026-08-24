const express = require('express');
const router = express.Router();
const db = require('../db');

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

module.exports = router;
