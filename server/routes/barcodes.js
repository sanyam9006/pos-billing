const express = require('express');
const router = express.Router();
const db = require('../db');
const {
  generateNextBarcodes,
  validateBarcode,
  generateBarcodeSvg,
  isValidEan13
} = require('../utils/barcode');

/**
 * POST /api/barcodes/next
 * Generates the next sequential unique 13-digit EAN-13 barcode starting with 2.
 */
router.post('/next', (req, res) => {
  try {
    const barcode = generateNextBarcodes(db, 1);
    res.json({ barcode });
  } catch (err) {
    res.status(500).json({ error: 'Failed to allocate barcode: ' + err.message });
  }
});

/**
 * POST /api/barcodes/batch
 * Allocates a batch of sequential unique EAN-13 barcodes (e.g. for variant matrices).
 */
router.post('/batch', (req, res) => {
  const count = parseInt(req.body.count, 10);
  if (!count || count < 1) {
    return res.status(400).json({ error: 'Count must be a positive integer' });
  }
  if (count > 500) {
    return res.status(400).json({ error: 'Batch limit is 500 barcodes per request' });
  }

  try {
    const barcodes = generateNextBarcodes(db, count);
    res.json({ barcodes: Array.isArray(barcodes) ? barcodes : [barcodes] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to allocate barcode batch: ' + err.message });
  }
});

/**
 * POST /api/barcodes/validate
 * Validates a barcode for uniqueness and check-digit validity.
 */
router.post('/validate', (req, res) => {
  const { barcode, exclude_product_id, exclude_rental_id } = req.body;
  const result = validateBarcode(db, barcode, {
    excludeProductId: exclude_product_id,
    excludeRentalId: exclude_rental_id
  });

  if (!result.valid) {
    return res.status(409).json(result);
  }

  res.json(result);
});

/**
 * POST /api/barcodes/tag-preview
 * Generates standalone SVG for barcode tag preview or printing.
 */
router.post('/tag-preview', (req, res) => {
  const { barcode, format } = req.body;
  if (!barcode) return res.status(400).json({ error: 'Barcode is required' });

  try {
    const svg = generateBarcodeSvg(barcode, { format });
    res.json({ svg, is_ean13: isValidEan13(barcode) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
