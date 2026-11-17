import { useState, useEffect } from 'react'
import { authFetch, formatPrice } from '../utils/api'
import { STORE_LOGO_BASE64 } from '../utils/logo'
import { formatDateTime, formatDate } from '../utils/date'

export default function CustomOrders({ cashier }) {
  const [orders, setOrders] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showBookModal, setShowBookModal] = useState(false)
  const [viewOrder, setViewOrder] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    loadOrders()
  }, [statusFilter])

  const notify = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const loadOrders = async () => {
    try {
      let url = '/api/custom-orders'
      const params = []
      if (statusFilter) params.push(`status=${statusFilter}`)
      if (params.length > 0) url += `?${params.join('&')}`

      const res = await authFetch(url)
      if (res.ok) setOrders(await res.json())
    } catch {}
    setLoading(false)
  }

  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      const res = await authFetch(`/api/custom-orders/${orderId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      })
      if (res.ok) {
        notify(`Order status changed to ${newStatus}`)
        loadOrders()
        if (viewOrder && viewOrder.id === orderId) {
          setViewOrder(await res.json())
        }
      }
    } catch {
      notify('Failed to update status', 'error')
    }
  }

  const handleDeliver = async (orderId) => {
    if (!confirm('Mark order as delivered and settle balance payment?')) return
    try {
      const res = await authFetch(`/api/custom-orders/${orderId}/deliver`, {
        method: 'POST'
      })
      const data = await res.json()
      if (res.ok) {
        notify('🎉 Order delivered and balance settled!')
        loadOrders()
        if (viewOrder && viewOrder.id === orderId) setViewOrder(null)
      } else {
        notify(data.error || 'Failed to deliver', 'error')
      }
    } catch {
      notify('Server error delivering order', 'error')
    }
  }

  const filtered = orders.filter(o =>
    o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_phone.includes(search) ||
    o.order_number.toLowerCase().includes(search.toLowerCase())
  )

  const printJobSlip = (order) => {
    const w = window.open('', '_blank', 'width=500,height=700')
    const measurements = JSON.parse(order.measurements_json || '{}')
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Tailoring Job Card - ${order.order_number}</title>
        <style>
          body { font-family: -apple-system, sans-serif; padding: 20px; font-size: 13px; line-height: 1.5; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 12px; }
          .order-no { font-size: 18px; font-weight: 800; }
          .section-title { font-weight: 800; text-transform: uppercase; margin: 12px 0 6px; border-bottom: 1px dashed #aaa; padding-bottom: 4px; }
          .meas-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
          .meas-table td { padding: 4px 6px; border: 1px solid #ddd; }
          .bold { font-weight: bold; }
          .money-box { background: #f5f5f5; padding: 10px; border-radius: 6px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${STORE_LOGO_BASE64}" alt="House of Sadaya" style="width: 65px; height: 65px; border-radius: 50%; object-fit: contain; margin: 0 auto 6px; display: block;" />
          <div style="font-weight: 800; font-size: 16px; text-transform: uppercase;">House of Sadaya</div>
          <div style="font-size: 11px; color: #555;">4/8 Housing board Tonk Rajasthan · Tel: 7568458575</div>
          <div class="order-no" style="margin-top: 8px;">${order.order_number}</div>
          <div style="font-weight: 700; font-size: 14px;">Tailoring & Alteration Job Card</div>
          <div style="font-size: 11px;">Date: ${formatDateTime(order.created_at)}</div>
        </div>

        <div>
          <div>Customer: <strong>${order.customer_name}</strong> (${order.customer_phone})</div>
          <div>Service: <strong>${order.service_type}</strong></div>
          <div>Trial Date: <strong>${order.trial_date || 'N/A'}</strong> | Delivery Date: <strong>${order.delivery_date || 'N/A'}</strong></div>
        </div>

        <div class="section-title">Measurements (Inches)</div>
        <table class="meas-table">
          <tr><td>Bust / Chest</td><td><strong>${measurements.bust || '—'}</strong></td><td>Waist</td><td><strong>${measurements.waist || '—'}</strong></td></tr>
          <tr><td>Hips</td><td><strong>${measurements.hip || '—'}</strong></td><td>Shoulder</td><td><strong>${measurements.shoulder || '—'}</strong></td></tr>
          <tr><td>Dress Length</td><td><strong>${measurements.length || '—'}</strong></td><td>Sleeve Length</td><td><strong>${measurements.sleeve || '—'}</strong></td></tr>
          <tr><td>Front Neck</td><td><strong>${measurements.front_neck || '—'}</strong></td><td>Back Neck</td><td><strong>${measurements.back_neck || '—'}</strong></td></tr>
          <tr><td>Bottom / Pant Length</td><td><strong>${measurements.bottom_length || '—'}</strong></td><td>Bottom Waist</td><td><strong>${measurements.bottom_waist || '—'}</strong></td></tr>
        </table>

        ${order.design_notes ? `
          <div class="section-title">Design Instructions / Remarks</div>
          <div style="background: #fafafa; padding: 8px; border: 1px solid #eee;">${order.design_notes}</div>
        ` : ''}

        <div class="money-box">
          <div>Total Charges: <strong>₹${order.total_amount}</strong></div>
          <div>Advance Paid: <strong>₹${order.advance_paid}</strong></div>
          <div style="font-size: 15px; color: #b00; margin-top: 4px;">Balance Due on Delivery: <strong>₹${order.balance_due}</strong></div>
        </div>

        <div style="text-align: center; margin-top: 30px; font-size: 11px; color: #777;">
          Please present this slip at the time of trial / delivery.
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `
    w.document.write(html)
    w.document.close()
  }

  return (
    <div className="page custom-orders-page">
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <div>
          <h1>✂️ Custom Stitching & Alterations</h1>
          <p className="page-subtitle">Track custom tailor orders, bridal bookings, measurements, and advance payments</p>
        </div>
        <button className="btn-primary" onClick={() => setShowBookModal(true)}>
          + Book Custom Order
        </button>
      </div>

      {/* Filter Tabs & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '14px', flexWrap: 'wrap' }}>
        <div className="report-tabs" style={{ marginBottom: 0 }}>
          {['', 'booked', 'in_progress', 'trial_ready', 'completed', 'delivered'].map(st => (
            <button
              key={st}
              className={`report-tab ${statusFilter === st ? 'active' : ''}`}
              onClick={() => setStatusFilter(st)}
              style={{ padding: '8px 14px' }}
            >
              <span className="tab-label">
                {st === '' ? 'All Orders' : st === 'booked' ? '📝 Booked' : st === 'in_progress' ? '🧵 Stitching' : st === 'trial_ready' ? '👗 Trial Ready' : st === 'completed' ? '✨ Ready' : '✅ Delivered'}
              </span>
            </button>
          ))}
        </div>

        <div className="search-bar-wrapper" style={{ marginBottom: 0, width: '280px' }}>
          <span className="search-icon-lg">🔍</span>
          <input
            className="search-bar"
            placeholder="Search customer, phone, order #..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Service</th>
              <th>Status</th>
              <th>Trial Date</th>
              <th>Delivery Date</th>
              <th>Total Value</th>
              <th>Advance</th>
              <th>Balance Due</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id}>
                <td><strong><code>{o.order_number}</code></strong></td>
                <td>
                  <div style={{ fontWeight: 700 }}>{o.customer_name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{o.customer_phone}</div>
                </td>
                <td><span className="category-badge">{o.service_type}</span></td>
                <td>
                  <select
                    value={o.status}
                    onChange={e => handleUpdateStatus(o.id, e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', fontSize: '11px', fontWeight: 700 }}
                  >
                    <option value="booked">📝 Booked</option>
                    <option value="in_progress">🧵 Stitching / In Progress</option>
                    <option value="trial_ready">👗 Trial Ready</option>
                    <option value="completed">✨ Completed</option>
                    <option value="delivered">✅ Delivered</option>
                  </select>
                </td>
                <td className="date-cell">{o.trial_date || '—'}</td>
                <td className="date-cell" style={{ fontWeight: 700 }}>{o.delivery_date || '—'}</td>
                <td className="num">{formatPrice(o.total_amount)}</td>
                <td className="num" style={{ color: 'var(--success)', fontWeight: 700 }}>{formatPrice(o.advance_paid)}</td>
                <td className="num" style={{ color: o.balance_due > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 800 }}>
                  {formatPrice(o.balance_due)}
                </td>
                <td>
                  <div className="action-cell">
                    <button className="icon-btn" title="View & Print Job Card" onClick={() => printJobSlip(o)}>🖨️</button>
                    {o.status !== 'delivered' && o.balance_due > 0 && (
                      <button
                        className="btn-primary btn-sm"
                        style={{ background: 'var(--success)' }}
                        title="Collect balance and deliver"
                        onClick={() => handleDeliver(o.id)}
                      >
                        ✅ Deliver
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && !loading && (
          <div className="empty-table">No custom tailoring orders found</div>
        )}
      </div>

      {/* Book New Order Modal */}
      {showBookModal && (
        <BookOrderModal
          onSuccess={() => { setShowBookModal(false); loadOrders() }}
          onClose={() => setShowBookModal(false)}
          notify={notify}
        />
      )}
    </div>
  )
}

function BookOrderModal({ onSuccess, onClose, notify }) {
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    service_type: 'Custom Stitching',
    trial_date: '',
    delivery_date: '',
    total_amount: '',
    advance_paid: '',
    design_notes: '',
    measurements: {
      bust: '',
      waist: '',
      hip: '',
      shoulder: '',
      length: '',
      sleeve: '',
      front_neck: '',
      back_neck: '',
      bottom_length: '',
      bottom_waist: ''
    }
  })
  const [submitting, setSubmitting] = useState(false)

  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const updateMeas = (k, v) => setForm(prev => ({
    ...prev,
    measurements: { ...prev.measurements, [k]: v }
  }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.customer_name.trim() || !form.customer_phone.trim() || !form.total_amount) {
      notify('Fill customer name, phone, and total amount', 'error')
      return
    }

    setSubmitting(true)
    try {
      const res = await authFetch('/api/custom-orders', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          total_amount: parseFloat(form.total_amount),
          advance_paid: parseFloat(form.advance_paid) || 0
        })
      })
      const data = await res.json()
      if (res.ok) {
        notify(`🎉 Order ${data.order_number} booked successfully!`)
        onSuccess()
      } else {
        notify(data.error || 'Failed to book order', 'error')
      }
    } catch {
      notify('Server error booking order', 'error')
    }
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '820px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2>✂️ Book Custom Tailoring / Alteration <button className="modal-close" onClick={onClose}>✕</button></h2>
        <form onSubmit={handleSubmit}>
          {/* Customer Details */}
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Customer Name *</label>
              <input placeholder="e.g. Pooja Deshmukh" value={form.customer_name} onChange={e => update('customer_name', e.target.value)} required autoFocus />
            </div>
            <div className="form-group" style={{ flex: 1.5 }}>
              <label>Phone Number *</label>
              <input type="tel" placeholder="10 digits" value={form.customer_phone} onChange={e => update('customer_phone', e.target.value)} required maxLength={10} />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Service Type *</label>
              <select value={form.service_type} onChange={e => update('service_type', e.target.value)}>
                <option value="Custom Stitching">Custom Stitching (Blouse / Kurti)</option>
                <option value="Alteration / Fitting">Alteration / Fitting</option>
                <option value="Bridal Wear">Bridal Lehenga / Gown</option>
                <option value="Embroidery Work">Hand Embroidery / Maggam Work</option>
              </select>
            </div>
          </div>

          {/* Dates & Pricing */}
          <div className="form-row">
            <div className="form-group">
              <label>Trial Date</label>
              <input type="date" value={form.trial_date} onChange={e => update('trial_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Delivery Date *</label>
              <input type="date" value={form.delivery_date} onChange={e => update('delivery_date', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Total Price (₹) *</label>
              <input type="number" placeholder="2500" value={form.total_amount} onChange={e => update('total_amount', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Advance Paid (₹)</label>
              <input type="number" placeholder="1000" value={form.advance_paid} onChange={e => update('advance_paid', e.target.value)} />
            </div>
          </div>

          {/* Measurements Grid */}
          <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius)', margin: '14px 0' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>
              📐 Measurements (Inches)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
              <div><label style={{ fontSize: '11px' }}>Bust/Chest</label><input style={{ padding: '6px' }} placeholder="36" value={form.measurements.bust} onChange={e => updateMeas('bust', e.target.value)} /></div>
              <div><label style={{ fontSize: '11px' }}>Waist</label><input style={{ padding: '6px' }} placeholder="30" value={form.measurements.waist} onChange={e => updateMeas('waist', e.target.value)} /></div>
              <div><label style={{ fontSize: '11px' }}>Hips</label><input style={{ padding: '6px' }} placeholder="38" value={form.measurements.hip} onChange={e => updateMeas('hip', e.target.value)} /></div>
              <div><label style={{ fontSize: '11px' }}>Shoulder</label><input style={{ padding: '6px' }} placeholder="14" value={form.measurements.shoulder} onChange={e => updateMeas('shoulder', e.target.value)} /></div>
              <div><label style={{ fontSize: '11px' }}>Dress Length</label><input style={{ padding: '6px' }} placeholder="42" value={form.measurements.length} onChange={e => updateMeas('length', e.target.value)} /></div>
              <div><label style={{ fontSize: '11px' }}>Sleeves</label><input style={{ padding: '6px' }} placeholder="15" value={form.measurements.sleeve} onChange={e => updateMeas('sleeve', e.target.value)} /></div>
              <div><label style={{ fontSize: '11px' }}>Front Neck</label><input style={{ padding: '6px' }} placeholder="7" value={form.measurements.front_neck} onChange={e => updateMeas('front_neck', e.target.value)} /></div>
              <div><label style={{ fontSize: '11px' }}>Back Neck</label><input style={{ padding: '6px' }} placeholder="8.5" value={form.measurements.back_neck} onChange={e => updateMeas('back_neck', e.target.value)} /></div>
              <div><label style={{ fontSize: '11px' }}>Bottom Length</label><input style={{ padding: '6px' }} placeholder="38" value={form.measurements.bottom_length} onChange={e => updateMeas('bottom_length', e.target.value)} /></div>
              <div><label style={{ fontSize: '11px' }}>Bottom Waist</label><input style={{ padding: '6px' }} placeholder="32" value={form.measurements.bottom_waist} onChange={e => updateMeas('bottom_waist', e.target.value)} /></div>
            </div>
          </div>

          <div className="form-group">
            <label>Design Notes / Neck Pattern / Lining Details</label>
            <textarea
              rows={2}
              placeholder="e.g. Princess cut blouse, sweetheart neck, extra margin inside, gold piping on sleeves"
              value={form.design_notes}
              onChange={e => update('design_notes', e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontFamily: 'inherit' }}
            />
          </div>

          <div className="modal-actions" style={{ marginTop: '16px' }}>
            <button type="button" className="modal-btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn primary" disabled={submitting}>
              {submitting ? '⏳ Booking...' : '✂️ Book & Generate Job Slip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
