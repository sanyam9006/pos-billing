import { useState, useEffect } from 'react'
import { authFetch, formatPrice } from '../utils/api'

export default function PurchaseOrders({ cashier }) {
  const [activeTab, setActiveTab] = useState('orders') // 'orders' | 'suppliers'
  const [orders, setOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPoModal, setShowPoModal] = useState(false)
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [viewPo, setViewPo] = useState(null)
  const [toast, setToast] = useState(null)

  const isSupervisor = cashier?.role === 'supervisor'

  useEffect(() => {
    loadData()
  }, [])

  const notify = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const loadData = async () => {
    try {
      const [poRes, supRes, prodRes] = await Promise.all([
        authFetch('/api/purchase-orders'),
        authFetch('/api/suppliers'),
        authFetch('/api/products')
      ])
      if (poRes.ok) setOrders(await poRes.json())
      if (supRes.ok) setSuppliers(await supRes.json())
      if (prodRes.ok) setProducts(await prodRes.json())
    } catch {}
    setLoading(false)
  }

  const handleReceiveStock = async (po) => {
    if (!confirm(`Confirm receipt of Purchase Order ${po.po_number}? This will automatically add items to your live product inventory.`)) {
      return
    }

    try {
      const res = await authFetch(`/api/purchase-orders/${po.id}/receive`, {
        method: 'POST',
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (res.ok) {
        notify(`🎉 ${data.message}`)
        loadData()
        if (viewPo && viewPo.id === po.id) setViewPo(null)
      } else {
        notify(data.error || 'Failed to receive order', 'error')
      }
    } catch {
      notify('Server error receiving order', 'error')
    }
  }

  const handleViewPo = async (poId) => {
    try {
      const res = await authFetch(`/api/purchase-orders/${poId}`)
      if (res.ok) {
        setViewPo(await res.json())
      }
    } catch {}
  }

  return (
    <div className="page po-page">
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <div>
          <h1>🚚 Procurement & Purchase Orders</h1>
          <p className="page-subtitle">Manage supplier vendors, restocking orders, and incoming shipments</p>
        </div>
        {isSupervisor && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-primary" style={{ background: 'var(--accent-secondary)' }} onClick={() => setShowSupplierModal(true)}>
              + Add Supplier
            </button>
            <button className="btn-primary" onClick={() => setShowPoModal(true)}>
              + Create Purchase Order
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="report-tabs">
        <button
          className={`report-tab ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <span className="tab-label">📦 Purchase Orders ({orders.length})</span>
          <span className="tab-desc">Incoming stock & shipments</span>
        </button>
        <button
          className={`report-tab ${activeTab === 'suppliers' ? 'active' : ''}`}
          onClick={() => setActiveTab('suppliers')}
        >
          <span className="tab-label">🏢 Supplier Directory ({suppliers.length})</span>
          <span className="tab-desc">Wholesalers & manufacturers</span>
        </button>
      </div>

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Supplier</th>
                <th>Status</th>
                <th>Total Cost</th>
                <th>Items Ordered</th>
                <th>Date Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(po => (
                <tr key={po.id}>
                  <td><strong><code>{po.po_number}</code></strong></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{po.supplier_name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{po.supplier_phone || ''}</div>
                  </td>
                  <td>
                    <span className={`status-pill ${po.status}`}>
                      {po.status === 'received' ? '✅ Received' : po.status === 'ordered' ? '🚚 In Transit' : '📝 Draft'}
                    </span>
                  </td>
                  <td className="num">{formatPrice(po.total_cost)}</td>
                  <td>{po.total_units_ordered || 0} units ({po.item_count} items)</td>
                  <td className="date-cell">{new Date(po.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td>
                    <div className="action-cell">
                      <button className="icon-btn" title="View Details" onClick={() => handleViewPo(po.id)}>👁️</button>
                      {po.status !== 'received' && (
                        <button
                          className="btn-primary btn-sm"
                          style={{ background: 'var(--success)' }}
                          title="Receive & Restock Inventory"
                          onClick={() => handleReceiveStock(po)}
                        >
                          📦 Receive Stock
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && !loading && (
            <div className="empty-table">No purchase orders created yet. Click "+ Create Purchase Order" to restock inventory!</div>
          )}
        </div>
      )}

      {/* Suppliers Tab */}
      {activeTab === 'suppliers' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplier / Company</th>
                <th>Contact Person</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong></td>
                  <td>{s.contact_person || '—'}</td>
                  <td><code>{s.phone || '—'}</code></td>
                  <td>{s.email || '—'}</td>
                  <td>{s.address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {suppliers.length === 0 && !loading && (
            <div className="empty-table">No suppliers added yet</div>
          )}
        </div>
      )}

      {/* View PO Details Modal */}
      {viewPo && (
        <div className="modal-overlay" onClick={() => setViewPo(null)}>
          <div className="modal wide-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px' }}>
            <h2>📋 {viewPo.po_number} <button className="modal-close" onClick={() => setViewPo(null)}>✕</button></h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius)', marginBottom: '16px' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{viewPo.supplier_name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{viewPo.supplier_phone} · {viewPo.supplier_email || ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`status-pill ${viewPo.status}`}>
                  {viewPo.status === 'received' ? '✅ Received & Restocked' : '🚚 In Transit'}
                </span>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {viewPo.received_at ? `Received: ${new Date(viewPo.received_at).toLocaleDateString('en-IN')}` : ''}
                </div>
              </div>
            </div>

            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Quantity</th>
                  <th>Cost Price (Rate)</th>
                  <th>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {viewPo.items?.map(item => (
                  <tr key={item.id}>
                    <td><strong>{item.product_name}</strong></td>
                    <td><code>{item.sku}</code></td>
                    <td>{item.quantity_ordered} {item.unit}</td>
                    <td className="num">{formatPrice(item.cost_price)}</td>
                    <td className="num">{formatPrice(item.quantity_ordered * item.cost_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', fontWeight: 700, fontSize: '15px' }}>
              <span>Total Purchase Value:</span>
              <span style={{ fontSize: '20px', color: 'var(--accent-secondary)' }}>{formatPrice(viewPo.total_cost)}</span>
            </div>

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button className="modal-btn secondary" onClick={() => setViewPo(null)}>Close</button>
              {viewPo.status !== 'received' && (
                <button
                  className="modal-btn primary"
                  style={{ background: 'var(--success)' }}
                  onClick={() => handleReceiveStock(viewPo)}
                >
                  📦 Receive Stock & Update Inventory
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Purchase Order Modal */}
      {showPoModal && (
        <CreatePoModal
          suppliers={suppliers}
          products={products}
          onSuccess={() => { setShowPoModal(false); loadData() }}
          onClose={() => setShowPoModal(false)}
          notify={notify}
        />
      )}

      {/* Add Supplier Modal */}
      {showSupplierModal && (
        <AddSupplierModal
          onSuccess={() => { setShowSupplierModal(false); loadData() }}
          onClose={() => setShowSupplierModal(false)}
          notify={notify}
        />
      )}
    </div>
  )
}

function CreatePoModal({ suppliers, products, onSuccess, onClose, notify }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '')
  const [poItems, setPoItems] = useState([])
  const [selectedProduct, setSelectedProduct] = useState('')
  const [qty, setQty] = useState(10)
  const [costPrice, setCostPrice] = useState(500)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const addItem = () => {
    if (!selectedProduct) return
    const prod = products.find(p => p.id === parseInt(selectedProduct))
    if (!prod) return

    setPoItems(prev => [
      ...prev,
      {
        product_id: prod.id,
        name: prod.name,
        sku: prod.sku,
        unit: prod.unit,
        quantity_ordered: parseInt(qty) || 1,
        cost_price: parseFloat(costPrice) || 0
      }
    ])
    setSelectedProduct('')
  }

  const removeItem = (idx) => {
    setPoItems(prev => prev.filter((_, i) => i !== idx))
  }

  const totalCost = poItems.reduce((sum, item) => sum + (item.quantity_ordered * item.cost_price), 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!supplierId) {
      notify('Select a supplier', 'error')
      return
    }
    if (poItems.length === 0) {
      notify('Add at least one item to order', 'error')
      return
    }

    setSubmitting(true)
    try {
      const res = await authFetch('/api/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: parseInt(supplierId),
          items: poItems,
          notes,
          status: 'ordered'
        })
      })
      const data = await res.json()
      if (res.ok) {
        notify(`🎉 Purchase Order ${data.po_number} created successfully!`)
        onSuccess()
      } else {
        notify(data.error || 'Failed to create PO', 'error')
      }
    } catch {
      notify('Server error creating PO', 'error')
    }
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <h2>📝 Create Supplier Purchase Order <button className="modal-close" onClick={onClose}>✕</button></h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Select Supplier *</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} required>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.phone || 'No phone'})</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Notes / Remarks</label>
              <input placeholder="e.g. Surat textile consignment #14" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {/* Add Item Row */}
          <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius)', margin: '14px 0' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>Add Items to Order:</div>
            <div className="form-row" style={{ alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 3 }}>
                <label>Product</label>
                <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
                  <option value="">-- Choose Product --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku}) · Stock: {p.stock_qty}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Qty to Order</label>
                <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Cost Rate (₹)</label>
                <input type="number" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} />
              </div>
              <button type="button" className="btn-primary" style={{ height: '42px', marginBottom: '4px' }} onClick={addItem}>
                + Add
              </button>
            </div>
          </div>

          {/* PO Items Table */}
          {poItems.length > 0 && (
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: '14px' }}>
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>SKU</th>
                    <th>Quantity</th>
                    <th>Rate</th>
                    <th>Line Total</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {poItems.map((item, i) => (
                    <tr key={i}>
                      <td><strong>{item.name}</strong></td>
                      <td><code>{item.sku}</code></td>
                      <td>{item.quantity_ordered} {item.unit}</td>
                      <td className="num">{formatPrice(item.cost_price)}</td>
                      <td className="num">{formatPrice(item.quantity_ordered * item.cost_price)}</td>
                      <td>
                        <button type="button" className="icon-btn danger" onClick={() => removeItem(i)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <span>Total Estimated Cost:</span>
            <span style={{ fontSize: '20px', color: 'var(--accent-secondary)' }}>{formatPrice(totalCost)}</span>
          </div>

          <div className="modal-actions" style={{ marginTop: '16px' }}>
            <button type="button" className="modal-btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn primary" disabled={submitting || poItems.length === 0}>
              {submitting ? '⏳ Submitting...' : '🚀 Place Purchase Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddSupplierModal({ onSuccess, onClose, notify }) {
  const [form, setForm] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: ''
  })
  const [saving, setSaving] = useState(false)

  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return

    setSaving(true)
    try {
      const res = await authFetch('/api/suppliers', {
        method: 'POST',
        body: JSON.stringify(form)
      })
      if (res.ok) {
        notify('Supplier added successfully')
        onSuccess()
      } else {
        const data = await res.json()
        notify(data.error || 'Failed to add supplier', 'error')
      }
    } catch {
      notify('Server error adding supplier', 'error')
    }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide-modal" onClick={e => e.stopPropagation()}>
        <h2>🏢 Add Vendor / Supplier <button className="modal-close" onClick={onClose}>✕</button></h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Supplier / Company Name *</label><input placeholder="e.g. Surat Silk Mills" value={form.name} onChange={e => update('name', e.target.value)} required autoFocus /></div>
          <div className="form-row">
            <div className="form-group"><label>Contact Person</label><input placeholder="e.g. Ramesh Kumar" value={form.contact_person} onChange={e => update('contact_person', e.target.value)} /></div>
            <div className="form-group"><label>Phone Number</label><input type="tel" placeholder="e.g. 9820011223" value={form.phone} onChange={e => update('phone', e.target.value)} /></div>
          </div>
          <div className="form-group"><label>Email</label><input type="email" placeholder="vendor@supplier.com" value={form.email} onChange={e => update('email', e.target.value)} /></div>
          <div className="form-group"><label>Address / Warehouse Location</label><input placeholder="City, State" value={form.address} onChange={e => update('address', e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn primary" disabled={saving || !form.name.trim()}>
              {saving ? '⏳ Saving...' : '✅ Save Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
