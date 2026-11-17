const JsBarcode = require('jsbarcode');
const { DOMImplementation, XMLSerializer } = require('@xmldom/xmldom');

/**
 * Generate a standalone Code128 SVG string for any barcode.
 * Includes quiet zones and human-readable text below.
 */
function generateBarcodeSvg(barcode, options = {}) {
  if (!barcode || !String(barcode).trim()) {
    throw new Error('Barcode cannot be empty');
  }

  const cleanBarcode = String(barcode).trim();
  const xmlDoc = new DOMImplementation().createDocument('http://www.w3.org/2000/svg', 'svg', null);
  const svgNode = xmlDoc.documentElement;

  JsBarcode(svgNode, cleanBarcode, {
    xmlDocument: xmlDoc,
    format: options.format || 'CODE128',
    displayValue: options.displayValue !== undefined ? options.displayValue : true,
    font: 'monospace',
    fontSize: options.fontSize || 12,
    textMargin: options.textMargin || 2,
    margin: options.margin !== undefined ? options.margin : 10, // quiet zone
    width: options.width || 1.6,
    height: options.height || 36,
    lineColor: options.lineColor || '#000000',
    background: options.background || '#ffffff',
    ...options
  });

  const serializer = new XMLSerializer();
  return serializer.serializeToString(svgNode);
}

module.exports = { generateBarcodeSvg };
