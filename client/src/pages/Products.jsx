import { useState, useEffect } from 'react'
import { authFetch, formatPrice, getStoreConfig } from '../utils/api'

export default function Products({ cashier }) {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showMatrixModal, setShowMatrixModal] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [showStockModal, setShowStockModal] = useState(null)
  const [showTagModal, setShowTagModal] = useState(null)
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
      setProducts(await res.json())
    } catch {}
    setLoading(false)
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode.includes(search)
  )

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

  return (
    <div className="page products-page">
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <div>
          <h1>📦 Product Catalog & Inventory</h1>
          <p className="page-subtitle">{products.length} active products & variants</p>
        </div>
        {isSupervisor && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-primary" style={{ background: 'var(--accent-secondary)' }} onClick={() => setShowMatrixModal(true)}>
              ⚡ Matrix Variant Generator
            </button>
            <button className="btn-primary" onClick={() => { setEditProduct(null); setShowForm(true) }}>
              + Add Product
            </button>
          </div>
        )}
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
              <th>Product / Variant</th>
              <th>SKU</th>
              <th>Category</th>
              <th>MRP</th>
              <th>Selling Price</th>
              <th>Stock</th>
              {isSupervisor && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className={p.stock_qty <= 10 ? 'low-stock-row' : ''}>
                <td>
                  <div className="product-cell">
                    <div className="product-name-cell">{p.name}</div>
                    <div className="product-barcode">
                      {p.barcode}
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
                {isSupervisor && (
                  <td>
                    <div className="action-cell">
                      <button className="icon-btn" title="Print Barcode Tag" onClick={() => setShowTagModal(p)}>🏷️</button>
                      <button className="icon-btn" title="Edit" onClick={() => { setEditProduct(p); setShowForm(true) }}>✏️</button>
                      <button className="icon-btn" title="Adjust Stock" onClick={() => setShowStockModal(p)}>📦</button>
                      <button className="icon-btn danger" title="Deactivate" onClick={() => handleDelete(p)}>🗑️</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="empty-table">{loading ? 'Loading catalog...' : 'No products found'}</div>
        )}
      </div>

      {/* Matrix / Variant Generator Modal */}
      {showMatrixModal && (
        <MatrixGeneratorModal
          onSuccess={() => { setShowMatrixModal(false); loadProducts() }}
          onClose={() => setShowMatrixModal(false)}
          notify={notify}
        />
      )}

      {/* Barcode Tag Modal */}
      {showTagModal && (
        <BarcodeTagModal
          product={showTagModal}
          onClose={() => setShowTagModal(null)}
        />
      )}

      {/* Product Form Modal */}
      {showForm && (
        <ProductFormModal
          product={editProduct}
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
  const [barcodePrefix, setBarcodePrefix] = useState(String(Math.floor(100000 + Math.random() * 900000)))
  const [category, setCategory] = useState('')
  const [mrp, setMrp] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [stockPerVariant, setStockPerVariant] = useState(10)

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
  let seq = 1
  for (const color of selectedColors) {
    for (const size of selectedSizes) {
      const colorCode = color.slice(0, 3).toUpperCase()
      const sku = `${baseSku ? baseSku.trim().toUpperCase() : 'SKU'}-${colorCode}-${size}`
      const barcode = `${barcodePrefix}${String(seq).padStart(3, '0')}`
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
      seq++
    }
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
      const res = await authFetch('/api/products/batch', {
        method: 'POST',
        body: JSON.stringify({ products: variants })
      })
      const data = await res.json()
      if (res.ok) {
        notify(`🎉 Created ${variants.length} product variants successfully!`)
        onSuccess()
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
          <div className="form-group" style={{ flex: 1 }}>
            <label>Barcode Prefix</label>
            <input placeholder="e.g. 890123" value={barcodePrefix} onChange={e => setBarcodePrefix(e.target.value)} />
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

        {/* Live Matrix Preview */}
        {variants.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <strong>Matrix Preview ({variants.length} variants will be created):</strong>
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
                      <td><code>{v.barcode}</code></td>
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
    </div>
  )
}

// ═══════════════════════════════════════════════
// CLOTHING / RETAIL BARCODE PRICE TAG MODAL
// ═══════════════════════════════════════════════
function BarcodeTagModal({ product, onClose }) {
  const [store, setStore] = useState(null)
  useEffect(() => {
    getStoreConfig().then(setStore)
  }, [])

  const printTag = () => {
    const printWindow = window.open('', '_blank', 'width=450,height=600')
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Barcode Tag - ${product.sku}</title>
        <style>
          body { font-family: -apple-system, sans-serif; text-align: center; margin: 0; padding: 20px; }
          .tag {
            width: 260px;
            border: 2px dashed #333;
            border-radius: 8px;
            padding: 16px;
            margin: auto;
            text-align: center;
          }
          .store-name { font-size: 14px; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 4px; }
          .item-name { font-size: 13px; font-weight: 700; margin: 6px 0; }
          .barcode-bars {
            font-family: 'Courier New', monospace;
            font-size: 26px;
            letter-spacing: 3px;
            margin: 8px 0 2px;
            display: inline-block;
            background: #eee;
            padding: 4px 8px;
            border-radius: 4px;
          }
          .digits { font-family: monospace; font-size: 12px; margin-bottom: 8px; }
          .meta-row { display: flex; justify-content: space-around; font-size: 12px; margin: 6px 0; border-top: 1px solid #ddd; padding-top: 6px; }
          .price-row { margin-top: 8px; }
          .mrp { text-decoration: line-through; color: #777; font-size: 12px; margin-right: 6px; }
          .sale-price { font-size: 18px; font-weight: 800; color: #111; }
          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="tag">
          <div class="store-name">${store?.store_name || 'STORE'}</div>
          <div class="item-name">${product.name}</div>
          <div class="barcode-bars">|||||||||||||||||||</div>
          <div class="digits">${product.barcode}</div>
          <div class="meta-row">
            <span>SKU: <strong>${product.sku}</strong></span>
            ${product.variant_size ? `<span>Size: <strong>${product.variant_size}</strong></span>` : ''}
          </div>
          <div class="price-row">
            <span class="mrp">MRP ₹${product.mrp}</span>
            <span class="sale-price">₹${product.selling_price}</span>
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `
    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>🏷️ Barcode Price Tag <button className="modal-close" onClick={onClose}>✕</button></h2>
        <div style={{ textAlign: 'center', padding: '16px', border: '1.5px dashed var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)', margin: '14px 0' }}>
          <div style={{ fontSize: '13px', fontWeight: 800 }}>{store?.store_name || 'STORE'}</div>
          <div style={{ fontSize: '14px', fontWeight: 700, margin: '6px 0' }}>{product.name}</div>
          <div style={{ fontSize: '26px', letterSpacing: '4px', fontFamily: 'monospace', margin: '8px 0', background: 'var(--bg-subtle)', padding: '6px', borderRadius: '4px' }}>
            |||||||||||||||||||
          </div>
          <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{product.barcode}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px', marginTop: '8px' }}>
            <span>SKU: <strong>{product.sku}</strong></span>
            {product.variant_size && <span>Size: <strong>{product.variant_size}</strong></span>}
          </div>
          <div style={{ marginTop: '10px' }}>
            <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', marginRight: '8px' }}>{formatPrice(product.mrp)}</span>
            <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent-secondary)' }}>{formatPrice(product.selling_price)}</span>
          </div>
        </div>

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose}>Close</button>
          <button className="modal-btn primary" onClick={printTag}>🖨️ Print Label / Sticker</button>
        </div>
      </div>
    </div>
  )
}

function ProductFormModal({ product, onSave, onClose, notify }) {
  const isEdit = !!product
  const [form, setForm] = useState({
    sku: product?.sku || '',
    barcode: product?.barcode || '',
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
      if (res.ok) {
        notify(isEdit ? 'Product updated' : 'Product created')
        onSave()
      } else {
        const data = await res.json()
        notify(data.error, 'error')
      }
    } catch { notify('Failed to save', 'error') }
    setSaving(false)
  }

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide-modal" onClick={e => e.stopPropagation()}>
        <h2>{isEdit ? '✏️ Edit' : '➕ New'} Boutique Garment <button className="modal-close" onClick={onClose}>✕</button></h2>
        <form onSubmit={handleSubmit} className="product-form">
          <div className="form-row">
            <div className="form-group"><label>SKU *</label><input value={form.sku} onChange={e => update('sku', e.target.value)} required disabled={isEdit} /></div>
            <div className="form-group"><label>Barcode *</label><input value={form.barcode} onChange={e => update('barcode', e.target.value)} required disabled={isEdit} /></div>
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
