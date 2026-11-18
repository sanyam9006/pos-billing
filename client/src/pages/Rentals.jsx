import { useState, useEffect } from 'react'
import { authFetch, formatPrice, getStoreConfig } from '../utils/api'
import { BarcodeSvg, isValidEan13 } from '../utils/barcode'
import { STORE_LOGO_BASE64 } from '../utils/logo'
import { formatDateTime, formatDate } from '../utils/date'
import ScanPromptModal from '../components/ScanPromptModal'

export default function Rentals({ cashier }) {
  const [tab, setTab] = useState('orders') // 'orders' | 'inventory'
  const [orders, setOrders] = useState([])
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showBookModal, setShowBookModal] = useState(false)
  const [preselectedItem, setPreselectedItem] = useState(null)
  const [showReturnModal, setShowReturnModal] = useState(null)
  const [showItemModal, setShowItemModal] = useState(null)
  const [slipOrder, setSlipOrder] = useState(null)
  const [toast, setToast] = useState(null)
  const isSupervisor = cashier?.role === 'supervisor'

  useEffect(() => {
    loadData()
  }, [tab, statusFilter])

  const notify = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const loadData = async () => {
    setLoading(true)
    try {
      if (tab === 'orders') {
        let url = '/api/rentals/orders'
        if (statusFilter) url += `?status=${statusFilter}`
        const res = await authFetch(url)
        const data = await res.json()
        if (res.ok && Array.isArray(data)) {
          setOrders(data)
        } else {
          setOrders([])
          notify(data?.error || 'Failed to load rental orders', 'error')
        }
        // Also fetch items count if empty
        if (items.length === 0) {
          authFetch('/api/rentals/items')
            .then(r => r.json())
            .then(d => { if (Array.isArray(d)) setItems(d) })
            .catch(() => {})
        }
      } else {
        let url = '/api/rentals/items'
        if (statusFilter) url += `?status=${statusFilter}`
        const res = await authFetch(url)
        const data = await res.json()
        if (res.ok && Array.isArray(data)) {
          setItems(data)
        } else {
          setItems([])
          notify(data?.error || 'Failed to load rental items', 'error')
        }
        // Also fetch orders count if empty
        if (orders.length === 0) {
          authFetch('/api/rentals/orders')
            .then(r => r.json())
            .then(d => { if (Array.isArray(d)) setOrders(d) })
            .catch(() => {})
        }
      }
    } catch {
      notify('Failed to load rental data', 'error')
    }
    setLoading(false)
  }

  const filteredOrders = Array.isArray(orders)
    ? orders.filter(o => {
        if (!o) return false
        const s = (search || '').toLowerCase()
        return (
          (o.customer_name || '').toLowerCase().includes(s) ||
          (o.customer_phone || '').includes(search) ||
          (o.order_number || '').toLowerCase().includes(s) ||
          (o.item_name || '').toLowerCase().includes(s) ||
          (o.item_barcode || '').includes(search)
        )
      })
    : []

  const filteredItems = Array.isArray(items)
    ? items.filter(i => {
        if (!i) return false
        const s = (search || '').toLowerCase()
        return (
          (i.name || '').toLowerCase().includes(s) ||
          (i.sku || '').toLowerCase().includes(s) ||
          (i.barcode || '').includes(search) ||
          (i.category || '').toLowerCase().includes(s)
        )
      })
    : []

  const printRentalSlip = async (orderId) => {
    try {
      const res = await authFetch(`/api/rentals/orders/${orderId}/slip`)
      if (res.ok) {
        const data = await res.json()
        setSlipOrder(data)
      } else {
        notify('Failed to load slip data', 'error')
      }
    } catch {
      notify('Failed to print slip', 'error')
    }
  }

  return (
    <div className="page rentals-page">
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <div>
          <h1>👘 Bridal & Occasion Wear Rentals</h1>
          <p className="page-subtitle">Per-day and per-event boutique rentals with deposit tracking</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {isSupervisor && (
            <button
              className="btn-secondary"
              onClick={() => { setShowItemModal({}); }}
            >
              ➕ Add Rental Garment
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => { setPreselectedItem(null); setShowBookModal(true); }}
          >
            📝 Book Rental Order
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
        <button
          className={`report-tab ${tab === 'orders' ? 'active' : ''}`}
          style={{ borderRadius: '6px 6px 0 0', padding: '10px 18px' }}
          onClick={() => { setTab('orders'); setStatusFilter(''); }}
        >
          <span className="tab-label">📋 Rental Orders ({orders.length})</span>
        </button>
        <button
          className={`report-tab ${tab === 'inventory' ? 'active' : ''}`}
          style={{ borderRadius: '6px 6px 0 0', padding: '10px 18px' }}
          onClick={() => { setTab('inventory'); setStatusFilter(''); }}
        >
          <span className="tab-label">👗 Rental Wardrobe ({items.length})</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div className="search-bar-wrapper" style={{ flex: 1, margin: 0 }}>
          <span className="search-icon-lg">🔍</span>
          <input
            className="search-bar"
            type="text"
            placeholder={tab === 'orders' ? 'Search by order #, customer, phone, garment...' : 'Search by garment name, SKU, barcode...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="clear-search" onClick={() => setSearch('')}>✕</button>}
        </div>

        <select
          className="search-bar"
          style={{ width: '180px' }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          {tab === 'orders' ? (
            <>
              <option value="">All Orders</option>
              <option value="active">Active (On Rent)</option>
              <option value="returned">Returned</option>
            </>
          ) : (
            <>
              <option value="">All Garments</option>
              <option value="available">Available</option>
              <option value="rented">Currently Rented</option>
              <option value="maintenance">Dry Cleaning / Repair</option>
            </>
          )}
        </select>
      </div>

      {/* ORDERS TAB */}
      {tab === 'orders' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Rented Garment</th>
                <th>Dates & Period</th>
                <th>Pricing Mode</th>
                <th>Rent Charged</th>
                <th>Deposit</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(o => {
                const isActive = o.status === 'active'
                const isOverdue = isActive && new Date() > new Date(o.due_date)
                return (
                  <tr key={o.id} className={isOverdue ? 'low-stock-row' : ''}>
                    <td>
                      <code className="sku-code">{o.order_number}</code>
                      {isOverdue && <span style={{ display: 'block', fontSize: '10px', color: '#dc2626', fontWeight: 700 }}>OVERDUE</span>}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{o.customer_name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{o.customer_phone}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{o.item_name}</div>
                      <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                        {o.item_barcode} {o.item_size ? `(${o.item_size})` : ''}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      <div>Out: <strong>{o.rent_date}</strong></div>
                      <div>Due: <strong>{o.due_date}</strong></div>
                      <div style={{ color: 'var(--text-muted)' }}>({o.billed_days} days billed)</div>
                    </td>
                    <td>
                      <span className={`category-badge ${o.pricing_mode === 'PER_DAY' ? 'teal' : 'purple'}`}>
                        {o.pricing_mode === 'PER_DAY' ? '☀️ Per Day' : '🎉 Per Event'}
                      </span>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        ₹{o.applied_rate} {o.pricing_mode === 'PER_DAY' ? '/day' : 'fixed'}
                      </div>
                    </td>
                    <td className="num">
                      <div style={{ fontWeight: 800, color: 'var(--accent-secondary)' }}>{formatPrice(o.final_rent)}</div>
                      {o.rent_override_reason && (
                        <div style={{ fontSize: '10px', color: '#ea580c' }} title={o.rent_override_reason}>
                          Override: {o.rent_override_reason.slice(0, 15)}...
                        </div>
                      )}
                    </td>
                    <td className="num">
                      <div>Held: {formatPrice(o.deposit_amount)}</div>
                      {o.status === 'returned' && (
                        <div style={{ fontSize: '11px', color: '#16a34a' }}>
                          Refunded: {formatPrice(o.deposit_refunded)}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`stock-badge ${isActive ? 'low' : 'ok'}`}>
                        {isActive ? '⏳ Active' : '✅ Returned'}
                      </span>
                    </td>
                    <td>
                      <div className="action-cell">
                        <button
                          className="icon-btn"
                          title="Print Agreement / Slip"
                          onClick={() => printRentalSlip(o.id)}
                        >
                          📄
                        </button>
                        {isActive && (
                          <button
                            className="btn-primary btn-sm"
                            style={{ background: '#16a34a', padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => setShowReturnModal(o)}
                          >
                            ↩️ Return
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filteredOrders.length === 0 && (
            <div className="empty-table">{loading ? 'Loading orders...' : 'No rental orders found'}</div>
          )}
        </div>
      )}

      {/* INVENTORY TAB */}
      {tab === 'inventory' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Garment</th>
                <th>SKU</th>
                <th>Barcode</th>
                <th>Per Day Rate</th>
                <th>Per Event Rate</th>
                <th>Deposit</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr key={item.id}>
                  <td>
                    <div className="product-name-cell">{item.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {item.category} {item.size ? `· Size ${item.size}` : ''} {item.color ? `· ${item.color}` : ''}
                    </div>
                  </td>
                  <td><code className="sku-code">{item.sku}</code></td>
                  <td><span style={{ fontFamily: 'monospace' }}>{item.barcode}</span></td>
                  <td className="num"><strong>{formatPrice(item.rent_per_day)}</strong> / day</td>
                  <td className="num">
                    <strong>{formatPrice(item.event_rent)}</strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({item.event_days || 3} days)</div>
                  </td>
                  <td className="num">{formatPrice(item.deposit_amount)}</td>
                  <td>
                    <span className={`stock-badge ${item.status === 'available' ? 'ok' : item.status === 'rented' ? 'low' : 'out'}`}>
                      {item.status === 'available' ? 'Available' : item.status === 'rented' ? 'On Rent' : item.status}
                    </span>
                  </td>
                  <td>
                    <div className="action-cell">
                      {item.status === 'available' && (
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => { setPreselectedItem(item); setShowBookModal(true); }}
                        >
                          Book
                        </button>
                      )}
                      {isSupervisor && (
                        <button
                          className="icon-btn"
                          title="Edit Item"
                          onClick={() => setShowItemModal(item)}
                        >
                          ✏️
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredItems.length === 0 && (
            <div className="empty-table">{loading ? 'Loading inventory...' : 'No rental garments found'}</div>
          )}
        </div>
      )}

      {/* BOOK RENTAL MODAL */}
      {showBookModal && (
        <BookRentalModal
          preselectedItem={preselectedItem}
          cashier={cashier}
          onSuccess={() => {
            setShowBookModal(false)
            loadData()
          }}
          onClose={() => setShowBookModal(false)}
          notify={notify}
        />
      )}

      {/* RETURN GARMENT MODAL */}
      {showReturnModal && (
        <ReturnGarmentModal
          order={showReturnModal}
          onSuccess={() => {
            setShowReturnModal(null)
            loadData()
          }}
          onClose={() => setShowReturnModal(null)}
          notify={notify}
        />
      )}

      {/* RENTAL ITEM FORM MODAL (Supervisor only) */}
      {showItemModal && (
        <RentalItemFormModal
          item={showItemModal.id ? showItemModal : null}
          onSuccess={() => {
            setShowItemModal(null)
            loadData()
          }}
          onClose={() => setShowItemModal(null)}
          notify={notify}
        />
      )}

      {/* PRINTABLE RENTAL SLIP MODAL */}
      {slipOrder && (
        <RentalSlipModal
          data={slipOrder}
          onClose={() => setSlipOrder(null)}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// BOOK RENTAL ORDER MODAL (Live PER_DAY / PER_EVENT Toggle & Calculation)
// ══════════════════════════════════════════════════════════════════════════
function BookRentalModal({ preselectedItem, cashier, onSuccess, onClose, notify }) {
  const [items, setItems] = useState([])
  const [selectedItemId, setSelectedItemId] = useState(preselectedItem?.id || '')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [rentDate, setRentDate] = useState(new Date().toISOString().slice(0, 10))

  // Default due date = rent date + 3 days
  const defaultDue = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const [dueDate, setDueDate] = useState(defaultDue)

  const [pricingMode, setPricingMode] = useState(preselectedItem?.pricing_mode_default || 'PER_EVENT')
  const [calculatedData, setCalculatedData] = useState(null)
  const [finalRent, setFinalRent] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [supervisorPin, setSupervisorPin] = useState('')
  const [advancePaid, setAdvancePaid] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pinThreshold, setPinThreshold] = useState(500)

  useEffect(() => {
    // Load available garments
    authFetch('/api/rentals/items?status=available')
      .then(res => res.json())
      .then(data => {
        setItems(data)
        if (!selectedItemId && data.length > 0) {
          setSelectedItemId(data[0].id)
          setPricingMode(data[0].pricing_mode_default || 'PER_EVENT')
        }
      })
      .catch(() => {})

    getStoreConfig().then(cfg => {
      if (cfg.rent_override_pin_threshold) {
        setPinThreshold(Number(cfg.rent_override_pin_threshold))
      }
    })
  }, [])

  // Whenever item, dates, or pricing mode changes, calculate live rent
  useEffect(() => {
    if (selectedItemId && rentDate && dueDate) {
      authFetch(`/api/rentals/calculate?item_id=${selectedItemId}&rent_date=${rentDate}&due_date=${dueDate}&pricing_mode=${pricingMode}`)
        .then(res => res.json())
        .then(calc => {
          setCalculatedData(calc)
          setFinalRent(String(calc.calculated_rent))
        })
        .catch(() => {})
    }
  }, [selectedItemId, rentDate, dueDate, pricingMode])

  const selectedItem = items.find(i => String(i.id) === String(selectedItemId)) || preselectedItem

  const isPriceOverridden = calculatedData && Math.abs(Number(finalRent) - calculatedData.calculated_rent) > 0.01
  const overrideDiff = calculatedData ? Math.abs(Number(finalRent) - calculatedData.calculated_rent) : 0
  const requiresSupervisorPin = isPriceOverridden && overrideDiff > pinThreshold && cashier?.role !== 'supervisor'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedItemId || !customerName || !customerPhone || !rentDate || !dueDate) {
      notify('Please fill all required fields', 'error')
      return
    }

    if (isPriceOverridden && !overrideReason.trim()) {
      notify(`Price modified from ₹${calculatedData.calculated_rent} to ₹${finalRent}. A reason is required.`, 'error')
      return
    }

    if (requiresSupervisorPin && !supervisorPin.trim()) {
      notify(`Supervisor PIN required for price adjustments over ₹${pinThreshold}`, 'error')
      return
    }

    setSubmitting(true)
    try {
      const res = await authFetch('/api/rentals/orders', {
        method: 'POST',
        body: JSON.stringify({
          rental_item_id: selectedItemId,
          customer_name: customerName,
          customer_phone: customerPhone,
          rent_date: rentDate,
          due_date: dueDate,
          pricing_mode: pricingMode,
          final_rent: parseFloat(finalRent),
          rent_override_reason: overrideReason,
          supervisor_pin: supervisorPin,
          advance_paid: parseFloat(advancePaid) || 0,
          notes
        })
      })

      const data = await res.json()
      if (res.ok) {
        notify(`🎉 Rental Order ${data.order_number} booked successfully!`)
        onSuccess()
      } else {
        notify(data.error || 'Failed to book rental order', 'error')
      }
    } catch {
      notify('Server error booking rental', 'error')
    }
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px' }}>
        <h2>👘 Book Rental Order <button className="modal-close" onClick={onClose}>✕</button></h2>

        <form onSubmit={handleSubmit}>
          {/* Garment Selector */}
          <div className="form-group">
            <label>Select Rental Garment *</label>
            <select
              value={selectedItemId}
              onChange={e => {
                setSelectedItemId(e.target.value)
                const itm = items.find(i => String(i.id) === String(e.target.value))
                if (itm) setPricingMode(itm.pricing_mode_default || 'PER_EVENT')
              }}
              required
            >
              {items.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.sku}) — Per-Day: ₹{i.rent_per_day} | Per-Event: ₹{i.event_rent} | Deposit: ₹{i.deposit_amount}
                </option>
              ))}
            </select>
          </div>

          {/* Customer Details */}
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Customer Name *</label>
              <input
                placeholder="e.g. Anjali Sharma"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Customer Phone *</label>
              <input
                type="tel"
                placeholder="10-digit mobile number"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Dates */}
          <div className="form-row">
            <div className="form-group">
              <label>Pickup / Rent Date *</label>
              <input
                type="date"
                value={rentDate}
                onChange={e => setRentDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Expected Return / Due Date *</label>
              <input
                type="date"
                value={dueDate}
                min={rentDate}
                onChange={e => setDueDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Pricing Mode Toggle: PER_DAY vs PER_EVENT */}
          <div style={{ margin: '14px 0', padding: '14px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius)' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
              PRICING MODE SELECTION:
            </label>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <button
                type="button"
                className={`pill-btn ${pricingMode === 'PER_DAY' ? 'active' : ''}`}
                style={{ flex: 1, padding: '10px', fontSize: '13px', fontWeight: 600 }}
                onClick={() => setPricingMode('PER_DAY')}
              >
                ☀️ Per Day Mode (₹{selectedItem?.rent_per_day || 0} / day)
              </button>
              <button
                type="button"
                className={`pill-btn ${pricingMode === 'PER_EVENT' ? 'active' : ''}`}
                style={{ flex: 1, padding: '10px', fontSize: '13px', fontWeight: 600 }}
                onClick={() => setPricingMode('PER_EVENT')}
              >
                🎉 Per Event Mode (Fixed ₹{selectedItem?.event_rent || 0} for {selectedItem?.event_days || 3} days)
              </button>
            </div>

            {/* Live calculation info box */}
            {calculatedData && (
              <div style={{ fontSize: '13px', background: '#fff', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                {pricingMode === 'PER_DAY' ? (
                  <div>
                    Calculation: <strong>₹{calculatedData.applied_rate} / day</strong> × <strong>{calculatedData.billed_days} days</strong> (pickup day counted) = <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent-secondary)' }}>₹{calculatedData.calculated_rent}</span>
                  </div>
                ) : (
                  <div>
                    Calculation: Fixed event rate covers standard <strong>{selectedItem?.event_days || 3} days</strong> = <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent-secondary)' }}>₹{calculatedData.calculated_rent}</span>
                    {calculatedData.billed_days > (selectedItem?.event_days || 3) && (
                      <span style={{ fontSize: '11px', color: '#ea580c', display: 'block', marginTop: '2px' }}>
                        Notice: Selected period ({calculatedData.billed_days} days) exceeds standard {selectedItem?.event_days || 3} days. Late fees apply if returned past due date.
                      </span>
                    )}
                  </div>
                )}
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Refundable Security Deposit: <strong>₹{calculatedData.deposit_amount}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Final Rent Override & Reason */}
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Final Rent Payable (₹) *</label>
              <input
                type="number"
                step="0.01"
                value={finalRent}
                onChange={e => setFinalRent(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Advance Payment Paid Now (₹)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={advancePaid}
                onChange={e => setAdvancePaid(e.target.value)}
              />
            </div>
          </div>

          {/* Reason & Supervisor PIN if price was modified */}
          {isPriceOverridden && (
            <div style={{ background: '#fff7ed', border: '1px solid #fdba74', padding: '12px', borderRadius: '6px', marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#c2410c', marginBottom: '6px' }}>
                ⚠️ Price Changed from ₹{calculatedData.calculated_rent} to ₹{finalRent} (Diff: ₹{overrideDiff})
              </div>
              <div className="form-group">
                <label style={{ fontSize: '12px' }}>Reason for price change *</label>
                <input
                  placeholder="e.g. Regular VIP customer discount / bridal package deal"
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  required
                />
              </div>

              {requiresSupervisorPin && (
                <div className="form-group" style={{ marginTop: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#dc2626' }}>
                    Supervisor PIN Required (override exceeds ₹{pinThreshold}) *
                  </label>
                  <input
                    type="password"
                    maxLength="6"
                    placeholder="Enter Supervisor PIN"
                    value={supervisorPin}
                    onChange={e => setSupervisorPin(e.target.value)}
                    required
                  />
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label>Booking Notes / Alteration Requests</label>
            <input
              placeholder="e.g. Minor waist alteration, matching latkan attached"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="modal-actions" style={{ marginTop: '18px' }}>
            <button type="button" className="modal-btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn primary" disabled={submitting}>
              {submitting ? '⏳ Booking Order...' : '✅ Confirm & Book Rental'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// RETURN GARMENT MODAL (Late Fee & Deposit Refund Calculation)
// ══════════════════════════════════════════════════════════════════════════
function ReturnGarmentModal({ order, onSuccess, onClose, notify }) {
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10))
  const [submitting, setSubmitting] = useState(false)

  const dueDate = new Date(order.due_date)
  const actualDate = new Date(returnDate)

  let extraDays = 0
  let lateFee = 0

  if (actualDate > dueDate) {
    const diffTime = actualDate.getTime() - dueDate.getTime()
    extraDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
    // PER_DAY late rate or PER_EVENT late rate
    const lateRate = Number(order.item_late_fee_per_day) > 0
      ? Number(order.item_late_fee_per_day)
      : order.pricing_mode === 'PER_DAY'
        ? order.applied_rate
        : Math.round((order.applied_rate / (order.item_event_days || 3)) * 100) / 100
    lateFee = Math.round(extraDays * lateRate * 100) / 100
  }

  const netRefund = Math.max(0, Math.round((order.deposit_amount - lateFee) * 100) / 100)

  const handleReturn = async () => {
    setSubmitting(true)
    try {
      const res = await authFetch(`/api/rentals/orders/${order.id}/return`, {
        method: 'POST',
        body: JSON.stringify({ actual_return_date: returnDate })
      })
      const data = await res.json()
      if (res.ok) {
        notify(`🎉 Return processed! Net refund to customer: ₹${data.order.deposit_refunded}`)
        onSuccess()
      } else {
        notify(data.error || 'Failed to process return', 'error')
      }
    } catch {
      notify('Server error processing return', 'error')
    }
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <h2>↩️ Return Rental Garment <button className="modal-close" onClick={onClose}>✕</button></h2>

        <div style={{ background: 'var(--bg-subtle)', padding: '14px', borderRadius: 'var(--radius)', margin: '14px 0' }}>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>{order.item_name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Order: <code>{order.order_number}</code> · Customer: <strong>{order.customer_name}</strong>
          </div>
          <div style={{ fontSize: '12px', marginTop: '6px' }}>
            Mode: <strong>{order.pricing_mode === 'PER_DAY' ? 'Per Day' : 'Per Event'}</strong> · Rate: ₹{order.applied_rate}
          </div>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>
            Due Date: <strong>{order.due_date}</strong>
          </div>
        </div>

        <div className="form-group">
          <label>Actual Return Date</label>
          <input
            type="date"
            value={returnDate}
            onChange={e => setReturnDate(e.target.value)}
          />
        </div>

        {/* Calculation summary */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', margin: '14px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span>Security Deposit Held:</span>
            <strong>{formatPrice(order.deposit_amount)}</strong>
          </div>

          {extraDays > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626', marginBottom: '8px' }}>
              <span>Late Fee ({extraDays} days overdue):</span>
              <strong>- {formatPrice(lateFee)}</strong>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: '#16a34a', marginBottom: '8px' }}>
              ✅ Returned on time! No late fee applied.
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: '14px' }}>Net Deposit Refundable to Customer:</span>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#16a34a' }}>
              {formatPrice(netRefund)}
            </span>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-btn secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="modal-btn primary"
            style={{ background: '#16a34a' }}
            disabled={submitting}
            onClick={handleReturn}
          >
            {submitting ? '⏳ Processing...' : `✅ Return Garment & Refund ${formatPrice(netRefund)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// RENTAL ITEM FORM MODAL (Add/Edit Rental Garment with Barcode Scan)
// ══════════════════════════════════════════════════════════════════════════
function RentalItemFormModal({ item, onSuccess, onClose, notify }) {
  const isEdit = !!item
  const [form, setForm] = useState({
    sku: item?.sku || '',
    barcode: item?.barcode || '',
    name: item?.name || '',
    category: item?.category || 'Bridal & Occasion Wear',
    size: item?.size || '',
    color: item?.color || '',
    deposit_amount: item?.deposit_amount ?? 3000,
    pricing_mode_default: item?.pricing_mode_default || 'PER_EVENT',
    rent_per_day: item?.rent_per_day ?? 1000,
    event_rent: item?.event_rent ?? 2500,
    event_days: item?.event_days ?? 3,
    late_fee_per_day: item?.late_fee_per_day ?? 500,
    notes: item?.notes || ''
  })
  const [saving, setSaving] = useState(false)
  const [generatingBarcode, setGeneratingBarcode] = useState(false)
  const [showScanner, setShowScanner] = useState(false)

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

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

  const is13Digits = form.barcode && form.barcode.trim().length === 13 && /^\d{13}$/.test(form.barcode.trim())
  const hasBadCheckDigit = is13Digits && !isValidEan13(form.barcode.trim())

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const url = isEdit ? `/api/rentals/items/${item.id}` : '/api/rentals/items'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await authFetch(url, {
        method,
        body: JSON.stringify({
          ...form,
          deposit_amount: parseFloat(form.deposit_amount) || 0,
          rent_per_day: parseFloat(form.rent_per_day) || 0,
          event_rent: parseFloat(form.event_rent) || 0,
          event_days: parseInt(form.event_days, 10) || 3,
          late_fee_per_day: parseFloat(form.late_fee_per_day) || 0
        })
      })

      const data = await res.json()
      if (res.ok) {
        notify(isEdit ? 'Rental garment updated' : 'Rental garment added')
        onSuccess()
      } else {
        notify(data.error || 'Failed to save rental item', 'error')
      }
    } catch {
      notify('Server error saving item', 'error')
    }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <h2>{isEdit ? '✏️ Edit' : '➕ Add'} Rental Garment <button className="modal-close" onClick={onClose}>✕</button></h2>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>SKU *</label>
              <input
                value={form.sku}
                onChange={e => update('sku', e.target.value.toUpperCase())}
                required
                disabled={isEdit}
                placeholder="e.g. RNT-LHG-RED"
              />
            </div>
            <div className="form-group">
              <label>Barcode *</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  value={form.barcode}
                  onChange={e => update('barcode', e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.preventDefault()
                  }}
                  required
                  style={{ fontFamily: 'monospace' }}
                  placeholder="Scan or type barcode"
                />
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
                <button
                  type="button"
                  className="icon-btn"
                  title="Scan barcode with camera"
                  aria-label="Scan barcode with camera"
                  onClick={() => setShowScanner(true)}
                >
                  📷
                </button>
              </div>
              {hasBadCheckDigit && (
                <div style={{ fontSize: '11px', color: '#b45309', background: '#fef3c7', padding: '4px 8px', borderRadius: '4px', marginTop: '4px' }}>
                  ⚠️ Warning: Invalid EAN-13 check digit. Standard scanners might have difficulty reading this code.
                </div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>Garment Name *</label>
            <input
              value={form.name}
              onChange={e => update('name', e.target.value)}
              required
              placeholder="e.g. Sabyasachi Inspired Bridal Lehenga"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Category</label>
              <input value={form.category} onChange={e => update('category', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Size</label>
              <input placeholder="e.g. M, L, Free" value={form.size} onChange={e => update('size', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Color</label>
              <input placeholder="e.g. Crimson Red" value={form.color} onChange={e => update('color', e.target.value)} />
            </div>
          </div>

          {/* Pricing settings */}
          <div style={{ margin: '14px 0', padding: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius)' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
              RENTAL PRICING & DEPOSIT:
            </label>
            <div className="form-row">
              <div className="form-group">
                <label>Rent Per Day (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.rent_per_day}
                  onChange={e => update('rent_per_day', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Event Rent (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.event_rent}
                  onChange={e => update('event_rent', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Event Days (default)</label>
                <input
                  type="number"
                  value={form.event_days}
                  onChange={e => update('event_days', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Security Deposit (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.deposit_amount}
                  onChange={e => update('deposit_amount', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Late Fee Per Day (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.late_fee_per_day}
                  onChange={e => update('late_fee_per_day', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Default Mode</label>
                <select
                  value={form.pricing_mode_default}
                  onChange={e => update('pricing_mode_default', e.target.value)}
                >
                  <option value="PER_EVENT">Per Event</option>
                  <option value="PER_DAY">Per Day</option>
                </select>
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn primary" disabled={saving}>
              {saving ? '⏳ Saving...' : (isEdit ? '✅ Update Garment' : '✅ Add Garment')}
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

// ══════════════════════════════════════════════════════════════════════════
// PRINTABLE RENTAL SLIP MODAL (Thermal & Paper Agreement)
// ══════════════════════════════════════════════════════════════════════════
function RentalSlipModal({ data, onClose }) {
  const { store, order } = data

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=450,height=700')
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rental Slip - ${order.order_number}</title>
        <style>
          body {
            font-family: monospace, system-ui, sans-serif;
            margin: 0;
            padding: 16px;
            color: #000;
            background: #fff;
            max-width: 320px;
            margin: auto;
          }
          .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
          .store-name { font-size: 16px; font-weight: bold; text-transform: uppercase; }
          .store-sub { font-size: 11px; margin-top: 2px; }
          .slip-title { font-size: 13px; font-weight: bold; margin-top: 6px; letter-spacing: 1px; }
          .meta-sec { font-size: 11px; line-height: 1.4; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
          .item-sec { font-size: 11px; line-height: 1.4; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
          .total-sec { font-size: 12px; line-height: 1.5; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px; }
          .row { display: flex; justify-content: space-between; }
          .bold { font-weight: bold; }
          .terms { font-size: 9px; line-height: 1.3; color: #333; margin-top: 8px; }
          .signatures { display: flex; justify-content: space-between; font-size: 10px; margin-top: 24px; padding-top: 8px; border-top: 1px solid #ccc; }
          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${(store.logo || STORE_LOGO_BASE64) ? `<img src="${store.logo || STORE_LOGO_BASE64}" alt="House of Sadaya" style="width: 68px; height: 68px; border-radius: 50%; object-fit: contain; margin: 0 auto 6px; display: block;" />` : ''}
          <div class="store-name">${store.name}</div>
          <div class="store-sub">${store.address}</div>
          <div class="store-sub">Tel: ${store.phone}</div>
          <div class="slip-title">RENTAL AGREEMENT & MEMO</div>
        </div>

        <div class="meta-sec">
          <div class="row"><span>Order:</span><span class="bold">${order.order_number}</span></div>
          <div class="row"><span>Date:</span><span>${formatDateTime(order.created_at)}</span></div>
          <div class="row"><span>Customer:</span><span class="bold">${order.customer_name}</span></div>
          <div class="row"><span>Phone:</span><span>${order.customer_phone}</span></div>
          <div class="row"><span>Pickup Date:</span><span class="bold">${order.rent_date}</span></div>
          <div class="row"><span>Due Return:</span><span class="bold">${order.due_date}</span></div>
        </div>

        <div class="item-sec">
          <div class="bold">${order.item_name}</div>
          <div class="row">
            <span>SKU: ${order.item_sku}</span>
            <span>Size: ${order.item_size || 'Std'}</span>
          </div>
          <div class="row">
            <span>Pricing Mode:</span>
            <span class="bold">${order.pricing_mode === 'PER_DAY' ? 'PER DAY' : 'PER EVENT'}</span>
          </div>
          <div class="row">
            <span>Rate Applied:</span>
            <span>₹${order.applied_rate} (${order.billed_days} days)</span>
          </div>
        </div>

        <div class="total-sec">
          <div class="row"><span>Calculated Rent:</span><span>₹${Number(order.calculated_rent).toFixed(2)}</span></div>
          <div class="row bold"><span>Final Rent Payable:</span><span>₹${Number(order.final_rent).toFixed(2)}</span></div>
          <div class="row"><span>Refundable Deposit:</span><span>₹${Number(order.deposit_amount).toFixed(2)}</span></div>
          ${order.advance_paid > 0 ? `<div class="row"><span>Advance Paid:</span><span>- ₹${Number(order.advance_paid).toFixed(2)}</span></div>` : ''}
          <div class="row bold" style="font-size: 14px; margin-top: 4px;">
            <span>Total Collected Now:</span>
            <span>₹${(Number(order.final_rent) + Number(order.deposit_amount)).toFixed(2)}</span>
          </div>
        </div>

        <div class="terms">
          <strong>TERMS & CONDITIONS:</strong><br/>
          1. Garments must be returned on or before due date in original condition.<br/>
          2. Late returns charged per store rate.<br/>
          3. Security deposit refunded upon return inspection.<br/>
          4. Professional dry cleaning is included. Do not hand-wash.
        </div>

        <div class="signatures">
          <div>Customer Signature</div>
          <div>Authorized Signatory</div>
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
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <h2>📄 Rental Agreement Slip <button className="modal-close" onClick={onClose}>✕</button></h2>

        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '6px', padding: '16px', fontSize: '13px', margin: '14px 0' }}>
          <div style={{ textAlign: 'center', borderBottom: '1px dashed var(--border)', paddingBottom: '10px', marginBottom: '10px' }}>
            <img
              src={store.logo || STORE_LOGO_BASE64}
              alt={store.name || 'House of Sadaya'}
              style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'contain', margin: '0 auto 6px', display: 'block' }}
            />
            <div style={{ fontWeight: 800, fontSize: '15px' }}>{store.name}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{store.address}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tel: {store.phone}</div>
            <div style={{ fontWeight: 700, marginTop: '4px' }}>RENTAL AGREEMENT & RECEIPT</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Order #:</span><strong>{order.order_number}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Customer:</span><strong>{order.customer_name} ({order.customer_phone})</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Dates:</span><span>{order.rent_date} to <strong>{order.due_date}</strong></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span>Mode:</span><strong>{order.pricing_mode === 'PER_DAY' ? '☀️ Per Day' : '🎉 Per Event'}</strong>
          </div>

          <div style={{ background: 'var(--bg-subtle)', padding: '8px', borderRadius: '4px', marginBottom: '10px' }}>
            <div style={{ fontWeight: 600 }}>{order.item_name}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SKU: {order.item_sku} · {order.billed_days} days</div>
          </div>

          <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Rent Amount:</span><strong>{formatPrice(order.final_rent)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Security Deposit:</span><strong>{formatPrice(order.deposit_amount)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '15px', marginTop: '6px' }}>
              <span>Total Deposit + Rent:</span>
              <span style={{ color: 'var(--accent-secondary)' }}>
                {formatPrice(Number(order.final_rent) + Number(order.deposit_amount))}
              </span>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose}>Close</button>
          <button className="modal-btn primary" onClick={handlePrint}>🖨️ Print Agreement Slip</button>
        </div>
      </div>
    </div>
  )
}
