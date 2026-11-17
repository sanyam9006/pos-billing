// Tax computation helper for retail & boutique apparel

function getGarmentTaxRate(product, effectiveUnitPrice) {
  const threshold = Number(process.env.GARMENT_TAX_THRESHOLD || 1000);
  const isGarment = /apparel|garment|clothing|wear|dress|kurti|saree|shirt|pant|suit|lehenga|top/i.test(product.category || '') ||
                    (product.hsn_code && /^6[123]/.test(product.hsn_code));

  if (isGarment) {
    // Per Indian GST rule: <= threshold -> 5%, > threshold -> 12%
    return effectiveUnitPrice <= threshold ? 5.0 : 12.0;
  }
  return product.tax_rate ?? 5.0;
}

function calculateItemTaxAndTotal(product, qty, overrideTaxMode) {
  const taxMode = overrideTaxMode || process.env.TAX_MODE || 'exclusive';
  const unitPrice = product.selling_price;
  const taxRate = getGarmentTaxRate(product, unitPrice);

  if (taxMode === 'inclusive') {
    // Customer pays exact tag price
    const lineTotal = Math.round(unitPrice * qty * 100) / 100;
    const taxableValue = Math.round((lineTotal / (1 + taxRate / 100)) * 100) / 100;
    const tax = Math.round((lineTotal - taxableValue) * 100) / 100;
    return {
      unitPrice,
      taxRate,
      tax,
      lineTotal,
      taxableValue,
      cgst: Math.round(tax / 2 * 100) / 100,
      sgst: Math.round(tax / 2 * 100) / 100
    };
  } else {
    // Tax added on top
    const taxableValue = Math.round(unitPrice * qty * 100) / 100;
    const tax = Math.round((taxableValue * taxRate / 100) * 100) / 100;
    const lineTotal = Math.round((taxableValue + tax) * 100) / 100;
    return {
      unitPrice,
      taxRate,
      tax,
      lineTotal,
      taxableValue,
      cgst: Math.round(tax / 2 * 100) / 100,
      sgst: Math.round(tax / 2 * 100) / 100
    };
  }
}

module.exports = {
  getGarmentTaxRate,
  calculateItemTaxAndTotal
};
