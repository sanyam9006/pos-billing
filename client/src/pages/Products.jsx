import { useState, useEffect } from 'react'
import { authFetch, formatPrice, getStoreConfig } from '../utils/api'
import { BarcodeSvg, LABEL_SIZES, generateTagPrintHtml, isValidEan13 } from '../utils/barcode'
import ScanPromptModal from '../components/ScanPromptModal'

export default function Products({ cashier }) {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showMatrixModal, setShowMatrixModal] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [showStockModal, setShowStockModal] = useState(null)
  const [showTagModal, setShowTagModal] = useState(null)
  const [selectedProductIds, setSelectedProductIds] = useState([])
  const [showBulkPrintModal, setShowBulkPrintModal] = useState(false)
  const [toast, setToast] = useState(null)
  const isSupervisor = cashier?.role === 'supervisor'

  useEffect(() => { loadProducts() }, [])

  const notify = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const loadProducts = async () => {
    try {
      const res = await authFetch('/api/products')
      const data = await res.json()
      if (res.ok && Array.isArray(data)) {
        setProducts(data)
      } else {
        setProducts([])
        notify(data?.error || 'Failed to load products', 'error')
      }
    } catch {
      setProducts([])
      notify('Failed to load products', 'error')
    }
    setLoading(false)
  }

  const filtered = Array.isArray(products)
    ? products.filter(p => {
        if (!p) return false
        const s = (search || '').toLowerCase()
        return (
          (p.name || '').toLowerCase().includes(s) ||
          (p.sku || '').toLowerCase().includes(s) ||
          (p.category || '').toLowerCase().includes(s) ||
          (p.barcode || '').includes(search)
        )
      })
    : []

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedProductIds(filtered.map(p => p.id))
    } else {
      setSelectedProductIds([])
    }
  }

  const toggleSelectProduct = (id) => {
    setSelectedProductIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleDelete = async (product) => {
    if (!confirm(`Deactivate "${product.name}"?`)) return
    try {
      await authFetch(`/api/products/${product.id}`, { method: 'DELETE' })
      notify(`${product.name} deactivated`)
      loadProducts()
    } catch { notify('Failed to deactivate', 'error') }
  }

  const handleStockAdjust = async (productId, adjustment) => {
    try {
      const res = await authFetch(`/api/products/${productId}/stock`, {
        method: 'PUT',
        body: JSON.stringify({ adjustment: parseInt(adjustment) })
      })
      if (res.ok) {
        notify('Stock updated successfully')
        setShowStockModal(null)
        loadProducts()
      } else {
        const data = await res.json()
        notify(data.error, 'error')
      }
    } catch { notify('Failed to update stock', 'error') }
  }

  const selectedProducts = products.filter(p => selectedProductIds.includes(p.id))

  return (
    <div className="page products-page">
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <div>
          <h1>📦 Product Catalog & Inventory</h1>
          <p className="page-subtitle">{products.length} active products & variants</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {selectedProductIds.length > 0 && (
            <button
              className="btn-primary"
              style={{ background: '#2563eb' }}
              onClick={() => setShowBulkPrintModal(true)}
            >
              🏷️ Print Selected Tags ({selectedProductIds.length})
            </button>
          )}
          {isSupervisor && (
            <>
              <button className="btn-primary" style={{ background: 'var(--accent-secondary)' }} onClick={() => setShowMatrixModal(true)}>
                ⚡ Matrix Variant Generator
              </button>
              <button className="btn-primary" onClick={() => { setEditProduct(null); setShowForm(true) }}>
                + Add Product
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="search-bar-wrapper">
        <span className="search-icon-lg">🔍</span>
        <input
          className="search-bar"
          type="text"
          placeholder="Search by name, SKU, barcode, category, or size..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && <button className="clear-search" onClick={() => setSearch('')}>✕</button>}
      </div>

      {/* Products Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedProductIds.length === filtered.length}
                  onChange={toggleSelectAll}
                  title="Select all"
                />
              </th>
              <th>Product / Variant</th>
              <th>SKU</th>
              <th>Category</th>
              <th>MRP</th>
              <th>Selling Price</th>
              <th>Stock</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const isSelected = selectedProductIds.includes(p.id)
              return (
                <tr key={p.id} className={`${p.stock_qty <= 10 ? 'low-stock-row' : ''} ${isSelected ? 'selected-row' : ''}`}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectProduct(p.id)}
                    />
                  </td>
                  <td>
                    <div className="product-cell">
                      <div className="product-name-cell">{p.name}</div>
                      <div className="product-barcode">
                        <span style={{ fontFamily: 'monospace' }}>{p.barcode}</span>
                        {p.variant_size && <span className="variant-tag size">{p.variant_size}</span>}
                        {p.variant_color && <span className="variant-tag color">{p.variant_color}</span>}
                      </div>
                    </div>
                  </td>
                  <td><code className="sku-code">{p.sku}</code></td>
                  <td><span className="category-badge">{p.category}</span></td>
                  <td className="num">{formatPrice(p.mrp)}</td>
                  <td className="num">{formatPrice(p.selling_price)}</td>
                  <td>
                    <span className={`stock-badge ${p.stock_qty <= 0 ? 'out' : p.stock_qty <= 10 ? 'low' : 'ok'}`}>
                      {p.stock_qty} {p.unit}
                    </span>
                  </td>
                  <td>
                    <div className="action-cell">
                      <button className="icon-btn" title="Print Real Barcode Tag" onClick={() => setShowTagModal(p)}>🏷️</button>
                      {isSupervisor && (
                        <>
                          <button className="icon-btn" title="Edit (Barcode, details)" onClick={() => { setEditProduct(p); setShowForm(true) }}>✏️</button>
                          <button className="icon-btn" title="Adjust Stock" onClick={() => setShowStockModal(p)}>📦</button>
                          <button className="icon-btn danger" title="Deactivate" onClick={() => handleDelete(p)}>🗑️</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="empty-table">{loading ? 'Loading catalog...' : 'No products found'}</div>
        )}
      </div>

      {/* Matrix / Variant Generator Modal */}
      {showMatrixModal && (
        <MatrixGeneratorModal
          onSuccess={(createdVariants) => {
            setShowMatrixModal(false)
            loadProducts()
            if (createdVariants && createdVariants.length > 0) {
              setSelectedProductIds(createdVariants.map(v => v.id))
            }
          }}
          onClose={() => setShowMatrixModal(false)}
          notify={notify}
        />
      )}

      {/* Single Barcode Tag Modal with Code128 */}
      {showTagModal && (
        <BarcodePriceTagModal
          product={showTagModal}
          onClose={() => setShowTagModal(null)}
        />
      )}

      {/* Bulk Barcode Tag Print Modal */}
      {showBulkPrintModal && (
        <BulkBarcodePrintModal
          products={selectedProducts}
          onClose={() => setShowBulkPrintModal(false)}
        />
      )}

      {/* Product Form Modal (With supervisor barcode editing & scan prompt) */}
      {showForm && (
        <ProductFormModal
          product={editProduct}
          cashier={cashier}
          onSave={() => { setShowForm(false); loadProducts() }}
          onClose={() => setShowForm(false)}
          notify={notify}
        />
      )}

      {/* Stock Adjust Modal */}
      {showStockModal && (
        <StockModal
          product={showStockModal}
          onAdjust={handleStockAdjust}
          onClose={() => setShowStockModal(null)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════
// AUTOMATED MATRIX VARIANT GENERATOR (Size × Color)
// ═══════════════════════════════════════════════
function MatrixGeneratorModal({ onSuccess, onClose, notify }) {
  const [baseName, setBaseName] = useState('')
  const [baseSku, setBaseSku] = useState('')
  const [allocatedBarcodes, setAllocatedBarcodes] = useState([])
  const [allocating, setAllocating] = useState(false)
  const [scanSample, setScanSample] = useState('')
  const [category, setCategory] = useState('')
  const [mrp, setMrp] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [stockPerVariant, setStockPerVariant] = useState(10)
  const [showScanner, setShowScanner] = useState(false)

  // Quick preset selections
  const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']
  const COMMON_COLORS = ['Black', 'White', 'Navy Blue', 'Red', 'Pink', 'Green', 'Yellow', 'Beige']

  const [selectedSizes, setSelectedSizes] = useState(['S', 'M', 'L', 'XL'])
  const [selectedColors, setSelectedColors] = useState(['Black', 'Navy Blue', 'Maroon'])
  const [customSize, setCustomSize] = useState('')
  const [customColor, setCustomColor] = useState('')
  const [generating, setGenerating] = useState(false)

  const toggleSize = (size) => {
    setSelectedSizes(prev => prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size])
  }

  const toggleColor = (color) => {
    setSelectedColors(prev => prev.includes(color) ? prev.filter(c => c !== color) : [...prev, color])
  }

  const addCustomSize = () => {
    if (customSize.trim() && !selectedSizes.includes(customSize.trim())) {
      setSelectedSizes(prev => [...prev, customSize.trim().toUpperCase()])
      setCustomSize('')
    }
  }

  const addCustomColor = () => {
    if (customColor.trim() && !selectedColors.includes(customColor.trim())) {
      setSelectedColors(prev => [...prev, customColor.trim()])
      setCustomColor('')
    }
  }

  // Calculate combinations
  const variants = []
  let idx = 0
  for (const color of selectedColors) {
    for (const size of selectedSizes) {
      const colorCode = color.slice(0, 3).toUpperCase()
      const sku = `${baseSku ? baseSku.trim().toUpperCase() : 'SKU'}-${colorCode}-${size}`
      const barcode = allocatedBarcodes[idx] || ''
      const name = `${baseName ? baseName.trim() : 'Product'} (${color} - ${size})`
      variants.push({
        sku,
        barcode,
        name,
        category: category || 'Apparel',
        mrp: parseFloat(mrp) || 0,
        selling_price: parseFloat(sellingPrice) || 0,
        cost_price: parseFloat(costPrice) || 0,
        stock_qty: parseInt(stockPerVariant) || 0,
        unit: 'pcs',
        variant_size: size,
        variant_color: color
      })
      idx++
    }
  }

  const handleAllocateBarcodes = async (neededCount = variants.length) => {
    if (!neededCount || neededCount <= 0) return []
    setAllocating(true)
    try {
      const res = await authFetch('/api/barcodes/batch', {
        method: 'POST',
        body: JSON.stringify({ count: neededCount })
      })
      let data = {}
      try {
        data = await res.json()
      } catch {
        data = { error: 'Server returned unexpected response' }
      }
      if (res.ok && Array.isArray(data.barcodes)) {
        setAllocatedBarcodes(data.barcodes)
        notify(`Allocated ${data.barcodes.length} unique sequential EAN-13 barcodes!`)
        return data.barcodes
      } else {
        notify(data.error || 'Failed to allocate barcodes', 'error')
      }
    } catch (err) {
      console.error('Barcode allocation error:', err)
      notify(err.message || 'Server error allocating barcodes', 'error')
    } finally {
      setAllocating(false)
    }
    return []
  }

  const handleGenerate = async () => {
    if (!baseName || !baseSku || !mrp || !sellingPrice) {
      notify('Please fill base product name, SKU code, MRP, and selling price', 'error')
      return
    }
    if (variants.length === 0) {
      notify('Select at least one size and one color', 'error')
      return
    }

    setGenerating(true)
    try {
      let finalBarcodes = allocatedBarcodes
      if (!finalBarcodes || finalBarcodes.length !== variants.length) {
        finalBarcodes = await handleAllocateBarcodes(variants.length)
        if (!finalBarcodes || finalBarcodes.length !== variants.length) {
          notify('Failed to allocate unique barcodes for all variants', 'error')
          setGenerating(false)
          return
        }
      }

      const productsToCreate = variants.map((v, i) => ({
        ...v,
        barcode: finalBarcodes[i]
      }))

      const res = await authFetch('/api/products/batch', {
        method: 'POST',
        body: JSON.stringify({ products: productsToCreate })
      })
      const data = await res.json()
      if (res.ok) {
        notify(`🎉 Created ${productsToCreate.length} product variants successfully with unique EAN-13 barcodes!`)
        onSuccess(productsToCreate)
      } else {
        notify(data.error || 'Failed to create variants', 'error')
      }
    } catch {
      notify('Server error creating variants', 'error')
    }
    setGenerating(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide-modal matrix-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2>⚡ Automated Batch / Matrix Variant Generator <button className="modal-close" onClick={onClose}>✕</button></h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
          Auto-generate full size & color variant matrices (e.g., S/M/L/XL across 4 colors = 16 individual SKUs with barcodes) in 1 click!
        </p>

        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label>Base Product Name *</label>
            <input placeholder="e.g. Linen Embroidered Kurti" value={baseName} onChange={e => setBaseName(e.target.value)} autoFocus />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Base SKU Prefix *</label>
            <input placeholder="e.g. LEK" value={baseSku} onChange={e => setBaseSku(e.target.value.toUpperCase())} />
          </div>
          <div className="form-group" style={{ flex: 1.5 }}>
            <label>EAN-13 Barcodes ({variants.length} needed)</label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-primary btn-sm"
                style={{ flex: 1, whiteSpace: 'nowrap', padding: '7px 10px', fontSize: '12px' }}
                title="Allocate sequential unique EAN-13 barcodes from counter"
                onClick={() => handleAllocateBarcodes(variants.length)}
                disabled={allocating || variants.length === 0}
              >
                {allocating ? '⏳ Allocating...' : `⚡ Generate ${variants.length} Barcodes`}
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Camera scanner for existing garment barcode"
                aria-label="Camera scanner"
                onClick={() => setShowScanner(true)}
              >
                📷
              </button>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {allocatedBarcodes.length === variants.length && variants.length > 0
                ? `✅ ${allocatedBarcodes.length} unique barcodes ready`
                : scanSample ? `Scanned sample: ${scanSample}` : 'Allocated sequentially from in-store counter'}
            </span>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group"><label>Category *</label><input placeholder="e.g. Women Ethnic" value={category} onChange={e => setCategory(e.target.value)} /></div>
          <div className="form-group"><label>MRP *</label><input type="number" placeholder="1999" value={mrp} onChange={e => setMrp(e.target.value)} /></div>
          <div className="form-group"><label>Selling Price *</label><input type="number" placeholder="1499" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} /></div>
          <div className="form-group"><label>Cost Price</label><input type="number" placeholder="600" value={costPrice} onChange={e => setCostPrice(e.target.value)} /></div>
        </div>

        {/* Sizes Attribute Matrix */}
        <div style={{ margin: '14px 0', padding: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius)' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
            Select Sizes ({selectedSizes.length} selected):
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            {COMMON_SIZES.map(s => (
              <button
                type="button"
                key={s}
                className={`pill-btn ${selectedSizes.includes(s) ? 'active' : ''}`}
                onClick={() => toggleSize(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              placeholder="Add custom size (e.g. 32, Free Size)..."
              value={customSize}
              onChange={e => setCustomSize(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '12px', flex: 1 }}
            />
            <button type="button" className="btn-primary btn-sm" onClick={addCustomSize}>+ Add Size</button>
          </div>
        </div>

        {/* Colors Attribute Matrix */}
        <div style={{ margin: '14px 0', padding: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius)' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
            Select Colors ({selectedColors.length} selected):
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            {COMMON_COLORS.map(c => (
              <button
                type="button"
                key={c}
                className={`pill-btn ${selectedColors.includes(c) ? 'active' : ''}`}
                onClick={() => toggleColor(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              placeholder="Add custom color (e.g. Royal Blue, Peach)..."
              value={customColor}
              onChange={e => setCustomColor(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '12px', flex: 1 }}
            />
            <button type="button" className="btn-primary btn-sm" onClick={addCustomColor}>+ Add Color</button>
          </div>
        </div>

        <div className="form-group" style={{ width: '220px' }}>
          <label>Default Stock Per Variant</label>
          <input type="number" value={stockPerVariant} onChange={e => setStockPerVariant(e.target.value)} />
        </div>

        {/* Live Matrix Preview with Barcodes */}
        {variants.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <strong>Matrix Preview ({variants.length} variants ready):</strong>
            </div>
            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Variant Name</th>
                    <th>Generated SKU</th>
                    <th>Barcode</th>
                    <th>Color</th>
                    <th>Size</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v, i) => (
                    <tr key={i}>
                      <td><strong>{v.name}</strong></td>
                      <td><code>{v.sku}</code></td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          {allocatedBarcodes[i] || (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '12px' }}>
                              ⚡ Auto EAN-13 on create
                            </span>
                          )}
                        </span>
                      </td>
                      <td>{v.variant_color}</td>
                      <td><span className="variant-tag size">{v.variant_size}</span></td>
                      <td className="num">{v.stock_qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="modal-btn secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="modal-btn primary"
            disabled={generating || variants.length === 0}
            onClick={handleGenerate}
          >
            {generating ? '⏳ Generating Variants...' : `🚀 Generate & Save All ${variants.length} Variants`}
          </button>
        </div>
      </div>

      {showScanner && (
        <ScanPromptModal
          title="Scan Sample Garment Barcode"
          onScan={(scanned) => {
            setScanSample(scanned)
            notify(`Scanned sample barcode: ${scanned}`)
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════
// REAL CODE128 BARCODE PRICE TAG MODAL (Single Item)
// ═══════════════════════════════════════════════
function BarcodePriceTagModal({ product, onClose }) {
  const [store, setStore] = useState(null)
  const [labelSize, setLabelSize] = useState('50x25')
  const [printCopies, setPrintCopies] = useState(1)

  useEffect(() => {
    getStoreConfig().then(setStore)
  }, [])

  const printTag = () => {
    const printWindow = window.open('', '_blank', 'width=550,height=650')
    const items = [{ ...product, print_qty: printCopies }]
    const html = generateTagPrintHtml(items, store, labelSize)
    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <h2>🏷️ Barcode Price Tag <button className="modal-close" onClick={onClose}>✕</button></h2>

        {/* Size Selection */}
        <div style={{ display: 'flex', gap: '8px', margin: '12px 0' }}>
          {LABEL_SIZES.map(s => (
            <button
              key={s.id}
              type="button"
              className={`pill-btn ${labelSize === s.id ? 'active' : ''}`}
              onClick={() => setLabelSize(s.id)}
              style={{ fontSize: '11px', padding: '5px 8px' }}
            >
              {s.name.split(' ')[0]} {s.name.includes('A4') ? 'A4' : ''}
            </button>
          ))}
        </div>

        {/* Visual Live Tag Preview */}
        <div
          style={{
            textAlign: 'center',
            padding: '14px',
            border: '1.5px dashed var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--surface)',
            margin: '12px 0'
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {store?.store_name || 'HOUSE OF SADAYA'}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, margin: '4px 0' }}>
            {product.name}
          </div>

          {/* Real Code128 SVG Barcode */}
          <div style={{ margin: '6px auto', background: '#fff', padding: '6px', borderRadius: '4px', display: 'inline-block' }}>
            <BarcodeSvg
              barcode={product.barcode}
              width={labelSize === '38x25' ? 1.2 : 1.5}
              height={labelSize === '38x25' ? 26 : 32}
              fontSize={11}
              margin={8}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px', marginTop: '4px' }}>
            <span>SKU: <strong>{product.sku}</strong></span>
            {product.variant_size && <span>Size: <strong>{product.variant_size}</strong></span>}
            {product.variant_color && <span>Color: <strong>{product.variant_color}</strong></span>}
          </div>

          <div style={{ marginTop: '8px' }}>
            {product.mrp && (
              <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', marginRight: '8px', fontSize: '13px' }}>
                {formatPrice(product.mrp)}
              </span>
            )}
            <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent-secondary)' }}>
              {formatPrice(product.selling_price)}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0' }}>
          <label style={{ fontSize: '13px', fontWeight: 600 }}>Number of copies:</label>
          <input
            type="number"
            min="1"
            max="1000"
            value={printCopies}
            onChange={e => setPrintCopies(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ width: '80px', textAlign: 'center' }}
          />
        </div>

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose}>Close</button>
          <button className="modal-btn primary" onClick={printTag}>🖨️ Print Real Barcode Tag</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// BULK BARCODE PRINT MODAL (Multiple Items)
// ═══════════════════════════════════════════════
function BulkBarcodePrintModal({ products, onClose }) {
  const [store, setStore] = useState(null)
  const [labelSize, setLabelSize] = useState('50x25')
  const [copiesMap, setCopiesMap] = useState({})

  useEffect(() => {
    getStoreConfig().then(setStore)
    const initialCopies = {}
    products.forEach(p => {
      initialCopies[p.id] = 1
    })
    setCopiesMap(initialCopies)
  }, [products])

  const setAllCopies = (val) => {
    const updated = {}
    products.forEach(p => {
      updated[p.id] = val === 'stock' ? Math.max(1, p.stock_qty || 1) : Math.max(1, parseInt(val) || 1)
    })
    setCopiesMap(updated)
  }

  const totalTags = products.reduce((sum, p) => sum + (copiesMap[p.id] || 1), 0)

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=650,height=750')
    const items = products.map(p => ({
      ...p,
      print_qty: copiesMap[p.id] || 1
    }))
    const html = generateTagPrintHtml(items, store, labelSize)
    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
        <h2>🏷️ Bulk Barcode Tag Printing <button className="modal-close" onClick={onClose}>✕</button></h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '14px' }}>
          Printing tags for <strong>{products.length}</strong> selected products ({totalTags} total labels to print)
        </p>

        {/* Stock Layout Selection */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
            SELECT LABEL STOCK FORMAT:
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            {LABEL_SIZES.map(s => (
              <button
                key={s.id}
                type="button"
                className={`pill-btn ${labelSize === s.id ? 'active' : ''}`}
                onClick={() => setLabelSize(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* Quick copies buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>Set copies:</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAllCopies(1)}>1 per product</button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAllCopies(2)}>2 per product</button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAllCopies('stock')}>Match current stock</button>
        </div>

        {/* Product list with editable copies */}
        <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Barcode</th>
                <th>Price</th>
                <th style={{ width: '90px' }}>Copies</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td><code>{p.sku}</code></td>
                  <td style={{ fontFamily: 'monospace' }}>{p.barcode}</td>
                  <td className="num">{formatPrice(p.selling_price)}</td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      value={copiesMap[p.id] ?? 1}
                      onChange={e => setCopiesMap({ ...copiesMap, [p.id]: Math.max(1, parseInt(e.target.value) || 1) })}
                      style={{ width: '60px', padding: '3px 6px', textAlign: 'center' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-actions" style={{ marginTop: '18px' }}>
          <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn primary" onClick={handlePrint}>
            🖨️ Print {totalTags} Barcode Tags ({labelSize})
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// PRODUCT FORM MODAL (Supervisor Barcode Editing & Scan Prompt)
// ═══════════════════════════════════════════════
export function ProductFormModal({ product, initialBarcode = '', cashier, onSave, onClose, notify }) {
  const isEdit = !!product
  const isSupervisor = cashier?.role === 'supervisor'
  const [form, setForm] = useState({
    sku: product?.sku || '',
    barcode: initialBarcode || product?.barcode || '',
    name: product?.name || '',
    category: product?.category || 'Kurtis',
    mrp: product?.mrp || '',
    selling_price: product?.selling_price || '',
    cost_price: product?.cost_price || '',
    variant_size: product?.variant_size || '',
    variant_color: product?.variant_color || '',
    stock_qty: product?.stock_qty ?? 0,
    unit: product?.unit || 'pcs'
  })
  const [saving, setSaving] = useState(false)
  const [generatingBarcode, setGeneratingBarcode] = useState(false)
  const [showScanner, setShowScanner] = useState(false)

  const generateBarcode = async () => {
    setGeneratingBarcode(true)
    try {
      const res = await authFetch('/api/barcodes/next', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.barcode) {
        update('barcode', data.barcode)
        notify(`Generated unique EAN-13 barcode: ${data.barcode}`)
      } else {
        notify(data.error || 'Failed to generate barcode', 'error')
      }
    } catch {
      notify('Failed to generate barcode', 'error')
    }
    setGeneratingBarcode(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const url = isEdit ? `/api/products/${product.id}` : '/api/products'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await authFetch(url, {
        method,
        body: JSON.stringify({
          ...form,
          mrp: parseFloat(form.mrp),
          selling_price: parseFloat(form.selling_price),
          cost_price: parseFloat(form.cost_price || 0),
          stock_qty: parseInt(form.stock_qty)
        })
      })
      const data = await res.json()
      if (res.ok) {
        notify(isEdit ? 'Product updated successfully' : 'Product created successfully')
        onSave(data)
      } else {
        notify(data.error || 'Failed to save product', 'error')
      }
    } catch {
      notify('Failed to save product', 'error')
    }
    setSaving(false)
  }

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  // Barcode can be edited on new products, or by supervisors on existing products
  const canEditBarcode = !isEdit || isSupervisor

  const is13Digits = form.barcode && form.barcode.trim().length === 13 && /^\d{13}$/.test(form.barcode.trim())
  const hasBadCheckDigit = is13Digits && !isValidEan13(form.barcode.trim())

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide-modal" onClick={e => e.stopPropagation()}>
        <h2>{isEdit ? '✏️ Edit' : '➕ New'} Boutique Garment <button className="modal-close" onClick={onClose}>✕</button></h2>
        <form onSubmit={handleSubmit} className="product-form">
          <div className="form-row">
            <div className="form-group">
              <label>SKU *</label>
              <input value={form.sku} onChange={e => update('sku', e.target.value)} required disabled={isEdit} />
            </div>
            <div className="form-group">
              <label>
                Barcode * {isEdit && isSupervisor && <span style={{ fontSize: '11px', color: '#16a34a' }}>(Supervisor editable)</span>}
                {isEdit && !isSupervisor && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(Supervisor required to edit)</span>}
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  value={form.barcode}
                  onChange={e => update('barcode', e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.preventDefault()
                  }}
                  required
                  disabled={!canEditBarcode}
                  style={{ fontFamily: 'monospace' }}
                  placeholder="Scan or type barcode"
                />
                {canEditBarcode && (
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    style={{ whiteSpace: 'nowrap', padding: '6px 10px', fontSize: '12px' }}
                    title="Generate unique sequential EAN-13 barcode"
                    onClick={generateBarcode}
                    disabled={generatingBarcode}
                  >
                    {generatingBarcode ? '⏳' : '⚡ Generate'}
                  </button>
                )}
                {canEditBarcode && (
                  <button
                    type="button"
                    className="icon-btn"
                    title="Scan barcode with camera"
                    aria-label="Scan barcode with camera"
                    onClick={() => setShowScanner(true)}
                  >
                    📷
                  </button>
                )}
              </div>
              {hasBadCheckDigit && (
                <div style={{ fontSize: '11px', color: '#b45309', background: '#fef3c7', padding: '4px 8px', borderRadius: '4px', marginTop: '4px' }}>
                  ⚠️ Warning: Invalid EAN-13 check digit. Standard scanners might have difficulty reading this code.
                </div>
              )}
            </div>
          </div>
          <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => update('name', e.target.value)} required /></div>
          <div className="form-row">
            <div className="form-group"><label>Category *</label><input value={form.category} onChange={e => update('category', e.target.value)} required /></div>
            <div className="form-group"><label>Cost Price (Wholesale / Stitching)</label><input type="number" step="0.01" value={form.cost_price} onChange={e => update('cost_price', e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Size</label><input placeholder="e.g. S, M, L, Free" value={form.variant_size} onChange={e => update('variant_size', e.target.value)} /></div>
            <div className="form-group"><label>Color</label><input placeholder="e.g. Navy Blue, Maroon" value={form.variant_color} onChange={e => update('variant_color', e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>MRP (Tag Price) *</label><input type="number" step="0.01" value={form.mrp} onChange={e => update('mrp', e.target.value)} required /></div>
            <div className="form-group"><label>Selling Price *</label><input type="number" step="0.01" value={form.selling_price} onChange={e => update('selling_price', e.target.value)} required /></div>
          </div>
          {!isEdit && (
            <div className="form-row">
              <div className="form-group"><label>Initial Stock</label><input type="number" value={form.stock_qty} onChange={e => update('stock_qty', e.target.value)} /></div>
              <div className="form-group"><label>Unit</label><input value={form.unit} onChange={e => update('unit', e.target.value)} /></div>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn primary" disabled={saving}>
              {saving ? '⏳ Saving...' : (isEdit ? '✅ Update' : '✅ Create Garment')}
            </button>
          </div>
        </form>
      </div>

      {showScanner && (
        <ScanPromptModal
          title="Scan Garment Barcode"
          onScan={(scanned) => {
            update('barcode', scanned)
            notify(`Scanned barcode: ${scanned}`)
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}

function StockModal({ product, onAdjust, onClose }) {
  const [qty, setQty] = useState('')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>📦 Adjust Stock <button className="modal-close" onClick={onClose}>✕</button></h2>
        <div style={{ padding: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius)', marginBottom: '16px' }}>
          <div style={{ fontWeight: 600 }}>{product.name}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Current stock: <strong>{product.stock_qty} {product.unit}</strong></div>
        </div>
        <div className="form-group">
          <label>Adjustment (+ to add, − to remove)</label>
          <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="e.g. +50 or -10" autoFocus />
        </div>
        {qty && (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            New stock: <strong>{product.stock_qty + parseInt(qty || 0)}</strong> {product.unit}
          </div>
        )}
        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn primary" disabled={!qty} onClick={() => onAdjust(product.id, qty)}>✅ Update Stock</button>
        </div>
      </div>
    </div>
  )
}
