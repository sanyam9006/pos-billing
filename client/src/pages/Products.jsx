import { useState, useEffect } from 'react'
import { authFetch, formatPrice } from '../utils/api'

export default function Products({ cashier }) {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [showStockModal, setShowStockModal] = useState(null)
  const [toast, setToast] = useState(null)
  const isSupervisor = cashier?.role === 'supervisor'

  useEffect(() => { loadProducts() }, [])

  const notify = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
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
        notify('Stock updated')
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
          <h1>📦 Products</h1>
          <p className="page-subtitle">{products.length} active products</p>
        </div>
        {isSupervisor && (
          <button className="btn-primary" onClick={() => { setEditProduct(null); setShowForm(true) }}>
            + Add Product
          </button>
        )}
      </div>

      {/* Search */}
      <div className="search-bar-wrapper">
        <span className="search-icon-lg">🔍</span>
        <input
          className="search-bar"
          type="text"
          placeholder="Search by name, SKU, barcode, or category..."
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
              <th>Product</th>
              <th>SKU</th>
              <th>Category</th>
              <th>MRP</th>
              <th>Selling Price</th>
              <th>Tax %</th>
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
                    <div className="product-barcode">{p.barcode}</div>
                  </div>
                </td>
                <td><code className="sku-code">{p.sku}</code></td>
                <td><span className="category-badge">{p.category}</span></td>
                <td className="num">{formatPrice(p.mrp)}</td>
                <td className="num">{formatPrice(p.selling_price)}</td>
                <td className="num">{p.tax_rate}%</td>
                <td>
                  <span className={`stock-badge ${p.stock_qty <= 0 ? 'out' : p.stock_qty <= 10 ? 'low' : 'ok'}`}>
                    {p.stock_qty} {p.unit}
                  </span>
                </td>
                {isSupervisor && (
                  <td>
                    <div className="action-cell">
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
          <div className="empty-table">No products found</div>
        )}
      </div>

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

function ProductFormModal({ product, onSave, onClose, notify }) {
  const isEdit = !!product
  const [form, setForm] = useState({
    sku: product?.sku || '',
    barcode: product?.barcode || '',
    name: product?.name || '',
    category: product?.category || '',
    mrp: product?.mrp || '',
    selling_price: product?.selling_price || '',
    hsn_code: product?.hsn_code || '',
    tax_rate: product?.tax_rate ?? 5,
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
          tax_rate: parseFloat(form.tax_rate),
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
        <h2>{isEdit ? '✏️ Edit' : '➕ New'} Product <button className="modal-close" onClick={onClose}>✕</button></h2>
        <form onSubmit={handleSubmit} className="product-form">
          <div className="form-row">
            <div className="form-group"><label>SKU *</label><input value={form.sku} onChange={e => update('sku', e.target.value)} required disabled={isEdit} /></div>
            <div className="form-group"><label>Barcode *</label><input value={form.barcode} onChange={e => update('barcode', e.target.value)} required disabled={isEdit} /></div>
          </div>
          <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => update('name', e.target.value)} required /></div>
          <div className="form-row">
            <div className="form-group"><label>Category *</label><input value={form.category} onChange={e => update('category', e.target.value)} required /></div>
            <div className="form-group"><label>HSN Code</label><input value={form.hsn_code} onChange={e => update('hsn_code', e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>MRP *</label><input type="number" step="0.01" value={form.mrp} onChange={e => update('mrp', e.target.value)} required /></div>
            <div className="form-group"><label>Selling Price *</label><input type="number" step="0.01" value={form.selling_price} onChange={e => update('selling_price', e.target.value)} required /></div>
            <div className="form-group"><label>Tax Rate %</label><input type="number" value={form.tax_rate} onChange={e => update('tax_rate', e.target.value)} /></div>
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
              {saving ? '⏳ Saving...' : (isEdit ? '✅ Update' : '✅ Create')}
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
