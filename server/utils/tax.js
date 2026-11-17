/**
 * Tax computation engine for Indian Clothing Boutique (Tax-Inclusive, Per-Piece Slab)
 *
 * Applicable Indian GST Law (Notification No. 15/2021-Central Tax (Rate), HSN 61/62/63):
 * - Per-piece sale value <= Rs 2,500: 5% GST
 * - Per-piece sale value > Rs 2,500: 18% GST
 *
 * Strict Boutique Retail Principle:
 * - Customer pays ONLY the MRP/tag price. Tax is NEVER added on top.
 * - Grand Total = sum(selling_price * qty) - discounts.
 * - Embedded GST is extracted for accounting/invoices: tax = price - price / (1 + rate).
 *
 * Edge Case Note for CA:
 * - Between Rs 2,625 and Rs 2,950: An inclusive price of Rs 2,625 gives Rs 2,500 taxable value at 5%.
 *   Setting `SLAB_BASED_ON` configures whether the slab threshold is evaluated on TAG_PRICE or TAXABLE_VALUE.
 */

const db = require('../db');

function getSetting(key, fallback) {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (row && row.value !== undefined && row.value !== null) {
      return row.value;
    }
  } catch (_) {}
  return process.env[key] !== undefined ? process.env[key] : fallback;
}

function getGarmentTaxRate(product = {}, effectivePiecePrice = 0) {
  const threshold = Number(getSetting('GARMENT_TAX_THRESHOLD', 2500));
  const rateLow = Number(getSetting('DEFAULT_GST_RATE_LOW', 5.0));
  const rateHigh = Number(getSetting('DEFAULT_GST_RATE_HIGH', 18.0));
  const slabRule = getSetting('SLAB_BASED_ON', 'TAG_PRICE');

  // Apparel / Garment detection: HSN starting with 61, 62, 63 or clothing categories
  const hsn = String(product.hsn_code || '');
  const category = String(product.category || '').toLowerCase();
  const name = String(product.name || '').toLowerCase();

  const isGarment = /^6[123]/.test(hsn) ||
    /apparel|garment|clothing|wear|kurti|saree|suit|dress|co-ord|lehenga|top|shirt|trousers|bottom|dupatta/i.test(category) ||
    /kurti|saree|suit|dress|co-ord|lehenga|anarkali|chanderi|mulmul|silk|cotton|linen/i.test(name);

  if (!isGarment && product.tax_rate !== undefined && product.tax_rate !== null) {
    return Number(product.tax_rate);
  }

  // Determine rate based on configured rule
  if (slabRule === 'TAXABLE_VALUE') {
    // CA edge-case approach: check if taxable value at low rate (5%) would be <= threshold
    const hypotheticalTaxable = effectivePiecePrice / (1 + rateLow / 100);
    return hypotheticalTaxable <= threshold ? rateLow : rateHigh;
  }

  // Default Standard Retail Practice: based on tag/effective selling price
  return effectivePiecePrice <= threshold ? rateLow : rateHigh;
}

/**
 * Calculate item tax and line total strictly tax-inclusive using integer paise
 */
function calculateInclusiveTax(sellingPrice, qty = 1, discount = 0, product = {}, isInterstate = false) {
  const quantity = Math.max(1, parseInt(qty, 10) || 1);
  const unitPrice = Number(sellingPrice) || 0;
  const itemDiscount = Math.max(0, Number(discount) || 0);

  // Line total in paise (customer pays strictly this amount)
  const lineTotalPaise = Math.max(0, Math.round((unitPrice * quantity - itemDiscount) * 100));
  const lineTotal = lineTotalPaise / 100;

  // Post-discount effective price per piece to determine GST slab
  const effectivePiecePrice = quantity > 0 ? (lineTotal / quantity) : unitPrice;
  const taxRate = getGarmentTaxRate(product, effectivePiecePrice);

  // Extract embedded GST
  const taxablePaise = Math.round(lineTotalPaise / (1 + taxRate / 100));
  const taxIncludedPaise = lineTotalPaise - taxablePaise;

  const taxableValue = taxablePaise / 100;
  const taxIncluded = taxIncludedPaise / 100;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (isInterstate) {
    igst = taxIncluded;
  } else {
    const cgstPaise = Math.round(taxIncludedPaise / 2);
    const sgstPaise = taxIncludedPaise - cgstPaise;
    cgst = cgstPaise / 100;
    sgst = sgstPaise / 100;
  }

  return {
    unitPrice,
    quantity,
    discount: itemDiscount,
    lineTotal,
    effectivePiecePrice,
    taxRate,
    taxableValue,
    taxIncluded,
    tax: taxIncluded, // alias for backward-compatibility
    cgst,
    sgst,
    igst
  };
}

module.exports = {
  getSetting,
  getGarmentTaxRate,
  calculateInclusiveTax,
  calculateItemTaxAndTotal: (product, qty = 1) => calculateInclusiveTax(product.selling_price || product.mrp, qty, 0, product)
};
